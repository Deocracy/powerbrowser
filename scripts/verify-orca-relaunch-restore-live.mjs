#!/usr/bin/env node
// scripts/verify-orca-relaunch-restore-live.mjs
//
// orca-relaunch-restore-live (Phase 65, TAB-08; criterion 4; P65-17..P65-19,
// P65-29, P65-31, P65-35; research Q1 item 3; CA-07, CA-09): Orca tabs saved
// in a Setup come back after a normal quit and relaunch, in their modes and
// splits, connected to the new orcad with no user step, and no launch
// persisted its offer.
//
// Launch 1, on a scratch profile with PowerBrowser's own orcad: pair (session
// only), write the marker key, add a scratch repository with the built CLI,
// select its worktree through the bundle's setActiveWorktree; in the Orca mode
// New Orca Chat and New Orca Terminal, the terminal split into two hosted
// terminal tabs with the built CLI's terminal split; in the Coding mode an
// editor (orca file open) and a diff (orca file open-changed --mode diff);
// record the dock, each mode's tabs and each pb-orca: name's pane key; save a
// Setup through Setups' own command; quit normally; count orca-devices.json
// rows by credentialKind, ephemeral and lastSeenAt only.
// Launch 2, same profile: before any harness input, wait for the bundle's
// state().booted and state().pairing.sessionOnly; then restore the Setup
// through Setups' own command. Named clauses:
//   dock         the main-area dock equals the saved one node by node (split
//                orientation and order; tab URIs as sets per tab area)
//   modes        each mode's tabs equal the saved sets
//   chat         the chat widget is in the new store and shows Orca's composer
//   terminals    each restored pb-orca:term<n> echoes a typed marker on a new
//                PTY (read back with the built CLI's terminal read)
//   identity     each pb-orca: name addresses the pane key it addressed before
//                the quit (P65-35)
//   pairing-ui   WebConnect's selectors (derived from Orca's source) match on
//                Orca's own web client page (the detector), then nothing in
//                PowerBrowser
//   no-input     the harness's input log is empty between launch 2 and the
//                connected state
//   offer-scan   scripts/lib/orca-offer-scan.mjs green for both launches' offers
//   devices      orca-devices.json gained exactly one used runtime token row
//                and holds no persisted keyed row
//   not-gone     no restored Orca widget was disposed as gone, read after the
//                observer's restore bound (A8)
// Output names clauses and counts only; no offer, token or needle is printed.
//
// The launch helpers are exported for scripts/verify-orca-offer-scan.mjs.
//
// SKIP (exit 0, one named line) while a prerequisite is absent: no built
// PowerBrowser, Theia app or orca/, or lane p65-01 not merged (the pane
// entry's state() reports no pairing). The coordinator runs it on the merged
// tree, after lanes p65-01, p65-02 and p65-04 merge.
//
// Run under the live lock with every inherited ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-relaunch-restore-live.mjs
//
// Tier: full. --self-test is quick: each comparator over a passing fixture and
// one fixture per failure, each red naming its clause.
//
// Usage:
//   node scripts/verify-orca-relaunch-restore-live.mjs
//   node scripts/verify-orca-relaunch-restore-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-relaunch-restore-live';
const SELF_REL = 'scripts/verify-orca-relaunch-restore-live.mjs';
const ENTRY_REL = 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx';
const WEB_CONNECT_REL = 'orca/src/renderer/src/web/WebConnect.tsx';
const SETUPS_COMMANDS_REL = 'theia/extensions/modes/src/browser/setups-commands.ts';
const MODES_COMMANDS_REL = 'theia/extensions/modes/src/browser/modes-commands.ts';
const OBSERVER_REL = 'theia/extensions/orca-panes/src/browser/orca-pane-observer.ts';
const DEVICES_FILE = 'orca-devices.json';
const SETUP_NAME = 'P65 relaunch';
const MARKER_KEY = 'powerbrowser.orca-relaunch.marker';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const sourceConst = (rel, name) => new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`).exec(read(join(REPO_ROOT, rel)) ?? '')?.[1] ?? null;
const sourceNumber = (rel, name) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(read(join(REPO_ROOT, rel)) ?? '')?.[1] ?? NaN);

// ---------------------------------------------------------------------------
// Pure comparators. Each returns red reasons.

/** Saved and restored SetupDockNode trees (main area): orientation and order of splits, tab URIs as sets per tab area. */
export function compareDocks(saved, restored, path = 'main') {
    if (!saved && !restored) return [];
    if (!saved || !restored) return [`dock: ${path} is ${restored ? 'present' : 'absent'} after the restore, ${saved ? 'present' : 'absent'} when saved`];
    if (saved.type !== restored.type) return [`dock: ${path} is a ${restored.type === 'split' ? 'split' : 'tab area'} after the restore, a ${saved.type === 'split' ? 'split' : 'tab area'} when saved`];
    if (saved.type === 'tabs') {
        const a = [...new Set(saved.tabs)].sort();
        const b = [...new Set(restored.tabs)].sort();
        return JSON.stringify(a) === JSON.stringify(b) ? [] : [`dock: tab area ${path} holds ${JSON.stringify(b)} after the restore, ${JSON.stringify(a)} when saved`];
    }
    if (saved.orientation !== restored.orientation) return [`dock: split ${path} is ${restored.orientation} after the restore, ${saved.orientation} when saved`];
    if (saved.children.length !== restored.children.length) return [`dock: split ${path} has ${restored.children.length} children after the restore, ${saved.children.length} when saved`];
    return saved.children.flatMap((child, i) => compareDocks(child, restored.children[i], `${path}.${i}`));
}

/** { mode: [tab URI] } before the quit and after the restore, compared as sets per mode. */
export function modeTabsVerdict(saved, restored) {
    const fails = [];
    for (const mode of Object.keys(saved ?? {})) {
        const a = new Set(saved[mode]);
        const b = new Set(restored?.[mode] ?? []);
        const missing = [...a].filter((u) => !b.has(u));
        const extra = [...b].filter((u) => !a.has(u));
        if (missing.length || extra.length) fails.push(`modes: the ${mode} mode's tabs differ (missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)})`);
    }
    if (!Object.keys(saved ?? {}).length) fails.push('modes: no mode tab set was recorded before the quit');
    return fails;
}

