#!/usr/bin/env node
// scripts/verify-winget-manifest.mjs
//
// The winget-manifest row (Phase 56, DIST-04). The three-file winget set is a template: every per-release
// value is a quoted token the DIST-12 leg renders. The row renders the tokens from the tree and derives
// each expected value at check time:
//
//  1. the identifier               PackageIdentifier = <publisher with its spaces removed>.<display name>
//                                  from configuration.toml, in all three files;
//  2. the version                  PackageVersion renders the release key minus its leading v, in all three files;
//  3. the installer URL            the Release-page download URL of the Windows asset, under the release key;
//  4. the installer hash           InstallerSha256 renders the SHA-256 of the fixture installer bytes this row
//                                  carries while assumption A2 is open (no Windows asset exists yet);
//  5. the fixture marker           while docs/RELEASING.md's Windows row still reads pending, the installer
//                                  file carries its "fixture:" marker; the marker is red when absent;
//  6. the locale values            Publisher, PackageUrl, PublisherUrl, License and the release-notes link are
//                                  derived from configuration.toml and the tree's release_notes URL;
//  7. the custody record           docs/RENEWALS.md has a WINGET_TOKEN row by structure: an item beginning
//                                  WINGET_TOKEN, an owner action that begins with an imperative verb and names
//                                  its holder. The credential's value is never read, written or compared here;
//  8. no credential literal        no token-shaped value appears in the three files.
//
// Honestly --quick: YAML parse (js-yaml from theia/), text reads and an in-memory fixture digest. No network,
// no gh, no wingetcreate, no token. The submission is owner-checkpoint evidence (plan 56-05).
//
// Usage:
//   node scripts/verify-winget-manifest.mjs
//   node scripts/verify-winget-manifest.mjs --release     (refuses the fixture while A2 is open)
//   node scripts/verify-winget-manifest.mjs --self-test

