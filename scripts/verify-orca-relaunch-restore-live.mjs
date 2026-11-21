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
// editor (orca file open) and an unstaged diff (the bundle's openPane('diff'),
// since headless orcad refuses orca file open-changed);
// record the dock, each mode's tabs and each pb-orca: name's pane key; save a
// Setup through Setups' own command; quit normally; count orca-devices.json
// rows by credentialKind, ephemeral and lastSeenAt only.
// Launch 2, same profile: before any harness input, wait for the bundle's
// state().booted and state().pairing.sessionOnly; then, in the Coding mode,
// close every Theia editor and diff tab (the restore's positive control: Theia's
// own layout restore cannot bring back what was just closed), and restore the
// Setup through Setups' own command, which must report that it ran. Named clauses:
//   restore-effect  the editors closed before the restore are back after it, and
//                the restore and mode commands each reported that they ran (a
//                moved command id or a restore that threw is a harness failure,
//                never a pass on Theia's own restored layout)
//   dock         the main-area dock equals the saved one node by node (split
//                orientation and order; tab URIs as sets per tab area)
//   modes        each mode's tabs equal the saved sets
//   chat         the chat widget is in the new store and shows Orca's composer
//   terminal-keeps-tab  (launch 1) the terminal New Orca Terminal made keeps its
//                widget and name when the CLI's split gives its layout its
//                first leaf (the leaf-less key is re-keyed, not closed and
//                reopened; 64-WR-03)
//   terminals    each restored pb-orca:term<n> echoes a typed marker on a new
//                PTY (read back with the built CLI's terminal read)
//   identity     each pb-orca: name addresses the pane key it addressed before
//                the quit (P65-35)
//   pairing-ui   WebConnect's selectors (derived from Orca's source) match on
//                Orca's own web client page (the detector), then nothing in
//                PowerBrowser
// No "no-input" clause: launch 2 performs only reads until connected() returns (by
// the order of runLive's code), and a clause that judged the harness's own input
// log could never go red from product behaviour (CLAUDE.md verification rule 1;
// removed by 65-05). "No user step" is evidenced by connected() itself (session-only
// pairing reached with no input) and by pairing-ui (detector first).
//   offer-scan   scripts/lib/orca-offer-scan.mjs green for both launches' offers
//   devices      orca-devices.json gained exactly one used runtime token row
//                and holds no persisted keyed row
//   not-gone     no restored Orca widget was disposed as gone, read after the
//                observer's restore bound (A8)
//   paste-choice (owner ruling 2026-11-17, "Remember my 'off'") launch 1, on the
//                fresh profile: Orca's Middle-click Paste from Selection switch reads
//                on on Linux, and the user turns it off in Orca's hosted Settings;
//                launch 2: it reads off, a CLI terminal's selection middle-clicked
//                pastes nothing, and once the user turns it on the same pastes once
//                (the detector that the off count can go red)
// Output names clauses and counts only; no offer, token or needle is printed.
//
// The launch helpers are exported for scripts/verify-orca-offer-scan.mjs.
//
// SKIP (SKIP-PROTOCOL.md): one line "orca-relaunch-restore-live: SKIP -- <reason>"
// and exit 77 while a prerequisite is absent: no built PowerBrowser, Theia app or
// orca/, or lane p65-01 not merged (the pane entry's state() reports no
// pairing). The coordinator runs it on the merged tree, after lanes p65-01,
// p65-02 and p65-04 merge.
//
// The live lock (scripts/lib/live-lock.mjs; SKIP-PROTOCOL.md, "The live lock"): the row calls holdLiveLock before it launches anything. It goes
// on without taking the lock only when /proc/locks shows the lock held by the driver's holder (PB_LIVE_LOCK_HOLDER: pid and start ticks) or by an
// ancestor (flock <git common dir>/pb-live.lock node <row>). An inherited PB_LIVE_LOCK_HELD=1 with neither is a FAIL by name. With nothing set it
// takes the lock itself and waits, naming the holder. A run with nothing to launch (a prerequisite is absent) prints its SKIP without the lock.
//
// Tier: full. --self-test is quick and needs no browser: each comparator over a
// passing fixture and one fixture per failure, each red naming its clause, the
// source ids and command results the live run depends on, the fixture git over
// a hostile developer config, and the lock probe.
//
// Usage:
//   node scripts/verify-orca-relaunch-restore-live.mjs
//   node scripts/verify-orca-relaunch-restore-live.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveEnv } from './lib/firefox-bidi.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

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

