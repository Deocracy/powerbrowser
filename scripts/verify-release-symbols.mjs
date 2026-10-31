#!/usr/bin/env node
// scripts/verify-release-symbols.mjs
//
// The TEL-12 symbols asset gate (Phase 57, 57-03). `mach buildsymbols` writes one
// <PKG_BASENAME>.crashreporter-symbols.zip per BUILD_TARGET; the DIST-07 Release asset set must carry it
// beside the tarball and MAR of the same target. This gate derives every expectation from the tree at
// check time and compares it; nothing here is a hand-kept list.
//
// WHAT IT ASSERTS (each expectation derived, never kept here):
//  1. The archive suffix and extension come from upstream/toolkit/mozapps/installer/package-name.mk
//     (SYMBOL_ARCHIVE_BASENAME = $(PKG_BASENAME).crashreporter-symbols) and upstream/Makefile.in
//     (symbolsarchive writes $(SYMBOL_ARCHIVE_BASENAME).zip). The same file's PKG_BASENAME line is the
//     on-disk name `mach buildsymbols` produces, and it carries the locale (AB_CD), the Gecko version
//     and the platform, none of which is the release asset's name. docs/BUILD.md "Crash symbols per
//     target" must therefore state that on-disk template (rendered from the make line) and the rename
//     to the asset name; a drift in the make line, or a doc that no longer records the rename, goes red.
//  2. The app basename comes from configuration.toml [identity] app_basename (resolveConfig), the release
//     key and version from the DIST-07 grammar, and EVERY target row of the "Release asset names" table
//     of docs/RELEASING.md. A row is a backticked target token (checked) or a prose row declared
//     `pending stage ...` (reported, not checkable until its token is observed). A row that is neither
//     goes red, so a new target written in prose cannot be silently skipped.
//  3. The expected symbols set is the versioned and the stable name per token. Names are unique across
//     the table (two rows with one token collide), and none collides with a DIST-07 name.
//  4. The DIST-07 names are NOT typed here: they are the output of `verify-release-asset-set.mjs
//     --expected`, the script the release job copies assets by.
//  5. SHA256SUMS coverage: the release workflow writes SHA256SUMS by enumerating every file of assets/,
//     not by naming files, so a symbols zip copied into assets/ is listed. The workflow text is read.
//  6. Draft equality (the live mode, `--draft <json> --manifest <json>`, and the plants): a Release
//     draft's symbols assets equal the expected set, so a missing and a stale symbols asset are each red,
//     named.
//  7. The stackwalk runbook in docs/CRASH-POLICY.md names the record's annotations; each must be a
//     top-level annotation of upstream/toolkit/crashreporter/CrashAnnotations.yaml, so the runbook never
//     tells the reader to read a field Gecko does not write.
//
// THE REAL RELEASE JOB IS NOT CHANGED HERE. The symbols join the live asset set at the TEL-13 flip,
// when the reporter is built on. Until then this gate proves the derivation and the equality rules
// on the tree, and the tier-3 `mach buildsymbols` run is an owner step (docs/BUILD.md).
//
// SELF-TEST. The unmutated tree is green first. Then each plant overrides one input of runChecks and
// must go red naming the rule or the asset: a missing and a stale symbols entry, SHA256SUMS naming
// files, two rows with one token, an unchecked new row, a prose row not marked pending, a locale-free
// PKG_BASENAME, a Makefile drift, a runbook annotation Gecko does not write, a DIST-07 collision.
//
// Honestly --quick: text reads of the tree plus one child process of verify-release-asset-set.mjs
// --expected. No build, no network.
//
// Usage:
//   node scripts/verify-release-symbols.mjs
//   node scripts/verify-release-symbols.mjs --manifest <release-manifest.json> --draft <draft-assets.json>
//   node scripts/verify-release-symbols.mjs --self-test

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-release-symbols';
const PACKAGE_NAME_REL = 'upstream/toolkit/mozapps/installer/package-name.mk';
const MAKEFILE_REL = 'upstream/Makefile.in';
const ANNOTATIONS_REL = 'upstream/toolkit/crashreporter/CrashAnnotations.yaml';
const DOCS_REL = 'docs/RELEASING.md';
const BUILD_DOC_REL = 'docs/BUILD.md';
const POLICY_REL = 'docs/CRASH-POLICY.md';
const RELEASE_REL = '.github/workflows/release.yml';
const ASSET_SET_REL = 'scripts/verify-release-asset-set.mjs';
const MANIFEST_REL = 'configuration.toml';
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');

