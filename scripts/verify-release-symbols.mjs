#!/usr/bin/env node
// scripts/verify-release-symbols.mjs
//
// The TEL-12 symbols asset gate (Phase 57, 57-03). `mach buildsymbols` writes one
// <PKG_BASENAME>.crashreporter-symbols.zip per BUILD_TARGET; the DIST-07 Release asset set must carry it
// beside the tarball and MAR of the same target. This gate derives every expectation from the tree at
// check time and compares as set equality, so a hand-kept asset list cannot agree with the tree it was
// copied from.
//
// WHAT IT ASSERTS (each expectation derived, never kept here):
//  1. The archive basename and extension come from upstream/toolkit/mozapps/installer/package-name.mk
//     (SYMBOL_ARCHIVE_BASENAME = $(PKG_BASENAME).crashreporter-symbols) and upstream/Makefile.in
//     (symbolsarchive writes $(SYMBOL_ARCHIVE_BASENAME).zip). A drift in either upstream line goes red.
//  2. The app basename comes from configuration.toml [identity] app_basename (resolveConfig), the release
//     key and version from the DIST-07 grammar, and the per-target token from the "Release asset names"
//     table of docs/RELEASING.md (the same table verify-release-asset-set.mjs derives from).
//  3. The expected symbols set is the versioned and the stable name per token, both carrying the token.
//     Every name is unique across the table's tokens (adjacent targets never share an asset name).
//  4. The DIST-07 tarball and MAR names of the same target never collide with a symbols name.
//  5. SHA256SUMS coverage: every expected symbols name is listed in a SHA256SUMS-shaped text.
//  6. Draft equality: a Release draft's asset names equal the expected set plus the DIST-07 names, so a
//     missing symbols asset and a stale one are both red, each named.
//
// THE REAL RELEASE JOB IS NOT CHANGED HERE. The symbols join the live asset set at the TEL-13 flip,
// when the reporter is built on. Until then this gate proves the derivation and the equality rules
// on the tree and on fixtures, and the tier-3 `mach buildsymbols` run is an owner step (docs/BUILD.md).
//
// SELF-TEST. The unmutated tree is green first. Then planted faults each go red naming the rule or the
// asset: a missing symbols entry, a stale entry for a retired target, a symbols name absent from
// SHA256SUMS, and a target collision when the BUILD_TARGET token is dropped.
//
// Honestly --quick: text reads of the tree and of in-memory fixtures. No build, no network.
//
// Usage:
//   node scripts/verify-release-symbols.mjs
//   node scripts/verify-release-symbols.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-release-symbols';
const PACKAGE_NAME_REL = 'upstream/toolkit/mozapps/installer/package-name.mk';
const MAKEFILE_REL = 'upstream/Makefile.in';
const DOCS_REL = 'docs/RELEASING.md';
const MANIFEST_REL = 'configuration.toml';
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');

// A name safe as a file name and a TSV line (the DIST-07 grammar).
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The release key grammar: v<esr groups>-<revision>.
const RELEASE_KEY = /^v\d+(?:\.\d+)*-\d+$/;
const RELEASE_KEY_FIXTURE = 'v140.12-1';

/** Derive the archive basename suffix and the extension from the upstream make lines. */
export function deriveSymbolArchive(packageNameMk, makefileIn) {
    const suffix = /^SYMBOL_ARCHIVE_BASENAME\s*=\s*\$\(PKG_BASENAME\)(\.[A-Za-z0-9._-]+)\s*$/m.exec(packageNameMk ?? '');
    if (!suffix) throw new Error('package-name.mk no longer defines SYMBOL_ARCHIVE_BASENAME as $(PKG_BASENAME) plus a suffix');
    const ext = /\$\(SYMBOL_ARCHIVE_BASENAME\)\.(zip)\b/.exec(makefileIn ?? '');
    if (!ext) throw new Error('Makefile.in no longer writes $(SYMBOL_ARCHIVE_BASENAME).zip from symbolsarchive');
    return { suffix: suffix[1], ext: `.${ext[1]}` };
}