/** pb-orca: name -> pane key before the quit and after the restore (P65-35). */
export function identityVerdict(before, after) {
    const fails = [];
    if (!Object.keys(before ?? {}).length) return ['identity: no hosted pb-orca: tab was recorded before the quit'];
    for (const [name, key] of Object.entries(before)) {
        if (!(name in (after ?? {}))) fails.push(`identity: pb-orca:${name} not restored`);
        else if (after[name] !== key) fails.push(`identity: pb-orca:${name} now addresses another pane`);
    }
    return fails;
}

/** obs: { inStore, composer } of the restored chat. */
export function chatVerdict(obs) {
    if (!obs?.inStore) return ['chat: the restored chat\'s pane is not in the new orcad\'s store'];
    return obs.composer ? [] : ['chat: the restored chat shows no Orca composer (not hydrated from the new orcad)'];
}

/** obs: [{ name, handle }] (handle: the terminal whose read-back holds the marker typed into that tab, or null). */
export function echoVerdict(obs) {
    if ((obs ?? []).length < 2) return [`terminals: ${obs?.length ?? 0} restored terminal tab(s), want the two split tabs`];
    const fails = obs.filter((t) => !t.handle).map((t) => `terminals: pb-orca:${t.name} did not echo its marker on a new PTY`);
    const handles = obs.map((t) => t.handle).filter(Boolean);
    if (new Set(handles).size !== handles.length) fails.push('terminals: two restored terminal tabs echoed into one PTY');
    return fails;
}

/** obs: { selectors, detector, theia } match counts. The detector moves first, or the absence proves nothing. */
export function pairingDomVerdict(obs) {
    if (!obs?.selectors?.length) return [`pairing-ui: source moved: no id selector derived from ${WEB_CONNECT_REL}`];
    if (!obs.detector) return ['pairing-ui: the pairing selectors matched nothing on Orca\'s own web client page, so their absence in PowerBrowser proves nothing'];
    return obs.theia ? [`pairing-ui: Orca's pairing UI is in the PowerBrowser document (${obs.theia} element(s))`] : [];
}

/** log: [{ t, what }]; from..to: launch 2's start and its connected state. */
export function inputLogVerdict(log, from, to) {
    const early = (log ?? []).filter((e) => e.t >= from && e.t <= to);
    return early.length ? [`no-input: ${early.length} harness input(s) between the relaunch and the connection (${early.map((e) => e.what).join(', ')})`] : [];
}

