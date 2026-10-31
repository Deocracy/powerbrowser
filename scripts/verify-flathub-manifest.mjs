#!/usr/bin/env node
// scripts/verify-flathub-manifest.mjs
//
// The flathub-manifest row (Phase 56, PKG-20, the static half). The Flathub manifest is submission-shaped
// and every value it names is derived from the tree at check time:
//
//  1. app id                 [identity] distribution_id + the display name, dotted: org.debios.PowerBrowser;
//  2. desktop and icon       flatpak/org.debios.PowerBrowser.desktop equals the tracked release desktop entry
//                            with its Exec rewritten to the bare launcher and its Icon set to the app id; the
//                            icon is byte-identical to the tracked 128-pixel branding PNG;
//  3. runtime                the Firefox BaseApp ref, org.mozilla.firefox.BaseApp (the Flathub base, not a
//                            literal of this project);
//  4. persist                --persist=.<vendor_machine, lowercased> in finish-args (.debios);
//  5. Flatpak-only disable   the build commands merge DisableAppUpdate into the staged policies copy;
//                            the policies-update-split row compares the values;
//  6. checker data           the archive source carries x-checker-data with a url-template naming the release
//                            asset shape, so external-data-checker can open the per-release pull request;
//  7. DNS TXT verification   x-flathub-verification names _flathub.<homepage host>, method dns-txt, and a
//                            token that is the placeholder until the owner sets the TXT value (release refuses it);
//  8. exception branch       x-source-exception is pending-owner-reply on the written-exception path, and the
//                            manifest carries one module: the from-source path is named, never half-built;
//  9. download copy          docs/download-flatpak.md names PowerBrowser, the Flatpak install line with the app id
//                            and no version literal, and no internal identifier;
// 10. cache interface        nix/cache.json lists the Cachix substituter the test build would use.
//
// The URL and hash equality with the flake package is the flake-repack row's section, not repeated here.
//
// Honestly --quick: JSON parses, text reads and the tracked branding bytes. No network, no flatpak-builder,
// no Flathub account. The submission and the DNS record are owner-checkpoint evidence (plan 56-05).
//
// Usage:
//   node scripts/verify-flathub-manifest.mjs
//   node scripts/verify-flathub-manifest.mjs --release     (refuses the placeholder verification token)
//   node scripts/verify-flathub-manifest.mjs --self-test

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveChannel, diskReader } from './lib/channel-identity.mjs';
import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'flathub-manifest';
const SELF_REL = 'scripts/verify-flathub-manifest.mjs';
const MANIFEST_REL = 'flatpak/org.debios.PowerBrowser.json';
const DESKTOP_REL = 'flatpak/org.debios.PowerBrowser.desktop';
const PNG_REL = 'flatpak/org.debios.PowerBrowser.png';
const TRACKED_DESKTOP_REL = 'powerbrowser/powerbrowser-release.desktop';
const TRACKED_PNG_REL = 'powerbrowser/branding/release/default128.png';
const CACHE_REL = 'nix/cache.json';
const COPY_REL = 'docs/download-flatpak.md';
const BASEAPP_REF = 'org.mozilla.firefox.BaseApp';
const VERIFY_PLACEHOLDER = '@FLATHUB_VERIFICATION_TOKEN@';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release or --self-test.`);
        process.exit(2);
    }
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// The desktop entry the Flatpak installs: the tracked one, with the launcher and the app-id icon.
export function flatpakDesktop(trackedText, appId) {
    return trackedText
        .replace(/^Exec=.*\/bin\/powerbrowser %u$/m, 'Exec=powerbrowser %u')
        .replace(/^Icon=.*$/m, `Icon=${appId}`);
}

export function runChecks(root, overrides = {}) {
    const read = overrides.read ?? diskReader(root);
    const readBytes = overrides.readBytes ?? (rel => readFileSync(join(root, rel)));
    const release = overrides.release ?? args.includes('--release');
    const failures = [];
    const fail = (file, msg, next) => failures.push(`${file}: ${msg} Next step: ${next}`);

    const { failures: cfgFailures, facts } = deriveChannel(root, read);
    if (facts === null) {
        return { failures: cfgFailures.map(f => `${f} Next step: fix configuration.toml, then re-run this check.`) };
    }
    const { config } = resolveConfig(join(root, 'configuration.toml'));
    const appId = `${config.identity.distribution_id}.${config.identity.display_name.replace(/\s+/g, '')}`;
    const persist = `--persist=.${config.product.vendor_machine.toLowerCase()}`;

    // --- the manifest --------------------------------------------------------
    const manifestText = read(MANIFEST_REL);
    let manifest = null;
    if (manifestText === null) {
        fail(MANIFEST_REL, 'is missing, so there is no Flathub manifest to submit.', 'restore flatpak/org.debios.PowerBrowser.json from git.');
    } else {
        try {
            manifest = JSON.parse(manifestText);
        } catch {
            fail(MANIFEST_REL, 'does not parse as JSON.', 'restore the manifest from git.');
        }
    }

    if (manifest !== null) {
        // 1. app id
        if (manifest['app-id'] !== appId) {
            fail(MANIFEST_REL, `names app-id ${JSON.stringify(manifest['app-id'] ?? null)} but the tracked identity derives ${appId}`, 'set app-id to the derived value.');
        }
        // 3. runtime
        if (manifest.runtime !== BASEAPP_REF) {
            fail(MANIFEST_REL, `names runtime ${JSON.stringify(manifest.runtime ?? null)} but the repack runs on ${BASEAPP_REF}`, `set runtime to ${BASEAPP_REF}.`);
        }
        // 4. persist
        if (!(manifest['finish-args'] ?? []).includes(persist)) {
            fail(MANIFEST_REL, `finish-args lacks ${persist}, so the per-user data would not survive an update (finish-args)`, `add ${persist} to finish-args.`);
        }
        // 5. the Flatpak-only disable key
        const commands = (manifest.modules ?? []).flatMap(m => (Array.isArray(m['build-commands']) ? m['build-commands'] : [])).join('\n');
        if (!/DisableAppUpdate/.test(commands)) {
            fail(MANIFEST_REL, 'the build commands never merge DisableAppUpdate into the staged policies copy, so the Flatpak would self-update outside the channel', 'add the DisableAppUpdate merge to the policies build command.');
        }
        // 6. checker data on the archive source
        const archive = (manifest.modules?.[0]?.sources ?? []).find(s => s.type === 'archive');
        const checker = archive?.['x-checker-data'];
        if (checker === undefined || checker === null) {
            fail(MANIFEST_REL, 'the archive source carries no x-checker-data, so external-data-checker cannot open the per-release pull request', 'add x-checker-data to the archive source.');
        } else if (typeof checker.url !== 'string' || !checker.url.includes('/releases/latest')) {
            fail(MANIFEST_REL, `x-checker-data names ${JSON.stringify(checker.url ?? null)}, not the latest-release API of the Release home`, 'point x-checker-data at the Release home latest-release API.');
        }
        // 7. DNS TXT verification
        const verify = manifest['x-flathub-verification'];
        const txtRecord = `_flathub.${facts.homeHost}`;
        if (verify === undefined || verify === null) {
            fail(MANIFEST_REL, 'carries no x-flathub-verification, so the DNS TXT step has no derived record name', 'add x-flathub-verification with the derived record.');
        } else {
            if (verify.method !== 'dns-txt') fail(MANIFEST_REL, `verification method is ${JSON.stringify(verify.method ?? null)}, not dns-txt`, 'set method to dns-txt.');
            if (verify.record !== txtRecord) {
                fail(MANIFEST_REL, `names the TXT record ${JSON.stringify(verify.record ?? null)} but the homepage host derives ${txtRecord}`, `set record to ${txtRecord}.`);
            }
            if (verify.token === VERIFY_PLACEHOLDER) {
                if (release) fail(MANIFEST_REL, `still holds the placeholder ${VERIFY_PLACEHOLDER}, so the submission would name no TXT value`, 'the owner sets the TXT value at the Flathub verification step, then writes it here.');
            } else if (typeof verify.token !== 'string' || !/^[A-Za-z0-9_.+/=-]{16,}$/.test(verify.token)) {
                fail(MANIFEST_REL, `holds the verification value ${JSON.stringify(verify.token ?? null)}, which does not have the shape of a TXT token`, 'write the TXT token the Flathub verification step shows.');
            }
        }
        // 8. the exception branch: one path, named, never both half-built
        const exception = manifest['x-source-exception'];
        if (exception === undefined || exception === null) {
            fail(MANIFEST_REL, 'carries no x-source-exception marker, so the submission path is not recorded', 'add the marker with status pending-owner-reply.');
        } else if (exception.status !== 'pending-owner-reply' || exception.branch !== 'written-exception') {
            fail(MANIFEST_REL, `marks the exception ${JSON.stringify(exception.status ?? null)} on ${JSON.stringify(exception.branch ?? null)}; until the owner's written reply is recorded it must read pending-owner-reply on written-exception`, 'keep the marker pending until the reply is recorded in docs/cache-flathub-checkpoint.md.');
        }
        const modules = manifest.modules ?? [];
        if (modules.length !== 1 || modules.some(m => /from-source/i.test(m.name ?? ''))) {
            fail(MANIFEST_REL, `carries ${modules.length} module(s), including a from-source path, so the exception and the rebuild are both half-built`, 'keep one repack module; the from-source manifest is a named follow-up, not part of this phase.');
        }
    }

    // --- 2. the desktop entry and the icon ------------------------------------
    const tracked = read(TRACKED_DESKTOP_REL);
    const desktop = read(DESKTOP_REL);
    if (tracked === null || desktop === null) {
        fail(DESKTOP_REL, 'or its tracked comparand is missing, so the desktop entry cannot be compared with the release', 'restore the file from git.');
    } else if (desktop !== flatpakDesktop(tracked, appId)) {
        fail(DESKTOP_REL, `differs from the tracked release desktop entry with Exec and Icon rewritten for ${appId}`, 'regenerate it from powerbrowser/powerbrowser-release.desktop with the same rewrite.');
    }
    let trackedPng = null;
    let png = null;
    try {
        trackedPng = readBytes(TRACKED_PNG_REL);
        png = readBytes(PNG_REL);
    } catch {
        fail(PNG_REL, 'or its tracked branding PNG is missing, so the icon cannot be compared', 'restore the icon from git.');
    }
    if (trackedPng !== null && png !== null && sha(png) !== sha(trackedPng)) {
        fail(PNG_REL, 'is not byte-identical to the tracked 128-pixel branding PNG', 'copy powerbrowser/branding/release/default128.png over it.');
    }

    // --- 9. the download copy --------------------------------------------------
    const copy = read(COPY_REL);
    if (copy === null) {
        fail(COPY_REL, 'is missing, so the /download Flatpak row has no paste-ready copy.', 'restore docs/download-flatpak.md from git.');
    } else {
        if (!copy.includes('PowerBrowser')) fail(COPY_REL, 'does not name the product as PowerBrowser.', 'name the product in plain language.');
        if (!copy.includes(`flatpak install flathub ${appId}`)) fail(COPY_REL, `has no install line for ${appId}`, `write: flatpak install flathub ${appId}`);
        const leak = /app\.update|DisableAppUpdate|x-checker|BaseApp|sha256/i.exec(copy);
        if (leak) fail(COPY_REL, `carries the internal identifier ${JSON.stringify(leak[0])}`, 'remove it; the copy is for readers.');
        const v = /\b\d{2,}\.\d+\.\d+/.exec(copy);
        if (v) fail(COPY_REL, `carries the version literal ${JSON.stringify(v[0])}`, 'remove it; the install and update lines name no version.');
    }

    // --- 10. the cache interface lists the substituter the test build would use ---
    const cacheText = read(CACHE_REL);
    let cache = null;
    try {
        cache = JSON.parse(cacheText ?? 'null');
    } catch {
        cache = null;
    }
    const cachixSub = cache?.cachix?.substituter;
    if (cache === null) {
        fail(CACHE_REL, 'does not parse as JSON, so the Cachix substituter cannot be read', 'restore nix/cache.json from git.');
    } else if (cachixSub === undefined || !(cache?.interface?.substituters ?? []).includes(cachixSub)) {
        fail(CACHE_REL, `does not list the Cachix substituter ${JSON.stringify(cachixSub ?? null)} in its interface, so a Flathub test build cannot substitute the flake package`, 'list the Cachix substituter in interface.substituters.');
    }

    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const withText = (rel, transform) => {
        const original = base(rel);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${rel} did not apply: the anchor text moved`);
        return { read: r => (r === rel ? planted : base(r)) };
    };
    const withManifest = mutate => {
        const doc = JSON.parse(base(MANIFEST_REL));
        mutate(doc);
        return { read: r => (r === MANIFEST_REL ? JSON.stringify(doc, null, 2) : base(r)) };
    };
    const { facts } = deriveChannel(REPO_ROOT, base);

    const cases = [
        {
            name: 'runtime off the Firefox BaseApp', expect: BASEAPP_REF,
            overrides: withManifest(d => { d.runtime = 'org.freedesktop.Platform'; }),
        },
        {
            name: '--persist removed from finish-args', expect: '--persist=',
            overrides: withManifest(d => { d['finish-args'] = d['finish-args'].filter(a => !a.startsWith('--persist')); }),
        },
        {
            name: 'Flatpak-only disable key merge removed', expect: 'DisableAppUpdate',
            overrides: withText(MANIFEST_REL, t => t.replace('d[\\"policies\\"][\\"DisableAppUpdate\\"]=True; ', '')),
        },
        {
            name: 'x-checker-data removed', expect: 'x-checker-data',
            overrides: withManifest(d => { delete d.modules[0].sources[0]['x-checker-data']; }),
        },
        {
            name: 'TXT record name not derived from the homepage host', expect: `_flathub.${facts.homeHost}`,
            overrides: withManifest(d => { d['x-flathub-verification'].record = '_flathub.example.invalid'; }),
        },
        {
            name: 'placeholder TXT token refused under --release', expect: VERIFY_PLACEHOLDER,
            overrides: { release: true },
        },
        {
            name: 'exception marker approved with no owner reply', expect: 'pending-owner-reply',
            overrides: withManifest(d => { d['x-source-exception'].status = 'approved'; }),
        },
        {
            name: 'from-source module added beside the repack', expect: 'from-source',
            overrides: withManifest(d => { d.modules.push({ name: 'from-source-build', buildsystem: 'simple', sources: [] }); }),
        },
        {
            name: 'desktop entry Icon off the app id', expect: DESKTOP_REL,
            overrides: withText(DESKTOP_REL, t => t.replace(/^Icon=.*$/m, 'Icon=powerbrowser')),
        },
        {
            name: 'download copy carries an internal identifier', expect: COPY_REL,
            overrides: withText(COPY_REL, t => `${t}\nThe x-checker-data block updates this.\n`),
        },
        {
            name: 'cache interface drops the Cachix substituter', expect: CACHE_REL,
            overrides: (() => {
                const doc = JSON.parse(base(CACHE_REL));
                doc.interface.substituters = doc.interface.substituters.filter(u => u !== doc.cachix.substituter);
                return { read: r => (r === CACHE_REL ? JSON.stringify(doc, null, 2) : base(r)) };
            })(),
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
        const overrides = c.overrides.read ? { ...c.overrides, release: false } : c.overrides;
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
    console.log(`${NAME}: --self-test PASS -- ${reds} planted fault(s) went red naming the manifest or the value, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the Flathub manifest.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const mode = args.includes('--release') ? 'release mode' : 'quick mode';
    console.log(`${NAME}: PASS -- the Flathub manifest is submission-shaped in ${mode}: the BaseApp runtime, the persist path, the Flatpak-only disable key, the checker data, the TXT record and the pending exception are all derived`);
    return 0;
}

process.exit(main());
