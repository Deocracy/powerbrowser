#!/usr/bin/env node
// scripts/verify-release-asset-set.mjs
//
// The release-asset-set row (Phase 49, DIST-07). One script serves the row and the release job.
//
// Derivation, at check time, from the tree and never from a typed list:
//  - app basename           configuration.toml [identity] app_basename (resolveConfig);
//  - release key and version the tag shape v<ESR>-<revision> (releaseIdentity), where the
//                           version is the tag minus its leading v, as docs/RELEASING.md states;
//  - target token           the first Target key row of the docs/RELEASING.md asset table;
//  - no-token assets        the paragraph of docs/RELEASING.md that lists the assets attached
//                           once per Release (SHA256SUMS, the notices, the source tarball), and
//                           each notice must exist in the tree.
// The expected set (versioned and stable names for the tarball and the MAR, SHA256SUMS, the
// notices, the source tarball) is compared as set equality. An addition and a removal are
// both red, naming the asset.
//
// What the row checks in .github/workflows/release.yml, sign-publish:
//  - the draft is created with --draft, and --generate-notes appears nowhere;
//  - the set equality step runs after attestation and before the bot App token is minted;
//  - the bot App token is minted immediately before the single publish;
//  - the publish is the only step with --draft=false, and it runs after the equality step.
//
// Modes:
//  (no argument)                       the row: the workflow order and the derived expectation.
//  --expected --manifest <json>        prints one TAB-separated kind and name per expected asset;
//                                      the release job copies the assets with these names.
//  --manifest <json> --draft <json>    the live comparison: the draft asset names from gh against
//                                      the manifest-derived set. Exit 1 names each delta.
//  --self-test                         plants faults in memory; writes nothing.
//
// Honestly --quick: the row and the self-test read the tree and parse YAML (js-yaml from theia/).
// No network and no gh call. The live mode reads files the release job already wrote.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-asset-set';
const SELF_REL = 'scripts/verify-release-asset-set.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const DOCS_REL = 'docs/RELEASING.md';

const usage = `Next step: run: node ${SELF_REL}, or node ${SELF_REL} --expected --manifest <release-manifest.json>, or add --self-test.`;
const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const SELF = args.includes('--self-test');
const EXPECTED = args.includes('--expected');
const MANIFEST_AT = flag('--manifest');
const DRAFT_AT = flag('--draft');
const known = new Set(['--self-test', '--expected', '--manifest', '--draft']);
for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!known.has(a)) {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  ${usage}`);
        process.exit(2);
    }
    if ((a === '--manifest' || a === '--draft') && (args[i + 1] === undefined || args[i + 1].startsWith('--'))) {
        console.error(`${NAME}: FAIL -- ${a} needs a path`);
        console.error(`  ${usage}`);
        process.exit(2);
    }
    if (a === '--manifest' || a === '--draft') i += 1;
}
if ((DRAFT_AT >= 0) !== (MANIFEST_AT >= 0) && !EXPECTED && !SELF) {
    console.error(`${NAME}: FAIL -- --draft is compared against --manifest; pass both`);
    console.error(`  ${usage}`);
    process.exit(2);
}

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/. Next step: run yarn install in theia/ first.`);
    process.exit(1);
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