/** Row summaries { credentialKind, ephemeral, lastSeenAt } after launch 1 and after launch 2 (CA-07, research Q1 item 3). */
export function deviceRowsVerdict(before, after) {
    const used = (rows) => (rows ?? []).filter((r) => r.credentialKind === undefined && r.lastSeenAt > 0).length;
    const fails = [];
    if (before === null || after === null) return [`devices: ${DEVICES_FILE} was not readable after ${before === null ? 'launch 1' : 'launch 2'}`];
    const grown = used(after) - used(before);
    if (grown !== 1) fails.push(`devices: ${grown} new used runtime token row(s) after the relaunch, want exactly 1`);
    const keyed = after.filter((r) => r.credentialKind === 'device-key' && r.ephemeral !== true).length;
    if (keyed) fails.push(`devices: ${keyed} persisted keyed row(s) (credentialKind device-key, not ephemeral)`);
    return fails;
}

/** Names present before the quit, and names still open after the restore bound passed. */
export function notGoneVerdict(names, afterBound) {
    return (names ?? []).filter((n) => !(afterBound ?? []).includes(n)).map((n) => `not-gone: pb-orca:${n} was disposed as gone after the relaunch`);
}

/** orca-devices.json rows reduced to the three fields this check may read; no token, key or id leaves this function. */
export function deviceRowsOf(text) {
    if (text === null) return null;
    try {
        const rows = JSON.parse(text);
        return Array.isArray(rows) ? rows.map((r) => ({ credentialKind: r?.credentialKind, ephemeral: r?.ephemeral === true ? true : undefined, lastSeenAt: Number(r?.lastSeenAt) || 0 })) : null;
    } catch {
        return null;
    }
}

/** WebConnect's id selectors, derived from Orca's source. */
export function pairingSelectors(text) {
    return [...new Set([...String(text ?? '').matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => `#${m[1]}`))];
}

// ---------------------------------------------------------------------------
// Live launch helpers (also used by verify-orca-offer-scan.mjs).

/** { skip, fail } for the live rows: the built tree, then lane p65-01's pairing report. */
export function livePrerequisites() {
    const out = { skip: null, fail: null };
    return import('./lib/orca-tabs-live.mjs').then((lib) => {
        const pre = lib.prerequisites({ needOrca: true });
        if (pre.skip || pre.fail) return { skip: pre.skip, fail: pre.fail };
        if (!/deviceKeySupport/.test(read(join(REPO_ROOT, ENTRY_REL)) ?? '')) return { skip: `lane p65-01 not merged (${ENTRY_REL}'s state() reports no pairing)`, fail: null };
        return out;
    });
}

/**
 * One scratch profile with PowerBrowser's own orcad, kept across launches. fn(session): session.profileDir,
 * session.launch(body) (one launch; body(s) gets the launch context), session.inputLog. Tears down every recorded
 * process, the scratch repository and the profile; inherited ORCA_* are scrubbed and output redaction is installed
 * before anything is launched.
 */
export async function withOrcaProfile(fn) {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const { installOutputRedaction, ensurePbNode, redact } = await import('./lib/orca-run.mjs');
    const secrets = [];
    const restoreOutput = installOutputRedaction(secrets);
    const savedEnv = {};
    for (const k of [...lib.scrubbedNames(), 'MOZ_PURGE_CACHES', 'XDG_CONFIG_HOME']) savedEnv[k] = process.env[k];
    const recorded = new Map();
    const scratch = mkdtempSync(join(tmpdir(), 'pb-orca-relaunch-'));
    const repo = join(scratch, 'repo');
    let profile = null;
    try {
        for (const k of lib.scrubbedNames()) delete process.env[k];
        process.env.MOZ_PURGE_CACHES = '1';
        const relaunch = await import('./lib/pb-relaunch.mjs');
        const live = await import('./lib/pb-live-probe.mjs');
        const { freePort, startTicks } = await import('./verify-orca-hidden-electron.mjs');
        const OrcaEnv = await import('../powerbrowser/shell/OrcaEnv.sys.mjs');
        const prefs = {
            'powerbrowser.orca.root': join(REPO_ROOT, 'orca'),
            'powerbrowser.orca.port': await freePort(OrcaEnv),
            'powerbrowser.sidecar.nodePath': (await ensurePbNode()).path,
        };
        profile = await relaunch.makeProfile(prefs);
        const inputLog = [];
        const record = (pid) => { const t = Number.isInteger(pid) && pid > 0 ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); };
        const session = {
            profileDir: profile.profileDir, repo, inputLog, worktree: `path:${repo}`,
            launch: (body) => relaunch.withShell(profile, async (app) => body(launchContext({ app, lib, live, relaunch, OrcaEnv, redact, secrets, record, inputLog, repo }))),
        };
        return await fn(session);
    } finally {
        await sleep(500);
        const { signalIdentity } = await import('./verify-orca-hidden-electron.mjs');
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        rmSync(scratch, { recursive: true, force: true });
        await profile?.dispose();
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
}