import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOCS_REL, deriveChannel, diskReader } from './lib/channel-identity.mjs';
import { loadYaml } from './lib/release-workflow.mjs';
import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'winget-manifest';
const SELF_REL = 'scripts/verify-winget-manifest.mjs';
const VERSION_REL = 'winget/DeBIOSFoundation.PowerBrowser.yaml';
const INSTALLER_REL = 'winget/DeBIOSFoundation.PowerBrowser.installer.yaml';
const LOCALE_REL = 'winget/DeBIOSFoundation.PowerBrowser.locale.yaml';
const RENEWALS_REL = 'docs/RENEWALS.md';
const FIXTURE_TEXT = 'PowerBrowser winget fixture installer, replaced by the Phase 54 asset (assumption A2)\n';
const FIXTURE_BYTES = Buffer.from(FIXTURE_TEXT, 'utf8');
const FIXTURE_HEX = createHash('sha256').update(FIXTURE_BYTES).digest('hex');
const WINDOWS_TOKEN = 'windows-x86_64';
const VERBS = ['rotate', 'renew', 're-verify', 'replace', 'confirm', 'decide', 'record', 'check', 'review'];
const TOKENS = ['@RELEASE_VERSION@', '@RELEASE_KEY@', '@RELEASE_REPO@', '@WINDOWS_INSTALLER_ASSET@', '@WINDOWS_INSTALLER_SHA256@'];
const CREDENTIAL_SHAPES = [new RegExp(`${'gh'}p_[A-Za-z0-9]{20,}`), new RegExp(`${'github'}_pat_[A-Za-z0-9_]{20,}`)];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release or --self-test.`);
        process.exit(2);
    }
}

// The Windows row of the asset table: pending means no Windows asset is named in the tree yet (A2).
export function windowsPending(docs) {
    const row = (docs ?? '').split('\n').find(l => /^\| Windows x86_64 \|/.test(l));
    return row === undefined || /pending/i.test(row);
}

// The WINGET_TOKEN row by structure. Returns null when absent.
export function wingetTokenRow(text) {
    if (text === null) return null;
    for (const line of text.split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length !== 5 || !/WINGET_TOKEN/.test(cells[0])) continue;
        const verb = (cells[3].match(/^[A-Za-z-]+/) ?? [''])[0].toLowerCase();
        return { item: cells[0], verbOk: VERBS.includes(verb), holderOk: /holder:/i.test(cells[3]) };
    }
    return null;
}

function render(text, values) {
    let out = text;
    for (const [token, value] of Object.entries(values)) out = out.split(token).join(value);
    return out;
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
    const { config } = resolveConfig(join(root, 'configuration.toml'));
    const identifier = `${config.product.vendor_display.replace(/\s+/g, '')}.${config.identity.display_name.replace(/\s+/g, '')}`;
    const fixtureAsset = `${facts.app}-${facts.version}.${WINDOWS_TOKEN}.exe`;
    const values = {
        '@RELEASE_VERSION@': facts.version,
        '@RELEASE_KEY@': facts.releaseKey,
        '@RELEASE_REPO@': facts.repo,
        '@WINDOWS_INSTALLER_ASSET@': fixtureAsset,
        '@WINDOWS_INSTALLER_SHA256@': FIXTURE_HEX,
    };
    const pending = windowsPending(read(DOCS_REL));

    const load = rel => {
        const text = read(rel);
        if (text === null) {
            fail(rel, 'is missing, so the winget set is incomplete.', 'restore the file from git.');
            return { text: null, doc: null };
        }
        try {
            return { text, doc: loadYaml().load(text) };
        } catch (e) {
            fail(rel, `does not parse as YAML (${e.message.split('\n')[0]}).`, 'fix the YAML; the three files are templates, not free text.');
            return { text, doc: null };
        }
    };
    const files = { [VERSION_REL]: load(VERSION_REL), [INSTALLER_REL]: load(INSTALLER_REL), [LOCALE_REL]: load(LOCALE_REL) };

    for (const [rel, { text, doc }] of Object.entries(files)) {
        if (text === null || doc === null) continue;
        for (const shape of CREDENTIAL_SHAPES) {
            const hit = shape.exec(text);
            if (hit) fail(rel, `carries a credential-shaped literal (${JSON.stringify(hit[0].slice(0, 6))}...)`, 'remove it; the credential lives only in the owner hands and the release environment.');
        }
        const rendered = render(text, values);
        const renderedDoc = loadYaml().load(rendered);
        if (renderedDoc.PackageIdentifier !== identifier) {
            fail(rel, `renders PackageIdentifier ${JSON.stringify(renderedDoc.PackageIdentifier)} but configuration.toml derives ${identifier}`, `set PackageIdentifier to "${identifier}".`);
        }
        if (renderedDoc.PackageVersion !== facts.version) {
            fail(rel, `renders PackageVersion ${JSON.stringify(renderedDoc.PackageVersion)} but the release key ${facts.releaseKey} derives ${facts.version}`, `set PackageVersion to ${TOKENS[0]}.`);
        }
        const literalVersion = /PackageVersion:\s*"?(?!@RELEASE_VERSION@)\d/.exec(text);
        if (literalVersion) fail(rel, 'types a PackageVersion literal instead of the release token', `set PackageVersion to ${TOKENS[0]}.`);
    }

    // --- the installer -----------------------------------------------------------
    const installer = files[INSTALLER_REL];
    if (installer.text !== null && installer.doc !== null) {
        const renderedInstaller = loadYaml().load(render(installer.text, values));
        const node = renderedInstaller.Installers?.[0] ?? {};
        // The wingetcreate update --out shape: the root carries the installer keys, and every arch node is complete.
        for (const key of ['PackageVersion', 'InstallerLocale', 'Platform', 'InstallerType', 'Installers', 'ManifestType', 'ManifestVersion']) {
            if (!(key in renderedInstaller)) fail(INSTALLER_REL, `lacks the root key ${key}, so wingetcreate update --out cannot write the installer set`, `add ${key}.`);
        }
        if (!Array.isArray(renderedInstaller.Installers) || renderedInstaller.Installers.length === 0) {
            fail(INSTALLER_REL, 'has no Installers list, so there is no arch node to write', 'add one Installers node per architecture.');
        }
        for (const key of ['Architecture', 'InstallerUrl', 'InstallerSha256']) {
            if (!(key in node)) fail(INSTALLER_REL, `has an installer node without ${key}, so the arch node is incomplete`, `add ${key} to the x64 node.`);
        }
        const wantUrl = `https://github.com/${facts.repo}/releases/download/${facts.releaseKey}/${fixtureAsset}`;
        if (node.InstallerUrl !== wantUrl) {
            fail(INSTALLER_REL, `renders InstallerUrl ${JSON.stringify(node.InstallerUrl ?? null)} but the derived Windows asset URL is ${wantUrl}`, 'point InstallerUrl at the release-key download URL of the Windows asset.');
        }
        if (node.InstallerSha256 !== FIXTURE_HEX) {
            fail(INSTALLER_REL, `renders InstallerSha256 ${JSON.stringify(node.InstallerSha256 ?? null)} but the fixture installer bytes hash to ${FIXTURE_HEX}`, `set InstallerSha256 to ${TOKENS[4]}.`);
        }
        const literalSha = /InstallerSha256:\s*"?(?!@WINDOWS_INSTALLER_SHA256@)[0-9a-f]{64}/.exec(installer.text);
        if (literalSha) fail(INSTALLER_REL, `types a SHA-256 literal ${JSON.stringify(literalSha[0].slice(-12))} instead of the token`, `set InstallerSha256 to ${TOKENS[4]}; wingetcreate update recomputes it per release.`);
        if (pending) {
            if (!/^# fixture:/m.test(installer.text)) {
                fail(INSTALLER_REL, 'carries no "fixture:" marker while docs/RELEASING.md still reads the Windows asset as pending (A2), so the fixture would look like a live asset', 'restore the marker naming assumption A2 until the Phase 54 asset is named.');
            }
            if (release) fail(INSTALLER_REL, 'names a fixture installer, because no Windows asset is named in docs/RELEASING.md yet; a release would submit a fixture to winget', 'name the Phase 54 Windows asset in the asset table first (assumption A2).');
        }
    }

    // --- the locale values derive from the manifest and the release home --------
    const locale = files[LOCALE_REL];
    if (locale.doc !== null) {
        const want = {
            Publisher: config.product.vendor_display,
            PublisherUrl: config.urls.homepage,
            PackageUrl: config.urls.homepage,
            License: config.legal.license,
            PackageName: config.identity.display_name,
        };
        for (const [key, value] of Object.entries(want)) {
            if (locale.doc[key] !== value) fail(LOCALE_REL, `sets ${key} to ${JSON.stringify(locale.doc[key] ?? null)} but configuration.toml derives ${JSON.stringify(value)}`, `set ${key} to the derived value.`);
        }
        const releaseNotes = `${config.urls.release_notes}/tag/${facts.releaseKey}`;
        const renderedNotes = render(locale.doc.ReleaseNotesUrl ?? '', values);
        if (renderedNotes !== releaseNotes) {
            fail(LOCALE_REL, `renders ReleaseNotesUrl ${JSON.stringify(renderedNotes)} but the release page for the key is the tree's release_notes URL plus /tag/${facts.releaseKey}`, 'set ReleaseNotesUrl to the release_notes URL for the release key.');
        }
    }

    // --- the custody record, by structure ---------------------------------------
    const row = wingetTokenRow(read(RENEWALS_REL));
    if (row === null) {
        fail(RENEWALS_REL, 'has no WINGET_TOKEN row, so the credential that submits the winget pull request has no holder and no rotation step', 'append the WINGET_TOKEN row; the owner holds the classic PAT.');
    } else {
        if (!row.verbOk) fail(RENEWALS_REL, 'the WINGET_TOKEN row owner action does not begin with an imperative verb', 'start the owner action with rotate, renew or confirm.');
        if (!row.holderOk) fail(RENEWALS_REL, 'the WINGET_TOKEN row owner action names no holder', 'add "Holder: <who holds it>" to the owner action.');
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
    const { facts } = deriveChannel(REPO_ROOT, base);
    const neighbour = facts.releaseKey.replace(/-(\d+)$/, (_m, d) => `-${Number(d) + 1}`).slice(1);

    const cases = [
        {
            name: 'PackageVersion typed as a neighbouring version', expect: VERSION_REL,
            overrides: withText(VERSION_REL, t => t.replace('"@RELEASE_VERSION@"', `"${neighbour}"`)),
        },
        {
            name: 'InstallerUrl off the release-key download shape', expect: INSTALLER_REL,
            overrides: withText(INSTALLER_REL, t => t.replace('/releases/download/@RELEASE_KEY@/', '/releases/latest/download/')),
        },
        {
            name: 'InstallerSha256 literal disagreeing with the fixture bytes', expect: INSTALLER_REL,
            overrides: withText(INSTALLER_REL, t => t.replace('"@WINDOWS_INSTALLER_SHA256@"', `"${'0'.repeat(64)}"`)),
        },
        {
            name: 'fixture marker removed while the Windows asset is pending', expect: 'fixture:',
            overrides: withText(INSTALLER_REL, t => t.replace(/^# fixture:.*$/m, '# note: installer')),
        },
        {
            name: 'fixture installer under --release', expect: 'fixture installer',
            overrides: { release: true },
        },
        {
            name: 'installer arch node missing its Architecture', expect: 'Architecture',
            overrides: withText(INSTALLER_REL, t => t.replace('  - Architecture: "x64"\n    InstallerUrl:', '  - InstallerUrl:')),
        },
        {
            name: 'WINGET_TOKEN custody row removed', expect: RENEWALS_REL,
            overrides: withText(RENEWALS_REL, t => t.split('\n').filter(l => !/^\| WINGET_TOKEN/.test(l)).join('\n')),
        },
        {
            name: 'locale publisher drifted from configuration.toml', expect: LOCALE_REL,
            overrides: withText(LOCALE_REL, t => t.replace('Publisher: "DeBIOS Foundation"', 'Publisher: "DeBIOS Other"')),
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
    console.log(`${NAME}: --self-test PASS -- ${reds} planted fault(s) went red naming the file or value, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the winget set.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the winget set renders the identifier, version and URL from the release key; the Windows installer is the marked fixture until Phase 54 (A2); the WINGET_TOKEN custody row is present`);
    return 0;
}

process.exit(main());
