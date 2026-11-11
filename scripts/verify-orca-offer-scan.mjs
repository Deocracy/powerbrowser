#!/usr/bin/env node
// scripts/verify-orca-offer-scan.mjs
//
// orca-offer-scan (Phase 65, TAB-08; P65-17, P65-23; CA-07, CA-09; criterion 4):
// the live pairing offer is never persisted by PowerBrowser. One launch on a
// scratch profile with its own orcad: the hosted client pairs session-only,
// the page writes a marker localStorage key (the collector's positive
// control), a scratch repository is added with the built CLI, its worktree is
// selected with the bundle's setActiveWorktree and New Orca Chat runs, a Setup
// is saved through Setups' own command, PowerBrowser quits normally, and
// scripts/lib/orca-offer-scan.mjs scans the profile for every needle form of
// that launch's offer: setups.json and powerbrowser-shell-state.json by bytes,
// and each 127.0.0.1 origin's localStorage key column, where the marker must
// be found and orca.web.runtimeEnvironment.v1 must be absent.
//
// Output names sinks, origins and counts only; no offer, needle or token is
// printed, logged or written. The offer stays in this process's memory.
//
// SKIP (exit 0, one named line) while a prerequisite is absent: no built
// PowerBrowser, no built Theia app, no built orca/, or lane p65-01 not merged
// (the pane entry's state() reports no pairing).
//
// Run under the live lock with every inherited ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-offer-scan.mjs
//
// Tier: full. --self-test is quick and hermetic (mkdtemp): a fixture offer in
// the shape Orca's web-pairing.ts parses, planted in each encoding into a copy
// of each sink, a node:sqlite fixture database for the key probe, and the
// zero-sinks and collector-blind controls; each fault must go red naming the
// sink or the fault, and the output must hold no needle.
//
// Usage:
//   node scripts/verify-orca-offer-scan.mjs
//   node scripts/verify-orca-offer-scan.mjs --self-test

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
    RUNTIME_ENV_KEY, SINKS, formatScan, needlesFromOffer, scanProfile,
} from './lib/orca-offer-scan.mjs';

const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-offer-scan';
const SELF_REL = 'scripts/verify-orca-offer-scan.mjs';
const MARKER_KEY = 'powerbrowser.orca-offer-scan.marker';

// ---------------------------------------------------------------------------
// Fixtures (no real token: a fixture offer in the shape web-pairing.ts parses).

/** A hand-off text as OrcaService writes it: orcad's web-client URL whose #pairing= fragment carries orca://pair?code=. */
export function fixtureOffer(token = 'fixture+tok/en=offer-scan-0001') {
    const payload = { v: 2, endpoint: 'ws://127.0.0.1:1/', deviceToken: token, publicKeyB64: 'Zml4dHVyZS1wdWJsaWMta2V5', pairedDeviceId: 'fixture-device', scope: 'runtime' };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const pairingUrl = `orca://pair?code=${code}`;
    return { handOff: `http://127.0.0.1:1/web-index.html#pairing=${encodeURIComponent(pairingUrl)}`, code, token, pairingUrl };
}

/** A profile directory holding the two byte sinks (clean JSON) and one origin's ls/data.sqlite with the given keys. */
function fixtureProfile(root, { keys = [MARKER_KEY], sinks = true, origin = 'http+++127.0.0.1+40404' } = {}) {
    const profileDir = mkdtempSync(join(root, 'profile-'));
    if (sinks) {
        for (const sink of SINKS) {
            mkdirSync(dirname(join(profileDir, sink.rel)), { recursive: true });
            writeFileSync(join(profileDir, sink.rel), JSON.stringify({ fixture: sink.name, tabs: ['pb-orca:chat1', 'pb-orca:term1'] }));
        }
    }
    if (keys !== null) {
        const dir = join(profileDir, 'storage', 'default', origin, 'ls');
        mkdirSync(dir, { recursive: true });
        const db = new DatabaseSync(join(dir, 'data.sqlite'));
        db.exec('CREATE TABLE data (key TEXT PRIMARY KEY, utf16_length INTEGER, conversion_type INTEGER, compression_type INTEGER, last_access_time INTEGER, value BLOB)');
        const insert = db.prepare('INSERT INTO data (key, utf16_length, conversion_type, compression_type, last_access_time, value) VALUES (?, 1, 1, 0, 0, ?)');
        for (const key of keys) insert.run(key, Buffer.from('1'));
        db.close();
    }
    return profileDir;
}

