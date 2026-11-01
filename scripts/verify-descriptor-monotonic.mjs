#!/usr/bin/env node
// scripts/verify-descriptor-monotonic.mjs
//
// The descriptor buildID monotonicity gate (Phase 44, UPD-26). No descriptor the
// pipeline offers may carry a build older than one already published for the same
// appVersion. Every candidate buildID must be strictly greater than every buildID the
// live Releases publish for that appVersion, across every BUILD_TARGET.
//
//  1. Published set (full tier). Every non-draft Release of the repository named in
//     configuration.toml [urls] release_notes must carry a release-manifest.json asset.
//     Its JSON gives { version, build_id, build_target }: the appVersion, the fourteen-digit
//     Gecko BuildID and the joined BUILD_TARGET. Unknown keys are ignored. Every read goes
//     through one fail-closed gh api helper with the pinned X-GitHub-Api-Version. A non-2xx,
//     a missing gh, failed auth, a non-JSON response, a Release with no manifest, a malformed
//     field, or a Release list at the page limit is a FAIL naming the endpoint or the Release,
//     never a SKIP. The manifest contract is written by the release packaging step.
//  2. Candidate set. Every <channel>/<BUILD_TARGET>/update.xml under .mozbuild/update-descriptors/,
//     the output tree of node scripts/build-update-xml.mjs --emit --outdir .mozbuild/update-descriptors.
//     Each is read through parseUpdateXml, the shared parser. A file that does not parse is a FAIL.
//  3. Rule. A candidate (appVersion, buildID) must have buildID strictly greater than every
//     published buildID with the same appVersion. The comparison is a string comparison, which
//     orders the same as the number because every BuildID is fourteen digits (%Y%m%d%H%M%S).
//     An older or equal buildID fails, naming the descriptor, the offered buildID, the published
//     buildID and its Release tag. Different appVersion lines do not compare.
//  4. Empty sets are green by name. Zero published buildIDs and zero candidate descriptors each
//     print a named count. The row never passes silently.
//
// Rollback boundary. This row is the refusal. A deliberate downgrade (--rollback-to) is an
// owner-dispatched override that belongs to the Phase 49/50 withdraw and descriptor path
// (REL-02, DIST-09). The flag does not exist in this tree and is not built here: a flag in this
// row would make the refusal conditional.
//
// Honest tiers. --self-test is quick: in-memory fixtures through overrides.get and
// overrides.descriptors, no network, no gh, no write. The default run is full: it reads
// live Releases and the candidate tree, and it FAILs on a missing gh or auth.
//
// Usage:
//   node scripts/verify-descriptor-monotonic.mjs
//   node scripts/verify-descriptor-monotonic.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, parseUpdateXml } from './verify-mar-update-hop.mjs';
import { API_VERSION_HEADER, repoSlug } from './verify-repo-controls.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'descriptor-monotonic';
const SELF_REL = 'scripts/verify-descriptor-monotonic.mjs';
const CANDIDATE_REL = '.mozbuild/update-descriptors';
const ASSET_NAME = 'release-manifest.json';
const RELEASES_PATH = 'repos/{owner}/{repo}/releases?per_page=100';
const ASSET_PATH = 'repos/{owner}/{repo}/releases/assets/{id}';
const PAGE_LIMIT = 100;
const JSON_ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/octet-stream';
const DOTTED = /^\d+(\.\d+)*$/;
const BUILD_ID = /^\d{14}$/;
const TARGET = /^[A-Za-z0-9]+_[A-Za-z0-9_.-]+$/;
const NEXT_AUTH = 'Next step: run gh auth status; the row needs read access to the repository.';

// Argument handling and the exit run on direct invocation only, so the exports stay importable.
// realpath on both sides, as scripts/generate.mjs isEntryPoint() documents.
const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined
            && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
