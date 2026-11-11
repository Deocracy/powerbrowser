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
// Usage:
//   node scripts/verify-orca-pairing-containment.mjs              (live; tier full)
//   node scripts/verify-orca-pairing-containment.mjs --self-test  (fixtures; tier quick)

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { installOutputRedaction } from './lib/orca-run.mjs';
import { collectorLine, historyCollector, needlesFromOffer, runCollector } from './lib/orca-offer-scan.mjs';

const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-pairing-containment';
const SELF_REL = 'scripts/verify-orca-pairing-containment.mjs';

// ---------------------------------------------------------------------------
// Fixtures: synthetic offers only, never a real one.

/** A hand-off text in the shape OrcaService writes: a web-client URL whose #pairing= fragment carries orca://pair?code=. */
export function syntheticOffer({ endpoint = 'ws://127.0.0.1:26768', token = 'synthetic+containment/token=0001' } = {}) {
    const payload = { v: 2, endpoint, deviceToken: token, publicKeyB64: 'c3ludGhldGljLWtleQ', scope: 'runtime' };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const pairingUrl = `orca://pair?code=${code}`;
    return { handOff: `http://127.0.0.1:26768/web-index.html#pairing=${encodeURIComponent(pairingUrl)}`, code, token, pairingUrl };
}

/** places.sqlite with a moz_places row per url. */
function writePlaces(profileDir, urls) {
    const db = new DatabaseSync(join(profileDir, 'places.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT)');
    const insert = db.prepare('INSERT INTO moz_places (url, title) VALUES (?, ?)');
    for (const url of urls) insert.run(url, 'fixture page');
    db.close();
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
    let failures = 0;
    let cases = 0;
    const printed = [];
    const say = (line) => { printed.push(line); console.log(line); };
    // expect: null for green, else a substring the red line must hold.
    const check = (label, collector, ctx, expect) => {
        const { red, line } = collectorLine(runCollector(collector, { needles, marker, ...ctx }));
        printed.push(line);
        if (expect === null ? red : !(red && line.includes(expect))) {
            console.error(`  FAIL ${label} -> ${line}`);
            failures++;
            return;
        }
        cases++;
        say(`  ok ${label} -> ${line}`);
    };
    const profile = (name) => { const dir = join(root, name); mkdirSync(dir); return dir; };
    try {
        { const p = profile('h-clean'); writePlaces(p, [marker]); check('history, clean fixture', historyCollector, { profileDir: p }, null); }
        { const p = profile('h-row'); writePlaces(p, [marker, `http://127.0.0.1:2/x#pairing=${encodeURIComponent(offer.pairingUrl)}`]); check('history, a moz_places row holding the pairing-fragment needle', historyCollector, { profileDir: p }, 'sink history: FAIL -- offer found'); }
        { const p = profile('h-blind'); writePlaces(p, ['http://127.0.0.1:1/other']); check('history without its marker row', historyCollector, { profileDir: p }, 'sink history: FAIL -- collector blind'); }
        const leaked = secrets.filter((s) => printed.join('\n').includes(s));
        if (leaked.length) { console.error(`  FAIL needle bytes in the check's output (${leaked.length} form(s))`); failures++; } else say('  ok the output holds no needle');
    } finally {
        rmSync(root, { recursive: true, force: true });
        restore();
    }
    if (failures) {
        console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`);
        return 1;
    }
    console.log(`${NAME} self-test: PASS -- ${cases} cases: each control found on its clean fixture, each plant red naming its sink, each blind collector red`);
    return 0;
}

// ---------------------------------------------------------------------------
// Live.

async function main() {
    console.log(`${NAME}: SKIP -- the live run lands in Task 3 of plan 67-04`);
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