// The "## Release asset names" section of docs/RELEASING.md, up to the next level-2 heading.
// Both derivations read this section only, so a backticked key elsewhere in the file never matches.
export function assetSection(docs) {
    const m = docs?.match(/^## Release asset names\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    return m ? m[1] : null;
}

// The target token: the first backticked Target key of the asset table in that section.
export function targetToken(docs) {
    const section = assetSection(docs);
    const m = section?.match(/^\| `([a-z0-9]+(?:-[a-z0-9_]+)+)` \|/m);
    return m ? m[1] : null;
}

// The assets attached once per Release: the backticked names of the paragraph that lists them.
export function noTokenAssets(docs) {
    const m = assetSection(docs)?.match(/Assets that carry no target token[^:]*:([\s\S]*?)the source tarball\./);
    if (!m) return null;
    return [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
}

// The expected set as [kind, name] pairs. The version is the tag minus its leading v.
export function expectedAssets({ app, releaseKey, token, noToken }) {
    const version = releaseKey.replace(/^v/, '');
    const notices = noToken.filter(n => n !== 'SHA256SUMS');
    return [
        ['versioned-tarball', `${app}-${version}.${token}.tar.xz`],
        ['stable-tarball', `${app}-${token}.tar.xz`],
        ['versioned-mar', `${app}-${version}.${token}.complete.mar`],
        ['stable-mar', `${app}-${token}.complete.mar`],
        ['sums', 'SHA256SUMS'],
        ...notices.map(n => ['notice', n]),
        ['source', `${app}-${version}.source.tar.gz`],
    ];
}

// Set equality: a missing asset and an extra asset are both failures, each naming the asset.
export function compareDraft(expected, draft) {
    const want = new Set(expected.map(([, n]) => n));
    const got = new Set(draft);
    const out = [];
    for (const n of want) {
        if (!got.has(n)) out.push(`asset ${n} is missing from the draft Release, so the publish would ship without it`);
    }
    for (const n of got) {
        if (!want.has(n)) out.push(`asset ${n} is on the draft Release but not in the manifest-derived set, so the publish would ship an unchecked file`);
    }
    return out;
}

function stepsOf(job) {
    return Array.isArray(job?.steps) ? job.steps.filter(s => s !== null && typeof s === 'object') : [];
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });
    const read = overrides.read ?? (rel => readText(root, rel));

    const { config, failures: cfgFailures } = resolveConfig(join(root, 'configuration.toml'));
    if (cfgFailures.length > 0) {
        fail('configuration.toml', 'derive', `does not resolve (${cfgFailures[0]}). Next step: fix the manifest.`);
        return { failures, expected: [] };
    }
    const app = config.identity.app_basename;
    const releaseKey = overrides.releaseKey ?? releaseIdentity(config).releaseKey;

    const docs = read(DOCS_REL);
    const token = targetToken(docs);
    const noToken = noTokenAssets(docs);
    if (token === null) fail(DOCS_REL, 'derive', `has no Target key row in the Release asset names table, so no target token is derivable. Next step: fill the table row.`);
    if (noToken === null) fail(DOCS_REL, 'derive', `has no paragraph that lists the assets attached once per Release. Next step: restore that sentence.`);
    if (token === null || noToken === null) return { failures, expected: [] };

    const expected = expectedAssets({ app, releaseKey, token, noToken });
    for (const [kind, name] of expected) {
        if (kind === 'notice' && read(name) === null) {
            fail(name, 'derive', `is listed as a no-token asset in ${DOCS_REL} but is not in the tree, so the publish has nothing to attach. Next step: restore the file.`);
        }
    }

    if (overrides.draft !== undefined) {
        for (const msg of compareDraft(expected, overrides.draft)) {
            const name = msg.match(/asset (\S+) is/)?.[1] ?? '(unnamed)';
            fail(RELEASE_REL, 'set-equality', `${msg} (${name}). Next step: rebuild the draft from the expected set.`);
        }
    }

    // The workflow order and the publish gate.
    const text = overrides.text ?? read(RELEASE_REL);
    if (text === null || text === undefined) {
        fail(RELEASE_REL, 'parse', `could not be read. Next step: restore the release workflow.`);
        return { failures, expected };
    }
    if (/--generate-notes/.test(text)) {
        fail(RELEASE_REL, 'notes', `uses --generate-notes; the notes are derived from the tree, never generated. Next step: remove the flag.`);
    }
    let wf;
    try {
        wf = yaml.load(text);
    } catch (e) {
        fail(RELEASE_REL, 'parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file.`);
        return { failures, expected };
    }
    const steps = stepsOf(wf?.jobs?.['sign-publish']);
    const at = id => steps.findIndex(s => s.id === id);
    const attestAt = steps.findIndex(s => String(s.uses ?? '').startsWith('actions/attest-build-provenance@'));
    const draftAt = at('draft_release');
    const equalAt = at('asset_set');
    const botAt = at('bot');
    const publishAt = at('publish');
    for (const [id, i] of [['draft_release', draftAt], ['asset_set', equalAt], ['bot', botAt], ['publish', publishAt]]) {
        if (i < 0) fail(RELEASE_REL, 'order', `sign-publish has no step with id ${id}. Next step: restore the step, so the draft, the equality check, the token and the publish are all present.`);
    }
    if (attestAt < 0) fail(RELEASE_REL, 'order', `sign-publish has no attest-build-provenance step. Next step: attest the assets before the draft.`);
    if (draftAt < 0 || equalAt < 0 || botAt < 0 || publishAt < 0) return { failures, expected };

    const draftRun = String(steps[draftAt].run ?? '');
    const publishRun = String(steps[publishAt].run ?? '');
    if (!/gh release create[^\n]*--draft/.test(draftRun)) {
        fail(RELEASE_REL, 'order', `the draft_release step does not create the Release with --draft. Next step: create a draft with every asset in one call.`);
    }
    if (/--draft=false/.test(draftRun)) {
        fail(RELEASE_REL, 'order', `the draft_release step publishes with --draft=false. Next step: publish only in the publish step, after the equality check.`);
    }
    if (!/--draft=false/.test(publishRun)) {
        fail(RELEASE_REL, 'order', `the publish step does not publish the draft with --draft=false. Next step: publish once with gh release edit --draft=false.`);
    }
    if (!(attestAt < draftAt)) {
        fail(RELEASE_REL, 'order', `the draft is created before the assets are attested. Next step: attest before the draft.`);
    }
    if (!(equalAt < publishAt)) {
        fail(RELEASE_REL, 'order', `the publish runs before the asset-set equality check, so an unchecked asset set could be published. Next step: move the equality check before the publish.`);
    }
    if (!(botAt === publishAt - 1)) {
        fail(RELEASE_REL, 'order', `the bot App token is not minted immediately before the publish. Next step: mint it in the step directly before the publish.`);
    }
    if (String(steps[botAt].uses ?? '').indexOf('actions/create-github-app-token@') !== 0) {
        fail(RELEASE_REL, 'order', `the bot step is not actions/create-github-app-token. Next step: mint the bot App token with that action.`);
    }

    failures.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : a.msg < b.msg ? -1 : 1));
    return { failures, expected };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${path} could not be read as JSON (${e.message.split('\n')[0]}). Next step: check the file the release job wrote.`);
        process.exit(1);
    }
}

function main() {
    if (SELF) return selfTest();
    if (EXPECTED) {
        if (MANIFEST_AT < 0) {
            console.error(`${NAME}: FAIL -- --expected needs --manifest <release-manifest.json>`);
            console.error(`  ${usage}`);
            return 2;
        }
        const manifest = readJson(args[MANIFEST_AT + 1]);
        const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
        const docs = readText(REPO_ROOT, DOCS_REL);
        const expected = expectedAssets({
            app: config.identity.app_basename,
            releaseKey: manifest.release_key,
            token: targetToken(docs),
            noToken: noTokenAssets(docs),
        });
        for (const [kind, name] of expected) console.log(`${kind}\t${name}`);
        return 0;
    }
    if (DRAFT_AT >= 0) {
        const manifest = readJson(args[MANIFEST_AT + 1]);
        const draft = readJson(args[DRAFT_AT + 1]);
        const { failures, expected } = runChecks(REPO_ROOT, { releaseKey: manifest.release_key, draft });
        if (failures.length > 0) {
            console.error(`${NAME}: FAIL -- ${failures.length} problem(s): the draft asset set does not equal the manifest-derived set.`);
            failures.forEach(f => console.error(`  ${fmt(f)}`));
            return 1;
        }
        console.log(`${NAME}: PASS -- the draft carries exactly the ${expected.length} manifest-derived assets for ${manifest.release_key}; the publish may run.`);
        return 0;
    }
    const { failures, expected } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the draft, the equality check and the publish order.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- sign-publish creates a draft with every asset, checks it against ${expected.length} derived names (versioned and stable tarball and MAR, SHA256SUMS, notices, source tarball) before the bot App token is minted and the single publish.`);
    return 0;
}