function launchContext({ app, lib, live, relaunch, OrcaEnv, redact, secrets, record, inputLog, repo }) {
    const probe = (body, ms) => relaunch.probe(app, body, ms);
    const pollFor = relaunch.pollFor;
    const chromeJson = async (expr) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
    const orcaState = () => chromeJson(`ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService.getState()`);
    const input = (what) => inputLog.push({ t: Date.now(), what });
    const SAVE = sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_SAVE_COMMAND_ID');
    const RESTORE = sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_RESTORE_COMMAND_ID');
    const ACTIVATE = sourceConst(MODES_COMMANDS_REL, 'MODES_ACTIVATE_COMMAND_ID');
    let state = null;
    const s = {
        app, probe, pollFor, startedAt: Date.now(),
        bundle: (expr) => probe(`const m = globalThis[Symbol.for(${JSON.stringify(lib.ORCA_PANES_MODULE_KEY)})];
            if (!m) return { error: 'no bundle module' };
            return await (${expr});`),
        hostedWidgets: () => probe(lib.HOSTED_WIDGETS),
        /** OrcaService ready and the bundle booted and paired session-only; resolves the time it was connected. Reads only. */
        async connected() {
            state = await pollFor(async () => { const st = await orcaState(); if (st.chromeError || st.state === 'failed') throw new Error(`OrcaService: ${st.chromeError ?? st.state}`); return st.state === 'ready' ? st : null; }, 90000, 'OrcaService to reach ready');
            record(state.pid);
            record(state.daemonPid);
            const boot = await probe(lib.BOOT_WAIT, 200000);
            if (!boot?.booted) throw new Error('the Orca pane bundle did not boot');
            const paired = await pollFor(async () => ((await s.bundle('m.state().pairing'))?.sessionOnly === true ? true : null), 30000, 'session-only pairing').catch(() => false);
            if (!paired) throw new Error('state().pairing.sessionOnly never read true');
            return Date.now();
        },
        /** The web-pairing file's text, held in memory and added to the redaction list; never printed. */
        async offer() {
            if (!state) await s.connected();
            const dir = await OrcaEnv.bridgeDirFor(state.dataRoot, (n) => process.env[n], 'linux');
            const text = (read(OrcaEnv.bridgeFileFor(dir, lib.WEB_PAIRING_FILE, 'linux')) ?? '').trim();
            if (!text) throw new Error('no web-pairing file in the bridge folder');
            if (!secrets.includes(text)) secrets.push(text);
            return text;
        },
        async writeMarker(key) {
            input('marker');
            return probe(`localStorage.setItem(${JSON.stringify(key)}, '1'); return localStorage.getItem(${JSON.stringify(key)}) === '1';`);
        },
        /** The built CLI against this launch's orcad, never this process's ORCA_* values. */
        orca(...a) {
            const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
            try { return JSON.parse(execFileSync(join(state.effectiveRoot, 'cli', 'bin', 'orca'), [...a, '--json'], { env, cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) {
                let said = [e.stderr, e.stdout, e.message].map((x) => String(x ?? '').trim()).find(Boolean) ?? '';
                try { const reply = JSON.parse(String(e.stdout ?? '')); said = reply?.error?.message ?? reply?.error?.code ?? said; } catch { /* not a JSON reply */ }
                throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${redact(said, secrets).split('\n').pop()}`);
            }
        },
        async addRepository() {
            if (!state) await s.connected();
            input('repo add');
            if (!existsSync(repo)) {
                mkdirSync(repo, { recursive: true });
                writeFileSync(join(repo, 'README'), 'orca relaunch scratch repository\n');
                const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
                git('init', '-q');
                git('add', '.');
                git('commit', '-q', '-m', 'fixture');
            }
            s.orca('repo', 'add', '--path', repo);
        },
        /** C64-6: the worktree selected with the bundle's setActiveWorktree before an Orca command. */
        async selectWorktree() {
            input('setActiveWorktree');
            const id = await pollFor(async () => (await s.bundle(`m.state().worktrees.find(w => w.path === ${JSON.stringify(repo)})?.id ?? null`)) ?? null, 30000, 'the scratch worktree in the store');
            await s.bundle(`(m.setActiveWorktree(${JSON.stringify(id)}), true)`);
            return id;
        },
        async command(id, ...args) {
            input(`command ${id}`);
            return probe(`try { await get('CommandService').executeCommand(${[JSON.stringify(id), ...args.map((x) => JSON.stringify(x))].join(', ')}); return true; } catch (e) { return false; }`);
        },
        async mode(id) { await s.command(ACTIVATE, id); await sleep(800); },
        /** Runs an Orca command and resolves the new hosted widget of `kind`, or null after 10 s. */
        async newHosted(commandId, kind) {
            const before = (await s.hostedWidgets()).map((w) => w.id);
            await s.command(commandId);
            return pollFor(async () => (await s.hostedWidgets()).find((w) => w.kind === kind && !before.includes(w.id)) ?? null, 10000, `a hosted ${kind}`).catch(() => null);
        },
        /** Setups' own Save Setup command, its capped name field answered as ng-036 answers it. */
        async saveSetup(name) {
            input('save setup');
            return probe(`const field = () => [...document.querySelectorAll('.quick-input-widget .quick-input-box input')].find(e => e.offsetParent !== null) || null;
                const saving = get('CommandService').executeCommand(${JSON.stringify(SAVE)});
                if (!(await until(() => field() !== null, 10000))) return false;
                field().value = ${JSON.stringify(name)};
                field().dispatchEvent(new Event('input', { bubbles: true }));
                await until(() => field().value === ${JSON.stringify(name)}, 2000);
                await get('MonacoQuickInputImplementation').accept();
                await saving;
                const setups = get('SetupsService');
                const stored = JSON.parse((await get('FileService').read(setups.setupsUri)).value);
                return (stored.setups || []).some(row => row.name === ${JSON.stringify(name)});`);
        },
        async restoreSetup(name) { input('restore setup'); return s.command(RESTORE, name); },
        savedDock: (name) => probe(`const setups = get('SetupsService');
            const stored = JSON.parse((await get('FileService').read(setups.setupsUri)).value);
            const row = (stored.setups || []).find(r => r.name === ${JSON.stringify(name)});
            return row && row.windows[0] && row.windows[0].dock ? row.windows[0].dock.main : null;`),
        liveDock: () => probe(`const w = get('SetupsService').snapshotWindows()[0]; return w && w.dock ? w.dock.main : null;`),
        mainTabUris: () => probe(`const registry = get('TabUriRegistry');
            return get('ApplicationShell').getWidgets('main').map(w => registry.uriOf(w)).filter(Boolean).map(u => u.toString(true));`),
        async modeTabs(modes) {
            const out = {};
            for (const m of modes) { await s.mode(m); out[m] = await s.mainTabUris(); }
            return out;
        },
        /** pb-orca: name -> pane key of every hosted widget. */
        async identity() {
            return Object.fromEntries((await s.hostedWidgets()).map((w) => [w.id.replace(/^orca-pane:/, ''), w.options?.paneKey ?? w.options?.tabId ?? null]));
        },
        storeKeys: async () => ((await s.bundle(`(() => { let list = []; const off = m.subscribePanes(p => { list = p; }); off(); return list.map(r => r.key); })()`)) ?? []),
        handles() {
            const out = new Set();
            const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'handle' && typeof v === 'string') out.add(v); else walk(v); } };
            walk(s.orca('terminal', 'list', '--worktree', `path:${repo}`));
            return [...out];
        },
        terminalText: (handle) => lib.terminalText({ orca: (...a) => s.orca(...a) }, handle),
        async typeInto(id, text) {
            input(`type into ${id}`);
            await live.focusTheiaFrame(app);
            await probe(`await get('ApplicationShell').activateWidget(${JSON.stringify(id)}); return true;`);
            for (const ch of text) await live.pressKey(app, ch === '\n' ? { key: 'Enter', code: 'Enter', keyCode: 13 } : { key: ch });
        },
        async openWebClientPage(offerText) {
            input('web client page');
            const u = new URL(offerText);
            const base = `${u.origin}${u.pathname}`;
            await live.openWebTab(app, base);
            return pollFor(async () => (await app.contexts()).find((x) => x.url.startsWith(base)) ?? null, 30000, 'Orca\'s own web client page').catch(() => null);
        },
        quit: () => app.quit({ timeoutMs: 60000 }),
    };
    return s;
}

/** orca-devices.json under the profile's orcad data root, reduced by deviceRowsOf. */
function deviceRows(profileDir) {
    return deviceRowsOf(read(join(profileDir, 'powerbrowser-orca', DEVICES_FILE)));
}

async function runLive() {
    const clauses = {};
    const offers = [];
    const scan = await import('./lib/orca-offer-scan.mjs');
    const selectors = pairingSelectors(read(join(REPO_ROOT, WEB_CONNECT_REL)));
    const holdMs = sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS');
    await withOrcaProfile(async (session) => {
        let saved = null;
        // Launch 1.
        await session.launch(async (s) => {
            await s.connected();
            offers.push(await s.offer());
            await s.writeMarker(MARKER_KEY);
            await s.addRepository();
            await s.selectWorktree();
            await s.mode('orca');
            const chat = await s.newHosted('powerbrowser.orca.newChat', 'agent-session');
            const term = await s.newHosted('powerbrowser.orca.newTerminal', 'terminal');
            if (!chat || !term) throw new Error(`launch 1: New Orca ${chat ? 'Terminal' : 'Chat'} gave no hosted widget`);
            const before = (await s.hostedWidgets()).map((w) => w.id);
            const handle = s.handles()[0];
            if (!handle) throw new Error('launch 1: the Orca CLI lists no terminal to split');
            s.orca('terminal', 'split', '--terminal', handle, '--direction', 'horizontal');
            const leaf = await s.pollFor(async () => (await s.hostedWidgets()).find((w) => w.kind === 'terminal' && !before.includes(w.id)) ?? null, 10000, 'the split terminal tab').catch(() => null);
            if (!leaf) throw new Error('launch 1: the terminal split gave no second hosted terminal tab');
            await s.mode('coding');
            writeFileSync(join(session.repo, 'README'), 'orca relaunch scratch repository, changed\n');
            s.orca('file', 'open', 'README', '--worktree', session.worktree);
            s.orca('file', 'open-changed', '--mode', 'diff', '--worktree', session.worktree);
            const editors = await s.pollFor(async () => { const u = await s.mainTabUris(); return u.some((x) => x.startsWith('file:')) && u.some((x) => x.startsWith('diff:')) ? u : null; }, 10000, 'the editor and the diff').catch(() => null);
            if (!editors) throw new Error('launch 1: orca file open and open-changed --mode diff gave no Theia editor and diff tab (lane p65-02 not merged?)');
            const modes = await s.modeTabs(['orca', 'coding']);
            const identity = await s.identity();
            if (!(await s.saveSetup(SETUP_NAME))) throw new Error('launch 1: the Setup was not saved through Setups\' own command');
            saved = { dock: await s.savedDock(SETUP_NAME), modes, identity, terminals: Object.keys(identity).filter((n) => /^term\d+$/.test(n)) };
            if ((await s.quit()) !== 'exited') throw new Error('launch 1 did not quit normally');
        });
        const devicesBefore = deviceRows(session.profileDir);
        // Launch 2: nothing but reads until connected.
        let launchAt = Date.now();
        await session.launch(async (s) => {
            launchAt = s.startedAt;
            const connectedAt = await s.connected();
            clauses['no-input'] = inputLogVerdict(session.inputLog, launchAt, connectedAt);
            offers.push(await s.offer());
            await s.writeMarker(MARKER_KEY);
            const theia = await s.probe(`return ${JSON.stringify(selectors)}.reduce((n, sel) => n + document.querySelectorAll(sel).length, 0);`);
            await s.restoreSetup(SETUP_NAME);
            await s.pollFor(async () => ((await s.storeKeys()).length ? true : null), 30000, 'the new store').catch(() => false);
            await sleep(1500);
            clauses.dock = compareDocks(saved.dock, await s.liveDock());
            clauses.identity = identityVerdict(saved.identity, await s.identity());
            const storeKeys = await s.storeKeys();
            const hosted = await s.hostedWidgets();
            const chatW = hosted.find((w) => w.kind === 'agent-session');
            const composer = chatW ? await s.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(chatW.id)}); if (!w) return false;
                await get('ApplicationShell').activateWidget(w.id); await sleep(800);
                return [...w.node.querySelectorAll('textarea, [contenteditable="true"]')].some(e => e.getClientRects().length > 0);`) : false;
            clauses.chat = chatVerdict({ inStore: !!chatW && storeKeys.includes(chatW.options?.paneKey ?? chatW.options?.tabId), composer });
            const echoes = [];
            for (const name of saved.terminals) {
                const id = `orca-pane:${name}`;
                if (!hosted.some((w) => w.id === id)) { echoes.push({ name, handle: null }); continue; }
                // The leaf mounts on first show and its transport then creates the PTY: type once its xterm is visible.
                await s.probe(`await get('ApplicationShell').activateWidget(${JSON.stringify(id)}); return true;`);
                await s.pollFor(async () => (((await s.hostedWidgets()).find((w) => w.id === id)?.xterms ?? 0) >= 1 ? true : null), 15000, 'the restored leaf\'s xterm').catch(() => false);
                await sleep(1500);
                const marker = `pbrelaunch${name}${Date.now() % 100000}`;
                let handle = null;
                for (let attempt = 0; attempt < 2 && !handle; attempt++) {
                    await s.typeInto(id, `echo ${marker}\n`);
                    handle = await s.pollFor(async () => s.handles().find((h) => s.terminalText(h).includes(marker)) ?? null, 10000, 'the echoed marker').catch(() => null);
                }
                echoes.push({ name, handle });
            }
            clauses.terminals = echoVerdict(echoes);
            clauses.modes = modeTabsVerdict(saved.modes, await s.modeTabs(['orca', 'coding']));
            // Detector for the pairing UI: Orca's own web client page shows WebConnect before it pairs.
            const page = await s.openWebClientPage(offers[1]);
            const detector = page ? Number(await s.app.evaluateIn(page.context, `${JSON.stringify(selectors)}.reduce((n, sel) => n + document.querySelectorAll(sel).length, 0)`).catch(() => 0)) : 0;
            clauses['pairing-ui'] = pairingDomVerdict({ selectors, detector, theia });
            await sleep(Math.max(0, connectedAt + holdMs + 2000 - Date.now()));
            clauses['not-gone'] = notGoneVerdict(Object.keys(saved.identity), Object.keys(await s.identity()));
            if ((await s.quit()) !== 'exited') throw new Error('launch 2 did not quit normally');
        });
        clauses.devices = deviceRowsVerdict(devicesBefore, deviceRows(session.profileDir));
        const result = scan.scanProfile({ profileDir: session.profileDir, offers, markerKey: MARKER_KEY });
        clauses['offer-scan'] = [...result.verdicts, ...scan.SINKS.filter((k) => !result.sinks.some((r) => r.name === k.name && r.read)).map((k) => `sink ${k.name} not read`)];
        clauses.scanLines = scan.formatScan(result);
    });
    return clauses;
}

async function main() {
    const pre = await livePrerequisites();
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    let clauses;
    try { clauses = await runLive(); } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    const order = ['no-input', 'dock', 'modes', 'chat', 'terminals', 'identity', 'pairing-ui', 'not-gone', 'devices', 'offer-scan'];
    const failed = [];
    for (const c of order) {
        const reasons = clauses[c];
        if (reasons === undefined) { failed.push(c); console.log(`${NAME}: ${c}: FAIL -- not reached`); continue; }
        if (reasons.length) failed.push(c);
        console.log(`${NAME}: ${c}: ${reasons.length ? `FAIL -- ${reasons.join('; ')}` : 'PASS'}`);
    }
    for (const line of clauses.scanLines ?? []) console.log(`${NAME}: scan -- ${line}`);
    console.log(failed.length ? `${NAME}: FAIL -- ${failed.join(', ')}` : `${NAME}: PASS -- ${order.join(', ')}`);
    return failed.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --self-test

const tabs = (...t) => ({ type: 'tabs', tabs: t, current: t[0] ?? null });
const split = (orientation, ...children) => ({ type: 'split', orientation, sizes: children.map(() => 1 / children.length), children });
const DOCK = split('horizontal', tabs('pb-orca:chat1', 'pb-orca:term1'), split('vertical', tabs('pb-orca:term2'), tabs('file:///r/README', 'diff:x')));

function runSelfTest() {
    const rows = (...r) => r.map(([credentialKind, ephemeral, lastSeenAt]) => ({ credentialKind, ephemeral, lastSeenAt }));
    const before = rows([undefined, undefined, 5]);
    const cases = [
        ['dock control (same tabs, other order)', null, () => compareDocks(DOCK, split('horizontal', tabs('pb-orca:term1', 'pb-orca:chat1'), split('vertical', tabs('pb-orca:term2'), tabs('diff:x', 'file:///r/README'))))],
        ['modes control', null, () => modeTabsVerdict({ orca: ['pb-orca:chat1', 'pb-orca:term1'], coding: ['file:///r/README'] }, { orca: ['pb-orca:term1', 'pb-orca:chat1'], coding: ['file:///r/README'] })],
        ['identity control', null, () => identityVerdict({ chat1: 'c', term1: 'a', term2: 'b' }, { chat1: 'c', term1: 'a', term2: 'b' })],
        ['chat control', null, () => chatVerdict({ inStore: true, composer: true })],
        ['terminals control', null, () => echoVerdict([{ name: 'term1', handle: 'h1' }, { name: 'term2', handle: 'h2' }])],
        ['pairing-ui control', null, () => pairingDomVerdict({ selectors: ['#web-runtime-pairing-code'], detector: 2, theia: 0 })],
        ['no-input control', null, () => inputLogVerdict([{ t: 100, what: 'save setup' }, { t: 900, what: 'restore setup' }], 200, 800)],
        ['devices control', null, () => deviceRowsVerdict(before, rows([undefined, undefined, 5], [undefined, undefined, 9], ['device-key', true, 9]))],
        ['not-gone control', null, () => notGoneVerdict(['chat1', 'term1'], ['term1', 'chat1'])],
        ['pairing selectors from Orca\'s source', null, () => (JSON.stringify(pairingSelectors('<input id="web-runtime-name" /><input\n id="web-runtime-pairing-code" />')) === JSON.stringify(['#web-runtime-name', '#web-runtime-pairing-code']) ? [] : ['selector derivation drifted'])],
        ['device rows read three fields only', null, () => (JSON.stringify(deviceRowsOf(JSON.stringify([{ deviceId: 'd', token: 't', credentialKind: 'device-key', ephemeral: true, lastSeenAt: 3 }]))) === JSON.stringify([{ credentialKind: 'device-key', ephemeral: true, lastSeenAt: 3 }]) ? [] : ['a row kept a field other than credentialKind, ephemeral and lastSeenAt'])],
        ['a split restored in the other orientation', 'dock: split main is vertical after the restore, horizontal when saved', () => compareDocks(DOCK, { ...DOCK, orientation: 'vertical' })],
        ['a tab moved between tab areas', 'dock: tab area main.0 holds', () => compareDocks(DOCK, split('horizontal', tabs('pb-orca:chat1'), split('vertical', tabs('pb-orca:term2', 'pb-orca:term1'), tabs('file:///r/README', 'diff:x'))))],
        ['a terminal tab restored under a new name', 'dock: tab area main.1.0 holds ["pb-orca:term3"]', () => compareDocks(DOCK, split('horizontal', tabs('pb-orca:chat1', 'pb-orca:term1'), split('vertical', tabs('pb-orca:term3'), tabs('file:///r/README', 'diff:x'))))],
        ['a mode lost a tab', 'modes: the coding mode\'s tabs differ', () => modeTabsVerdict({ coding: ['file:///r/README', 'diff:x'] }, { coding: ['file:///r/README'] })],
        ['a name now addressing another pane', 'identity: pb-orca:term1 now addresses another pane', () => identityVerdict({ term1: 'a', term2: 'b' }, { term1: 'b', term2: 'a' })],
        ['a chat not hydrated', 'chat: the restored chat shows no Orca composer', () => chatVerdict({ inStore: true, composer: false })],
        ['a terminal that did not echo', 'terminals: pb-orca:term2 did not echo its marker', () => echoVerdict([{ name: 'term1', handle: 'h1' }, { name: 'term2', handle: null }])],
        ['pairing DOM present in PowerBrowser', 'pairing-ui: Orca\'s pairing UI is in the PowerBrowser document', () => pairingDomVerdict({ selectors: ['#web-runtime-pairing-code'], detector: 1, theia: 1 })],
        ['a blind pairing detector', 'proves nothing', () => pairingDomVerdict({ selectors: ['#web-runtime-pairing-code'], detector: 0, theia: 0 })],
        ['harness input before the connection', 'no-input: 1 harness input(s)', () => inputLogVerdict([{ t: 300, what: 'restore setup' }], 200, 800)],
        ['two new token rows', 'devices: 2 new used runtime token row(s)', () => deviceRowsVerdict(before, rows([undefined, undefined, 5], [undefined, undefined, 7], [undefined, undefined, 9]))],
        ['a persisted keyed row', 'devices: 1 persisted keyed row(s)', () => deviceRowsVerdict(before, rows([undefined, undefined, 5], [undefined, undefined, 9], ['device-key', undefined, 9]))],
        ['a restored widget disposed as gone', 'not-gone: pb-orca:term2 was disposed as gone', () => notGoneVerdict(['term1', 'term2'], ['term1'])],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${label} -> not green: ${text}`); failures++; } else console.log(`  control ${label} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${label} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${label} -> red, but not naming '${naming}': ${text}`); failures++; }
        else { console.log(`  ok ${label} -> red, naming '${naming}'`); ok++; }
    }
    if (!Number.isFinite(sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS'))) { console.error(`  FAIL source moved: ORCA_RESTORE_HOLD_MS not found in ${OBSERVER_REL}`); failures++; }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${ok} planted faults each went red naming the clause`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await main());
}