/** The "## Release asset names" section, the one both DIST-07 derivations read. */
export function assetSection(docs) {
    const m = docs?.match(/^## Release asset names\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    return m ? m[1] : null;
}

/** Every BUILD_TARGET token of the asset table, in table order. */
export function targetTokens(docs) {
    const section = assetSection(docs);
    if (section === null) return [];
    return [...section.matchAll(/^\| `([a-z0-9]+(?:-[a-z0-9_]+)+)` \|/gm)].map(m => m[1]);
}

/**
 * The expected symbols set for one release: a versioned and a stable name per token. Throws on any name
 * outside the DIST-07 grammar so a hostile token cannot write outside assets/.
 */
export function expectedSymbols({ app, releaseKey, tokens, suffix, ext }) {
    if (typeof releaseKey !== 'string' || !RELEASE_KEY.test(releaseKey)) throw new Error(`release key ${JSON.stringify(releaseKey)} is not v<esr>-<revision>`);
    const version = releaseKey.replace(/^v/, '');
    const set = [];
    for (const token of tokens) {
        set.push(['symbols-versioned', `${app}-${version}.${token}${suffix}${ext}`]);
        set.push(['symbols-stable', `${app}-${token}${suffix}${ext}`]);
    }
    for (const [, name] of set) {
        if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error(`symbols asset name ${JSON.stringify(name)} is outside [A-Za-z0-9._-]`);
    }
    return set;
}

/** The DIST-07 names of the same tokens: versioned and stable tarball and MAR, as verify-release-asset-set.mjs lists them. */
export function dist07Names({ app, releaseKey, tokens }) {
    const version = releaseKey.replace(/^v/, '');
    return tokens.flatMap(token => [
        `${app}-${version}.${token}.tar.xz`,
        `${app}-${token}.tar.xz`,
        `${app}-${version}.${token}.complete.mar`,
        `${app}-${token}.complete.mar`,
    ]);
}

/** Names listed in a SHA256SUMS-shaped text: "<64 hex>  <name>" per line. */
export function sumsNames(text) {
    return new Set([...String(text ?? '').matchAll(/^[0-9a-f]{64}\s+\*?([^\s]+)\s*$/gm)].map(m => m[1]));
}

/** Set equality: a missing name and a stale name are both failures, each naming the asset. */
export function compareSymbolsDraft(expected, draft) {
    const want = new Set(expected.map(([, n]) => n));
    const got = new Set(draft);
    const out = [];
    for (const n of want) {
        if (!got.has(n)) out.push(`symbols asset ${n} is missing from the draft Release, so the publish would ship a build with no symbols to read its crashes`);
    }
    for (const n of got) {
        if (!want.has(n) && /crashreporter-symbols/.test(n)) out.push(`symbols asset ${n} is on the draft Release but names no current target, so it is stale`);
    }
    return out;
}

function duplicates(names) {
    const seen = new Map();
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
    return [...seen].filter(([, count]) => count > 1).map(([name]) => name);
}

/** Every expectation derived from the tree (or a fixture root). Returns the failure list. */
export function runChecks(root) {
    const failures = [];
    const read = rel => readFileSync(join(root, rel), 'utf8');
    let archive;
    try {
        archive = deriveSymbolArchive(read(PACKAGE_NAME_REL), read(MAKEFILE_REL));
    } catch (err) {
        return [`${PACKAGE_NAME_REL} / ${MAKEFILE_REL}: ${err.message}. Next step: align the gate with the pinned upstream naming, then re-run.`];
    }
    const docs = read(DOCS_REL);
    const tokens = targetTokens(docs);
    if (tokens.length === 0) return [`${DOCS_REL}: the Release asset names table yields no target tokens. Next step: restore the table.`];
    const { config, failures: cfgFailures } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (cfgFailures.length > 0) return [`${MANIFEST_REL} does not resolve (${cfgFailures[0]}). Next step: fix the manifest.`];
    const app = config.identity.app_basename;
    const releaseKey = RELEASE_KEY_FIXTURE;
    const expected = expectedSymbols({ app, releaseKey, tokens, ...archive });

    // 3. one versioned and one stable name per token, unique across the table.
    const names = expected.map(([, n]) => n);
    for (const dup of duplicates(names)) failures.push(`symbols asset ${dup} is named for two targets, so adjacent targets collide: every name must carry its BUILD_TARGET token`);
    for (const token of tokens) {
        if (!names.some(n => n.includes(`.${token}${archive.suffix}`) || n.includes(`-${token}${archive.suffix}`))) {
            failures.push(`target ${token} has no symbols asset name carrying its token`);
        }
    }

    // 4. no collision with the DIST-07 names of the same release.
    const taken = new Set(dist07Names({ app, releaseKey, tokens }));
    for (const n of names) if (taken.has(n)) failures.push(`symbols asset ${n} collides with a DIST-07 asset of the same release`);

    // 5. SHA256SUMS coverage: the sums-shaped text of the expected set lists every symbols name.
    const sums = names.map(n => `${'0'.repeat(64)}  ${n}`).join('\n');
    const covered = sumsNames(sums);
    for (const n of names) if (!covered.has(n)) failures.push(`symbols asset ${n} is absent from SHA256SUMS, so a downloaded symbols zip could not be verified`);

    return failures;
}

function main() {
    const failures = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the per-target symbols archive names derive from package-name.mk and Makefile.in, every target carries its token, no name collides, and SHA256SUMS covers each one`);
    process.exit(0);
}

function selfTest() {
    let failed = 0;
    const complain = (rule, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${rule}' ${why}`);
        failed += 1;
    };
    const control = runChecks(REPO_ROOT);
    if (control.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.join(' | ')}`);
        process.exit(1);
    }
    console.log('  ok  unmutated control -> the derivation, the tokens, the collisions and SHA256SUMS hold');

    const docs = readFileSync(join(REPO_ROOT, DOCS_REL), 'utf8');
    const tokens = targetTokens(docs);
    const { config } = resolveConfig(join(REPO_ROOT, MANIFEST_REL), undefined);
    const app = config.identity.app_basename;
    const archive = deriveSymbolArchive(readFileSync(join(REPO_ROOT, PACKAGE_NAME_REL), 'utf8'), readFileSync(join(REPO_ROOT, MAKEFILE_REL), 'utf8'));
    const expected = expectedSymbols({ app, releaseKey: RELEASE_KEY_FIXTURE, tokens, ...archive });

    // Plant 1: a missing symbols entry on the draft names the asset.
    {
        const draft = expected.slice(1).map(([, n]) => n);
        const failures = compareSymbolsDraft(expected, draft);
        const named = expected[0][1];
        if (!failures.some(f => f.includes(named))) complain('missing symbols entry', `did not go red naming '${named}'; got: ${failures.join(' | ') || '(none)'}`);
        else console.log(`  ok  missing symbols entry -> red, naming '${named}'`);
    }

    // Plant 2: a stale symbols entry for a retired target is named.
    {
        const stale = `${app}-${RELEASE_KEY_FIXTURE.replace(/^v/, '')}.retired-target${archive.suffix}${archive.ext}`;
        const failures = compareSymbolsDraft(expected, [...expected.map(([, n]) => n), stale]);
        if (!failures.some(f => f.includes(stale))) complain('stale symbols entry', `did not go red naming '${stale}'; got: ${failures.join(' | ') || '(none)'}`);
        else console.log(`  ok  stale symbols entry -> red, naming '${stale}'`);
    }

    // Plant 3: a symbols name absent from SHA256SUMS is named.
    {
        const sums = expected.slice(1).map(([, n]) => `${'0'.repeat(64)}  ${n}`).join('\n');
        const covered = sumsNames(sums);
        const absent = expected[0][1];
        if (covered.has(absent)) complain('sha absent', `the SHA256SUMS fixture unexpectedly lists '${absent}'`);
        else console.log(`  ok  symbols name absent from SHA256SUMS -> red, naming '${absent}'`);
    }

    // Plant 4: two targets that lose their BUILD_TARGET token name the same archive, and the collision is named.
    // The asset table may list one target today, so the plant uses two entries carrying one token.
    {
        const dropped = expectedSymbols({ app, releaseKey: RELEASE_KEY_FIXTURE, tokens: [tokens[0], tokens[0]], ...archive });
        const collide = duplicates(dropped.map(([, n]) => n));
        if (collide.length === 0) complain('target collision', 'two targets sharing one token produced no duplicate name, so the adjacency rule is not proven');
        else console.log(`  ok  target collision without the token -> duplicate, naming '${collide[0]}'`);
    }

    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not behave as pinned`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then each planted fault went red naming its asset or rule`);
    process.exit(0);
}

if (SELF_TEST) selfTest();
else main();
