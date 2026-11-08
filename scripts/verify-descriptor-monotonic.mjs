#!/usr/bin/env node
// scripts/verify-descriptor-monotonic.mjs
//
// The descriptor buildID monotonicity gate (Phase 44, UPD-26). No descriptor the
// pipeline offers may carry a build older than one already published for the same
// appVersion. Every candidate buildID must be strictly greater than every buildID the
// live Releases publish for that appVersion and BUILD_TARGET.
//
//  1. Published set (full tier). Every non-draft Release of the repository named in
//     configuration.toml [urls] release_notes whose tag is a release key (v<ESR>-<revision>)
//     must carry a release-manifest.json asset. A Release on any other tag is not a release (the
//     immutable-release probe's probe-1, REL-02) and is not read.
//     Its JSON gives { version, build_id, build_target }: the appVersion, the fourteen-digit
//     Gecko BuildID and the joined BUILD_TARGET. Unknown keys are ignored. Every read goes
//     through one fail-closed gh api helper with the pinned X-GitHub-Api-Version. A non-2xx,
//     a missing gh, failed auth, a non-JSON response, a Release with no manifest or a malformed
//     field is a FAIL naming the endpoint or the Release, never a SKIP. The Release list is read
//     with gh api --paginate --slurp, every page, so no published Release falls off a page limit. The manifest contract is written by the release packaging step.
//  2. Candidate set. Every <channel>/<BUILD_TARGET>/update.xml under the descriptor tree: the
//     directory given as --descriptors <dir> (the Phase 49 descriptor job passes its own output),
//     else .mozbuild/update-descriptors/, the output tree of
//     node scripts/build-update-xml.mjs --emit --outdir .mozbuild/update-descriptors.
//     Each is read through parseUpdateXml, the shared parser. A file that does not parse is a FAIL.
//     An explicit --descriptors directory that is absent or holds zero descriptors is a FAIL: the
//     thing under test is missing, and "nothing offered" cannot be told from "emit never ran".
//  3. Rule. A candidate (appVersion, buildID, target) must have buildID strictly greater than every
//     published buildID with the same appVersion and the same build_target. The target is the
//     <BUILD_TARGET> directory the candidate sits in; a directory that is not an OS_ABI token is a
//     FAIL. Targets do not compare with each other: the update server selects a descriptor by
//     BUILD_TARGET, so a downgrade exists only within one target, and targets build at different times.
//     The candidate's own Release is exempt from the order. Its patch URL is
//     <mar_origin>/<tag>/<asset>, and a descriptor is offered once that Release is reachable, so the
//     descriptor job may run before or after its own Release is published. When the Release named by
//     <tag> is published, its manifest is the same build, not an older one: it must carry the
//     candidate's appVersion, buildID and target exactly, else a FAIL naming both sides. Every
//     other Release is compared by the strict rule. The comparison is a string comparison, which
//     orders the same as the number because every BuildID is fourteen digits (%Y%m%d%H%M%S).
//     An older or equal buildID fails, naming the descriptor, the offered buildID, the published
//     buildID and its Release tag. Different appVersion lines do not compare.
//     Every buildID, published or offered, must also be a real %Y%m%d%H%M%S date no later than now
//     plus one day (Gecko stamps the build machine's local time). One typo such as 99999999999999
//     would otherwise outrank every later build of that appVersion and target for good.
//  4. Empty sets are named, never silent. Zero published buildIDs is a PASS with a named count:
//     with nothing published, no descriptor can be a downgrade. Zero candidates under the default
//     tree (gitignored, so every clean checkout) prints a SKIP verdict naming the count and the
//     emit step, never a PASS claiming every candidate was compared.
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
//   node scripts/verify-descriptor-monotonic.mjs [--descriptors <dir>]
//   node scripts/verify-descriptor-monotonic.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, parseUpdateXml } from './verify-mar-update-hop.mjs';
import { API_VERSION_HEADER, repoSlug } from './verify-repo-controls.mjs';
import { MANIFEST_ASSET, RELEASE_KEY_RE } from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'descriptor-monotonic';
const SELF_REL = 'scripts/verify-descriptor-monotonic.mjs';
const CANDIDATE_REL = '.mozbuild/update-descriptors';
// The stable name sign-publish attaches the manifest under, shared with release-asset-set and channel-live.
const ASSET_NAME = MANIFEST_ASSET;
const RELEASES_PATH = 'repos/{owner}/{repo}/releases?per_page=100';
const ASSET_PATH = 'repos/{owner}/{repo}/releases/assets/{id}';
const JSON_ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/octet-stream';
const DOTTED = /^\d+(\.\d+)*$/;
const BUILD_ID = /^\d{14}$/;
const TARGET = /^[A-Za-z0-9]+_[A-Za-z0-9_.-]+$/;
const SKEW_MS = 24 * 60 * 60 * 1000;
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
let SELF_TEST = false;
let DESCRIPTORS_ARG = null;
for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--self-test') {
        SELF_TEST = true;
    } else if (a === '--descriptors' && DESCRIPTORS_ARG === null && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
        DESCRIPTORS_ARG = args[i + 1];
        i += 1;
    } else {
        console.error(`${NAME}: FAIL -- unknown, repeated or incomplete argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL} [--descriptors <dir>], or add --self-test to prove the buildID rule discriminates.`);
        process.exit(2);
    }
}

