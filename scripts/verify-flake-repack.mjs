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
    DOCS_REL, HEX_RE, RELEASE_HASH_REL, SENTINEL_SRI, SENTINEL_TEXT, SRI_RE, deriveChannel, diskReader, sriToHex,
} from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'flake-repack';
const SELF_REL = 'scripts/verify-flake-repack.mjs';
const DERIV_REL = 'nix/pkg/powerbrowser-bin.nix';
const FLAKE_REL = 'flake.nix';
const FLATPAK_REL = 'flatpak/org.debios.PowerBrowser.json';
const URL_TOKEN = '@RELEASE_URL@';
const NIX_COPY_REL = 'docs/download-nix.md';
const REPO_TOKEN = '@RELEASE_REPO@';
const SHA_TOKEN = '@RELEASE_SHA256@';
const TEMPLATE_TOKEN = '@RELEASE_URL_TEMPLATE@';
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
            [/--prefix LD_LIBRARY_PATH : \$\{dlopenPath\}/, 'the wrapper puts the dlopen libraries on LD_LIBRARY_PATH, as the nixpkgs firefox wrapper does (WR-08)'],
            [/stdenv\.cc\.cc\.lib/, 'libstdc++ (stdenv.cc.cc.lib) in the runtime libraries'],
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
            [/overlays\.default[\s\S]*?nodejs\s*=\s*final\.nodejs_24\s*;/, 'the overlay binding the consumer nodejs_24 (final.nodejs_24, not the flake own)'],
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

    // --- 6. the Flatpak manifest shares the derivation's URL, hash and checker template (PKG-20) -----
    // The manifest carries the release values as tokens, which the release renders; a literal is allowed
    // only when it equals the derived value, so a second literal for the same tarball cannot drift apart.
    const manifestText = read(FLATPAK_REL);
    if (manifestText === null) {
        fail(FLATPAK_REL, 'is missing, so the Flatpak repack has no tarball source to compare with the derivation.', 'restore flatpak/org.debios.PowerBrowser.json from git.');
    } else {
        let manifest = null;
        try {
            manifest = JSON.parse(manifestText);
        } catch {
            fail(FLATPAK_REL, 'does not parse as JSON.', 'restore the manifest from git.');
        }
        const archive = manifest?.modules?.[0]?.sources?.find(src => src.type === 'archive');
        if (manifest !== null && archive === undefined) {
            fail(FLATPAK_REL, 'has no archive source for the release tarball.', 'add the archive source with the release URL and hash tokens.');
        }
        if (archive !== undefined) {
            if (archive.url !== URL_TOKEN && archive.url !== facts.tarballUrl) {
                fail(FLATPAK_REL, `fetches ${JSON.stringify(archive.url)} but the derivation fetches ${facts.tarballUrl}; the manifest must carry ${URL_TOKEN} or that exact URL`, 'replace the URL with the release token.');
            }
            const expectHex = record === null ? null : sriToHex(record.sha256);
            if (archive.sha256 !== SHA_TOKEN && !(HEX_RE.test(archive.sha256 ?? '') && archive.sha256 === expectHex)) {
                fail(FLATPAK_REL, `pins sha256 ${JSON.stringify(archive.sha256 ?? null)} but ${RELEASE_HASH_REL} holds ${expectHex ?? 'no valid hash'} for the derivation; two hashes for one tarball disagree`, `replace the hash with ${SHA_TOKEN}, so the release renders it from the hash record.`);
            }
            const checker = archive['x-checker-data'];
            if (checker === undefined || checker === null) {
                fail(FLATPAK_REL, 'has no x-checker-data on the archive source, so external-data-checker cannot open the per-release pull request', 'add x-checker-data with the release URL template.');
            } else if (checker['url-template'] !== TEMPLATE_TOKEN && checker['url-template'] !== facts.checkerUrlTemplate) {
                fail(FLATPAK_REL, `x-checker-data url-template is ${JSON.stringify(checker['url-template'] ?? null)} but the release derives ${facts.checkerUrlTemplate}`, `set url-template to ${TEMPLATE_TOKEN}.`);
            }
        }
        const literalVersion = /\b\d{2,}\.\d+\.\d+/.exec(manifestText);
        if (literalVersion) fail(FLATPAK_REL, `carries the version literal ${JSON.stringify(literalVersion[0])}; every version reaches the manifest through a token`, 'replace the literal with the release token.');
    }

    // --- 7. the /download Nix copy names the product, takes the repo token and carries no internal identifier ---
    const copy = read(NIX_COPY_REL);
    if (copy === null) {
        fail(NIX_COPY_REL, 'is missing, so the /download Nix row has no paste-ready copy.', 'restore docs/download-nix.md from git.');
    } else {
        if (!/PowerBrowser/.test(copy)) fail(NIX_COPY_REL, 'does not name the product as PowerBrowser.', 'name the product in plain language.');
        if (!copy.includes(REPO_TOKEN)) fail(NIX_COPY_REL, `does not carry ${REPO_TOKEN}, so the install line would name no release home`, `use ${REPO_TOKEN}; the owner renders it from the release home at paste time.`);
        const leak = /app\.update|DisableAppUpdate|sha256|pref\s/i.exec(copy);
        if (leak) fail(NIX_COPY_REL, `carries the internal identifier ${JSON.stringify(leak[0])}`, 'remove it; the copy is for readers, not for the policy or the hash.');
        if (!copy.includes('--accept-flake-config')) fail(NIX_COPY_REL, 'does not tell the reader to accept the flake configuration (--accept-flake-config), without which a flake nixConfig never applies and nobody uses the cache (IN-03)', 'add the one sentence naming --accept-flake-config.');
        const v = /\b\d{2,}\.\d+\.\d+/.exec(copy);
        if (v) fail(NIX_COPY_REL, `carries the version literal ${JSON.stringify(v[0])}`, 'remove it; the install and upgrade lines name no version.');
    }

    notes.push(`release key ${facts.releaseKey}, tarball ${facts.tarballName}`);
    return { failures, notes, placeholder: record?.sha256 === SENTINEL_SRI };
}