const args = DIRECT_RUN ? process.argv.slice(2) : [];
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the buildID rule discriminates.`);
        process.exit(2);
    }
}

const show = v => JSON.stringify(v ?? null);

/** One fail-closed read through gh api. Returns { ok: true, text } or { ok: false, why }. */
export function ghRead(path, accept = JSON_ACCEPT, exec = execFileSync) {
    try {
        const text = exec('gh', ['api', '-H', API_VERSION_HEADER, '-H', `Accept: ${accept}`, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
        return { ok: true, text };
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
}

// Every getter, real or planted, goes through this: a throw or a malformed result is unreadable, never green.
function guardedGet(get) {
    return (path, accept) => {
        let r;
        try {
            r = get(path, accept);
        } catch (e) {
            return { ok: false, why: `GET ${path} could not be read (${String(e?.message ?? e).split('\n')[0]}). ${NEXT_AUTH}` };
        }
        if (r === null || typeof r !== 'object') return { ok: false, why: `GET ${path} returned no result. ${NEXT_AUTH}` };
        if (r.ok === true && typeof r.text !== 'string') return { ok: false, why: `GET ${path} returned no text. ${NEXT_AUTH}` };
        return r;
    };
}

function parseJson(text) {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return { error: true };
    }
}

/** The three manifest fields, or an error naming the field that is wrong. Unknown keys are ignored. */
export function manifestFields(doc) {
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'is not a JSON object' };
    if (typeof doc.version !== 'string' || !DOTTED.test(doc.version)) return { error: `version is ${show(doc.version)}, not a dotted appVersion` };
    if (typeof doc.build_id !== 'string' || !BUILD_ID.test(doc.build_id)) return { error: `build_id is ${show(doc.build_id)}, not fourteen digits` };
    if (typeof doc.build_target !== 'string' || !TARGET.test(doc.build_target)) return { error: `build_target is ${show(doc.build_target)}, not an OS_ABI token` };
    return { value: { appVersion: doc.version, buildID: doc.build_id, target: doc.build_target } };
}

/** Candidate descriptors on disk: <channel>/<BUILD_TARGET>/update.xml under CANDIDATE_REL. Missing tree is an empty set. */
function listDescriptors(root) {
    const base = join(root, CANDIDATE_REL);
    if (!existsSync(base)) return [];
    const dirs = d => readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
    const out = [];
    for (const channel of dirs(base)) {
        for (const target of dirs(join(base, channel))) {
            const file = join(base, channel, target, 'update.xml');
            if (!existsSync(file)) continue;
            const rel = `${CANDIDATE_REL}/${channel}/${target}/update.xml`;
            let text = null;
            try {
                text = readFileSync(file, 'utf8');
            } catch { /* reported below as unreadable */ }
            out.push({ rel, text });
        }
    }
    return out;
}

/**
 * Compare every candidate descriptor with the live published set. Returns
 * { failures, published, candidates, notes }. overrides.get replaces the gh read;
 * overrides.descriptors replaces the candidate tree with { rel, text } entries.
 */
export function runChecks(root, overrides = {}) {
    const failures = [];
    const published = [];
    const candidates = [];
    const get = guardedGet(overrides.get ?? ghRead);

    let slug;
    try {
        slug = repoSlug(root);
    } catch (e) {
        failures.push(e.message);
        return { failures, published, candidates, notes: [] };
    }
    const fill = tpl => tpl.replace('{owner}', slug.owner).replace('{repo}', slug.repo);

    // --- 1. published set ----------------------------------------------------
    const listed = get(fill(RELEASES_PATH), JSON_ACCEPT);
    let nonDraft = 0;
    if (!listed.ok) {
        failures.push(listed.why);
    } else {
        const parsed = parseJson(listed.text);
        if (parsed.error || !Array.isArray(parsed.value)) {
            failures.push(`GET ${fill(RELEASES_PATH)} returned no list of Releases. ${NEXT_AUTH}`);
        } else if (parsed.value.length >= PAGE_LIMIT) {
            failures.push(`GET ${fill(RELEASES_PATH)} returned ${parsed.value.length} Releases, the page limit, so the published set may be truncated and is unproven. Next step: page the endpoint in ${SELF_REL} before trusting the verdict.`);
        } else {
            for (const release of parsed.value) {
                if (release?.draft === true) continue;
                nonDraft += 1;
                const tag = typeof release?.tag_name === 'string' ? release.tag_name : `(unnamed Release ${show(release?.id)})`;
                const asset = (Array.isArray(release?.assets) ? release.assets : []).find(a => a?.name === ASSET_NAME);
                if (!asset || !Number.isInteger(asset.id)) {
                    failures.push(`Release ${tag} carries no ${ASSET_NAME} asset, so its buildIDs cannot be read and the published set is unproven. Next step: upload the manifest to ${tag}, or remove the Release.`);
                    continue;
                }
                const got = get(fill(ASSET_PATH).replace('{id}', String(asset.id)), RAW_ACCEPT);
                if (!got.ok) {
                    failures.push(`Release ${tag}: ${got.why}`);
                    continue;
                }
                const doc = parseJson(got.text);
                const fields = doc.error ? { error: 'is not valid JSON' } : manifestFields(doc.value);
                if (fields.error) {
                    failures.push(`Release ${tag} ${ASSET_NAME} ${fields.error}. Next step: re-upload a well-formed manifest to ${tag}; the descriptor the Release offers cannot be compared until it is.`);
                    continue;
                }
                published.push({ tag, ...fields.value });
            }
        }
    }

    // --- 2 and 3. candidates against the published set -----------------------
    const descriptors = overrides.descriptors ?? listDescriptors(root);
    for (const d of descriptors) {
        const parsed = d.text === null || d.text === undefined ? null : parseUpdateXml(d.text);
        if (parsed === null) {
            failures.push(`${d.rel} does not parse as a descriptor (no update element with appVersion and buildID, and no patch), so its buildID cannot be compared. Next step: regenerate it with node scripts/build-update-xml.mjs --emit --outdir ${CANDIDATE_REL}`);
            continue;
        }
        candidates.push({ rel: d.rel, appVersion: parsed.appVersion, buildID: parsed.buildID });
        if (!BUILD_ID.test(parsed.buildID)) {
            failures.push(`${d.rel} offers buildID ${show(parsed.buildID)}, not fourteen digits, so it cannot be ordered. Next step: rebuild the descriptor from a build with a fourteen-digit BuildID.`);
            continue;
        }
        for (const p of published) {
            if (p.appVersion !== parsed.appVersion) continue;
            if (parsed.buildID <= p.buildID) {
                failures.push(`${d.rel} offers buildID ${parsed.buildID} for appVersion ${parsed.appVersion}, but ${p.tag} already publishes buildID ${p.buildID}; a descriptor must offer a strictly newer buildID than every published one. Next step: rebuild the descriptor from a build whose BuildID is newer than ${p.buildID}.`);
            }
        }
    }

    const notes = [
        `${published.length} published buildID(s) across ${nonDraft} non-draft Release(s)`,
        `${candidates.length} candidate descriptor(s) under ${CANDIDATE_REL}`,
    ];
    return { failures, published, candidates, notes };
}

function main() {
    const { failures, published, candidates, notes } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the descriptor buildID order.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const emptyNote = published.length === 0 ? ' (zero published buildIDs: nothing to compare against)' : '';
    const candNote = candidates.length === 0 ? ' (zero candidate descriptors: nothing offered to compare)' : '';
    console.log(`${NAME}: PASS -- ${notes.join('; ')}${emptyNote}${candNote}; every candidate buildID is strictly greater than every published buildID for its appVersion`);
    return 0;
}

// --- self-test ---------------------------------------------------------------

const FIXTURE_MAR = Buffer.from('power-browser descriptor-monotonic fixture\n');
// The fixture detailsURL derives from configuration.toml at run time, never typed.
const PUBLISHED_BUILD = '20261020215955';
const TARGET_TOKEN = 'Linux_x86_64-gcc3';

function descriptorFixture(appVersion, buildID, slug) {
    return buildUpdateXml({
        marBytes: FIXTURE_MAR,
        marUrl: `https://downloads.powerbrowser.org/v${appVersion}-1/fixture.mar`,
        appVersion,
        platformVersion: appVersion,
        buildID,
        displayVersion: appVersion,
        detailsURL: `https://github.com/${slug.owner}/${slug.repo}/releases`,
    });
}

