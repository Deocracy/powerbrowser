#!/usr/bin/env node
// scripts/verify-orca-pairing-containment.mjs
//
// orca-pairing-containment (Phase 67, RUN-07, ROADMAP Phase 67 criterion 2;
// P67-08..P67-12, A-8): the pairing offer orcad issued reaches none of
// PowerBrowser's sinks. Built on Phase 65's one scanner,
// scripts/lib/orca-offer-scan.mjs (P65-23, CA-09): needles, the byte scanner
// and every collector live there; this file drives it.
//
// Derivations, in order:
//   1. The needles come from the offer text in memory (the web-pairing file a
//      live run reads once, or a synthetic offer in the self-test): the raw
//      code, its URL-encoded form, the orca://pair? form, the #pairing=
//      fragment and the decoded deviceToken, decoded as Orca's
//      decodePairingPayload does (web-pairing.ts), plus Phase 65's extra forms.
//   2. Each sink has one collector { sink, control, read }. The control is a
//      harmless marker that travelled the same path; a collector whose
//      control is not found is red "collector blind", never green (P67-11).
//   3. Holder 5 (orcad's registry files) is derived from the pin at check
//      time (A-8); a pin whose source no longer names it is red "source moved".
//
// The five holders the offer may live in (P67-08): OrcaService memory; the
// 0600 web-pairing file in the 0700 bridge folder; Theia backend memory and
// one RPC reply; the Theia origin's storage (key absence is Phase 65's
// orca-offer-scan probe); orcad's registry files derived from the pin
// (orca-devices.json, its durable-write temporaries and corrupt-* quarantine
// copies; the keypair file is excluded and not expected to hold a needle).
// Every other place is a sink.
//
// Limit: a sink not listed here is not proven. Output is sink names and
// counts only, through installOutputRedaction; no offer, needle, token or
// pairing URL is printed, logged or written.
//
// Live run (tier full; a coordinator proof on the merged, built tree):
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-pairing-containment.mjs
// MOZ_PURGE_CACHES=1 is set and every inherited ORCA_* name removed at start
// (Phase 65's withOrcaProfile, scripts/verify-orca-relaunch-restore-live.mjs).
// One launch on a profile under .mozbuild/pb-live-profiles/ (P67-21): ready
// and paired; the offer read once from <bridgeDir>/web-pairing; the bridge
// folder and non-loopback-peer collectors run while orcad runs; a marker page
// (servePages, random path) opens in a PB web tab; New Orca Chat opens a
// hosted chat tab; the diagnostics layer's rows and log are read from the
// chrome document; the address text of every Orca tab and of the control web
// tab is read from the chrome bar, and each Orca tab's address copy from
// TabUriRegistry (the OS clipboard is never read); a Setup is saved through
// Setups' own command; stdout (devtools.console.stdout.content in user.js) and
// stderr are captured to a .mozbuild work folder removed after the run;
// PowerBrowser quits; then every collector runs. A run that read zero sinks
// is red. SKIP (exit 0, one named line) without a built PowerBrowser, Theia
// app or orca/, as Phase 65's livePrerequisites decides.
//
// Usage:
//   node scripts/verify-orca-pairing-containment.mjs              (live; tier full)
//   node scripts/verify-orca-pairing-containment.mjs --self-test  (fixtures; tier quick)

import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { installOutputRedaction } from './lib/orca-run.mjs';
import { decodeMozLz4, encodeMozLz4Literal } from './lib/mozlz4.mjs';
import {
    COLLECTORS, addressFieldCollector, bridgeFolderCollector, collectorLine, copyableTextCollector, historyCollector,
    logsCollector, needlesFromOffer, nonLoopbackPeerCollector, offerEndpoint, registryFilesFromPin, runCollector,
    sessionRestoreCollector, setupsCollector, wholeProfileCollector,
} from './lib/orca-offer-scan.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'orca-pairing-containment';
const SELF_REL = 'scripts/verify-orca-pairing-containment.mjs';
const OFFER_FILE = 'web-pairing';
const LOG_CONTROL = 'orcad ready on ';

// ---------------------------------------------------------------------------
// Fixtures: synthetic offers only, never a real one.

