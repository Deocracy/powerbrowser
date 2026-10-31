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
//  3. runtime and base       org.freedesktop.Platform / org.freedesktop.Sdk on a yy.mm branch, with the Firefox
//                            BaseApp, org.mozilla.firefox.BaseApp, as `base` on the same branch. The BaseApp is a
//                            base application, never the runtime (CR-04; Flathub's org.mozilla.firefox.BaseApp
//                            manifest builds on org.freedesktop.Platform at the branch it is published for);
//  4. persist and sandbox    --persist=.<vendor_machine, lowercased> in finish-args (.debios), and finish-args equal the
//                            least-privilege allow-list as a set (WR-10): fallback-x11 beside wayland, never plain x11,
//                            and no filesystem or bus-name grant. The allow-list is a policy, so it is kept by hand here;
//  5. Flatpak-only disable   the build commands merge DisableAppUpdate into the staged policies copy;
//                            the policies-update-split row compares the values;
//  6. checker data           the archive source carries x-checker-data with a url-template naming the release
//                            asset shape, so external-data-checker can open the per-release pull request;
//  7. DNS TXT verification   x-flathub-verification names _flathub.<homepage host>, method dns-txt, and a
//                            token that is the placeholder until the owner sets the TXT value (release refuses it);
//  8. exception branch       x-source-exception is pending-owner-reply on the written-exception path, and the
//                            manifest carries one module: the from-source path is named, never half-built;
//  9. build executed         the manifest's build-commands are run on a fixture tarball packed with the layout the
//                            derivation unpacks (one top-level directory), unpacked with the archive source's own
//                            strip-components, so a copy that lands the launcher at the wrong path goes red (CR-03);
// 10. download copy          docs/download-flatpak.md names PowerBrowser, the Flatpak install line with the app id
//                            and no version literal, and no internal identifier;
// 11. cache interface        nix/cache.json lists the Cachix substituter the test build would use.
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

import { RELEASE_HASH_REL, SENTINEL_SRI, deriveChannel, diskReader, sriToHex } from './lib/channel-identity.mjs';
import { isRegularFile, nixTarballTop, readText, resolvesTo, simulateFlatpakBuild } from './lib/channel-exec.mjs';
import { resolveConfig } from './generate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'flathub-manifest';
const SELF_REL = 'scripts/verify-flathub-manifest.mjs';
const MANIFEST_REL = 'flatpak/org.debios.PowerBrowser.json';
const DESKTOP_REL = 'flatpak/org.debios.PowerBrowser.desktop';
const PNG_REL = 'flatpak/org.debios.PowerBrowser.png';
const TRACKED_DESKTOP_REL = 'powerbrowser/powerbrowser-release.desktop';
const TRACKED_PNG_REL = 'powerbrowser/branding/release/default128.png';
const CACHE_REL = 'nix/cache.json';
const NIX_REL = 'nix/pkg/powerbrowser-bin.nix';
const POLICIES_REL = 'powerbrowser/distribution/policies.json';
const COPY_REL = 'docs/download-flatpak.md';
const BASEAPP_REF = 'org.mozilla.firefox.BaseApp';
const RUNTIME_REF = 'org.freedesktop.Platform';
const SDK_REF = 'org.freedesktop.Sdk';
// Policy allow-list for the sandbox (the one place a hand-kept list is right): X11 only as a fallback to Wayland, the
// network for the browser, and the dri device for GL. Anything else is a grant someone has to add here on purpose.
const SANDBOX_ALLOW = ['--share=ipc', '--socket=fallback-x11', '--socket=wayland', '--socket=pulseaudio', '--share=network', '--device=dri'];
const BRANCH_RE = /^\d{2}\.\d{2}$/;
const VERIFY_PLACEHOLDER = '@FLATHUB_VERIFICATION_TOKEN@';

