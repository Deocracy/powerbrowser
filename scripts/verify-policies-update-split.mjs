#!/usr/bin/env node
// scripts/verify-policies-update-split.mjs
//
// The policies-update-split row (Phase 56, PKG-19 and PKG-20). The disable key lives only in the
// repacked copies. Derived at check time, compared as sets and values:
//
//  1. the release tarball's copy   powerbrowser/distribution/policies.json (the tracked comparand the
//                                  tarball ships) has no DisableAppUpdate;
//  2. the Nix repack's copy        the merge the derivation applies (nix/pkg/powerbrowser-bin.nix, the jq
//                                  assignments on .policies) is applied to the tarball's copy in memory;
//  3. the Flatpak staging copy     the merge the manifest applies (flatpak/org.debios.PowerBrowser.json,
//                                  the python assignments in build-commands) is applied the same way.
//
// The text reads above only locate the merges. Each merge is then EXECUTED on the tarball's policies.json (the
// jq program from the derivation, and the Flatpak build-commands run on a fixture tarball) and the result is
// compared with {tarball, policies: {...tarball.policies, DisableAppUpdate: true}} by deep equality, so a merge
// that deletes or rewrites a sibling is red even when no assignment names it (WR-11). jq, python3, tar and bash
// must be on PATH; a missing tool is a failure.
//
// Each repack copy must then equal the tarball's copy plus exactly one new key, DisableAppUpdate = true.
// Every sibling key keeps the tarball's value (the generator's ExtensionSettings fragment rule: set one
// key, leave siblings byte-identical). Red names the file that drifted, the key, and both values.
//
// Honestly --quick: text reads and JSON parses. No build, no network. The self-test plants each drift in
// memory through runChecks' read override and writes nothing.
//
// Usage:
//   node scripts/verify-policies-update-split.mjs
//   node scripts/verify-policies-update-split.mjs --self-test