function selfTest() {
    const real = readText(REPO_ROOT, RELEASE_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return 1;
    }
    const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    const docs = readText(REPO_ROOT, DOCS_REL);
    const expected = expectedAssets({
        app: config.identity.app_basename,
        releaseKey: releaseIdentity(config).releaseKey,
        token: targetToken(docs),
        noToken: noTokenAssets(docs),
    });
    const names = expected.map(([, n]) => n);
    const good = [...names];

    const baseline = runChecks(REPO_ROOT, { text: real, draft: good });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${RELEASE_REL}`);
        return real.replace(from, to);
    };
    // Swaps two steps of the workflow text by line range: a step runs from its `      - ` line to
    // the next step or the next job-level key, so the job below sign-publish is never moved.
    const swapStepBlocks = (a, b) => {
        const lines = real.split('\n');
        const blockOf = id => {
            const at = lines.findIndex(l => l === `        id: ${id}`);
            if (at < 0) throw new Error(`self-test anchor ${id} is absent from ${RELEASE_REL}`);
            let start = at;
            while (start > 0 && !/^ {6}- /.test(lines[start])) start -= 1;
            let end = at + 1;
            while (end < lines.length && !/^( {6}- |\s{0,5}\S)/.test(lines[end])) end += 1;
            return [start, end];
        };
        const [a1, a2] = blockOf(a);
        const [b1, b2] = blockOf(b);
        const [[f1, f2], [s1, s2]] = a1 < b1 ? [[a1, a2], [b1, b2]] : [[b1, b2], [a1, a2]];
        return [...lines.slice(0, f1), ...lines.slice(s1, s2), ...lines.slice(f2, s1), ...lines.slice(f1, f2), ...lines.slice(s2)].join('\n');
    };
    const stableTar = expected.find(([k]) => k === 'stable-tarball')[1];
    const versionedTar = expected.find(([k]) => k === 'versioned-tarball')[1];
    const plants = [
        ['dropped asset (LICENSING.md)', { draft: good.filter(n => n !== 'LICENSING.md') }, 'LICENSING.md'],
        ['extra asset (stray.zip)', { draft: [...good, 'stray.zip'] }, 'stray.zip'],
        ['stable-name drift', { draft: good.map(n => (n === stableTar ? 'powerbrowser-linux-x86.tar.xz' : n)) }, stableTar],
        ['versioned-name drift', { draft: good.map(n => (n === versionedTar ? versionedTar.replace(/-\d+\.linux/, '-99.linux') : n)) }, versionedTar],
        ['publish before the asset-set equality', { text: swapStepBlocks('asset_set', 'publish') }, 'publish runs before the asset-set equality'],
    ];

    let failed = 0;
    for (const [name, overrides, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text: real, draft: good, ...overrides });
        const hit = failures.some(f => f.file.length > 0 && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified draft and publish order are green and ${plants.length} planted faults each went red naming the asset or the step. It writes nothing.`);
    return 0;
}

process.exit(main());