function selfTest() {
    let slug;
    try {
        slug = repoSlug(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: --self-test FAIL -- ${e.message}`);
        return 1;
    }
    const fill = tpl => tpl.replace('{owner}', slug.owner).replace('{repo}', slug.repo);
    const listPath = fill(RELEASES_PATH);
    const assetPath = id => fill(ASSET_PATH).replace('{id}', String(id));
    const release = (tag, assetId, draft = false) => ({
        tag_name: tag, draft, assets: [{ name: ASSET_NAME, id: assetId }, { name: 'fixture.mar', id: assetId + 1000 }],
    });
    const manifest = (version, buildId, target = TARGET_TOKEN) => JSON.stringify({
        version, build_id: buildId, build_target: target, unknown_key: 'ignored',
    }, null, 2);
    // The fake world: one published Release with its manifest, and the endpoints it answers.
    const world = ({ releases, manifests = {}, throwOn = null } = {}) => ({ releases, manifests, throwOn });
    const baseWorld = () => world({
        releases: [release('v153.5.1-1', 101)],
        manifests: { 101: manifest('153.5.1', PUBLISHED_BUILD) },
    });
    const fakeGet = w => (path) => {
        if (path === w.throwOn) throw new Error('fixture: HTTP 503 from the Releases endpoint');
        if (path === listPath) return { ok: true, text: JSON.stringify(w.releases) };
        const m = /\/releases\/assets\/(\d+)$/.exec(path);
        if (m && w.manifests[m[1]] !== undefined) return { ok: true, text: w.manifests[m[1]] };
        return { ok: false, why: `GET ${path} could not be read (fixture has no endpoint). ${NEXT_AUTH}` };
    };
    const candidate = (appVersion, buildID, target = TARGET_TOKEN) => ({
        rel: `${CANDIDATE_REL}/default/${target}/update.xml`,
        text: descriptorFixture(appVersion, buildID, slug),
    });
    const run = (w, descriptors) => runChecks(REPO_ROOT, { get: fakeGet(w), descriptors });

    // Control first: a candidate above the only published buildID is green.
    const baseline = run(baseWorld(), [candidate('153.5.1', '20261021000000')]);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the green control went red: ${baseline.failures.join(' | ')}`);
        return 1;
    }
    if (baseline.published.length !== 1 || baseline.candidates.length !== 1) {
        console.error(`${NAME}: --self-test FAIL -- the control read ${baseline.published.length} published and ${baseline.candidates.length} candidate(s), not 1 and 1`);
        return 1;
    }
    console.log('  ok  control: candidate above the published buildID -> green');

    // Empty set: zero published Releases is green, and the count line names it.
    const empty = run(world({ releases: [] }), [candidate('153.5.1', '20261021000000')]);
    if (empty.failures.length > 0 || empty.published.length !== 0) {
        console.error(`${NAME}: --self-test FAIL -- zero published Releases did not stay green: ${empty.failures.join(' | ') || 'published set not empty'}`);
        return 1;
    }
    console.log('  ok  control: zero published Releases -> green, named by count');

    // Older appVersion line: a newer buildID on a different version line is green.
    const otherLine = run(baseWorld(), [candidate('152.9.0', '20270101000000')]);
    if (otherLine.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- a different appVersion line went red: ${otherLine.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  control: older appVersion line with a newer buildID -> green');

    let failed = 0;
    const plants = [
        {
            name: 'same-version older buildID',
            w: baseWorld(),
            d: [candidate('153.5.1', '20260101000000')],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, '20260101000000', PUBLISHED_BUILD, 'v153.5.1-1'],
        },
        {
            name: 'same-version equal buildID',
            w: baseWorld(),
            d: [candidate('153.5.1', PUBLISHED_BUILD)],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, PUBLISHED_BUILD, 'v153.5.1-1'],
        },
        {
            name: 'malformed release-manifest.json',
            w: world({ releases: [release('v153.5.1-1', 101)], manifests: { 101: '{"version": "153.5.1", "build_id": ' } }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-1', ASSET_NAME, 'not valid JSON'],
        },
        {
            name: 'manifest with a build_id that is not fourteen digits',
            w: world({ releases: [release('v153.5.1-1', 101)], manifests: { 101: manifest('153.5.1', '2026-10-20') } }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-1', 'build_id', '2026-10-20'],
        },
        {
            name: 'throwing getter on the Releases endpoint',
            w: world({ releases: [], throwOn: listPath }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'HTTP 503'],
        },
    ];
    for (const p of plants) {
        const { failures } = run(p.w, p.d);
        const hit = failures.some(f => p.needles.every(n => f.includes(n)));
        if (hit) {
            console.log(`  ok  ${p.name} -> red, naming ${p.needles.map(n => `'${n}'`).join(', ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming ${p.needles.join(', ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // An import must resolve with the exports, not run main and exit (the DIRECT_RUN guard).
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
        `const m = await import(${JSON.stringify(import.meta.url)}); console.log('imported', typeof m.runChecks);`],
    { encoding: 'utf8' });
    if (imported.status === 0 && imported.stdout.trim() === 'imported function') {
        console.log('  ok  import resolves with runChecks and runs nothing');
    } else {
        console.error(`${NAME}: --self-test FAIL -- importing ${SELF_REL} did not resolve cleanly (exit ${imported.status}): ${(imported.stdout + imported.stderr).trim().split('\n')[0]}`);
        failed += 1;
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- control green first; zero published Releases green by count; ${plants.length} planted faults went red naming the drifted file, Release or endpoint`);
    return 0;
}

if (DIRECT_RUN) process.exit(args.includes('--self-test') ? selfTest() : main());