const args = process.argv.slice(2);
const renderAt = args.indexOf('--render');
for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--render') {
        if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
            console.error(`${NAME}: FAIL -- --render needs an output path outside the tree`);
            console.error(`  Next step: run: node ${SELF_REL} --render <scratch-dir>/org.debios.PowerBrowser.json`);
            process.exit(2);
        }
        i += 1;
        continue;
    }
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release, --render <path> or --self-test.`);
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
        // 3. runtime and base
        if (manifest.runtime !== RUNTIME_REF) {
            fail(MANIFEST_REL, `names runtime ${JSON.stringify(manifest.runtime ?? null)} but a runtime is ${RUNTIME_REF}; the Firefox BaseApp is a base, not a runtime`, `set runtime to ${RUNTIME_REF}.`);
        }
        if (manifest.sdk !== SDK_REF) {
            fail(MANIFEST_REL, `names sdk ${JSON.stringify(manifest.sdk ?? null)} but the runtime ${RUNTIME_REF} pairs with ${SDK_REF}`, `set sdk to ${SDK_REF}.`);
        }
        if (manifest.base !== BASEAPP_REF) {
            fail(MANIFEST_REL, `names base ${JSON.stringify(manifest.base ?? null)} but the Firefox repack builds on the ${BASEAPP_REF} base`, `set base to ${BASEAPP_REF}.`);
        }
        if (!BRANCH_RE.test(manifest['runtime-version'] ?? '')) {
            fail(MANIFEST_REL, `names runtime-version ${JSON.stringify(manifest['runtime-version'] ?? null)}, not a pinned yy.mm branch; stable is not a runtime branch`, 'pin the runtime-version to a published yy.mm branch.');
        }
        if (manifest['base-version'] !== manifest['runtime-version']) {
            fail(MANIFEST_REL, `names base-version ${JSON.stringify(manifest['base-version'] ?? null)} but runtime-version ${JSON.stringify(manifest['runtime-version'] ?? null)}; the BaseApp branch must match the runtime branch`, 'set base-version equal to runtime-version.');
        }
        // 4. persist
        if (!(manifest['finish-args'] ?? []).includes(persist)) {
            fail(MANIFEST_REL, `finish-args lacks ${persist}, so the per-user data would not survive an update (finish-args)`, `add ${persist} to finish-args.`);
        }
        // 4b. least privilege: finish-args equal the allow-list as a set
        const have = new Set(manifest['finish-args'] ?? []);
        const want = new Set([...SANDBOX_ALLOW, persist]);
        for (const a of have) if (!want.has(a)) fail(MANIFEST_REL, `finish-args grants ${a}, which is not on the least-privilege allow-list`, `remove ${a}; the sandbox grants only ${[...want].join(' ')}.`);
        for (const a of want) if (!have.has(a)) fail(MANIFEST_REL, `finish-args lacks ${a} from the least-privilege allow-list`, `add ${a}.`);
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

    // --- 9. the build commands, executed on a fixture tarball (CR-03) -------------
    if (manifest !== null && overrides.exec !== false) {
        const top = nixTarballTop(read(NIX_REL));
        const policies = read(POLICIES_REL);
        if (top === null || policies === null) {
            fail(NIX_REL, 'names no test -d $out/lib/<top> line, or the tracked policies file is missing, so the tarball layout cannot be derived', 'restore the derivation and the policies file from git.');
        } else {
            const sim = simulateFlatpakBuild({
                manifest,
                top,
                tarballFiles: { [top]: '#!/bin/sh\n', 'distribution/policies.json': policies, 'browser/omni.ja': 'fixture\n' },
                fileSources: { [`${appId}.desktop`]: read(DESKTOP_REL) ?? '', [`${appId}.png`]: 'png' },
            });
            try {
                if (!sim.ok) {
                    fail(MANIFEST_REL, `the build commands fail on a tarball that unpacks to ${top}/ (${sim.error}); the archive source strips components by default, so strip-components must keep the top-level directory`, `set "strip-components": 0 on the archive source so cp -a ${top} finds the directory.`);
                } else {
                    const lib = join(sim.app, 'lib', top);
                    if (!isRegularFile(join(lib, top))) fail(MANIFEST_REL, `the build leaves no launcher at lib/${top}/${top}`, 'fix the copy so the unpacked directory lands at /app/lib/powerbrowser.');
                    if (!resolvesTo(join(sim.app, 'bin', top), join(lib, top))) fail(MANIFEST_REL, `the build leaves bin/${top} unlinked to the launcher`, 'link /app/bin/powerbrowser to the launcher.');
                    let merged = null;
                    try {
                        merged = JSON.parse(readText(join(lib, 'distribution', 'policies.json')));
                    } catch {
                        merged = null;
                    }
                    if (merged?.policies?.DisableAppUpdate !== true) fail(MANIFEST_REL, 'the staged policies.json does not carry DisableAppUpdate = true after the build', 'fix the policies merge command.');
                    if (!isRegularFile(join(sim.app, 'share', 'applications', `${appId}.desktop`)) || !isRegularFile(join(sim.app, 'share', 'icons', 'hicolor', '128x128', 'apps', `${appId}.png`))) {
                        fail(MANIFEST_REL, 'the build leaves no desktop entry or icon under the app id', 'install both files under the app id.');
                    }
                }
            } finally {
                sim.cleanup();
            }
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

    // --- 10. the download copy --------------------------------------------------
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

    // --- 11. the cache interface lists the substituter the test build would use ---
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

// The submission copy: every release token rendered from the tree, written outside the repository. It refuses
// the placeholder hash, so a copy never names an unhashed tarball, and it never writes inside the tree.
function render(outPath) {
    const base = diskReader(REPO_ROOT);
    const { failures, facts } = deriveChannel(REPO_ROOT, base);
    if (facts === null) {
        console.error(`${NAME}: FAIL -- the release identity does not derive: ${failures.join('; ')}`);
        return 1;
    }
    const absOut = resolve(outPath);
    if (absOut === REPO_ROOT || absOut.startsWith(REPO_ROOT + '/')) {
        console.error(`${NAME}: FAIL -- ${outPath} is inside the repository; a rendered copy never lives in the tree.`);
        console.error(`  Next step: render into a scratch directory outside the checkout.`);
        return 2;
    }
    const record = JSON.parse(base(RELEASE_HASH_REL));
    if (record.sha256 === SENTINEL_SRI) {
        console.error(`${NAME}: FAIL -- ${RELEASE_HASH_REL} still holds the placeholder, so a rendered manifest would name no real tarball hash.`);
        console.error(`  Next step: the DIST-12 bot PR writes the hash for ${facts.releaseKey} first, then re-run this render.`);
        return 1;
    }
    const values = {
        '@RELEASE_URL@': facts.tarballUrl,
        '@RELEASE_SHA256@': sriToHex(record.sha256),
        '@RELEASE_REPO@': facts.repo,
        '@RELEASE_URL_TEMPLATE@': facts.checkerUrlTemplate,
    };
    let text = base(MANIFEST_REL);
    for (const [token, value] of Object.entries(values)) text = text.split(token).join(value);
    mkdirSync(dirname(absOut), { recursive: true });
    writeFileSync(absOut, text, 'utf8');
    console.log(`${NAME}: PASS -- rendered the release tokens for ${facts.releaseKey} to ${absOut}; the verification token is still ${VERIFY_PLACEHOLDER} until the owner sets it`);
    return 0;
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
            name: 'runtime set to the Firefox BaseApp (CR-04, the old value)', expect: `a runtime is ${RUNTIME_REF}`,
            overrides: withManifest(d => { d.runtime = BASEAPP_REF; }),
        },
        {
            name: 'base missing', expect: 'names base',
            overrides: withManifest(d => { delete d.base; }),
        },
        {
            name: 'base-version off the runtime branch', expect: 'base-version',
            overrides: withManifest(d => { d['base-version'] = '24.08'; }),
        },
        {
            name: 'runtime-version left at stable', expect: 'not a pinned yy.mm branch',
            overrides: withManifest(d => { d['runtime-version'] = 'stable'; d['base-version'] = 'stable'; }),
        },
        {
            name: 'sdk off the freedesktop pairing', expect: 'names sdk',
            overrides: withManifest(d => { d.sdk = 'org.gnome.Sdk'; }),
        },
        {
            name: 'archive strip-components left at the default (the launcher copy breaks)', expect: 'strip-components',
            overrides: withManifest(d => { delete d.modules[0].sources[0]['strip-components']; }),
        },
        {
            name: 'archive strip-components set to 2', expect: 'strip-components',
            overrides: withManifest(d => { d.modules[0].sources[0]['strip-components'] = 2; }),
        },
        {
            name: 'copy source names a directory the tarball does not hold', expect: 'build commands fail',
            overrides: withManifest(d => { d.modules[0]['build-commands'][1] = 'cp -a browser /app/lib/powerbrowser'; }),
        },
        {
            name: 'plain X11 socket instead of fallback-x11', expect: 'grants --socket=x11',
            overrides: withManifest(d => { d['finish-args'] = d['finish-args'].map(a => (a === '--socket=fallback-x11' ? '--socket=x11' : a)); }),
        },
        {
            name: 'host filesystem granted', expect: 'grants --filesystem=host',
            overrides: withManifest(d => { d['finish-args'].push('--filesystem=host'); }),
        },
        {
            name: 'session bus name talk granted', expect: 'grants --talk-name=org.freedesktop.Flatpak',
            overrides: withManifest(d => { d['finish-args'].push('--talk-name=org.freedesktop.Flatpak'); }),
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
            name: 'cache interface drops the Cachix substituter (shared-substituter tripwire)', expect: CACHE_REL,
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
    if (renderAt >= 0) return render(args[renderAt + 1]);
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
