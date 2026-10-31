#!/usr/bin/env node
// scripts/verify-binary-cache.mjs
//
// The binary-cache row (Phase 56, INF-05). nix/cache.json declares two backends behind one interface:
// Cachix first, the R2 S3-compatible bucket as the committed fallback. The row derives the substituters
// and the trusted public keys from the two backend blocks and requires the interface to equal them:
//
//  1. both backend blocks exist and carry their fields: cachix (cacheName, substituter, publicKey) and
//     r2 (bucket, endpoint, keyName, substituter, publicKey). A missing block or field is red, naming it;
//     an empty block never passes because the other backend covers for it;
//  2. the interface substituters equal [cachix.substituter, r2.substituter], in that order, and every one
//     is an https URL. A substituter disagreeing with its backend is red, naming both values;
//  3. the interface trusted keys equal [cachix.publicKey, r2.publicKey]. A key disagreeing is red;
//  4. the RENEWALS row for the cache token exists, by structure: an item cell beginning "binary-cache token",
//     an owner action that begins with an imperative verb and names its holder. Never judged by its date;
//  5. the shared-derivation tripwire: the Flatpak manifest's tarball URL template still derives from the same
//     release key as the flake package, so a cache and a manifest cannot point at different release shapes;
//  6. no credential-shaped literal is written into the cache config (a token prefix, a PEM block);
//  7. with --release, every placeholder (@NAME@) is refused: the owner has created the cache and filled it.
//
// Honestly --quick: JSON and text reads; no network, no cache, no account. The live substitute proof is
// owner-checkpoint evidence (plan 56-05), never a quick assertion.
//
// Usage:
//   node scripts/verify-binary-cache.mjs
//   node scripts/verify-binary-cache.mjs --release
//   node scripts/verify-binary-cache.mjs --self-test

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveChannel, diskReader } from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'binary-cache';
const SELF_REL = 'scripts/verify-binary-cache.mjs';
const CACHE_REL = 'nix/cache.json';
const RENEWALS_REL = 'docs/RENEWALS.md';
const FLATPAK_REL = 'flatpak/org.debios.PowerBrowser.json';
const TEMPLATE_TOKEN = '@RELEASE_URL_TEMPLATE@';
const VERBS = ['rotate', 'renew', 're-verify', 'replace', 'confirm', 'decide', 'record', 'check', 'review'];
// Credential shapes, assembled at run time so this file names none of them.
const CREDENTIAL_SHAPES = [
    new RegExp(`${'gh'}p_[A-Za-z0-9]{20,}`),
    new RegExp(`${'github'}_pat_[A-Za-z0-9_]{20,}`),
    new RegExp(`-----BEGIN [A-Z ]*PRIVATE KEY-----`),
];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release or --self-test.`);
        process.exit(2);
    }
}

// The cache-token row, read by structure from the RENEWALS table.
export function renewalsCacheRow(text) {
    if (text === null) return null;
    for (const line of text.split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length !== 5) continue;
        if (!/^binary-cache token/i.test(cells[0])) continue;
        const action = cells[3];
        const verb = (action.match(/^[A-Za-z-]+/) ?? [''])[0].toLowerCase();
        return { item: cells[0], verbOk: VERBS.includes(verb), holderOk: /holder:/i.test(action) };
    }
    return null;
}

export function runChecks(root, overrides = {}) {
    const read = overrides.read ?? diskReader(root);
    const release = overrides.release ?? args.includes('--release');
    const failures = [];
    const fail = (file, msg, next) => failures.push(`${file}: ${msg} Next step: ${next}`);

    const { failures: cfgFailures, facts } = deriveChannel(root, read);
    if (facts === null) {
        return { failures: cfgFailures.map(f => `${f} Next step: fix configuration.toml, then re-run this check.`) };
    }

    // --- 1. the cache config and its backend blocks --------------------------
    const cacheText = read(CACHE_REL);
    let cache = null;
    if (cacheText === null) {
        fail(CACHE_REL, 'is missing, so the flake package has no binary cache configuration.', 'restore nix/cache.json from git.');
    } else {
        try {
            cache = JSON.parse(cacheText);
        } catch {
            fail(CACHE_REL, 'does not parse as JSON.', 'restore nix/cache.json from git.');
        }
    }
    if (cache !== null) {
        const backends = { cachix: ['cacheName', 'substituter', 'publicKey'], r2: ['bucket', 'endpoint', 'keyName', 'substituter', 'publicKey'] };
        for (const [backend, fields] of Object.entries(backends)) {
            const block = cache[backend];
            if (block === undefined || block === null || typeof block !== 'object') {
                fail(CACHE_REL, `has no ${backend} backend block, so the cache has one backend and no fallback`, `add the ${backend} block with ${fields.join(', ')}.`);
                continue;
            }
            for (const f of fields) {
                if (typeof block[f] !== 'string' || block[f].trim() === '') {
                    fail(CACHE_REL, `has an empty ${backend}.${f}; that backend cannot serve, and the other backend must not cover for it`, `set ${backend}.${f} to its value.`);
                }
            }
        }

        // --- 2 and 3. the interface equals the backends -----------------------
        const cachix = cache.cachix ?? {};
        const r2 = cache.r2 ?? {};
        const wantSubs = [cachix.substituter, r2.substituter];
        const wantKeys = [cachix.publicKey, r2.publicKey];
        const iface = cache.interface ?? {};
        if (!Array.isArray(iface.substituters) || JSON.stringify(iface.substituters) !== JSON.stringify(wantSubs)) {
            fail(CACHE_REL, `interface.substituters is ${JSON.stringify(iface.substituters ?? null)} but the backends derive ${JSON.stringify(wantSubs)} (cachix then r2)`, 'make the interface list the two backend substituters, in that order.');
        }
        if (!Array.isArray(iface.trustedKeys) || JSON.stringify(iface.trustedKeys) !== JSON.stringify(wantKeys)) {
            fail(CACHE_REL, `interface.trustedKeys is ${JSON.stringify(iface.trustedKeys ?? null)} but the backends derive ${JSON.stringify(wantKeys)} (cachix then r2)`, 'make the interface list the two backend public keys, in that order.');
        }
        for (const s of wantSubs) {
            if (typeof s === 'string' && !/^https:\/\/[^/\s]+/.test(s)) {
                fail(CACHE_REL, `substituter ${JSON.stringify(s)} is not an https URL`, 'write the substituter as an https URL naming a host only, with no path.');
            }
        }

        // --- 6. no credential-shaped literal -------------------------------
        for (const shape of CREDENTIAL_SHAPES) {
            const hit = shape.exec(cacheText);
            if (hit) fail(CACHE_REL, `carries a credential-shaped literal (${JSON.stringify(hit[0].slice(0, 6))}...)`, 'remove it; tokens stay in the environment and are recorded by holder only.');
        }

        // --- 7. release mode refuses every placeholder ---------------------
        if (release) {
            const placeholders = [...cacheText.matchAll(/@[A-Z0-9_]+@/g)].map(m => m[0]);
            for (const p of [...new Set(placeholders)]) {
                fail(CACHE_REL, `still holds the placeholder ${p}, so a release would publish to a cache the owner has not created`, 'the owner creates the cache, then writes its public key and host here before the release.');
            }
        }
    }

    // --- 4. the RENEWALS row, by structure -------------------------------------
    const row = renewalsCacheRow(read(RENEWALS_REL));
    if (row === null) {
        fail(RENEWALS_REL, 'has no binary-cache token row, so the cache token has no holder and no rotation step', 'append the cache-token row; the owner rotates it.');
    } else {
        if (!row.verbOk) fail(RENEWALS_REL, `the ${row.item} row's owner action does not begin with an imperative verb`, 'start the owner action with rotate, renew, or confirm.');
        if (!row.holderOk) fail(RENEWALS_REL, `the ${row.item} row's owner action names no holder`, 'add "Holder: <who holds it>" to the owner action.');
    }

    // --- 5. the shared-derivation tripwire -------------------------------------
    const manifestText = read(FLATPAK_REL);
    let template = null;
    try {
        template = JSON.parse(manifestText ?? 'null')?.modules?.[0]?.sources?.find(s => s.type === 'archive')?.['x-checker-data']?.['url-template'] ?? null;
    } catch {
        template = null;
    }
    if (template !== TEMPLATE_TOKEN && template !== facts.checkerUrlTemplate) {
        fail(FLATPAK_REL, `the url-template ${JSON.stringify(template)} no longer derives from the release key ${facts.releaseKey} that ${CACHE_REL} serves; the cache and the manifest name different release shapes`, `set url-template to ${TEMPLATE_TOKEN}, so both files derive from the one release key.`);
    }

    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const { facts } = deriveChannel(REPO_ROOT, base);
    const cacheDoc = () => JSON.parse(base(CACHE_REL));
    const withCache = mutate => {
        const doc = cacheDoc();
        mutate(doc);
        return { read: r => (r === CACHE_REL ? JSON.stringify(doc, null, 2) : base(r)) };
    };
    const withText = (rel, transform) => {
        const original = base(rel);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${rel} did not apply: the anchor text moved`);
        return { read: r => (r === rel ? planted : base(r)) };
    };
    // A template that names another host: a manifest pointing at a release shape the cache does not serve.
    const neighbourUrl = `https://example.invalid/releases/download/v$version/${facts.app}-$version.${facts.token}.tar.xz`;

    const cases = [
        {
            name: 'interface substituter disagreeing with the Cachix backend', expect: 'interface.substituters',
            overrides: withCache(d => { d.interface.substituters[0] = 'https://evil.example.invalid'; }),
        },
        {
            name: 'interface trusted key disagreeing with the R2 backend', expect: 'interface.trustedKeys',
            overrides: withCache(d => { d.interface.trustedKeys[1] = 'not-the-r2-key'; }),
        },
        {
            name: 'R2 backend block removed', expect: 'no r2 backend block',
            overrides: withCache(d => { delete d.r2; }),
        },
        {
            name: 'R2 endpoint empty (the other backend must not cover for it)', expect: 'r2.endpoint',
            overrides: withCache(d => { d.r2.endpoint = ''; }),
        },
        {
            name: 'RENEWALS cache-token row removed', expect: RENEWALS_REL,
            overrides: withText(RENEWALS_REL, t => t.split('\n').filter(l => !/^\| binary-cache token/.test(l)).join('\n')),
        },
        {
            name: 'release mode with the placeholders still in place', expect: '@CACHIX_PUBLIC_KEY@',
            overrides: { release: true },
        },
        {
            name: 'Flatpak url-template naming another host (shared-derivation tripwire)', expect: FLATPAK_REL,
            overrides: withText(FLATPAK_REL, t => t.replace(`"url-template": "${TEMPLATE_TOKEN}"`, `"url-template": "${neighbourUrl}"`)),
        },
        {
            name: 'control: unmodified tree stays green', expect: null,
            overrides: {},
        },
    ];

    let failed = 0;
    let reds = 0;
    let greens = 0;
    const baseline = runChecks(REPO_ROOT, { read: base, release: false });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    for (const c of cases) {
        const overrides = c.overrides.read ? { ...c.overrides, release: c.overrides.release ?? false } : c.overrides;
        const { failures } = runChecks(REPO_ROOT, overrides);
        const text = failures.join('\n');
        if (c.expect === null) {
            if (failures.length > 0) {
                console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red but must stay green:\n${text}`);
                failed += 1;
            } else {
                greens += 1;
                console.log(`  ${c.name}: green`);
            }
            continue;
        }
        const hit = failures.find(f => f.includes(c.expect));
        if (!hit) {
            console.error(`${NAME}: --self-test FAIL -- '${c.name}' did not go red naming ${c.expect}:\n${text || '(no failure)'}`);
            failed += 1;
        } else if (text.includes(REPO_ROOT)) {
            console.error(`${NAME}: --self-test FAIL -- '${c.name}' leaked a checkout path into its output: ${text}`);
            failed += 1;
        } else {
            reds += 1;
            console.log(`  ${c.name}: red -- ${hit}`);
        }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${reds} planted drift(s) went red naming the backend, key, substituter or row, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the binary cache.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const mode = args.includes('--release') ? 'release mode' : 'quick mode';
    console.log(`${NAME}: PASS -- the Cachix and R2 backends share one interface in ${mode}; the cache-token row is present; the placeholders are the owner's to fill before a release`);
    return 0;
}

process.exit(main());
