#!/usr/bin/env node
// scripts/verify-flake-repack.mjs
//
// The flake-repack row (Phase 56, PKG-19; the Flatpak half is added by PKG-20). It proves the Nix
// package repacks the Release tarball and nothing else. Derived at check time, never typed:
//
//  1. the release key and version   releaseIdentity() via scripts/lib/channel-identity.mjs;
//  2. the tarball URL and name      <app>-<version>.<token>.tar.xz under /releases/download/<key>/,
//                                   with the token the first Target key of docs/RELEASING.md's table;
//  3. the derivation shape          nix/pkg/powerbrowser-bin.nix uses fetchurl, autoPatchelfHook,
//                                   makeWrapper and copyDesktopItems; builds nothing (dontBuild);
//                                   takes the flake's nodejs binding and never a nodejs_<N> literal;
//                                   carries the repack-only DisableAppUpdate merge; names x86_64-linux
//                                   only (no darwin literal, assumption A3); has no version literal;
//                                   reads the release key and hash record instead of typing them;
//  4. the hash record               nix/pkg/release-hash.json names the current release key and holds
//                                   a valid sha256 SRI. A stale key is red, naming the key and the DIST-12
//                                   bot-PR step that writes it. The sentinel placeholder is green in the
//                                   quick tier and red under --release, which the release job passes.
//  5. the flake outputs             flake.nix exposes packages.${system}.powerbrowser, packages.${system}.default
//                                   and overlays.default, and has no nodejs_<N> or darwin literal.
//
// NOT HERE: the live asset hash (it needs the published asset, so the DIST-12 bot PR computes it with
// nix store prefetch-file), and the build itself (a 50-minute tier-3 check, not a quick row).
//
// Honestly --quick: text reads, JSON and the generator's pure functions. No network, no nix, no build.
// This script and its --self-test only read the tree; every plant is applied in memory through
// runChecks' read override.
//
// Usage:
//   node scripts/verify-flake-repack.mjs
//   node scripts/verify-flake-repack.mjs --release      (refuses the sentinel placeholder hash)
//   node scripts/verify-flake-repack.mjs --self-test

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DOCS_REL, RELEASE_HASH_REL, SENTINEL_SRI, SENTINEL_TEXT, SRI_RE, deriveChannel, diskReader,
} from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'flake-repack';
const SELF_REL = 'scripts/verify-flake-repack.mjs';
const DERIV_REL = 'nix/pkg/powerbrowser-bin.nix';
const FLAKE_REL = 'flake.nix';
const BOT_STEP = 'the DIST-12 bot PR (channel-manifests.yml, job flake-hash-pr) writes it with nix store prefetch-file on the published asset';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release or --self-test.`);
        process.exit(2);
    }
}

// The neighbouring release key, derived from the current one, so the self-test names no literal key.
function neighbourKey(key) {
    return key.replace(/-(\d+)$/, (_m, d) => `-${Number(d) + 1}`);
}

export function runChecks(root, overrides = {}) {
    const read = overrides.read ?? diskReader(root);
    const release = overrides.release ?? false;
    const failures = [];
    const fail = (file, msg, next) => failures.push(`${file}: ${msg} Next step: ${next}`);
    const notes = [];

    const { failures: cfgFailures, facts } = deriveChannel(root, read);
    if (facts === null) {
        return { failures: cfgFailures.map(f => `${f} Next step: fix configuration.toml, then re-run this check.`), notes, placeholder: false };
    }

    // --- 3. the derivation shape ---------------------------------------------
    const deriv = read(DERIV_REL);
    if (deriv === null) {
        fail(DERIV_REL, 'is missing, so the flake package has no repack derivation.', 'restore nix/pkg/powerbrowser-bin.nix from git.');
    } else {
        const required = [
            [/\bfetchurl\b/, 'fetchurl fetches the tarball'],
            [/\bautoPatchelfHook\b/, 'autoPatchelfHook rewrites the ELF interpreter and rpath'],
            [/\bmakeWrapper\b/, 'makeWrapper wraps the launcher'],
            [/\bcopyDesktopItems\b/, 'copyDesktopItems is in nativeBuildInputs'],
            [/dontBuild\s*=\s*true/, 'dontBuild = true (the derivation compiles nothing)'],
            [/\.policies\.DisableAppUpdate\s*=\s*true/, 'the repack-only DisableAppUpdate merge'],
            [/releases\/download\/\$\{releaseKey\}\/\$\{tarball\}/, 'the tarball URL built from the release key and the derived tarball name'],
            [/makeBinPath \[ nodejs \]/, 'the sidecar PATH takes the flake nodejs binding'],
            [/platforms\s*=\s*\[\s*"x86_64-linux"\s*\]/, 'platforms is x86_64-linux only'],
            [/release-hash\.json/, 'the hash comes from the tracked hash record'],
            [/release\.txt/, 'the release key is read from the generator output'],
        ];
        for (const [re, what] of required) {
            if (!re.test(deriv)) fail(DERIV_REL, `lacks ${what}.`, 'restore that part of the derivation; the repack must match the release contract.');
        }
        const forbidden = [
            [/\bnodejs_\d+\b/, 'a nodejs_<N> literal (the sidecar takes the flake nodejs binding, never a second Node)'],
            [/aarch64-darwin|x86_64-darwin|\bdarwin\b/, 'a darwin system literal (assumption A3: darwin waits on the notarized DMG)'],
            [/\b\d{2,}\.\d+\.\d+/, 'a version literal (an ESR version derives from the release key; the license version is not one)'],
        ];
        for (const [re, what] of forbidden) {
            const hit = re.exec(deriv);
            if (hit) fail(DERIV_REL, `carries ${what}: ${JSON.stringify(hit[0])}.`, 'delete the literal and derive the value from the release key.');
        }
        const token = /targetToken\s*=\s*"([^"]+)"/.exec(deriv)?.[1];
        if (token !== facts.token) {
            fail(DERIV_REL, `names target token ${JSON.stringify(token ?? null)} but ${DOCS_REL} derives ${JSON.stringify(facts.token)}.`, 'make targetToken equal the Linux Target key in the asset table.');
        }
    }

    // --- 4. the hash record ---------------------------------------------------
    const recordText = read(RELEASE_HASH_REL);
    let record = null;
    if (recordText === null) {
        fail(RELEASE_HASH_REL, `is missing, so the flake package has no hash for ${facts.releaseKey}.`, `restore the record; ${BOT_STEP}.`);
    } else {
        try {
            record = JSON.parse(recordText);
        } catch {
            fail(RELEASE_HASH_REL, 'does not parse as JSON.', 'restore the record from git.');
        }
    }
    if (record !== null) {
        if (record.releaseKey !== facts.releaseKey) {
            fail(RELEASE_HASH_REL, `holds the hash for ${JSON.stringify(record.releaseKey ?? null)} but the release key is ${facts.releaseKey}, so the package would fetch a stale tarball`, `${BOT_STEP}, for ${facts.releaseKey}.`);
        } else if (!SRI_RE.test(record.sha256 ?? '')) {
            fail(RELEASE_HASH_REL, `holds ${JSON.stringify(record.sha256 ?? null)} for ${facts.releaseKey}, which is not a sha256 SRI value`, `${BOT_STEP}.`);
        } else if (record.sha256 === SENTINEL_SRI) {
            if (release) {
                fail(RELEASE_HASH_REL, `still holds the placeholder ${SENTINEL_TEXT} for ${facts.releaseKey}, so a release would refuse to publish an unhashed tarball`, `${BOT_STEP}; the release refuses the placeholder until then.`);
            } else {
                notes.push(`the ${facts.releaseKey} hash is the placeholder, which --release refuses until the bot PR fills it`);
            }
        }
    }

    // --- 5. the flake outputs -------------------------------------------------
    const flake = read(FLAKE_REL);
    if (flake === null) {
        fail(FLAKE_REL, 'is missing, so the flake has no outputs.', 'restore flake.nix from git.');
    } else {
        const outputs = [
            [/packages\.\$\{system\}\s*=\s*\{[\s\S]*?\bpowerbrowser\s*=\s*pkgsPowerBrowser\.callPackage/, 'packages.${system}.powerbrowser'],
            [/\bdefault\s*=\s*self\.packages\.\$\{system\}\.powerbrowser/, 'packages.${system}.default'],
            [/nodejs\s*=\s*pkgs\.nodejs_24\s*;/, 'the flake nodejs_24 binding the sidecar shares'],
            [/overlays\.default\s*=/, 'overlays.default'],
            [/nix\/pkg\/powerbrowser-bin\.nix/, 'the derivation file the packages call'],
            [/devShells\.\$\{system\}\s*=/, 'the existing devShells'],
        ];
        for (const [re, what] of outputs) {
            if (!re.test(flake)) fail(FLAKE_REL, `lacks ${what}.`, 'add the output so the package is exposed and the devShells stay as they were.');
        }
        // The one Node literal the flake may hold is the existing nodejs_24 binding; any other major is a second Node.
        const hit = /nodejs_(?!24\b)\d+|aarch64-darwin/.exec(flake);
        if (hit) fail(FLAKE_REL, `carries the literal ${JSON.stringify(hit[0])}; the sidecar uses the nodejs_24 binding and the flake is x86_64-linux only`, 'remove the literal and reuse the nodejs let-binding.');
    }

    notes.push(`release key ${facts.releaseKey}, tarball ${facts.tarballName}`);
    return { failures, notes, placeholder: record?.sha256 === SENTINEL_SRI };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const { facts } = deriveChannel(REPO_ROOT, base);
    const neighbour = neighbourKey(facts.releaseKey);
    const withPlant = (rel, transform) => {
        const original = base(rel);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${rel} did not apply: the anchor text moved`);
        return { read: r => (r === rel ? planted : base(r)) };
    };

    const cases = [
        {
            name: 'release-hash record for a stale key', expect: RELEASE_HASH_REL,
            overrides: withPlant(RELEASE_HASH_REL, t => JSON.stringify({ ...JSON.parse(t), releaseKey: neighbour }, null, 2)),
        },
        {
            name: 'release-hash record with a non-SRI hash', expect: RELEASE_HASH_REL,
            overrides: withPlant(RELEASE_HASH_REL, t => t.replace(/"sha256": "sha256-[^"]*"/, '"sha256": "sha256-not-a-real-digest"')),
        },
        {
            name: 'placeholder hash refused under --release', expect: RELEASE_HASH_REL,
            overrides: { release: true },
        },
        {
            name: 'nodejs_22 sidecar literal', expect: 'nodejs_22',
            overrides: withPlant(DERIV_REL, t => `${t}\n# sidecar: pkgs.nodejs_22\n`),
        },
        {
            name: 'darwin system literal', expect: 'aarch64-darwin',
            overrides: withPlant(DERIV_REL, t => t.replace('platforms = [ "x86_64-linux" ];', 'platforms = [ "x86_64-linux" "aarch64-darwin" ];')),
        },
        {
            name: 'version literal typed into the derivation', expect: 'carries a version literal',
            overrides: withPlant(DERIV_REL, t => t.replace('  pname = "powerbrowser";', `  pname = "powerbrowser";\n  # ${facts.version}`)),
        },
        {
            name: 'DisableAppUpdate merge missing from the repack', expect: 'DisableAppUpdate',
            overrides: withPlant(DERIV_REL, t => t.replace('.policies.DisableAppUpdate = true', '.policies.DisableTelemetry = true')),
        },
        {
            name: 'overlays.default missing from the flake', expect: 'overlays.default',
            overrides: withPlant(FLAKE_REL, t => t.replace('overlays.default =', 'overlays.other =')),
        },
        {
            name: 'control: unmodified tree stays green', expect: null,
            overrides: {},
        },
        {
            name: 'control: placeholder stays green in the quick tier', expect: null,
            overrides: { release: false },
        },
    ];

    let failed = 0;
    let reds = 0;
    let greens = 0;
    const baseline = runChecks(REPO_ROOT, { read: base });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    for (const c of cases) {
        const { failures } = runChecks(REPO_ROOT, c.overrides);
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
    console.log(`${NAME}: --self-test PASS -- ${reds} planted fault(s) went red naming the file or value, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, notes, placeholder } = runChecks(REPO_ROOT, { release: args.includes('--release') });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the flake repack.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const mode = args.includes('--release') ? 'release mode' : 'quick mode';
    console.log(`${NAME}: PASS -- the flake package repacks the tarball in ${mode}; ${notes.join("; ")}`);
    return 0;
}

process.exit(main());