import { isDeepStrictEqual } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diskReader } from './lib/channel-identity.mjs';
import { nixJqProgram, nixTarballTop, readText, runJq, simulateFlatpakBuild } from './lib/channel-exec.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'policies-update-split';
const SELF_REL = 'scripts/verify-policies-update-split.mjs';
const TARBALL_REL = 'powerbrowser/distribution/policies.json';
const NIX_REL = 'nix/pkg/powerbrowser-bin.nix';
const FLATPAK_REL = 'flatpak/org.debios.PowerBrowser.json';
const KEY = 'DisableAppUpdate';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the split discriminates.`);
        process.exit(2);
    }
}

// The Nix side: each jq assignment `.policies.<Key> = <bool>` in the derivation.
export function nixAssignments(text) {
    const out = {};
    for (const m of text.matchAll(/\.policies\.(\w+)\s*=\s*(true|false)\b/g)) out[m[1]] = m[2] === 'true';
    return out;
}

// The Flatpak side: each python assignment `d["policies"]["<Key>"] = <bool>` in the manifest's build commands.
export function flatpakAssignments(manifestText) {
    const out = {};
    let manifest;
    try {
        manifest = JSON.parse(manifestText);
    } catch {
        return null;
    }
    const commands = (manifest.modules ?? []).flatMap(m => (Array.isArray(m['build-commands']) ? m['build-commands'] : []));
    const joined = commands.join('\n');
    for (const m of joined.matchAll(/\[\s*['"]policies['"]\s*\]\s*\[\s*['"](\w+)['"]\s*\]\s*=\s*(True|False|true|false)\b/g)) {
        out[m[1]] = m[2].toLowerCase() === 'true';
    }
    return out;
}

export function runChecks(root, overrides = {}) {
    const read = overrides.read ?? diskReader(root);
    const failures = [];
    const fail = (file, msg, next) => failures.push(`${file}: ${msg} Next step: ${next}`);

    const tarballText = read(TARBALL_REL);
    let tarball = null;
    if (tarballText === null) {
        fail(TARBALL_REL, 'is missing, so there is no release-tarball comparand.', 'restore the tracked policies file from git.');
    } else {
        try {
            tarball = JSON.parse(tarballText).policies ?? null;
        } catch {
            fail(TARBALL_REL, 'does not parse as JSON.', 'restore the tracked policies file from git.');
        }
    }
    if (tarball === null || typeof tarball !== 'object') {
        if (tarballText !== null && tarball === null) fail(TARBALL_REL, 'has no policies object.', 'restore the tracked policies file from git.');
        return { failures };
    }

    // 1. the release tarball copy stays clean.
    if (Object.prototype.hasOwnProperty.call(tarball, KEY)) {
        fail(TARBALL_REL, `carries ${KEY} (${JSON.stringify(tarball[KEY])}), so the release tarball would refuse managed updates it must not`, `remove ${KEY}; the key is merged into the repacked copies only.`);
    }

    // 2 and 3. each repack copy is the tarball copy plus the one key.
    const sides = [
        ['Nix repack (derivation merge)', NIX_REL, read(NIX_REL), text => (text === null ? null : nixAssignments(text))],
        ['Flatpak staging (manifest merge)', FLATPAK_REL, read(FLATPAK_REL), text => (text === null ? null : flatpakAssignments(text))],
    ];
    for (const [label, rel, text, parse] of sides) {
        if (text === null) {
            fail(rel, `is missing, so the ${label} copy has no merge to check.`, `restore ${rel} from git.`);
            continue;
        }
        const merged = parse(text);
        if (merged === null) {
            fail(rel, `does not parse, so the ${label} merge cannot be read.`, `restore ${rel} from git.`);
            continue;
        }
        if (merged[KEY] !== true) {
            fail(rel, `lacks the ${KEY} = true merge in the ${label} copy, so the repack would self-update outside the channel`, `add the ${KEY} assignment to the repack merge; it is the only key this copy adds.`);
        }
        for (const [k, v] of Object.entries(merged)) {
            if (k === KEY) continue;
            if (!Object.prototype.hasOwnProperty.call(tarball, k)) {
                fail(rel, `adds the key ${k} to the ${label} copy, which the release tarball does not carry; the merge sets only ${KEY}`, `remove ${k} from the merge.`);
            } else if (tarball[k] !== v) {
                fail(rel, `sets sibling key ${k} to ${JSON.stringify(v)} in the ${label} copy, but the release tarball carries ${JSON.stringify(tarball[k])}; siblings must stay byte-identical`, `restore ${k} to ${JSON.stringify(tarball[k])} in the merge.`);
            }
        }
    }

    // 4. execute both merges and compare the results with the expected document.
    if (overrides.exec !== false) {
        const full = JSON.parse(tarballText);
        const expected = { ...full, policies: { ...full.policies, [KEY]: true } };
        const nixText = read(NIX_REL);
        const program = nixText === null ? null : nixJqProgram(nixText);
        if (program === null) {
            fail(NIX_REL, 'has no jq \'<program>\' "$policies" line, so the Nix merge cannot be executed', 'restore the policies merge in the derivation.');
        } else {
            const ran = runJq(program, tarballText);
            if (!ran.ok) {
                fail(NIX_REL, `the jq merge fails on the tracked policies file (${ran.error})`, 'fix the jq program.');
            } else if (!isDeepStrictEqual(ran.value, expected)) {
                fail(NIX_REL, `the jq merge yields ${JSON.stringify(ran.value)} but the tarball copy plus ${KEY} = true is ${JSON.stringify(expected)}; a sibling was replaced or deleted`, `make the program set only .policies.${KEY}.`);
            }
        }
        const flatpakText = read(FLATPAK_REL);
        const top = nixText === null ? null : nixTarballTop(nixText);
        let manifest = null;
        try {
            manifest = JSON.parse(flatpakText ?? 'null');
        } catch {
            manifest = null;
        }
        if (manifest === null || top === null) {
            fail(FLATPAK_REL, 'or the derivation names no tarball layout, so the Flatpak merge cannot be executed', `restore ${FLATPAK_REL} and ${NIX_REL} from git.`);
        } else {
            const sim = simulateFlatpakBuild({
                manifest,
                top,
                tarballFiles: { [top]: '#!/bin/sh\n', 'distribution/policies.json': tarballText },
                fileSources: Object.fromEntries((manifest.modules?.[0]?.sources ?? []).filter(x => x.type === 'file').map(x => [x.path, 'fixture'])),
            });
            try {
                if (!sim.ok) {
                    fail(FLATPAK_REL, `the build commands fail on the fixture tarball (${sim.error})`, 'fix the build commands; the cross-check on the layout is in the flathub-manifest row.');
                } else {
                    let staged = null;
                    try {
                        staged = JSON.parse(readText(join(sim.app, 'lib', top, 'distribution', 'policies.json')));
                    } catch {
                        staged = null;
                    }
                    if (!isDeepStrictEqual(staged, expected)) {
                        fail(FLATPAK_REL, `the staged policies.json is ${JSON.stringify(staged)} but the tarball copy plus ${KEY} = true is ${JSON.stringify(expected)}; a sibling was replaced or deleted`, `make the python merge set only policies.${KEY}.`);
                    }
                }
            } finally {
                sim.cleanup();
            }
        }
    }
    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const withPlant = (rel, transform) => {
        const original = base(rel);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${rel} did not apply: the anchor text moved`);
        return { read: r => (r === rel ? planted : base(r)) };
    };
    const tarballWith = extra => {
        const doc = JSON.parse(base(TARBALL_REL));
        doc.policies = { ...doc.policies, ...extra };
        return JSON.stringify(doc, null, 2);
    };

    const cases = [
        {
            name: 'DisableAppUpdate added to the release tarball', expect: TARBALL_REL,
            overrides: { read: r => (r === TARBALL_REL ? tarballWith({ [KEY]: true }) : base(r)) },
        },
        {
            name: 'Nix repack merge missing the key', expect: NIX_REL,
            overrides: withPlant(NIX_REL, t => t.replace('.policies.DisableAppUpdate = true', '')),
        },
        {
            name: 'Flatpak staging merge missing the key', expect: FLATPAK_REL,
            overrides: withPlant(FLATPAK_REL, t => t.replace('d[\\"policies\\"][\\"DisableAppUpdate\\"]=True; ', '')),
        },
        {
            name: 'sibling key drifted in the Nix repack', expect: 'DisableTelemetry',
            overrides: withPlant(NIX_REL, t => t.replace('.policies.DisableAppUpdate = true', '.policies.DisableAppUpdate = true | .policies.DisableTelemetry = false')),
        },
        {
            name: 'sibling key drifted in the Flatpak staging copy', expect: 'DisableFirefoxStudies',
            overrides: withPlant(FLATPAK_REL, t => t.replace('d[\\"policies\\"][\\"DisableAppUpdate\\"]=True;', 'd[\\"policies\\"][\\"DisableAppUpdate\\"]=True; d[\\"policies\\"][\\"DisableFirefoxStudies\\"]=False;')),
        },
        {
            name: 'Nix jq merge deletes a sibling the assignments never name', expect: 'a sibling was replaced or deleted',
            overrides: withPlant(NIX_REL, t => t.replace(`jq '.policies.DisableAppUpdate = true'`, `jq 'del(.policies.ExtensionSettings) | .policies.DisableAppUpdate = true'`)),
        },
        {
            name: 'Flatpak python merge drops a sibling the assignments never name', expect: 'a sibling was replaced or deleted',
            overrides: withPlant(FLATPAK_REL, t => t.replace('d=json.load(open(p));', 'd=json.load(open(p)); d[\\"policies\\"].pop(\\"ExtensionSettings\\");')),
        },
        {
            name: 'Flatpak python merge rewrites the whole object', expect: 'a sibling was replaced or deleted',
            overrides: withPlant(FLATPAK_REL, t => t.replace('d=json.load(open(p));', 'd=json.load(open(p)); d[\\"policies\\"]={};')),
        },
        {
            name: 'control: unmodified tree stays green', expect: null,
            overrides: {},
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
    console.log(`${NAME}: --self-test PASS -- ${reds} planted drift(s) went red naming the file, key or sibling, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the update-disable split.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the release tarball carries no ${KEY}; the Nix repack and the Flatpak staging copy each add only ${KEY} = true and keep every sibling key`);
    return 0;
}

process.exit(main());