// A name safe as a file name and a TSV line (the DIST-07 grammar).
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The release key grammar: v<esr groups>-<revision>.
const RELEASE_KEY = /^v\d+(?:\.\d+)*-\d+$/;
const RELEASE_KEY_FIXTURE = 'v140.12-1';
const TOKEN_CELL = /^`([a-z0-9]+(?:-[a-z0-9_]+)+)`$/;

/** Derive the archive suffix, the extension and the on-disk PKG_BASENAME template from the upstream lines. */
export function deriveSymbolArchive(packageNameMk, makefileIn) {
    const suffix = /^SYMBOL_ARCHIVE_BASENAME\s*=\s*\$\(PKG_BASENAME\)(\.[A-Za-z0-9._-]+)\s*$/m.exec(packageNameMk ?? '');
    if (!suffix) throw new Error('package-name.mk no longer defines SYMBOL_ARCHIVE_BASENAME as $(PKG_BASENAME) plus a suffix');
    const ext = /\$\(SYMBOL_ARCHIVE_BASENAME\)\.(zip)\b/.exec(makefileIn ?? '');
    if (!ext) throw new Error('Makefile.in no longer writes $(SYMBOL_ARCHIVE_BASENAME).zip from symbolsarchive');
    const base = /^PKG_BASENAME = (.+)$/m.exec(packageNameMk ?? '');
    if (!base) throw new Error('package-name.mk no longer defines PKG_BASENAME');
    return { suffix: suffix[1], ext: `.${ext[1]}`, onDiskTemplate: base[1].trim().replace(/\$\(([A-Z_]+)\)/g, '<$1>') };
}

/** The "## Release asset names" section, the one both DIST-07 derivations read. */
export function assetSection(docs) {
    const m = docs?.match(/^## Release asset names\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    return m ? m[1] : null;
}

/**
 * Every target row of the asset table. A row is { token } for a backticked token, { pending } for a prose
 * row whose cells all say `pending stage`, or { bad } for anything else.
 */
export function targetRows(docs) {
    const section = assetSection(docs);
    if (section === null) return [];
    const rows = [];
    for (const line of section.split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 3 || /^Target key$/i.test(cells[0]) || /^-+$/.test(cells[0].replace(/\s/g, ''))) continue;
        const token = TOKEN_CELL.exec(cells[0]);
        if (token) rows.push({ token: token[1] });
        else if (cells.slice(1).every(c => /^pending stage `[a-z0-9-]+`/.test(c))) rows.push({ pending: cells[0] });
        else rows.push({ bad: cells[0] });
    }
    return rows;
}

/** The expected symbols set for one release: a versioned and a stable name per token. */
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