/** A hand-off text in the shape OrcaService writes: a web-client URL whose #pairing= fragment carries orca://pair?code=. */
export function syntheticOffer({ endpoint = 'ws://127.0.0.1:26768', token = 'synthetic+containment/token=0001' } = {}) {
    const payload = { v: 2, endpoint, deviceToken: token, publicKeyB64: 'c3ludGhldGljLWtleQ', scope: 'runtime' };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const pairingUrl = `orca://pair?code=${code}`;
    return { handOff: `http://127.0.0.1:26768/web-index.html#pairing=${encodeURIComponent(pairingUrl)}`, code, token, pairingUrl };
}

const put = (path, data, mode) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); if (mode) chmodSync(path, mode); };

/** places.sqlite with a moz_places row per url. */
function writePlaces(profileDir, urls) {
    const db = new DatabaseSync(join(profileDir, 'places.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT)');
    const insert = db.prepare('INSERT INTO moz_places (url, title) VALUES (?, ?)');
    for (const url of urls) insert.run(url, 'fixture page');
    db.close();
}

const sessionFile = (url) => encodeMozLz4Literal(JSON.stringify({ version: ['sessionrestore', 1], windows: [{ tabs: [{ entries: [{ url, title: 'fixture' }] }] }] }));

/** The four pinned source sites holder 5 is derived from, in the pin's own shape; `rename` breaks the registry constant. */
function writePin(dir, { rename = false } = {}) {
    put(join(dir, 'src/main/runtime/mobile-pairing-files.ts'), `import { E2EE_KEYPAIR_FILENAME } from '../../shared/runtime-e2ee-keypair-file'\n\nexport const ${rename ? 'DEVICE_REGISTRY_FILE' : 'DEVICE_REGISTRY_FILENAME'} = 'orca-devices.json'\nexport { E2EE_KEYPAIR_FILENAME }\n\nexport const MOBILE_PAIRING_USERDATA_FILES = [\n  DEVICE_REGISTRY_FILENAME,\n  E2EE_KEYPAIR_FILENAME\n] as const\n`);
    put(join(dir, 'src/shared/runtime-e2ee-keypair-file.ts'), `export const E2EE_KEYPAIR_FILENAME = 'orca-e2ee-keypair.json'\n`);
    put(join(dir, 'src/main/filesystem/durable-file-write.ts'), 'export function durableWriteTempPath(finalPath: string, owner?: string): string {\n  const ownerSuffix = owner === undefined ? \'\' : `.owner-${owner}`\n  return `${finalPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}${ownerSuffix}.tmp`\n}\n');
    put(join(dir, 'src/main/runtime/device-registry-corruption.ts'), 'function corruptCopyPrefix(registryPath: string): string {\n  return `${basename(registryPath)}.corrupt-`\n}\n');
    return dir;
}

/**
 * A clean fixture under `dir`, every control present: a profile (places, session files, Setups, shell state, an orcad
 * data root, the Theia origin's storage), a 0700 bridge folder with a 0600 offer file, a /proc tree with loopback
 * LISTEN sockets, and the captured texts. Holders carry the offer on purpose (registry, its temporary and quarantine
 * copies, the Theia origin's storage), so a green clean run proves the holder exclusions.
 */
function fixture(dir, offer, pin, marker) {
    const profileDir = join(dir, 'profile');
    const dataRoot = join(profileDir, 'powerbrowser-orca');
    const bridgeDir = join(dir, 'bridge');
    const procRoot = join(dir, 'proc');
    mkdirSync(profileDir, { recursive: true });
    writePlaces(profileDir, [marker]);
    put(join(profileDir, 'sessionstore.jsonlz4'), sessionFile(marker));
    put(join(profileDir, 'sessionstore-backups/recovery.jsonlz4'), sessionFile(marker));
    put(join(profileDir, 'powerbrowser-theia/setups.json'), JSON.stringify({ setups: [{ name: 'P67 containment', windows: [] }] }));
    put(join(profileDir, 'powerbrowser-shell-state.json'), JSON.stringify({ tabs: ['pb-orca:chat1'] }));
    put(join(profileDir, 'prefs.js'), 'user_pref("browser.startup.homepage", "about:blank");\n');
    put(join(dataRoot, 'orca-data.json'), JSON.stringify({ repos: [] }));
    put(join(dataRoot, 'orca-devices.json'), JSON.stringify({ devices: [{ token: offer.token }] }));
    put(join(dataRoot, 'orca-devices.json.4242.1700000000000.9f3a2b.tmp'), JSON.stringify({ devices: [{ token: offer.token }] }));
    put(join(dataRoot, 'orca-e2ee-keypair.json'), JSON.stringify({ publicKeyB64: 'c3ludGhldGljLWtleQ' }));
    put(join(profileDir, 'storage/default/http+++127.0.0.1+40404/ls/data.sqlite'), offer.handOff); // holder 4 stand-in
    mkdirSync(bridgeDir, { recursive: true });
    chmodSync(bridgeDir, 0o700);
    put(join(bridgeDir, OFFER_FILE), offer.handOff, 0o600);
    put(join(bridgeDir, 'orcad-data-root'), dataRoot, 0o600);
    const listen = (addr, inode) => `   0: ${addr}:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 ${inode} 1 0000000000000000 100 0 0 10 0`;
    put(join(procRoot, 'net/tcp'), ['  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode', listen('0100007F', 1001), listen('0100007F', 1002)].join('\n') + '\n');
    put(join(procRoot, 'net/tcp6'), '  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n');
    for (const [pid, inode] of [[111, 1001], [222, 1002]]) {
        mkdirSync(join(procRoot, String(pid), 'fd'), { recursive: true });
        symlinkSync(`socket:[${inode}]`, join(procRoot, String(pid), 'fd', '3'));
    }
    return {
        marker, profileDir, dataRoot, bridgeDir, procRoot, offerFile: OFFER_FILE, holder5: registryFilesFromPin(pin),
        theiaOriginDir: 'http+++127.0.0.1+40404', setupName: 'P67 containment', logControl: LOG_CONTROL,
        logTexts: [`${LOG_CONTROL}127.0.0.1:26768, pid 111, terminal daemon pid 112.`, 'POWERBROWSER_SHELL_READY'],
        addressTexts: [{ kind: 'control', text: marker }, { kind: 'orca', text: 'pb-orca:chat1' }],
        copyable: { rows: ['Port: 3000', 'Orca port: 26768', 'Orca state: ready'], log: 'theia backend started', tabAddresses: ['pb-orca:chat1'] },
        endpoint: offerEndpoint(offer.handOff), orcaPort: 26768, pids: { orcad: [111], theia: [222] },
    };
}

// ---------------------------------------------------------------------------
// Self-test.

function runSelfTest() {
    const root = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const offer = syntheticOffer();
    const needles = needlesFromOffer(offer.handOff);
    const secrets = needles.map((n) => n.bytes.toString('utf8'));
    const restore = installOutputRedaction(secrets);
    const marker = 'http://127.0.0.1:1/containment-marker-0001';
    const pin = writePin(join(root, 'pin'));
    let failures = 0;
    let cases = 0;
    let plants = 0;
    const printed = [];
    const ok = (line) => { cases++; printed.push(line); console.log(`  ok ${line}`); };
    const bad = (line) => { failures++; printed.push(line); console.error(`  FAIL ${line}`); };
    let n = 0;
    // A fresh clean fixture, changed by `plant`; `expect` null means green, else a text the red line must hold.
    const check = (label, collector, plant, expect) => {
        const ctx = { needles, ...fixture(join(root, `case-${++n}`), offer, pin, marker) };
        plant?.(ctx);
        const { red, line } = collectorLine(runCollector(collector, ctx));
        if (expect === null ? red : !(red && line.includes(expect))) { bad(`${label} -> ${line}`); return; }
        if (expect !== null && !expect.includes('collector blind')) plants++;
        ok(`${label} -> ${line}`);
    };
    const nonLoop = syntheticOffer({ endpoint: 'ws://192.168.1.5:26768' });
    try {
        // mozlz4: a literal round trip, a hand-built block with an overlapping match, a bad magic.
        const text = Buffer.from(JSON.stringify({ a: 'b'.repeat(300) }));
        if (decodeMozLz4(encodeMozLz4Literal(text)).equals(text)) ok('mozlz4 round trip of a 300-byte run'); else bad('mozlz4 round trip differs');
        const block = Buffer.concat([Buffer.from('mozLz40\0', 'latin1'), Buffer.from([12, 0, 0, 0, 0x35]), Buffer.from('abc'), Buffer.from([3, 0, 0x00])]);
        if (decodeMozLz4(block).toString() === 'abcabcabcabc') ok('mozlz4 decodes a hand-built match (offset 3, length 9)'); else bad('mozlz4 hand-built match decoded wrong');
        try { decodeMozLz4(Buffer.from('notLz40\0\0\0\0\0')); bad('mozlz4 accepted a bad magic'); } catch { ok('mozlz4 refuses a bad magic'); }
        // Holder 5 from the pin: the fixture pin, the real orca/ when fetched, and a renamed constant.
        if (existsSyncSafe(join(REPO_ROOT, 'orca', 'src'))) {
            try { const h = registryFilesFromPin(join(REPO_ROOT, 'orca')); if (h.isHolder('orca-devices.json') && h.isHolder('orca-devices.json.corrupt-1') && !h.isHolder('orca-data.json')) ok('holder 5 derived from orca/ at the pin'); else bad('holder 5 at the pin does not hold the registry set'); } catch (e) { bad(`holder 5 at the pin -> ${e.message}`); }
        } else ok('holder 5 at the pin not checked: no orca/ (the fixture pin stands in)');
        try { registryFilesFromPin(writePin(join(root, 'pin-moved'), { rename: true })); bad('a renamed registry constant stayed green'); } catch (e) { if (/^source moved/.test(e.message)) { plants++; ok(`a pin whose registry constant is renamed -> ${e.message.split(':')[0]}`); } else bad(`renamed registry constant -> ${e.message}`); }
        // Every collector green on the clean fixture: each control found, holders excluded.
        for (const c of COLLECTORS) check(`clean fixture, ${c.sink}`, c, null, null);
        // P67-12 plants, each on a fresh fixture.
        check('a moz_places row holding the pairing URL', historyCollector, (x) => writePlaces(x.profileDir, [offer.pairingUrl]), 'sink history: FAIL -- offer found');
        check('a WAL page holding the raw code', historyCollector, (x) => put(join(x.profileDir, 'places.sqlite-wal'), Buffer.concat([Buffer.alloc(32), Buffer.from(offer.code)])), 'sink history: FAIL -- offer found');
        check('a compressed session file holding the web-client URL', sessionRestoreCollector, (x) => put(join(x.profileDir, 'sessionstore-backups/previous.jsonlz4'), sessionFile(offer.handOff)), 'sink session restore: FAIL -- offer found');
        check('a Setups record holding the raw code', setupsCollector, (x) => put(join(x.profileDir, 'powerbrowser-theia/setups.json'), JSON.stringify({ setups: [{ name: 'P67 containment', windows: [{ url: offer.code }] }] })), 'sink setups and shell state: FAIL -- offer found');
        check('a log text holding the device token', logsCollector, (x) => x.logTexts.push(`connected with ${offer.token}`), 'sink logs: FAIL -- offer found');
        check('a needle in orca-data.json in the data root', logsCollector, (x) => put(join(x.dataRoot, 'orca-data.json'), JSON.stringify({ t: offer.token })), 'sink logs: FAIL -- offer found');
        check('a needle in orca-devices.json.corrupt-1 (holder 5, allowed)', logsCollector, (x) => put(join(x.dataRoot, 'orca-devices.json.corrupt-1'), JSON.stringify({ t: offer.token })), null);
        check('a needle in orca-devices.json.corrupt-1, whole profile (holder 5, allowed)', wholeProfileCollector, (x) => put(join(x.dataRoot, 'orca-devices.json.corrupt-1'), JSON.stringify({ t: offer.token })), null);
        check('an address text holding the web-client URL', addressFieldCollector, (x) => x.addressTexts.push({ kind: 'orca', text: offer.handOff }), 'sink address field: FAIL -- offer found');
        check('a diagnostics text holding the raw code', copyableTextCollector, (x) => x.copyable.rows.push(`Orca offer: ${offer.code}`), 'sink copyable text: FAIL -- offer found');
        check('a tab-address copy holding the pairing URL', copyableTextCollector, (x) => x.copyable.tabAddresses.push(offer.pairingUrl), 'sink copyable text: FAIL -- offer found');
        check('a profile file outside every holder holding the token', wholeProfileCollector, (x) => appendFileSync(join(x.profileDir, 'prefs.js'), `// ${offer.token}\n`), 'sink whole profile: FAIL -- offer found');
        check('a 0644 offer file in a 0755 folder', bridgeFolderCollector, (x) => { chmodSync(x.bridgeDir, 0o755); chmodSync(join(x.bridgeDir, OFFER_FILE), 0o644); }, 'sink bridge folder: FAIL -- bridge folder mode');
        check('a stray copy web-pairing.bak in the bridge folder', bridgeFolderCollector, (x) => put(join(x.bridgeDir, `${OFFER_FILE}.bak`), offer.handOff, 0o600), 'stray copy (1 file other than web-pairing holds a needle)');
        check('an offer whose endpoint is ws://192.168.1.5:26768', nonLoopbackPeerCollector, (x) => { x.endpoint = offerEndpoint(nonLoop.handOff); }, 'sink non-loopback peer: FAIL -- non-loopback peer: the decoded endpoint');
        check('a Theia backend LISTEN socket on 0.0.0.0', nonLoopbackPeerCollector, (x) => put(join(x.procRoot, 'net/tcp'), `header\n   0: 0100007F:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000 0 1001 1\n   1: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000 0 1002 1\n`), 'sink non-loopback peer: FAIL -- non-loopback peer: 1 listening socket(s) off loopback');
        // A blind collector for each control kind.
        const blind = 'collector blind';
        check('history without its marker row', historyCollector, (x) => { rmSync(join(x.profileDir, 'places.sqlite')); writePlaces(x.profileDir, ['http://127.0.0.1:1/other']); }, `sink history: FAIL -- ${blind}`);
        check('session files without the marker', sessionRestoreCollector, (x) => { put(join(x.profileDir, 'sessionstore.jsonlz4'), sessionFile('about:blank')); put(join(x.profileDir, 'sessionstore-backups/recovery.jsonlz4'), sessionFile('about:blank')); }, `sink session restore: FAIL -- ${blind}`);
        check('setups.json without the saved Setup', setupsCollector, (x) => put(join(x.profileDir, 'powerbrowser-theia/setups.json'), '{"setups":[]}'), `sink setups and shell state: FAIL -- ${blind}`);
        check('logs without the orcad ready line', logsCollector, (x) => { x.logTexts = ['POWERBROWSER_SHELL_READY']; }, `sink logs: FAIL -- ${blind}`);
        check('address texts without the control web tab', addressFieldCollector, (x) => { x.addressTexts = x.addressTexts.filter((a) => a.kind !== 'control'); }, `sink address field: FAIL -- ${blind}`);
        check('diagnostics rows without the Orca port row', copyableTextCollector, (x) => { x.copyable.rows = x.copyable.rows.filter((r) => !r.startsWith('Orca port')); }, `sink copyable text: FAIL -- ${blind}`);
        check('a profile without the marker bytes in places.sqlite', wholeProfileCollector, (x) => { rmSync(join(x.profileDir, 'places.sqlite')); writePlaces(x.profileDir, ['http://127.0.0.1:1/other']); }, `sink whole profile: FAIL -- ${blind}`);
        check('a bridge folder without the offer file', bridgeFolderCollector, (x) => rmSync(join(x.bridgeDir, OFFER_FILE)), `sink bridge folder: FAIL -- ${blind}`);
        check('no LISTEN row for orcad', nonLoopbackPeerCollector, (x) => { x.pids.orcad = [333]; }, `sink non-loopback peer: FAIL -- ${blind}`);
        // The output never carries a needle (the redaction is a second line of defence, not the proof).
        const leaked = secrets.filter((s) => printed.join('\n').includes(s));
        if (leaked.length) bad(`needle bytes in the check's output (${leaked.length} form(s))`); else ok('the output holds no needle');
    } finally {
        rmSync(root, { recursive: true, force: true });
        restore();
    }
    if (failures) {
        console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`);
        return 1;
    }
    console.log(`${NAME} self-test: PASS -- ${cases} cases, ${plants} planted faults each red naming its sink, ${COLLECTORS.length} controls found and ${COLLECTORS.length} blind collectors red`);
    return 0;
}

function existsSyncSafe(path) {
    try { return realpathSync(path) !== ''; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Live.

const chromeRead = async (app, body) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try {
    const OrcaService = ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService;
    const TheiaService = ChromeUtils.importESModule('chrome://powerbrowser/content/TheiaService.sys.mjs').TheiaService;
    return JSON.stringify((() => { ${body} })()); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));

async function main() {
    const live = await import('./verify-orca-relaunch-restore-live.mjs');
    const pre = await live.livePrerequisites();
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    for (const k of Object.keys(process.env)) if (k.startsWith('ORCA_')) delete process.env[k];
    const { servePages, probe, pollFor } = await import('./lib/pb-relaunch.mjs');
    const { openWebTab } = await import('./lib/pb-live-probe.mjs');
    mkdirSync(join(REPO_ROOT, '.mozbuild'), { recursive: true });
    const work = mkdtempSync(join(REPO_ROOT, '.mozbuild', `${NAME}-`));
    const markerPath = `/containment-marker-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const pages = await servePages({ [markerPath]: { title: 'PowerBrowser containment marker', body: 'marker' } });
    const marker = markerPath; // the random path: what every control looks for, whether or not a surface trims the scheme
    const setupName = 'P67 containment';
    const secrets = [];
    const restoreOutput = installOutputRedaction(secrets); // withOrcaProfile's own redaction ends when it returns
    process.env.PB_LIVE_STDOUT_PATH = join(work, 'stdout.log');
    process.env.PB_LIVE_STDERR_PATH = join(work, 'stderr.log');
    const results = [];
    let fragmentLine = null;
    try {
        await live.withOrcaProfile(async (session) => {
            appendFileSync(join(session.profileDir, 'user.js'), 'user_pref("devtools.console.stdout.content", true);\n');
            const holder5 = registryFilesFromPin(join(REPO_ROOT, 'orca'));
            let ctx = null;
            const quit = await session.launch(async (s) => {
                const offer = await s.offer(); // read once, held in memory and in the redaction list
                const needles = needlesFromOffer(offer);
                secrets.push(...needles.map((n) => n.bytes.toString('utf8')));
                const st = await chromeRead(s.app, 'return { orca: OrcaService.getState(), theia: TheiaService.getState() };');
                if (st.chromeError) throw new Error(`reading service state: ${st.chromeError}`);
                ctx = {
                    needles, marker, setupName, holder5, logControl: LOG_CONTROL, offerFile: OFFER_FILE,
                    profileDir: session.profileDir, dataRoot: st.orca.dataRoot, bridgeDir: st.orca.bridgeDir,
                    theiaOriginDir: `http+++127.0.0.1+${s.app.port}`, endpoint: offerEndpoint(offer), orcaPort: st.orca.port,
                    pids: { orcad: [st.orca.pid], theia: [st.theia.pid] }, procRoot: '/proc',
                };
                // While orcad runs: the offer file is removed on stop (P67-09).
                results.push(runCollector(bridgeFolderCollector, ctx), runCollector(nonLoopbackPeerCollector, ctx));
                const tabId = await openWebTab(s.app, pages.url(markerPath));
                await pollFor(async () => ((await s.app.contexts()).some((c) => c.url === pages.url(markerPath)) ? true : null), 30000, 'the marker web tab to load');
                await s.addRepository();
                await s.selectWorktree();
                if (!(await s.newHosted('powerbrowser.orca.newChat', 'agent-session'))) throw new Error('New Orca Chat gave no hosted chat widget within 10 s');
                const diag = await chromeRead(s.app, `window.powerbrowserShowDiagnostics();
                    const rows = [...document.getElementById('powerbrowser-diagnostics-fields').children].map(r => r.textContent);
                    const log = document.getElementById('powerbrowser-diagnostics-log').textContent;
                    window.powerbrowserHideDiagnostics();
                    return { rows, log, orcaLog: OrcaService.getRecentLog(), theiaLog: TheiaService.getRecentLog() };`);
                if (diag.chromeError) throw new Error(`reading the diagnostics layer: ${diag.chromeError}`);
                ctx.copyable = { rows: diag.rows, log: diag.log };
                ctx.logTexts = [...diag.orcaLog, ...diag.theiaLog];
                const orcaIds = (await s.hostedWidgets()).map((w) => w.id);
                const tabs = await probe(s.app, `const shell = get('ApplicationShell');
                    const registry = get('TabUriRegistry');
                    const web = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
                    const out = [];
                    for (const [kind, id] of [...${JSON.stringify(orcaIds)}.map(i => ['orca', i]), ['control', web.id]]) {
                        const w = shell.getWidgetById(id);
                        await shell.activateWidget(id);
                        await until(() => shell.mainPanel.currentTitle?.owner === w, 5000);
                        await new Promise(r => setTimeout(r, 300));
                        const input = document.querySelector('.pb-chrome-bar-input');
                        const uri = kind === 'orca' && w ? registry.uriOf(w) : null;
                        out.push({ kind, text: input ? input.value : null, copy: uri ? uri.toString(true) : null });
                    }
                    return { out, hash: location.hash };`);
                ctx.addressTexts = tabs.out.filter((t) => typeof t.text === 'string').map(({ kind, text }) => ({ kind, text }));
                ctx.copyable.tabAddresses = tabs.out.filter((t) => t.kind === 'orca' && t.copy).map((t) => t.copy);
                const fragment = String(tabs.hash ?? '').replace(/^#/, '');
                fragmentLine = `clause theia-fragment (recorded, 65-RESEARCH Q2): ${fragment ? (ctx.addressTexts.some((a) => a.text.includes(fragment)) ? 'PRESENT in an address text' : `absent from ${ctx.addressTexts.length} address text(s)`) : 'the Theia document has no fragment'}`;
                if (!(await s.saveSetup(setupName))) throw new Error('the Setup was not saved through Setups\' own command');
                return s.quit();
            });
            if (quit !== 'exited') throw new Error(`PowerBrowser did not exit after its own quit (${quit})`);
            const captured = (f) => { try { return readFileSync(join(work, f), 'utf8'); } catch { return ''; } };
            ctx.logTexts.push(captured('stdout.log'), captured('stderr.log'));
            for (const c of COLLECTORS) if (c !== bridgeFolderCollector && c !== nonLoopbackPeerCollector) results.push(runCollector(c, ctx));
        });
    } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        restoreOutput();
        return 1;
    } finally {
        await pages.close();
        delete process.env.PB_LIVE_STDOUT_PATH;
        delete process.env.PB_LIVE_STDERR_PATH;
        rmSync(work, { recursive: true, force: true }); // the captured output may hold a needle; it never outlives the run
    }
    try { return report(results, fragmentLine); } finally { restoreOutput(); }
}

function report(results, fragmentLine) {
    if (!results.length) { console.error(`${NAME}: FAIL -- zero sinks read: an absence proves nothing`); return 1; }
    let red = 0;
    for (const r of results) {
        const { red: isRed, line } = collectorLine(r);
        if (isRed) { red++; console.error(`${NAME}: ${line}`); } else console.log(`${NAME}: ${line}`);
    }
    if (fragmentLine) console.log(`${NAME}: ${fragmentLine}`);
    const missing = COLLECTORS.filter((c) => !results.some((r) => r.sink === c.sink)).map((c) => c.sink);
    if (missing.length) { console.error(`${NAME}: FAIL -- sink(s) not read: ${missing.join(', ')}`); return 1; }
    if (red) { console.error(`${NAME}: FAIL -- ${red} of ${results.length} sink(s) red`); return 1; }
    console.log(`${NAME}: PASS -- ${results.length} sinks read, each control found, no needle of the launch's offer outside its five holders`);
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
        console.error(`  Next step: run node ${SELF_REL} --self-test, or node ${SELF_REL} under the live lock.`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await main());
}