/** Plants `text` into the named sink of a fixture profile. */
function plant(profileDir, sinkName, text) {
    const sink = SINKS.find((s) => s.name === sinkName);
    writeFileSync(join(profileDir, sink.rel), JSON.stringify({ fixture: sink.name, planted: text }));
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const offer = fixtureOffer();
    const forbidden = [offer.handOff, offer.code, offer.token, offer.pairingUrl, encodeURIComponent(offer.token), Buffer.from(offer.token).toString('base64')];
    let failures = 0;
    let planted = 0;
    const outputs = [];
    const run = (label, { profile, naming, offers = [offer.handOff], count }) => {
        let r;
        try { r = scanProfile({ profileDir: profile, offers, markerKey: MARKER_KEY }); } catch (err) { r = { verdicts: [`threw ${err.message}`], sinks: [] }; }
        const text = formatScan(r).join('\n');
        outputs.push(text, ...(r.verdicts ?? []));
        if (naming === null) {
            if (r.verdicts.length) { console.error(`  FAIL ${label} -> not green: ${r.verdicts.join(' | ')}`); failures++; } else console.log(`  control ${label} -> green`);
            return;
        }
        const hit = r.verdicts.join('\n');
        if (!r.verdicts.length) { console.error(`  FAIL ${label} -> stayed green`); failures++; return; }
        if (!hit.includes(naming)) { console.error(`  FAIL ${label} -> red, but not naming '${naming}': ${hit}`); failures++; return; }
        if (count !== undefined && !hit.includes(`${count} match`)) { console.error(`  FAIL ${label} -> red naming '${naming}', but not with ${count} match(es): ${hit}`); failures++; return; }
        console.log(`  ok ${label} -> red, naming '${naming}'`);
        planted++;
    };
    try {
        // Needle derivation: every form Orca's source defines, derived from the hand-off text.
        const needles = needlesFromOffer(offer.handOff);
        const forms = needles.map((n) => n.form);
        for (const want of ['web-client URL', 'raw code', 'orca://pair? form', '#pairing= fragment', 'URL-encoded pairing URL', 'device token', 'percent-encoded token', 'base64 token']) {
            if (!forms.includes(want)) { console.error(`  FAIL needle derivation -> no '${want}' form`); failures++; }
        }
        if (needles.find((n) => n.form === 'device token')?.bytes.toString() !== offer.token) { console.error('  FAIL needle derivation -> the decoded deviceToken differs from the fixture'); failures++; }
        try { needlesFromOffer('http://127.0.0.1:1/web-index.html#pairing=not-a-pairing-payload'); console.error('  FAIL an undecodable offer -> derived needles'); failures++; } catch (err) {
            if (/needle form not derivable/.test(err.message)) { console.log('  ok an undecodable offer -> red, naming \'needle form not derivable\''); planted++; } else { console.error(`  FAIL an undecodable offer -> threw without naming it: ${err.message}`); failures++; }
        }
        // Clean control: both sinks read, the marker found, no runtime key.
        run('clean profile', { profile: fixtureProfile(tmp), naming: null });
        // Each sink, each encoding.
        for (const sink of SINKS) {
            for (const [form, text] of [['raw code', offer.code], ['web-client URL', offer.handOff], ['orca://pair? form', offer.pairingUrl], ['percent-encoded token', encodeURIComponent(offer.token)], ['base64 token', Buffer.from(offer.token).toString('base64')], ['device token', offer.token]]) {
                const profile = fixtureProfile(tmp);
                plant(profile, sink.name, text);
                run(`${form} planted in ${sink.name}`, { profile, naming: `offer found in ${sink.name}`, count: form === 'raw code' ? 1 : undefined });
            }
        }
        // The behaviour list's two named cases.
        { const profile = fixtureProfile(tmp); plant(profile, 'setups.json', offer.code); run('raw code in setups.json (count 1)', { profile, naming: 'offer found in setups.json (1 match', count: 1 }); }
        { const profile = fixtureProfile(tmp); plant(profile, 'powerbrowser-shell-state.json', encodeURIComponent(offer.token)); run('percent-encoded deviceToken in the shell state', { profile, naming: 'offer found in powerbrowser-shell-state.json' }); }
        // The key probe.
        run('an origin without the marker', { profile: fixtureProfile(tmp, { keys: ['other.key'] }), naming: 'collector blind' });
        run('the runtime-environment key present', { profile: fixtureProfile(tmp, { keys: [MARKER_KEY, RUNTIME_ENV_KEY] }), naming: `${RUNTIME_ENV_KEY} present in http://127.0.0.1:40404` });
        run('no origin storage at all', { profile: fixtureProfile(tmp, { keys: null }), naming: 'collector blind' });
        run('a profile with no readable sink', { profile: fixtureProfile(tmp, { sinks: false }), naming: 'zero sinks read' });
        // The output never carries a needle.
        const all = outputs.join('\n');
        const leaked = forbidden.filter((n) => all.includes(n));
        if (leaked.length) { console.error(`  FAIL needle bytes in the scanner output (${leaked.length} form(s))`); failures++; } else console.log('  control the scanner output holds no needle');
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${planted} planted faults each went red naming the sink`);
    return 0;
}

// ---------------------------------------------------------------------------
// Live.

async function main() {
    const live = await import('./verify-orca-relaunch-restore-live.mjs');
    const pre = await live.livePrerequisites();
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    const offers = [];
    let result;
    try {
        result = await live.withOrcaProfile(async (session) => {
            await session.launch(async (s) => {
                offers.push(await s.offer());
                await s.writeMarker(MARKER_KEY);
                await s.addRepository();
                await s.selectWorktree();
                const chat = await s.newHosted('powerbrowser.orca.newChat', 'agent-session');
                if (!chat) throw new Error('New Orca Chat gave no hosted chat widget within 10 s');
                const saved = await s.saveSetup('P65 offer scan');
                if (!saved) throw new Error('the Setup was not saved through Setups\' own command');
                return s.quit();
            });
            return scanProfile({ profileDir: session.profileDir, offers, markerKey: MARKER_KEY });
        });
    } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    for (const line of formatScan(result)) console.log(`${NAME}: ${line}`);
    const missing = SINKS.filter((sink) => !result.sinks.some((r) => r.name === sink.name && r.read)).map((sink) => `sink ${sink.name} not read`);
    const verdicts = [...result.verdicts, ...missing];
    if (verdicts.length) { for (const v of verdicts) console.error(`${NAME}: FAIL -- ${v}`); return 1; }
    console.log(`${NAME}: PASS -- ${result.sinks.filter((s) => s.read).length} sinks and ${result.origins.length} origin(s) read; no needle of the launch's offer found; marker found; no ${RUNTIME_ENV_KEY}`);
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