/**
 * paste-choice (owner ruling 2026-11-17, "Remember my 'off'"). obs: { platform, fresh: { checked }, off: { before, checked },
 * relaunch: { checked }, tab, printed, offCount, on: { checked }, onCount }: the switch read on a fresh profile, turned off by
 * the user, read after the relaunch; the token counts in orcad's read after a selection and middle-click with it off, then on.
 */
export function pasteChoiceVerdict(obs) {
    if (!obs) return ['paste-choice: not measured'];
    const fails = [];
    const wantOn = obs.platform === 'linux';
    if (obs.fresh?.checked !== wantOn) fails.push(`paste-choice: on a fresh profile Orca's Middle-click Paste from Selection reads ${JSON.stringify(obs.fresh)}, want ${wantOn ? 'on (the Linux preset)' : "off (Orca's web default)"}`);
    if (obs.off?.error || obs.off?.checked !== false) return [...fails, `paste-choice: NOT SCORED -- the user could not turn the switch off in launch 1 (${JSON.stringify(obs.off)})`];
    if (obs.relaunch?.checked !== false) fails.push(`paste-choice: after the relaunch the switch reads ${JSON.stringify(obs.relaunch)}, want off: the user's off was not remembered`);
    if (!obs.tab || !obs.printed) return [...fails, `paste-choice: NOT SCORED -- the paste terminal ${obs.tab ? 'never printed its token' : 'produced no hosted widget'}`];
    if (obs.offCount !== obs.printed) fails.push(`paste-choice: after the relaunch, with the user's off, a terminal selection pasted ${obs.offCount - obs.printed} time(s) on a middle-click, want none`);
    if (obs.on?.checked !== true || obs.onCount - obs.offCount !== 1) fails.push(`paste-choice: NOT SCORED -- turned on again the switch reads ${JSON.stringify(obs.on)} and the selection pasted ${obs.onCount - obs.offCount} time(s), want once, so the off count proves nothing`);
    return fails;
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

/** The three command ids this row's own run uses, read from Theia's sources (null when one moved). */
export function rowCommandIds() {
    return {
        SETUPS_SAVE_COMMAND_ID: sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_SAVE_COMMAND_ID'),
        SETUPS_RESTORE_COMMAND_ID: sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_RESTORE_COMMAND_ID'),
        MODES_ACTIVATE_COMMAND_ID: sourceConst(MODES_COMMANDS_REL, 'MODES_ACTIVATE_COMMAND_ID'),
    };
}

/** The command ids the live run reads from Theia's sources (a regex over the const); null when the source moved. */
export function sourceIdsVerdict(ids) {
    const missing = Object.entries(ids).filter(([, id]) => !id).map(([name]) => name);
    return missing.length ? [`source moved: no ${missing.join(', ')} found (${SETUPS_COMMANDS_REL}, ${MODES_COMMANDS_REL}), so the Setup and mode commands cannot be run and a pass would rest on Theia's own layout restore`] : [];
}

/** A Theia command or mode switch must report that it ran: the page returns true, anything else (false, an error object, nothing) is a failure. */
export function commandResultVerdict(what, result) {
    return result === true ? [] : [`${what} did not run (the command reported ${JSON.stringify(result ?? null)}), so the clauses after it would judge Theia's own restored layout`];
}

/** The restore-hold bound the not-gone wait uses: it must be a number (a renamed constant reads NaN and the wait would end at once). */
export function holdMsVerdict(holdMs) {
    return Number.isFinite(holdMs) && holdMs > 0 ? [] : [`source moved: ORCA_RESTORE_HOLD_MS is ${holdMs} (read from ${OBSERVER_REL}), so not-gone would be judged before the observer's restore bound passed`];
}

/**
 * The restore's positive control. obs: { saved: [editor URI] (the editors saved in the Coding mode), closed: [editor URI] still open
 * after they were closed, after: [editor URI] open after the Setup restore }. The editors are closed first and proven closed; the
 * restore must bring each back, which Theia's own layout restore cannot do for a tab closed after it ran.
 */
export function restoreEffectVerdict(obs) {
    const saved = obs.saved ?? [];
    if (!saved.length) return ['restore-effect: no editor or diff tab was saved in the Coding mode, so the restore has nothing to bring back'];
    const stillOpen = saved.filter((u) => (obs.closed ?? []).includes(u));
    if (stillOpen.length) return [`restore-effect: NOT SCORED -- ${stillOpen.length} saved editor(s) were still open after the close, so a restore proves nothing`];
    const missing = saved.filter((u) => !(obs.after ?? []).includes(u));
    return missing.length ? [`restore-effect: the Setup restore did not bring back ${missing.length} of ${saved.length} closed editor(s)`] : [];
}

/** (launch 1) The terminal New Orca Terminal made keeps its widget and name when its layout first has a leaf. obs: { id, hosted: [id], paneKey }. */
export function terminalKeptVerdict(obs) {
    const fails = [];
    if (!(obs.hosted ?? []).includes(obs.id)) fails.push(`terminal-keeps-tab: ${obs.id} was closed when the CLI split gave its layout a first leaf (the tab must keep its widget and name)`);
    else if (!obs.paneKey) fails.push(`terminal-keeps-tab: ${obs.id} addresses no leaf pane key after the split (its widget was not re-keyed)`);
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
 * session.launch(body) (one launch; body(s) gets the launch context). Tears down every recorded
 * process, the scratch repository and the profile; inherited ORCA_* are scrubbed and output redaction is installed
 * before anything is launched.
 */
export async function withOrcaProfile(fn) {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const { installOutputRedaction, ensurePbNode, redact } = await import('./lib/orca-run.mjs');
    const secrets = [];
    const restoreOutput = installOutputRedaction(secrets);
    lib.retainForOutput(redact, secrets); // the verdict is printed after both launches, through lib.redactAfterSession
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
        const record = (pid) => { const t = Number.isInteger(pid) && pid > 0 ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); };
        const session = {
            profileDir: profile.profileDir, repo, worktree: `path:${repo}`,
            launch: (body) => relaunch.withShell(profile, async (app) => body(launchContext({ app, lib, live, relaunch, OrcaEnv, redact, secrets, record, repo }))),
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

function launchContext({ app, lib, live, relaunch, OrcaEnv, redact, secrets, record, repo }) {
    const probe = (body, ms) => relaunch.probe(app, body, ms);
    const pollFor = relaunch.pollFor;
    const chromeJson = async (expr) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
    const orcaState = () => chromeJson(`ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService.getState()`);
    const SAVE = sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_SAVE_COMMAND_ID');
    const RESTORE = sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_RESTORE_COMMAND_ID');
    const ACTIVATE = sourceConst(MODES_COMMANDS_REL, 'MODES_ACTIVATE_COMMAND_ID');
    // Each caller needs only the ids it uses (verify-orca-offer-scan and verify-orca-pairing-containment share this context and only
    // save a Setup): an id is required where it is used, and this row's own run requires all three up front (rowCommandIds).
    const needId = (name, id) => { const f = sourceIdsVerdict({ [name]: id }); if (f.length) throw new Error(f.join('; ')); return id; };
    let state = null;
    const s = {
        app, probe, pollFor,
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
            const dir = await OrcaEnv.bridgeDirFor(state.dataRoot, (n) => liveEnv()[n], 'linux');
            const text = (read(OrcaEnv.bridgeFileFor(dir, lib.WEB_PAIRING_FILE, 'linux')) ?? '').trim();
            if (!text) throw new Error('no web-pairing file in the bridge folder');
            if (!secrets.includes(text)) secrets.push(text);
            return text;
        },
        async writeMarker(key) {
            return probe(`localStorage.setItem(${JSON.stringify(key)}, '1'); return localStorage.getItem(${JSON.stringify(key)}) === '1';`);
        },
        /** The built CLI against this launch's orcad, never this process's ORCA_* values. */
        orca(...a) {
            const env = { PATH: process.env.PATH ?? '', HOME: dirname(repo), ORCA_USER_DATA: state.effectiveRoot, ORCA_USER_DATA_PATH: state.effectiveRoot };
            try { return JSON.parse(execFileSync(join(state.effectiveRoot, 'cli', 'bin', 'orca'), [...a, '--json'], { env: liveEnv(env), cwd: repo, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) {
                let said = [e.stderr, e.stdout, e.message].map((x) => String(x ?? '').trim()).find(Boolean) ?? '';
                try { const reply = JSON.parse(String(e.stdout ?? '')); said = reply?.error?.message ?? reply?.error?.code ?? said; } catch { /* not a JSON reply */ }
                throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${redact(said, secrets).split('\n').pop()}`);
            }
        },
        async addRepository() {
            if (!state) await s.connected();
            if (!existsSync(repo)) {
                mkdirSync(repo, { recursive: true });
                writeFileSync(join(repo, 'README'), 'orca relaunch scratch repository\n');
                // No developer config reaches the fixture's version control: no signing, no hooks (harness-live-tabs-13).
                const { fixtureGit } = await import('./lib/orca-pane-harness.mjs'); // the pane harness's hardened runner, scratch HOME
                const git = fixtureGit(repo, dirname(repo));
                git('init', '-q');
                git('add', '.');
                git('commit', '-q', '-m', 'fixture');
            }
            s.orca('repo', 'add', '--path', repo);
        },
        /** C64-6: the worktree selected with the bundle's setActiveWorktree before an Orca command. */
        async selectWorktree() {
            const id = await pollFor(async () => (await s.bundle(`m.state().worktrees.find(w => w.path === ${JSON.stringify(repo)})?.id ?? null`)) ?? null, 30000, 'the scratch worktree in the store');
            await s.bundle(`(m.setActiveWorktree(${JSON.stringify(id)}), true)`);
            return id;
        },
        /** true only when the command ran and returned; false for a throw or a probe error. */
        async command(id, ...args) {
            return (await probe(`try { await get('CommandService').executeCommand(${[JSON.stringify(id), ...args.map((x) => JSON.stringify(x))].join(', ')}); return true; } catch (e) { return false; }`)) === true;
        },
        /** Activates a mode and proves it took: the command ran and the body names the mode (a no-op switch would leave both tab lists under one name). */
        async mode(id) {
            const ran = commandResultVerdict(`switching to the ${id} mode`, await s.command(needId('MODES_ACTIVATE_COMMAND_ID', ACTIVATE), id));
            if (ran.length) throw new Error(ran.join('; '));
            const took = await pollFor(async () => ((await probe(`return document.body.getAttribute('data-pb-mode');`)) === id ? true : null), 10000, `the body to name the ${id} mode`).catch(() => false);
            if (!took) throw new Error(`switching to the ${id} mode did not take (the body never named it)`);
            await sleep(800);
        },
        /** Runs an Orca command and resolves the new hosted widget of `kind`, or null after 10 s. */
        async newHosted(commandId, kind) {
            const before = (await s.hostedWidgets()).map((w) => w.id);
            await s.command(commandId);
            return pollFor(async () => (await s.hostedWidgets()).find((w) => w.kind === kind && !before.includes(w.id)) ?? null, 10000, `a hosted ${kind}`).catch(() => null);
        },
        /** Setups' own Save Setup command, its capped name field answered as ng-036 answers it. */
        async saveSetup(name) {
            return probe(`const field = () => [...document.querySelectorAll('.quick-input-widget .quick-input-box input')].find(e => e.offsetParent !== null) || null;
                const saving = get('CommandService').executeCommand(${JSON.stringify(needId('SETUPS_SAVE_COMMAND_ID', SAVE))});
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
        /** Setups' own restore command; throws unless it ran. */
        async restoreSetup(name) {
            const ran = commandResultVerdict(`restoring the Setup '${name}'`, await s.command(needId('SETUPS_RESTORE_COMMAND_ID', RESTORE), name));
            if (ran.length) throw new Error(ran.join('; '));
        },
        /** The own URI of every Theia editor widget in the main area (file: for an editor, diff: for a diff editor). */
        editorUris: async () => (await probe(`return get('ApplicationShell').getWidgets('main').map(w => w.editor && w.editor.uri ? w.editor.uri.toString(true) : null).filter(Boolean);`)) ?? [],
        /** Closes every Theia editor widget in the main area; resolves how many were closed. */
        closeEditors: () => probe(`const shell = get('ApplicationShell'); let n = 0;
            for (const w of shell.getWidgets('main')) { if (w.editor && w.editor.uri) { try { w.close(); n++; } catch (e) { /* counted by what remains */ } } }
            await sleep(500); return n;`),
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
            await live.focusTheiaFrame(app);
            await probe(`await get('ApplicationShell').activateWidget(${JSON.stringify(id)}); return true;`);
            for (const ch of text) await live.pressKey(app, ch === '\n' ? { key: 'Enter', code: 'Enter', keyCode: 13 } : { key: ch });
        },
        async openWebClientPage(offerText) {
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
    const idFails = sourceIdsVerdict(rowCommandIds());
    if (idFails.length) throw new Error(idFails.join('; '));
    const clauses = {};
    const offers = [];
    const scan = await import('./lib/orca-offer-scan.mjs');
    const selectors = pairingSelectors(read(join(REPO_ROOT, WEB_CONNECT_REL)));
    const holdMs = sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS');
    const holdFails = holdMsVerdict(holdMs);
    if (holdFails.length) throw new Error(holdFails.join('; ')); // a NaN bound would end the not-gone wait at once
    const keys = await import('./verify-orca-terminal-keys-live.mjs');
    const live = await import('./lib/pb-live-probe.mjs');
    // The shape orca-terminal-keys-live's paste helpers read.
    const keysCtx = (s) => ({ app: s.app, probe: s.probe, focusTheiaFrame: () => live.focusTheiaFrame(s.app),
        activate: (id) => s.probe(`const shell = get('ApplicationShell'); await shell.activateWidget(${JSON.stringify(id)}); return await until(() => shell.activeWidget && shell.activeWidget.id === ${JSON.stringify(id)}, 5000);`) });
    const pasteChoice = { platform: process.platform };
    await withOrcaProfile(async (session) => {
        let saved = null;
        // Launch 1.
        await session.launch(async (s) => {
            await s.connected();
            offers.push(await s.offer());
            // paste-choice: a fresh profile reads the preset; the user turns the switch off in Orca's hosted Settings.
            pasteChoice.fresh = await keys.setPasteSetting(keysCtx(s), null);
            pasteChoice.off = await keys.setPasteSetting(keysCtx(s), false);
            await s.writeMarker(MARKER_KEY);
            await s.addRepository();
            const worktreeId = await s.selectWorktree();
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
            // 64-WR-03: the terminal New Orca Terminal made keeps its widget and name when the split gave its layout a first leaf.
            const termNow = await s.pollFor(async () => { const w = (await s.hostedWidgets()).find((x) => x.id === term.id); return w?.options?.paneKey ? w : null; }, 10000, 'the split terminal re-keyed to its first leaf').catch(() => null);
            clauses['terminal-keeps-tab'] = terminalKeptVerdict({ id: term.id, hosted: (await s.hostedWidgets()).map((w) => w.id), paneKey: termNow?.options?.paneKey ?? null });
            await s.mode('coding');
            writeFileSync(join(session.repo, 'README'), 'orca relaunch scratch repository, changed\n');
            s.orca('file', 'open', 'README', '--worktree', session.worktree);
            // Headless orcad refuses the CLI's file open-changed (it has no app window): Orca's own unstaged diff
            // opener runs through the bundle's openPane('diff') (B-10), as Orca's source-control panel opens it.
            const diff = await s.bundle(`m.openPane('diff', ${JSON.stringify(worktreeId)}, ${JSON.stringify(JSON.stringify({ source: 'unstaged', relativePath: 'README' }))})`);
            if (diff?.error) throw new Error(`launch 1: openPane diff failed: ${diff.error}`);
            // TabUriRegistry addresses no editor; an editor widget's own uri is file: or, for a diff editor, diff:.
            const editors = await s.pollFor(async () => { const u = await s.probe(`return get('ApplicationShell').getWidgets('main').map(w => w.editor && w.editor.uri ? w.editor.uri.toString(true) : null).filter(Boolean);`); return u.some((x) => x.startsWith('file:')) && u.some((x) => x.startsWith('diff:')) ? u : null; }, 10000, 'the editor and the diff').catch(() => null);
            if (!editors) throw new Error('launch 1: orca file open and openPane diff gave no Theia editor and diff tab (lane p65-02 not merged?)');
            const modes = await s.modeTabs(['orca', 'coding']);
            const identity = await s.identity();
            if (!(await s.saveSetup(SETUP_NAME))) throw new Error('launch 1: the Setup was not saved through Setups\' own command');
            saved = { dock: await s.savedDock(SETUP_NAME), modes, identity, editors, terminals: Object.keys(identity).filter((n) => /^term\d+$/.test(n)) };
            if ((await s.quit()) !== 'exited') throw new Error('launch 1 did not quit normally');
        });
        const devicesBefore = deviceRows(session.profileDir);
        // Launch 2: nothing but reads until connected.
        await session.launch(async (s) => {
            const connectedAt = await s.connected();
            offers.push(await s.offer());
            await s.writeMarker(MARKER_KEY);
            const theia = await s.probe(`return ${JSON.stringify(selectors)}.reduce((n, sel) => n + document.querySelectorAll(sel).length, 0);`);
            // The restore's positive control: in the Coding mode every Theia editor is closed and proven closed, so only the Setup's own
            // restore (which must run: it throws otherwise) can bring them back; Theia's layout restore has already finished.
            await s.mode('coding');
            await s.closeEditors();
            const closedLeft = await s.editorUris();
            await s.restoreSetup(SETUP_NAME);
            const editorsAfter = await s.pollFor(async () => { const u = await s.editorUris(); return saved.editors.every((x) => u.includes(x)) ? u : null; }, 15000, 'the restored editors').catch(() => s.editorUris());
            clauses['restore-effect'] = restoreEffectVerdict({ saved: saved.editors, closed: closedLeft, after: editorsAfter });
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
            // paste-choice: the switch after the relaunch, then a terminal selection middle-clicked with it off and on.
            pasteChoice.relaunch = await keys.setPasteSetting(keysCtx(s), null);
            const href = await s.app.evaluate('location.href');
            const theiaContext = (await s.app.contexts()).find((c) => c.url === href)?.context;
            const n = String(Date.now()).slice(-6);
            const token = `@R${n}R@`;
            const ids0 = (await s.hostedWidgets()).map((w) => w.id);
            const handles0 = s.handles();
            s.orca('terminal', 'create', '--worktree', session.worktree, '--command', `printf '\\033[2J\\033[H@R%sR@\\n' ${n}; ${keys.PROBE_COMMAND}`);
            pasteChoice.tab = await s.pollFor(async () => (await s.hostedWidgets()).find((w) => w.kind === 'terminal' && !ids0.includes(w.id))?.id ?? null, 30000, 'the paste terminal').catch(() => null);
            const handle = await s.pollFor(async () => s.handles().find((h) => !handles0.includes(h)) ?? null, 10000, 'the paste terminal handle').catch(() => null);
            const tokens = () => (handle ? s.terminalText(handle).split(token).length - 1 : 0);
            if (pasteChoice.tab && handle && theiaContext) {
                pasteChoice.printed = await s.pollFor(async () => tokens() || null, 15000, 'the printed token').catch(() => 0);
                await keys.selectAndMiddleClick(keysCtx(s), theiaContext, pasteChoice.tab);
                await sleep(1500);
                pasteChoice.offCount = tokens();
                pasteChoice.on = await keys.setPasteSetting(keysCtx(s), true);
                await keys.selectAndMiddleClick(keysCtx(s), theiaContext, pasteChoice.tab);
                await s.pollFor(async () => (tokens() > pasteChoice.offCount ? true : null), 5000, 'the pasted token').catch(() => null);
                await sleep(700);
                pasteChoice.onCount = tokens();
            }
            if (handle) { try { s.orca('terminal', 'close', '--terminal', handle); } catch { /* the quit ends it */ } }
            clauses['paste-choice'] = pasteChoiceVerdict(pasteChoice);
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
    const lib = await import('./lib/orca-tabs-live.mjs');
    const pre = await livePrerequisites();
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(skipLine(NAME, `${pre.skip}. Next step: build what that names, then run scripts/verify-platform.sh --only orca-relaunch-restore-live`)); return SKIP_EXIT; }
    // What is printed after the launches ended goes through their redaction list.
    const out = (line) => console.log(lib.redactAfterSession(line));
    let clauses;
    try { clauses = await runLive(); } catch (err) {
        console.error(lib.redactAfterSession(`${NAME}: FAIL -- harness: ${err.message}`));
        return 1;
    }
    const order = ['dock', 'modes', 'restore-effect', 'terminal-keeps-tab', 'chat', 'terminals', 'identity', 'pairing-ui', 'not-gone', 'paste-choice', 'devices', 'offer-scan'];
    const failed = [];
    for (const c of order) {
        const reasons = clauses[c];
        if (reasons === undefined) { failed.push(c); out(`${NAME}: ${c}: FAIL -- not reached`); continue; }
        if (reasons.length) failed.push(c);
        out(`${NAME}: ${c}: ${reasons.length ? `FAIL -- ${reasons.join('; ')}` : 'PASS'}`);
    }
    for (const line of clauses.scanLines ?? []) out(`${NAME}: scan -- ${line}`);
    out(failed.length ? `${NAME}: FAIL -- ${failed.join(', ')}` : `${NAME}: PASS -- ${order.join(', ')}`);
    return failed.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --self-test

const tabs = (...t) => ({ type: 'tabs', tabs: t, current: t[0] ?? null });
const split = (orientation, ...children) => ({ type: 'split', orientation, sizes: children.map(() => 1 / children.length), children });
const DOCK = split('horizontal', tabs('pb-orca:chat1', 'pb-orca:term1'), split('vertical', tabs('pb-orca:term2'), tabs('file:///r/README', 'diff:x')));

const PASTE_CHOICE = { platform: 'linux', fresh: { checked: true }, off: { before: true, checked: false }, relaunch: { checked: false }, tab: 'orca-pane:term3', printed: 1, offCount: 1, on: { before: false, checked: true }, onCount: 2 };

async function runSelfTest() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const liveLock = await import('./lib/live-lock.mjs');
    const { fixtureGit: paneGit } = await import('./lib/orca-pane-harness.mjs');
    const rows = (...r) => r.map(([credentialKind, ephemeral, lastSeenAt]) => ({ credentialKind, ephemeral, lastSeenAt }));
    const before = rows([undefined, undefined, 5]);
    const cases = [
        ['dock control (same tabs, other order)', null, () => compareDocks(DOCK, split('horizontal', tabs('pb-orca:term1', 'pb-orca:chat1'), split('vertical', tabs('pb-orca:term2'), tabs('diff:x', 'file:///r/README'))))],
        ['modes control', null, () => modeTabsVerdict({ orca: ['pb-orca:chat1', 'pb-orca:term1'], coding: ['file:///r/README'] }, { orca: ['pb-orca:term1', 'pb-orca:chat1'], coding: ['file:///r/README'] })],
        ['identity control', null, () => identityVerdict({ chat1: 'c', term1: 'a', term2: 'b' }, { chat1: 'c', term1: 'a', term2: 'b' })],
        ['chat control', null, () => chatVerdict({ inStore: true, composer: true })],
        ['terminals control', null, () => echoVerdict([{ name: 'term1', handle: 'h1' }, { name: 'term2', handle: 'h2' }])],
        ['pairing-ui control', null, () => pairingDomVerdict({ selectors: ['#web-runtime-pairing-code'], detector: 2, theia: 0 })],
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
        ['two new token rows', 'devices: 2 new used runtime token row(s)', () => deviceRowsVerdict(before, rows([undefined, undefined, 5], [undefined, undefined, 7], [undefined, undefined, 9]))],
        ['a persisted keyed row', 'devices: 1 persisted keyed row(s)', () => deviceRowsVerdict(before, rows([undefined, undefined, 5], [undefined, undefined, 9], ['device-key', undefined, 9]))],
        ['a restored widget disposed as gone', 'not-gone: pb-orca:term2 was disposed as gone', () => notGoneVerdict(['term1', 'term2'], ['term1'])],
        ['paste-choice control', null, () => pasteChoiceVerdict(PASTE_CHOICE)],
        ["the user's off forgotten by the relaunch", "the user's off was not remembered", () => pasteChoiceVerdict({ ...PASTE_CHOICE, relaunch: { checked: true } })],
        ['a paste after the relaunch with the off', 'pasted 1 time(s) on a middle-click, want none', () => pasteChoiceVerdict({ ...PASTE_CHOICE, offCount: 2, onCount: 3 })],
        ['a fresh profile not preset on', 'on a fresh profile', () => pasteChoiceVerdict({ ...PASTE_CHOICE, fresh: { checked: false } })],
        ['a blind paste detector', 'so the off count proves nothing', () => pasteChoiceVerdict({ ...PASTE_CHOICE, onCount: 1 })],
        ['the off never set', 'NOT SCORED -- the user could not turn the switch off', () => pasteChoiceVerdict({ ...PASTE_CHOICE, off: { error: 'switch not found' } })],
        ['no paste terminal', 'NOT SCORED -- the paste terminal produced no hosted widget', () => pasteChoiceVerdict({ ...PASTE_CHOICE, tab: null })],
        ['the clause not reached', 'paste-choice: not measured', () => pasteChoiceVerdict(undefined)],
        ['source ids control', null, () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: 'a.b', SETUPS_RESTORE_COMMAND_ID: 'a.c', MODES_ACTIVATE_COMMAND_ID: 'a.d' })],
        ['a moved restore command id (harness-live-tabs-05)', 'source moved: no SETUPS_RESTORE_COMMAND_ID found', () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: 'a.b', SETUPS_RESTORE_COMMAND_ID: null, MODES_ACTIVATE_COMMAND_ID: 'a.d' })],
        ['a moved activate command id', 'no MODES_ACTIVATE_COMMAND_ID found', () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: 'a.b', SETUPS_RESTORE_COMMAND_ID: 'a.c', MODES_ACTIVATE_COMMAND_ID: null })],
        ['the real source ids are found in the tree', null, () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_SAVE_COMMAND_ID'), SETUPS_RESTORE_COMMAND_ID: sourceConst(SETUPS_COMMANDS_REL, 'SETUPS_RESTORE_COMMAND_ID'), MODES_ACTIVATE_COMMAND_ID: sourceConst(MODES_COMMANDS_REL, 'MODES_ACTIVATE_COMMAND_ID') })],
        ['a command that ran', null, () => commandResultVerdict('restoring the Setup', true)],
        ['a restore command that returned false', 'restoring the Setup did not run (the command reported false)', () => commandResultVerdict('restoring the Setup', false)],
        ['a command that returned a probe error', 'did not run (the command reported {"error":"probe threw: x"})', () => commandResultVerdict('switching to the orca mode', { error: 'probe threw: x' })],
        ['a command that returned nothing', 'did not run (the command reported null)', () => commandResultVerdict('switching to the orca mode', undefined)],
        ['a hold bound that reads NaN (harness-live-tabs-06)', 'ORCA_RESTORE_HOLD_MS is NaN', () => holdMsVerdict(sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS_RENAMED'))],
        ['a hold bound of zero', 'ORCA_RESTORE_HOLD_MS is 0', () => holdMsVerdict(0)],
        ['the real hold bound is a number', null, () => holdMsVerdict(sourceNumber(OBSERVER_REL, 'ORCA_RESTORE_HOLD_MS'))],
        ['restore-effect control', null, () => restoreEffectVerdict({ saved: ['file:///r/README', 'diff:x'], closed: [], after: ['diff:x', 'file:///r/README'] })],
        ['a restore that brought nothing back', 'the Setup restore did not bring back 2 of 2 closed editor(s)', () => restoreEffectVerdict({ saved: ['file:///r/README', 'diff:x'], closed: [], after: [] })],
        ['a close that left an editor open (the control is blind)', 'NOT SCORED -- 1 saved editor(s) were still open after the close', () => restoreEffectVerdict({ saved: ['file:///r/README', 'diff:x'], closed: ['diff:x'], after: ['file:///r/README', 'diff:x'] })],
        ['no editor saved', 'no editor or diff tab was saved in the Coding mode', () => restoreEffectVerdict({ saved: [], closed: [], after: [] })],
        ['terminal-keeps-tab control', null, () => terminalKeptVerdict({ id: 'orca-pane:term1', hosted: ['orca-pane:term1', 'orca-pane:term2'], paneKey: 'tab:leaf1' })],
        ['a terminal closed and reopened under the next name (64-WR-03)', 'orca-pane:term1 was closed when the CLI split', () => terminalKeptVerdict({ id: 'orca-pane:term1', hosted: ['orca-pane:term2', 'orca-pane:term3'], paneKey: null })],
        ['a terminal that kept its widget but no leaf key', 'addresses no leaf pane key after the split', () => terminalKeptVerdict({ id: 'orca-pane:term1', hosted: ['orca-pane:term1'], paneKey: null })],
        ['fixture git (the pane harness\'s) ignores a developer config with signing and hooks (harness-live-tabs-13)', null, () => lib.fixtureGitVerdict((repo, home) => paneGit(repo, home))],
        ['the save id alone is enough for a caller that only saves a Setup', null, () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: 'a.b' })],
        ['this row requires all three ids up front', 'no SETUPS_RESTORE_COMMAND_ID, MODES_ACTIVATE_COMMAND_ID found', () => sourceIdsVerdict({ SETUPS_SAVE_COMMAND_ID: 'a.b', SETUPS_RESTORE_COMMAND_ID: null, MODES_ACTIVATE_COMMAND_ID: undefined })],
        ['the row\'s three ids are all found in the tree', null, () => sourceIdsVerdict(rowCommandIds())],
        ['every live path awaits the shared live-lock helper (harness-live-tabs-14)', null, () => liveLock.lockWiringFails(NAME, import.meta.url)],
        ['a script that no longer awaits holdLiveLock is caught', 'lock wiring', () => lib.lockWiringPlantFails(liveLock.lockWiringFails)],
        ['the real main with no built PowerBrowser exits 77 with the one SKIP line', null, () => skipRun()],
        ['a skip alone exits 77, a failure wins over it', null, () => (lib.verdictExitQuiet(NAME, [], ['x']) === SKIP_EXIT && lib.verdictExitQuiet(NAME, ['f'], ['x']) === 1 ? [] : ['the exit status for a skip or a failure is wrong'])],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = await runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
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

/** The real main on a tree with no built PowerBrowser: exit 77 and the one SKIP line (no browser is started). */
function skipRun() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_') && k !== 'PB_LIVE_LOCK_HELD' && k !== 'PB_LIVE_LOCK_HOLDER'));
    const r = spawnSync(process.execPath, [SELF], { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT, env: { ...env, PB_FIREFOX_BIN: '/nonexistent/pb-self-test/powerbrowser' } });
    const fails = [];
    if (r.status !== SKIP_EXIT) fails.push(`exit ${r.status}, want ${SKIP_EXIT} (${String(r.stdout).trim().slice(0, 120)} ${String(r.stderr).trim().slice(0, 120)})`);
    if (!new RegExp(`^${NAME}: SKIP -- .+`, 'm').test(r.stdout ?? '')) fails.push('no "<name>: SKIP -- <reason>" line on stdout');
    return fails;
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
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    // The live lock before anything launches (scripts/lib/live-lock.mjs). A run with nothing to launch needs none.
    const lib = await import('./lib/orca-tabs-live.mjs');
    const { holdLiveLock } = await import('./lib/live-lock.mjs');
    const mayLaunch = await (async () => { const pre = await livePrerequisites(); return !pre.skip && !pre.fail; })();
    const locked = mayLaunch ? await holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT }) : null;
    if (locked !== null) process.exit(locked);
    process.exit(await main());
}