// The tarball URL of the neighbouring release key, derived from the current one.
function neighbourUrl(facts) {
    return facts.tarballUrl.replace(facts.releaseKey, neighbourKey(facts.releaseKey)).replace(facts.tarballName, facts.tarballName.replace(facts.version, neighbourKey(facts.releaseKey).slice(1)));
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
            name: 'wrapper without the dlopen LD_LIBRARY_PATH prefix (WR-08)', expect: 'LD_LIBRARY_PATH',
            overrides: withPlant(DERIV_REL, t => t.replace(' \\\n      --prefix LD_LIBRARY_PATH : ${dlopenPath}', '')),
        },
        {
            name: 'libstdc++ dropped from the runtime libraries', expect: 'stdenv.cc.cc.lib',
            overrides: withPlant(DERIV_REL, t => t.replaceAll('stdenv.cc.cc.lib', 'xdg-utils')),
        },
        {
            name: 'overlay binds the flake own nodejs again (IN-02)', expect: 'consumer nodejs_24',
            overrides: withPlant(FLAKE_REL, t => t.replace('{ nodejs = final.nodejs_24; }', '{ inherit nodejs; }')),
        },
        {
            name: 'overlays.default missing from the flake', expect: 'overlays.default',
            overrides: withPlant(FLAKE_REL, t => t.replace('overlays.default =', 'overlays.other =')),
        },
        {
            name: 'Flatpak URL literal for a neighbouring release', expect: FLATPAK_REL,
            overrides: withPlant(FLATPAK_REL, t => t.replace(`"url": "${URL_TOKEN}"`, `"url": "${neighbourUrl(facts)}"`)),
        },
        {
            name: 'Flatpak hash literal disagreeing with the hash record', expect: FLATPAK_REL,
            overrides: withPlant(FLATPAK_REL, t => t.replace(`"sha256": "${SHA_TOKEN}"`, `"sha256": "${'0'.repeat(64)}"`)),
        },
        {
            name: 'Flatpak x-checker-data missing', expect: 'x-checker-data',
            overrides: withPlant(FLATPAK_REL, t => t.replace('"x-checker-data": {', '"x-checker-data-removed": {')),
        },
        {
            name: '/download Nix copy carries an internal identifier', expect: NIX_COPY_REL,
            overrides: withPlant(NIX_COPY_REL, t => `${t}\nSet pref DisableAppUpdate for the package.\n`),
        },
        {
            name: '/download Nix copy drops the accept-flake-config sentence (IN-03)', expect: '--accept-flake-config',
            overrides: withPlant(NIX_COPY_REL, t => t.replaceAll('--accept-flake-config', '--help')),
        },
        {
            name: '/download Nix copy carries a version literal', expect: 'version literal',
            overrides: withPlant(NIX_COPY_REL, t => t.replace('nix profile upgrade powerbrowser', 'nix profile upgrade powerbrowser 153.5.1')),
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