/** The DIST-07 names, as the release job derives them: the output of verify-release-asset-set.mjs --expected. */
export function dist07Names(releaseKey) {
    const dir = mkdtempSync(join(tmpdir(), 'verify-release-symbols-'));
    try {
        const manifest = join(dir, 'release-manifest.json');
        writeFileSync(manifest, JSON.stringify({ release_key: releaseKey }), 'utf8');
        const run = spawnSync(process.execPath, [join(REPO_ROOT, ASSET_SET_REL), '--expected', '--manifest', manifest], { encoding: 'utf8' });
        if (run.status !== 0) throw new Error(`${ASSET_SET_REL} --expected exited ${run.status}: ${(run.stderr || '').trim().split('\n')[0]}`);
        return run.stdout.split('\n').filter(Boolean).map(line => line.split('\t')[1]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** Set equality over the symbols assets: a missing name and a stale name are both failures, each naming the asset. */
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

/** True when the workflow writes SHA256SUMS by enumerating every file of assets/ (not by naming files). */
export function sumsEnumeratesAssets(workflow) {
    return /find \. -maxdepth 1 -type f ! -name SHA256SUMS[^\n]*sha256sum > SHA256SUMS/.test(workflow ?? '');
}

/** The annotation names the stackwalk runbook tells the reader to read in the record. */
export function runbookAnnotations(policy) {
    const section = /^## Minidump stackwalk runbook\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(policy ?? '');
    const sentence = section && /in the\s+((?:`[A-Za-z]+`(?:,\s+|\s+and\s+)?)+)\s+annotations/.exec(section[1]);
    return sentence ? [...sentence[1].matchAll(/`([A-Za-z]+)`/g)].map(m => m[1]) : [];
}

function duplicates(names) {
    const seen = new Map();
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
    return [...seen].filter(([, count]) => count > 1).map(([name]) => name);
}

/**
 * Every expectation derived from the tree. overrides.files replaces the text of named tree files (the
 * plants), overrides.dist07 replaces the DIST-07 name list, overrides.draft supplies a Release draft's
 * asset names, overrides.releaseKey the key. Returns { failures, pending }.
 */
export function runChecks(root, overrides = {}) {
    const failures = [];
    const read = rel => overrides.files?.[rel] ?? readFileSync(join(root, rel), 'utf8');
    let archive;
    try {
        archive = deriveSymbolArchive(read(PACKAGE_NAME_REL), read(MAKEFILE_REL));
    } catch (err) {
        return { failures: [`${PACKAGE_NAME_REL} / ${MAKEFILE_REL}: ${err.message}. Next step: align the gate with the pinned upstream naming, then re-run.`], pending: [] };
    }
    const rows = targetRows(read(DOCS_REL));
    const tokens = rows.filter(r => r.token).map(r => r.token);
    const pending = rows.filter(r => r.pending).map(r => r.pending);
    for (const row of rows.filter(r => r.bad)) {
        failures.push(`${DOCS_REL}: the asset table row ${JSON.stringify(row.bad)} is neither a backticked target token nor marked "pending stage ...", so its symbols asset cannot be derived or skipped knowingly. Next step: write the token or mark the row pending.`);
    }
    if (tokens.length === 0) return { failures: [...failures, `${DOCS_REL}: the Release asset names table yields no target tokens. Next step: restore the table.`], pending };
    const { config, failures: cfgFailures } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (cfgFailures.length > 0) return { failures: [...failures, `${MANIFEST_REL} does not resolve (${cfgFailures[0]}). Next step: fix the manifest.`], pending };
    const app = config.identity.app_basename;
    const releaseKey = overrides.releaseKey ?? RELEASE_KEY_FIXTURE;
    let expected;
    try {
        expected = expectedSymbols({ app, releaseKey, tokens, ...archive });
    } catch (err) {
        return { failures: [...failures, `${DOCS_REL}: ${err.message}. Next step: fix the key or the table.`], pending };
    }

    // 3. unique names across the table, and no token listed twice.
    const names = expected.map(([, n]) => n);
    for (const dup of duplicates(names)) failures.push(`symbols asset ${dup} is named for two targets, so adjacent targets collide: every target row needs its own BUILD_TARGET token`);

    // 4. no collision with the DIST-07 names of the same release, derived by the release job's own script.
    let taken;
    try {
        taken = new Set(overrides.dist07 ?? dist07Names(releaseKey));
    } catch (err) {
        return { failures: [...failures, `${err.message}. Next step: fix ${ASSET_SET_REL} so the DIST-07 names derive.`], pending };
    }
    for (const n of names) if (taken.has(n)) failures.push(`symbols asset ${n} collides with a DIST-07 asset of the same release`);

    // 1b. the on-disk name carries the locale, version and platform; the doc must record the rename.
    const buildDoc = read(BUILD_DOC_REL);
    const section = /^## Crash symbols per target[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(buildDoc)?.[1] ?? '';
    if (!section.includes(archive.onDiskTemplate) || !/\brename/i.test(section)) {
        failures.push(`${BUILD_DOC_REL}: "Crash symbols per target" must state the on-disk name template ${archive.onDiskTemplate} (from PKG_BASENAME in package-name.mk) and the rename of that zip to the release asset name; the build writes a locale, a Gecko version and a platform that the asset name does not carry`);
    }

    // 5. SHA256SUMS lists every file of assets/.
    if (!sumsEnumeratesAssets(read(RELEASE_REL))) {
        failures.push(`${RELEASE_REL}: SHA256SUMS is no longer written by enumerating every file of assets/ (find . -maxdepth 1 -type f ! -name SHA256SUMS | sha256sum > SHA256SUMS), so a symbols zip could be absent from SHA256SUMS and a downloaded zip could not be verified`);
    }

    // 6. the draft's symbols assets equal the expected set.
    if (overrides.draft !== undefined) failures.push(...compareSymbolsDraft(expected, overrides.draft));

    // 7. the runbook reads only annotations Gecko writes.
    const annotationsYaml = read(ANNOTATIONS_REL);
    const known = new Set([...annotationsYaml.matchAll(/^([A-Za-z0-9]+):\s*$/gm)].map(m => m[1]));
    const used = runbookAnnotations(read(POLICY_REL));
    if (used.length === 0) failures.push(`${POLICY_REL}: the stackwalk runbook no longer names the record's annotations ("in the ... annotations"), so the build cannot be matched to its symbols`);
    for (const a of used) {
        if (!known.has(a)) failures.push(`${POLICY_REL}: the stackwalk runbook tells the reader to read the \`${a}\` annotation, which is not in ${ANNOTATIONS_REL}, so Gecko never writes it`);
    }

    return { failures, pending };
}

function main() {
    const manifestAt = args.indexOf('--manifest');
    const draftAt = args.indexOf('--draft');
    let overrides = {};
    if (manifestAt >= 0 || draftAt >= 0) {
        if (manifestAt < 0 || draftAt < 0 || !args[manifestAt + 1] || !args[draftAt + 1]) {
            console.error(`${NAME}: FAIL -- --manifest and --draft each need a path. Next step: pass both.`);
            process.exit(2);
        }
        overrides = {
            releaseKey: JSON.parse(readFileSync(args[manifestAt + 1], 'utf8')).release_key,
            draft: JSON.parse(readFileSync(args[draftAt + 1], 'utf8')),
        };
    }
    const { failures, pending } = runChecks(REPO_ROOT, overrides);
    if (failures.length > 0) {
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the symbols archive names derive from package-name.mk and Makefile.in, the rename from the on-disk name is recorded, no name collides with the DIST-07 set, SHA256SUMS enumerates assets/, and the runbook reads only annotations Gecko writes${pending.length > 0 ? `; not yet checkable (pending their stage): ${pending.join(', ')}` : ''}`);
    process.exit(0);
}

function selfTest() {
    let failed = 0;
    const complain = (rule, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${rule}' ${why}`);
        failed += 1;
    };
    const control = runChecks(REPO_ROOT);
    if (control.failures.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.failures.join(' | ')}`);
        process.exit(1);
    }
    console.log('  ok  unmutated control -> the derivation, the rows, the rename, the collisions and SHA256SUMS hold');

    const text = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
    const docs = text(DOCS_REL);
    const tokens = targetRows(docs).filter(r => r.token).map(r => r.token);
    const { config } = resolveConfig(join(REPO_ROOT, MANIFEST_REL), undefined);
    const app = config.identity.app_basename;
    const archive = deriveSymbolArchive(text(PACKAGE_NAME_REL), text(MAKEFILE_REL));
    const expected = expectedSymbols({ app, releaseKey: RELEASE_KEY_FIXTURE, tokens, ...archive });
    const good = expected.map(([, n]) => n);
    const firstRow = /^\| `[a-z0-9_-]+` \|.*$/m.exec(assetSection(docs))[0];

    const plants = [
        ['missing symbols entry', { draft: good.slice(1) }, good[0]],
        ['stale symbols entry', { draft: [...good, `${app}-${RELEASE_KEY_FIXTURE.replace(/^v/, '')}.retired-target${archive.suffix}${archive.ext}`] }, 'retired-target'],
        ['SHA256SUMS written from named files', { files: { [RELEASE_REL]: text(RELEASE_REL).replace('find . -maxdepth 1 -type f ! -name SHA256SUMS -printf', 'ls -1 *.tar.xz *.mar -printf') } }, 'SHA256SUMS'],
        ['two rows with one token', { files: { [DOCS_REL]: docs.replace(firstRow, `${firstRow}\n${firstRow}`) } }, 'two targets'],
        ['new target row without a draft entry', { files: { [DOCS_REL]: docs.replace(firstRow, `${firstRow}\n| \`windows-x86_64\` | x | y |`) }, draft: good }, 'windows-x86_64'],
        ['prose row not marked pending', { files: { [DOCS_REL]: docs.replace(firstRow, `${firstRow}\n| Haiku riscv | x | y |`) } }, 'Haiku riscv'],
        ['PKG_BASENAME loses the locale', { files: { [PACKAGE_NAME_REL]: text(PACKAGE_NAME_REL).replace('.$(AB_CD).$(MOZ_PKG_PLATFORM)', '.$(MOZ_PKG_PLATFORM)') } }, 'on-disk name template'],
        ['Makefile no longer writes the zip', { files: { [MAKEFILE_REL]: text(MAKEFILE_REL).replaceAll('$(SYMBOL_ARCHIVE_BASENAME).zip', '$(SYMBOL_ARCHIVE_BASENAME).tar') } }, 'Makefile.in'],
        ['runbook reads the Platform annotation', { files: { [POLICY_REL]: text(POLICY_REL).replace('`OS` and `CPUArchitecture` annotations', '`Platform` and `CPUArchitecture` annotations') } }, 'Platform'],
        ['symbols name collides with a DIST-07 name', { dist07: [good[0]] }, good[0]],
    ];
    for (const [rule, overrides, needle] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (!failures.some(f => f.includes(needle))) complain(rule, `did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures)'}`);
        else console.log(`  ok  ${rule} -> red, naming '${needle}'`);
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