const show = v => JSON.stringify(v ?? null);

/** One fail-closed read through gh api. Returns { ok: true, text } or { ok: false, why }. */
export function ghRead(path, accept = JSON_ACCEPT, opts = {}, exec = execFileSync) {
    // --paginate --slurp: one JSON array holding every page, each page the endpoint's own array.
    const paging = opts.paginate === true ? ['--paginate', '--slurp'] : [];
    try {
        const text = exec('gh', ['api', ...paging, '-H', API_VERSION_HEADER, '-H', `Accept: ${accept}`, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
        return { ok: true, text };
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
}

// Every getter, real or planted, goes through this: a throw or a malformed result is unreadable, never green.
function guardedGet(get) {
    return (path, accept, opts) => {
        let r;
        try {
            r = get(path, accept, opts);
        } catch (e) {
            return { ok: false, why: `GET ${path} could not be read (${String(e?.message ?? e).split('\n')[0]}). ${NEXT_AUTH}` };
        }
        if (r === null || typeof r !== 'object') return { ok: false, why: `GET ${path} returned no result. ${NEXT_AUTH}` };
        if (r.ok === true && typeof r.text !== 'string') return { ok: false, why: `GET ${path} returned no text. ${NEXT_AUTH}` };
        return r;
    };
}

/** The release tag in a patch URL <mar_origin>/<tag>/<asset>, or null when the URL names none. */
function releaseTagOf(url) {
    let segments;
    try {
        segments = new URL(url).pathname.split('/').filter(Boolean);
    } catch {
        return null;
    }
    const tag = segments.length >= 2 ? decodeURIComponent(segments[segments.length - 2]) : null;
    return tag !== null && RELEASE_KEY_RE.test(tag) ? tag : null;
}

function parseJson(text) {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return { error: true };
    }
}

/** Why a BuildID cannot be ordered, or null: fourteen digits, a real UTC date-time, not after now plus SKEW_MS. */
export function buildIdProblem(id, now = Date.now()) {
    if (typeof id !== 'string' || !BUILD_ID.test(id)) return 'not fourteen digits';
    const [y, mo, d, h, mi, se] = [[0, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14]].map(([a, b]) => Number(id.slice(a, b)));
    const at = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
    const real = at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d
        && at.getUTCHours() === h && at.getUTCMinutes() === mi && at.getUTCSeconds() === se;
    if (!real) return 'not a real %Y%m%d%H%M%S date';
    if (at.getTime() > now + SKEW_MS) return `later than now plus one day (${new Date(now).toISOString()})`;
    return null;
}

/** The three manifest fields, or an error naming the field that is wrong. Unknown keys are ignored. */
export function manifestFields(doc, now = Date.now()) {
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'is not a JSON object' };
    if (typeof doc.version !== 'string' || !DOTTED.test(doc.version)) return { error: `version is ${show(doc.version)}, not a dotted appVersion` };
    const idProblem = buildIdProblem(doc.build_id, now);
    if (idProblem !== null) return { error: `build_id is ${show(doc.build_id)}, ${idProblem}` };
    if (typeof doc.build_target !== 'string' || !TARGET.test(doc.build_target)) return { error: `build_target is ${show(doc.build_target)}, not an OS_ABI token` };
    return { value: { appVersion: doc.version, buildID: doc.build_id, target: doc.build_target } };
}

/** The descriptor tree as shown in messages: repo-relative when inside the repo, else absolute. */
function shownDir(root, dir) {
    const rel = relative(root, dir);
    return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? dir : rel;
}

/**
 * Candidate descriptors on disk: <channel>/<BUILD_TARGET>/update.xml under base. Missing tree is an
 * empty set. Symlinked directories are followed. Anything else in the tree (a file where a channel or
 * target directory belongs, or a target directory with no update.xml) is pushed to failures: a
 * smaller candidate set must never pass for a complete one.
 */
function listDescriptors(root, base = join(root, CANDIDATE_REL), failures = []) {
    if (!existsSync(base)) return [];
    const shown = shownDir(root, base);
    const isDir = p => {
        try {
            return statSync(p).isDirectory();
        } catch {
            return false;
        }
    };
    const dirs = (d, relDir) => readdirSync(d).sort().filter(name => {
        if (isDir(join(d, name))) return true;
        failures.push(`${relDir}/${name} is not a directory, where the descriptor tree holds only <channel>/<BUILD_TARGET>/ directories, so the candidate set is not what was emitted. Next step: remove it, or re-emit the tree with node scripts/build-update-xml.mjs --emit.`);
        return false;
    });
    const out = [];
    for (const channel of dirs(base, shown)) {
        for (const target of dirs(join(base, channel), `${shown}/${channel}`)) {
            const file = join(base, channel, target, 'update.xml');
            const rel = `${shown}/${channel}/${target}/update.xml`;
            if (!existsSync(file)) {
                failures.push(`${rel} is absent although its target directory exists, so that target offers no comparable descriptor. Next step: re-emit the tree with node scripts/build-update-xml.mjs --emit, or remove the empty directory.`);
                continue;
            }
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
 * { failures, published, candidates, notes, explicit }. overrides.get replaces the gh read;
 * overrides.descriptorsDir names the candidate tree explicitly (the --descriptors argument);
 * overrides.descriptors replaces the candidate tree with { rel, text } entries.
 */
export function runChecks(root, overrides = {}) {
    const failures = [];
    const published = [];
    const candidates = [];
    const get = guardedGet(overrides.get ?? ghRead);
    const now = overrides.now ?? Date.now();

    let slug;
    try {
        slug = repoSlug(root);
    } catch (e) {
        failures.push(e.message);
        return { failures, published, candidates, notes: [] };
    }
    const fill = tpl => tpl.replace('{owner}', slug.owner).replace('{repo}', slug.repo);

    // --- 1. published set ----------------------------------------------------
    const listed = get(fill(RELEASES_PATH), JSON_ACCEPT, { paginate: true });
    let nonDraft = 0;
    if (!listed.ok) {
        failures.push(listed.why);
    } else {
        const parsed = parseJson(listed.text);
        const pages = parsed.error ? null : parsed.value;
        if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
            failures.push(`GET ${fill(RELEASES_PATH)} returned no list of Release pages. ${NEXT_AUTH}`);
        } else {
            for (const release of pages.flat()) {
                if (release?.draft === true) continue;
                // Only a release key names a release; the probe-1 Release (REL-02) carries no manifest by design.
                if (typeof release?.tag_name === 'string' && !RELEASE_KEY_RE.test(release.tag_name)) continue;
                nonDraft += 1;
                const tag = typeof release?.tag_name === 'string' ? release.tag_name : `(unnamed Release ${show(release?.id)})`;
                const asset = (Array.isArray(release?.assets) ? release.assets : []).find(a => a?.name === ASSET_NAME);
                if (!asset || !Number.isInteger(asset.id)) {
                    failures.push(`Release ${tag} carries no ${ASSET_NAME} asset, so its buildIDs cannot be read and the published set is unproven. Next step: upload that build's ${ASSET_NAME} to ${tag} (sign-publish attaches it to every Release it publishes), or remove the Release.`);
                    continue;
                }
                const got = get(fill(ASSET_PATH).replace('{id}', String(asset.id)), RAW_ACCEPT);
                if (!got.ok) {
                    failures.push(`Release ${tag}: ${got.why}`);
                    continue;
                }
                const doc = parseJson(got.text);
                const fields = doc.error ? { error: 'is not valid JSON' } : manifestFields(doc.value, now);
                if (fields.error) {
                    failures.push(`Release ${tag} ${ASSET_NAME} ${fields.error}. Next step: re-upload a well-formed manifest to ${tag}; the descriptor the Release offers cannot be compared until it is.`);
                    continue;
                }
                published.push({ tag, ...fields.value });
            }
        }
    }

    // --- 2 and 3. candidates against the published set -----------------------
    const explicitDir = overrides.descriptorsDir == null ? null : resolve(root, overrides.descriptorsDir);
    const candidateSource = explicitDir === null ? CANDIDATE_REL : shownDir(root, explicitDir);
    if (explicitDir !== null && !existsSync(explicitDir)) {
        failures.push(`--descriptors ${candidateSource} does not exist, so no offered buildID can be compared. Next step: pass the directory build-update-xml.mjs --emit --outdir wrote.`);
    }
    const descriptors = overrides.descriptors ?? listDescriptors(root, explicitDir ?? join(root, CANDIDATE_REL), failures);
    if (explicitDir !== null && existsSync(explicitDir) && descriptors.length === 0) {
        failures.push(`--descriptors ${candidateSource} holds zero <channel>/<BUILD_TARGET>/update.xml descriptors; the thing under test is absent. Next step: run node scripts/build-update-xml.mjs --emit --outdir ${candidateSource} first.`);
    }
    for (const d of descriptors) {
        const parsed = d.text === null || d.text === undefined ? null : parseUpdateXml(d.text);
        if (parsed === null) {
            failures.push(`${d.rel} does not parse as a descriptor (no update element with appVersion and buildID, and no patch), so its buildID cannot be compared. Next step: regenerate it with node scripts/build-update-xml.mjs --emit --outdir ${CANDIDATE_REL}`);
            continue;
        }
        const segments = d.rel.split('/');
        const target = segments.length >= 2 ? segments[segments.length - 2] : null;
        candidates.push({ rel: d.rel, appVersion: parsed.appVersion, buildID: parsed.buildID, target });
        if (target === null || !TARGET.test(target)) {
            failures.push(`${d.rel} sits under ${show(target)}, not an OS_ABI BUILD_TARGET directory, so its target cannot be matched with a published build_target. Next step: emit it as <channel>/<BUILD_TARGET>/update.xml with node scripts/build-update-xml.mjs --emit.`);
            continue;
        }
        const idProblem = buildIdProblem(parsed.buildID, now);
        if (idProblem !== null) {
            failures.push(`${d.rel} offers buildID ${show(parsed.buildID)}, ${idProblem}, so it cannot be ordered. Next step: rebuild the descriptor from a build whose BuildID is the real build time.`);
            continue;
        }
        const ownTag = releaseTagOf(parsed.url);
        for (const p of published) {
            if (p.tag === ownTag) {
                // Its own Release: the same build, compared for identity rather than order.
                if (p.appVersion !== parsed.appVersion || p.buildID !== parsed.buildID || p.target !== target) {
                    failures.push(`${d.rel} names Release ${ownTag} in its patch URL, but ${ownTag} ${ASSET_NAME} publishes appVersion ${p.appVersion}, buildID ${p.buildID}, build_target ${p.target}, not this descriptor's appVersion ${parsed.appVersion}, buildID ${parsed.buildID}, target ${target}; the descriptor does not describe the build its Release publishes. Next step: regenerate the descriptor from the build ${ownTag} published with node scripts/build-update-xml.mjs --emit.`);
                }
                continue;
            }
            if (p.appVersion !== parsed.appVersion || p.target !== target) continue;
            if (parsed.buildID <= p.buildID) {
                failures.push(`${d.rel} offers buildID ${parsed.buildID} for appVersion ${parsed.appVersion} on ${target}, but ${p.tag} already publishes buildID ${p.buildID} for that target; a descriptor must offer a strictly newer buildID than every published one. Next step: rebuild the descriptor from a build whose BuildID is newer than ${p.buildID}.`);
            }
        }
    }

    const notes = [
        `${published.length} published buildID(s) across ${nonDraft} non-draft Release(s)`,
        `${candidates.length} candidate descriptor(s) under ${candidateSource}`,
    ];
    return { failures, published, candidates, notes, explicit: explicitDir !== null };
}

/** The row verdict for one runChecks result: { code, out } where out is the lines and the stream. */
export function verdict({ failures, published, candidates, notes }) {
    if (failures.length > 0) {
        return {
            code: 1,
            stream: 'stderr',
            lines: [`${NAME}: FAIL -- ${failures.length} problem(s) with the descriptor buildID order.`, ...failures.map(f => `  ${f}`)],
        };
    }
    const emptyNote = published.length === 0 ? ' (zero published buildIDs: nothing to compare against)' : '';
    if (candidates.length === 0) {
        // Not a PASS: the default tree is gitignored, so this is every clean checkout. An explicit
        // --descriptors tree with zero descriptors never reaches here; runChecks fails it.
        return {
            code: 0,
            stream: 'stdout',
            lines: [`${NAME}: SKIP -- ${notes.join('; ')}${emptyNote}; no candidate descriptor exists, so no offered buildID was compared. Next step: run node scripts/build-update-xml.mjs --emit --outdir ${CANDIDATE_REL}, or pass --descriptors <dir>.`],
        };
    }
    return {
        code: 0,
        stream: 'stdout',
        lines: [`${NAME}: PASS -- ${notes.join('; ')}${emptyNote}; each of the ${candidates.length} candidate buildID(s) is strictly greater than every published buildID for its appVersion`],
    };
}

function main() {
    const v = verdict(runChecks(REPO_ROOT, { descriptorsDir: DESCRIPTORS_ARG }));
    v.lines.forEach(l => (v.stream === 'stderr' ? console.error(l) : console.log(l)));
    return v.code;
}

// --- self-test ---------------------------------------------------------------

const FIXTURE_MAR = Buffer.from('power-browser descriptor-monotonic fixture\n');
// The fixture detailsURL derives from configuration.toml at run time, never typed.
const PUBLISHED_BUILD = '20261020215955';
// The self-test clock, so the future-buildID bound never depends on the host clock.
const FIXTURE_NOW = Date.UTC(2026, 10, 1);
const TARGET_TOKEN = 'Linux_x86_64-gcc3';

// A candidate is the next revision's descriptor: its patch URL names its own Release v<appVersion>-2.
function descriptorFixture(appVersion, buildID, slug, tag = `v${appVersion}-2`) {
    return buildUpdateXml({
        marBytes: FIXTURE_MAR,
        marUrl: `https://downloads.powerbrowser.org/${tag}/fixture.mar`,
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
    const world = ({ releases, pages = null, listBody = null, manifests = {}, throwOn = null } = {}) => ({ releases, pages, listBody, manifests, throwOn });
    const baseWorld = () => world({
        releases: [release('v153.5.1-1', 101)],
        manifests: { 101: manifest('153.5.1', PUBLISHED_BUILD) },
    });
    // The published v153.5.1-1 plus the candidate's own v153.5.1-2 with the given manifest; olderManifest replaces -1's.
    const ownWorld = (ownManifest, olderManifest = manifest('153.5.1', PUBLISHED_BUILD)) => world({
        releases: [release('v153.5.1-1', 101), release('v153.5.1-2', 201)],
        manifests: { 101: olderManifest, 201: ownManifest },
    });
    const fakeGet = w => (path) => {
        if (path === w.throwOn) throw new Error('fixture: HTTP 503 from the Releases endpoint');
        if (path === listPath) return { ok: true, text: w.listBody ?? JSON.stringify(w.pages ?? [w.releases]) };
        const m = /\/releases\/assets\/(\d+)$/.exec(path);
        if (m && w.manifests[m[1]] !== undefined) return { ok: true, text: w.manifests[m[1]] };
        return { ok: false, why: `GET ${path} could not be read (fixture has no endpoint). ${NEXT_AUTH}` };
    };
    const candidate = (appVersion, buildID, target = TARGET_TOKEN) => ({
        rel: `${CANDIDATE_REL}/default/${target}/update.xml`,
        text: descriptorFixture(appVersion, buildID, slug),
    });
    const run = (w, descriptors) => runChecks(REPO_ROOT, { get: fakeGet(w), descriptors, now: FIXTURE_NOW });

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
    const otherLine = run(baseWorld(), [candidate('152.9.0', '20261030000000')]);
    if (otherLine.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- a different appVersion line went red: ${otherLine.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  control: older appVersion line with a newer buildID -> green');

    // Its own Release already published (the descriptor job ran after publish): the equal buildID is
    // the same build, not a regression, and the older Release still orders it.
    const own = run(ownWorld(manifest('153.5.1', '20261021000000')), [candidate('153.5.1', '20261021000000')]);
    if (own.failures.length > 0 || own.published.length !== 2) {
        console.error(`${NAME}: --self-test FAIL -- a descriptor whose own Release is published went red or was not read: ${own.failures.join(' | ') || `${own.published.length} published, not 2`}`);
        return 1;
    }
    console.log('  ok  control: own Release already published with the same build -> green');

    // The real ghRead, through a stub exec: the list read asks for every page, and its pages are read.
    const calls = [];
    const stubExec = (cmd, argv) => {
        calls.push([cmd, ...argv]);
        return argv.includes(listPath) ? JSON.stringify([[release('v153.5.1-1', 101)], []]) : manifest('153.5.1', PUBLISHED_BUILD);
    };
    const viaGh = runChecks(REPO_ROOT, { get: (path, accept, opts) => ghRead(path, accept, opts, stubExec), descriptors: [candidate('153.5.1', '20261021000000')], now: FIXTURE_NOW });
    const listCall = calls.find(c => c.includes(listPath));
    if (viaGh.failures.length > 0 || viaGh.published.length !== 1 || !listCall
        || !['--paginate', '--slurp', API_VERSION_HEADER].every(a => listCall.includes(a))) {
        console.error(`${NAME}: --self-test FAIL -- ghRead did not page the Release list or read its answer: ${viaGh.failures.join(' | ') || JSON.stringify(listCall ?? null)}`);
        return 1;
    }
    console.log('  ok  control: ghRead pages the Release list (--paginate --slurp, pinned API version) and reads it -> green');

    // A draft Release is not published: its newer manifest must not be read or counted.
    const drafted = run(world({
        releases: [release('v153.5.1-1', 101), release('v153.5.1-3', 301, true)],
        manifests: { 101: manifest('153.5.1', PUBLISHED_BUILD), 301: manifest('153.5.1', '20261031000000') },
    }), [candidate('153.5.1', '20261021000000')]);
    if (drafted.failures.length > 0 || drafted.published.length !== 1 || !drafted.notes[0].includes('1 non-draft Release(s)')) {
        console.error(`${NAME}: --self-test FAIL -- a draft Release was read or counted: ${drafted.failures.join(' | ') || drafted.notes[0]}`);
        return 1;
    }
    console.log('  ok  control: a draft Release with a newer manifest -> green, not counted');

    // A published Release on a tag that is not a release key (the probe-1 Release, REL-02) has no manifest: not read.
    const probed = run(world({
        releases: [release('v153.5.1-1', 101), { tag_name: 'probe-1', draft: false, assets: [] }],
        manifests: { 101: manifest('153.5.1', PUBLISHED_BUILD) },
    }), [candidate('153.5.1', '20261021000000')]);
    if (probed.failures.length > 0 || probed.published.length !== 1 || !probed.notes[0].includes('1 non-draft Release(s)')) {
        console.error(`${NAME}: --self-test FAIL -- the published probe-1 Release (no manifest, not a release key) was read or counted: ${probed.failures.join(' | ') || probed.notes[0]}`);
        return 1;
    }
    console.log('  ok  control: a published probe-1 Release with no manifest -> green, not counted');

    // Another target: an older buildID than the published Linux build, offered for a different target, is green.
    const otherTarget = run(baseWorld(), [candidate('153.5.1', '20260101000000', 'Darwin_aarch64-gcc3')]);
    if (otherTarget.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- a different BUILD_TARGET went red: ${otherTarget.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  control: different BUILD_TARGET with an older buildID -> green');

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
            name: 'own Release published with a different build_id',
            w: ownWorld(manifest('153.5.1', '20261021000001')),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-2', '20261021000001', '20261021000000', 'does not describe the build'],
        },
        {
            name: 'own Release published with a different build_target',
            w: ownWorld(manifest('153.5.1', '20261021000000', 'Darwin_aarch64-gcc3')),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-2', 'Darwin_aarch64-gcc3', TARGET_TOKEN, 'does not describe the build'],
        },
        {
            name: 'own Release published, equal to an older Release that is not its own',
            w: ownWorld(manifest('153.5.1', '20261021000000'), manifest('153.5.1', '20261021000000')),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['20261021000000', 'v153.5.1-1', 'already publishes'],
        },
        {
            name: 'candidate outside a BUILD_TARGET directory',
            w: baseWorld(),
            d: [{ rel: `${CANDIDATE_REL}/default/update.xml`, text: descriptorFixture('153.5.1', '20261021000000', slug) }],
            needles: [`${CANDIDATE_REL}/default/update.xml`, '"default"', 'BUILD_TARGET'],
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
            name: 'manifest with a far-future build_id',
            w: world({ releases: [release('v153.5.1-1', 101)], manifests: { 101: manifest('153.5.1', '99999999999999') } }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-1', 'build_id', '99999999999999', 'not a real'],
        },
        {
            name: 'candidate buildID that is not a real date',
            w: baseWorld(),
            d: [candidate('153.5.1', '20261332000000')],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, '20261332000000', 'not a real'],
        },
        {
            name: 'candidate buildID later than now plus one day',
            w: baseWorld(),
            d: [candidate('153.5.1', '20261103000000')],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, '20261103000000', 'later than now'],
        },
        {
            name: 'regression against a Release on the second page',
            w: world({
                pages: [[release('v152.9.0-1', 90)], [release('v153.5.1-1', 101)]],
                manifests: { 90: manifest('152.9.0', '20260901000000'), 101: manifest('153.5.1', PUBLISHED_BUILD) },
            }),
            d: [candidate('153.5.1', '20260101000000')],
            needles: ['v153.5.1-1', '20260101000000', PUBLISHED_BUILD, 'already publishes'],
        },
        {
            name: 'Releases response that is an object, not pages',
            w: world({ listBody: '{}' }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'no list of Release pages'],
        },
        {
            name: 'Releases page that is not an array',
            w: world({ listBody: '[{}]' }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'no list of Release pages'],
        },
        {
            name: 'gh itself fails (ghRead with a stub exec that throws with stderr)',
            get: (path, accept, opts) => ghRead(path, accept, opts, () => {
                const e = new Error('Command failed: gh api');
                e.stderr = 'HTTP 401: Bad credentials (https://api.github.com/)\n';
                throw e;
            }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'HTTP 401: Bad credentials', 'gh auth status'],
        },
        {
            name: 'non-draft Release with no release-manifest.json asset',
            w: world({ releases: [{ tag_name: 'v153.5.1-1', draft: false, assets: [{ name: 'fixture.mar', id: 5 }] }] }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: ['v153.5.1-1', `carries no ${ASSET_NAME} asset`, `Next step: upload that build's ${ASSET_NAME} to v153.5.1-1`],
        },
        {
            name: 'candidate that does not parse as a descriptor',
            w: baseWorld(),
            d: [{ rel: `${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, text: '<update>' }],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, 'does not parse'],
        },
        {
            name: 'candidate that could not be read',
            w: baseWorld(),
            d: [{ rel: `${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, text: null }],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, 'does not parse'],
        },
        {
            name: 'candidate buildID that is not fourteen digits',
            w: baseWorld(),
            d: [candidate('153.5.1', '2026')],
            needles: [`${CANDIDATE_REL}/default/${TARGET_TOKEN}/update.xml`, '"2026"', 'not fourteen digits'],
        },
        {
            name: 'getter that returns no result',
            get: () => null,
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'returned no result'],
        },
        {
            name: 'getter that answers ok with no text',
            get: () => ({ ok: true, text: 5 }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'returned no text'],
        },
        {
            name: 'throwing getter on the Releases endpoint',
            w: world({ releases: [], throwOn: listPath }),
            d: [candidate('153.5.1', '20261021000000')],
            needles: [listPath, 'HTTP 503'],
        },
    ];
    for (const p of plants) {
        const { failures } = p.get ? runChecks(REPO_ROOT, { get: p.get, descriptors: p.d, now: FIXTURE_NOW }) : run(p.w, p.d);
        const hit = failures.some(f => p.needles.every(n => f.includes(n)));
        if (hit) {
            console.log(`  ok  ${p.name} -> red, naming ${p.needles.map(n => `'${n}'`).join(', ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming ${p.needles.join(', ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // The candidate tree on disk and the verdict over it: mkdtemp only, removed in finally.
    let DISK_PLANTS = 0;
    const tmp = mkdtempSync(join(tmpdir(), 'descriptor-monotonic-'));
    try {
        const tree = join(tmp, 'tree');
        mkdirSync(join(tree, 'default', TARGET_TOKEN), { recursive: true });
        writeFileSync(join(tree, 'default', TARGET_TOKEN, 'update.xml'), descriptorFixture('153.5.1', '20261021000000', slug));
        const emptyTree = join(tmp, 'empty');
        mkdirSync(emptyTree);
        // A symlinked target directory is followed; a stray file and a target with no update.xml are red.
        const linked = join(tmp, 'linked');
        mkdirSync(join(linked, 'default'), { recursive: true });
        symlinkSync(join(tree, 'default', TARGET_TOKEN), join(linked, 'default', TARGET_TOKEN));
        const stray = join(tmp, 'stray');
        mkdirSync(join(stray, 'default', TARGET_TOKEN), { recursive: true });
        writeFileSync(join(stray, 'default', TARGET_TOKEN, 'update.xml'), descriptorFixture('153.5.1', '20261021000000', slug));
        writeFileSync(join(stray, 'default', 'notes.txt'), 'stray\n');
        const hollow = join(tmp, 'hollow');
        mkdirSync(join(hollow, 'default', TARGET_TOKEN), { recursive: true });
        writeFileSync(join(hollow, 'default', TARGET_TOKEN, 'update.xml'), descriptorFixture('153.5.1', '20261021000000', slug));
        mkdirSync(join(hollow, 'default', 'Darwin_aarch64-gcc3'));
        const fromLink = runChecks(REPO_ROOT, { get: fakeGet(baseWorld()), descriptorsDir: linked, now: FIXTURE_NOW });
        const fromDisk = runChecks(REPO_ROOT, { get: fakeGet(baseWorld()), descriptorsDir: tree, now: FIXTURE_NOW });
        const diskOk = fromDisk.failures.length === 0 && fromDisk.candidates.length === 1
            && fromDisk.candidates[0].rel === `${tree}/default/${TARGET_TOKEN}/update.xml`;
        const pass = verdict(fromDisk);
        const skip = verdict(run(baseWorld(), []));
        const disk = [
            ['--descriptors tree with one descriptor is read and passes', diskOk && pass.code === 0 && /: PASS -- .*each of the 1 candidate/.test(pass.lines[0]),
                `${fromDisk.failures.join(' | ')} ${pass.lines[0]}`],
            ['a symlinked target directory is followed and read', fromLink.failures.length === 0 && fromLink.candidates.length === 1,
                `${fromLink.candidates.length} candidate(s); ${fromLink.failures.join(' | ')}`],
            ['zero candidates under the default tree is a named SKIP, not a PASS claiming every candidate', skip.code === 0
                && skip.lines[0].startsWith(`${NAME}: SKIP -- `) && skip.lines[0].includes('0 candidate descriptor(s)') && !/every candidate|each of/.test(skip.lines[0]),
                skip.lines[0]],
        ];
        for (const [name, ok, got] of disk) {
            if (ok) console.log(`  ok  ${name}`);
            else {
                console.error(`${NAME}: --self-test FAIL -- ${name}: got ${got}`);
                failed += 1;
            }
        }
        const diskPlants = [
            ['explicit --descriptors tree with zero descriptors', { descriptorsDir: emptyTree }, [emptyTree, 'zero']],
            ['explicit --descriptors tree that does not exist', { descriptorsDir: join(tmp, 'absent') }, [join(tmp, 'absent'), 'does not exist']],
            ['a file where a target directory belongs', { descriptorsDir: stray }, [`${stray}/default/notes.txt`, 'not a directory']],
            ['a target directory with no update.xml', { descriptorsDir: hollow }, [`${hollow}/default/Darwin_aarch64-gcc3/update.xml`, 'absent']],
        ];
        DISK_PLANTS = diskPlants.length;
        for (const [name, o, needles] of diskPlants) {
            const r = runChecks(REPO_ROOT, { get: fakeGet(baseWorld()), now: FIXTURE_NOW, ...o });
            const v = verdict(r);
            if (v.code === 1 && r.failures.some(f => needles.every(n => f.includes(n)))) {
                console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(', ')}`);
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${needles.join(', ')}; got: ${r.failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    } finally {
        rmSync(tmp, { recursive: true, force: true });
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
    console.log(`${NAME}: --self-test PASS -- controls green first; zero published Releases green by count; ${plants.length} in-memory and ${DISK_PLANTS} on-disk planted faults went red naming the drifted file, Release or endpoint`);
    return 0;
}

if (DIRECT_RUN) process.exit(SELF_TEST ? selfTest() : main());
