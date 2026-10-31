#!/usr/bin/env node
// scripts/verify-homebrew-cask.mjs
//
// The homebrew-cask row (Phase 56, DIST-11). The own-tap cask is a template: its per-release values are
// tokens the DIST-12 leg renders. The row renders them and derives each expected value at check time:
//
//  1. version and url         the version renders the release key minus its leading v; the url renders the
//                             Release-page download of the macOS disk image under the release key;
//  2. sha256                  renders the SHA-256 of the fixture disk-image bytes this row carries, while the
//                             macOS asset is not yet named (assumption A3, Phase 55);
//  3. verified host           the verified: prefix names the Release host and owner path, derived from the
//                             tree's release_notes URL, and equals the url's host and path prefix;
//  4. auto_updates            auto_updates true (the app updates itself; the cask must say so);
//  5. livecheck               a livecheck block with url :url and strategy :github_latest;
//  6. stanzas                 name, desc, homepage, app, uninstall and zap are present (the cask shape
//                             wingetcreate-style tooling and brew audit both read);
//  7. darwin deferral         the "deferred:" marker naming assumption A3 and Phase 55 is present, and no
//                             arm64 or on_arm enablement appears before Phase 55 evidence exists;
//  8. no signing claim        the cask and this row name no signing, notary or Gatekeeper result. The
//                             words are assembled at run time so this file contains none of them literally.
//
// Honestly --quick: text reads and an in-memory fixture digest. No brew, no network, no ruby run. The Ruby
// syntax check (ruby -c) runs through the locked nixpkgs in the owner checkpoint (docs/winget-tap-checkpoint.md).
//
// Usage:
//   node scripts/verify-homebrew-cask.mjs
//   node scripts/verify-homebrew-cask.mjs --release     (refuses the fixture while A3 is open)
//   node scripts/verify-homebrew-cask.mjs --self-test

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOCS_REL, deriveChannel, diskReader } from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'homebrew-cask';
const SELF_REL = 'scripts/verify-homebrew-cask.mjs';
const CASK_REL = 'homebrew-tap/Casks/powerbrowser.rb';
const FIXTURE_TEXT = 'PowerBrowser macOS fixture disk image, replaced by the Phase 55 asset (assumption A3)\n';
const FIXTURE_HEX = createHash('sha256').update(Buffer.from(FIXTURE_TEXT, 'utf8')).digest('hex');
const DMG_TOKEN = 'macos-universal';
const CLAIMS = new RegExp([
    `notari${'z'}`, `stap${'le'}`, `Developer ${'ID'}`, `Gatekeeper ${'passed'}`,
].join('|'), 'i');
const ARM_ENABLEMENT = /\bon_arm\b|depends_on\s+arch:\s*:arm64|depends_on\s+arch:\s*\[?:arm64/;
const TOKENS = ['@RELEASE_VERSION@', '@RELEASE_KEY@', '@RELEASE_REPO@', '@MACOS_DMG_ASSET@', '@MACOS_DMG_SHA256@'];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && a !== '--release') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --release or --self-test.`);
        process.exit(2);
    }
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
    const dmgAsset = `${facts.app}-${facts.version}.${DMG_TOKEN}.dmg`;
    const values = {
        '@RELEASE_VERSION@': facts.version,
        '@RELEASE_KEY@': facts.releaseKey,
        '@RELEASE_REPO@': facts.repo,
        '@MACOS_DMG_ASSET@': dmgAsset,
        '@MACOS_DMG_SHA256@': FIXTURE_HEX,
    };

    const text = read(CASK_REL);
    if (text === null) {
        fail(CASK_REL, 'is missing, so the own tap has no cask to commit.', 'restore homebrew-tap/Casks/powerbrowser.rb from git.');
        return { failures };
    }
    const rendered = render(text, values);

    // 1 and 2: version, url and sha256
    const version = /^\s*version "([^"]*)"/m.exec(rendered)?.[1];
    if (version !== facts.version) {
        fail(CASK_REL, `renders version ${JSON.stringify(version ?? null)} but the release key ${facts.releaseKey} derives ${facts.version}`, `set version to ${TOKENS[0]}.`);
    }
    const wantUrl = `https://github.com/${facts.repo}/releases/download/${facts.releaseKey}/${dmgAsset}`;
    const url = /^\s*url "([^"]*)"/m.exec(rendered)?.[1];
    if (url !== wantUrl) {
        fail(CASK_REL, `renders url ${JSON.stringify(url ?? null)} but the derived disk-image URL is ${wantUrl}`, 'point the url at the release-key download of the macOS disk image.');
    }
    const sha = /^\s*sha256 "([^"]*)"/m.exec(rendered)?.[1];
    if (sha !== FIXTURE_HEX) {
        fail(CASK_REL, `renders sha256 ${JSON.stringify(sha ?? null)} but the fixture disk image hashes to ${FIXTURE_HEX}`, `set sha256 to ${TOKENS[4]}.`);
    }
    const literalSha = /^\s*sha256 "(?!@MACOS_DMG_SHA256@)[0-9a-f]{64}"/m.exec(text);
    if (literalSha) fail(CASK_REL, 'types a sha256 literal instead of the token', `set sha256 to ${TOKENS[4]}; the release leg recomputes it.`);

    // 3: the verified host and path prefix equal the url's
    const verified = /verified: "([^"]*)"/.exec(rendered)?.[1];
    const wantVerified = `github.com/${facts.repo}/`;
    if (verified !== wantVerified) {
        fail(CASK_REL, `names verified ${JSON.stringify(verified ?? null)} but the release host and path derive ${wantVerified}`, `set verified to the release host and owner path, ${TOKENS[2]} rendered.`);
    }

    // 4 to 6: the cask block, auto_updates, livecheck and the stanzas
    if (!/^cask "powerbrowser" do\s*$/m.test(text) || !/^end\s*$/m.test(text)) {
        fail(CASK_REL, 'is not one cask "powerbrowser" do ... end block, so the stanzas below would belong to no cask', 'write the cask as one block with the token powerbrowser.');
    }
    if (!/^\s*auto_updates true\s*$/m.test(text)) {
        fail(CASK_REL, 'lacks auto_updates true, so brew would reinstall over an app that updates itself', 'add auto_updates true.');
    }
    if (!/livecheck do[\s\S]*?url :url[\s\S]*?strategy :github_latest[\s\S]*?end/.test(text)) {
        fail(CASK_REL, 'has no livecheck block naming url :url and strategy :github_latest', 'add the livecheck block for the release tags.');
    }
    const stanzas = { name: /^\s*name "/m, desc: /^\s*desc "/m, homepage: /^\s*homepage "/m, app: /^\s*app "/m, uninstall: /^\s*uninstall /m, zap: /^\s*zap /m };
    for (const [label, re] of Object.entries(stanzas)) {
        if (!re.test(text)) fail(CASK_REL, `lacks the ${label} stanza`, 'add the stanza; the cask shape needs every one of them.');
    }

    // 7: the darwin deferral marker and no early arm enablement
    const deferral = text.split('\n').find(l => l.startsWith('# deferred:')) ?? '';
    if (!(/\bA3\b/.test(deferral) && /Phase 55/.test(deferral))) {
        fail(CASK_REL, 'lacks the darwin deferral marker naming assumption A3 and Phase 55, so an aarch64 enablement would look deliberate', 'restore the "# deferred:" marker until the Phase 55 evidence exists.');
    }
    const arm = ARM_ENABLEMENT.exec(text);
    if (arm) fail(CASK_REL, `enables arm64 (${JSON.stringify(arm[0])}) before the Phase 55 evidence exists (assumption A3)`, 'remove the arm64 stanza until the Phase 55 macOS asset is named.');

    // 8: no signing claim in the cask
    const claim = CLAIMS.exec(text);
    if (claim) fail(CASK_REL, `makes a signing claim (${JSON.stringify(claim[0])}); that state arrives with Phase 55 (A3)`, 'remove the claim; the cask says what it does not yet establish.');

    // The release refuses the fixture while the macOS asset is unnamed.
    if (release && (read(DOCS_REL) ?? '').split('\n').some(l => /^\| macOS universal \|.*pending/.test(l))) {
        fail(CASK_REL, 'names a fixture disk image, because no macOS asset is named in docs/RELEASING.md yet; a release would ship the cask against a fixture', 'name the Phase 55 macOS asset in the asset table first (assumption A3).');
    }

    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const withText = (transform) => {
        const original = base(CASK_REL);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${CASK_REL} did not apply: the anchor text moved`);
        return { read: r => (r === CASK_REL ? planted : base(r)) };
    };
    const { facts } = deriveChannel(REPO_ROOT, base);
    const neighbour = facts.releaseKey.replace(/-(\d+)$/, (_m, d) => `-${Number(d) + 1}`).slice(1);

    const cases = [
        {
            name: 'auto_updates false', expect: 'auto_updates',
            overrides: withText(t => t.replace('auto_updates true', 'auto_updates false')),
        },
        {
            name: 'verified host drifted off the release host', expect: 'verified',
            overrides: withText(t => t.replace('verified: "github.com/@RELEASE_REPO@/"', 'verified: "example.invalid/owner/"')),
        },
        {
            name: 'version typed as a neighbouring version', expect: 'renders version',
            overrides: withText(t => t.replace('version "@RELEASE_VERSION@"', `version "${neighbour}"`)),
        },
        {
            name: 'arm64 enabled before Phase 55 evidence', expect: 'arm64',
            overrides: withText(t => t.replace('  auto_updates true', '  auto_updates true\n  depends_on arch: :arm64')),
        },
        {
            name: 'darwin deferral marker removed', expect: 'A3',
            overrides: withText(t => t.replace(/^# deferred:.*$/m, '# note: none')),
        },
        {
            name: 'signing claim added to the cask', expect: 'signing claim',
            overrides: withText(t => t.replace('  auto_updates true', `  # ${`${'notari'}${'z'}`}ed by ${`${'Developer'} ${'ID'}`}\n  auto_updates true`)),
        },
        {
            name: 'cask block header removed', expect: 'is not one cask',
            overrides: withText(t => t.replace('cask "powerbrowser" do', 'class Powerbrowser do')),
        },
        {
            name: 'zap stanza removed', expect: 'zap',
            overrides: withText(t => t.replace(/^\s*zap .*$/m, '')),
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
    console.log(`${NAME}: --self-test PASS -- ${reds} planted fault(s) went red naming the cask or the value, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the cask.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the cask renders its version, url and sha256 from the release key; auto_updates, the verified host and the livecheck are present; the darwin deferral (A3) is recorded and no signing claim is made`);
    return 0;
}

process.exit(main());
