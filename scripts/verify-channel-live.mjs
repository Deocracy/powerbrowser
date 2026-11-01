#!/usr/bin/env node
// scripts/verify-channel-live.mjs
//
// The channel-live row (Phase 49, UPD-17; the patch-URL form is DIST-08). It proves the public
// update channel equals the published Release. Every compared value is derived at check time from
// release-manifest.json (written by powerbrowser/packaging/package-linux.sh) plus the live Release,
// never from a literal and never from a build tree:
//
//  1. Manifest. release_key (the tag), version, build_id, build_target (the joined BUILD_TARGET set),
//     update_channel, update_url (the baked [AppUpdate] URL template) and mar_origin. A missing field
//     or a null mar_origin is a FAIL naming the field. --manifest <path> reads the build job's copy;
//     without it the row reads the release-manifest.json asset of the latest published Release. The
//     manifest is untrusted build output: its mar_origin, update_channel and update_url are claims that
//     must equal configuration.toml (marOrigin, updateChannel, [urls] update host plus the Gecko update
//     path), else a FAIL naming both values; the tree decides. Each BUILD_TARGET token must match
//     [A-Za-z0-9_-]+ before it becomes a path segment, and every segment is URI-encoded.
//  2. Latest Release. GET repos/<owner>/<repo>/releases/latest (owner and repo from configuration.toml
//     [urls] release_notes). Its tag must equal the manifest's release_key, and each descriptor's
//     offered version must equal that tag. No published Release is a FAIL, never a SKIP.
//  3. Per BUILD_TARGET. The descriptor is fetched through the baked 11-segment path, which exercises
//     the updates host's _redirects rule rather than the file path. Its bytes must equal the updates
//     repo copy at <channel>/<target>/update.xml. It is parsed with parseUpdateXml (the shared parser),
//     its patch URL must pass patchUrlForm, its appVersion and buildID must equal the manifest, the
//     patch URL must answer HEAD 200 with Content-Length equal to the descriptor size, and a GET of
//     the MAR must hash (marDigest, sha512) to hashValue.
//  4. patchUrlForm. The patch URL as written, before any transport mapping: https, the host of the
//     manifest's mar_origin, and the path exactly /<tag>/<asset>. A github.com Releases download URL
//     (github.com is user-initiated), a release-assets signed URL (it expires about one hour after
//     issue), any other host, any other scheme and any other path are red, naming target and value.
//     The asset is <app_basename>-<tag minus v>.<target token>.complete.mar, the name
//     scripts/build-update-xml.mjs writes into the descriptor.
//
// --form-only --manifest <path> --descriptors <dir> runs check 4 alone over a local descriptor
// tree, with no network: the descriptor job's pre-commit gate. The descriptor carries exactly one
// patch, and the URL judged is the one parseUpdateXml returns, the value the live fetch and Gecko
// read; the hop drill's servedMarUrl is the same emitted value, so this covers both.
//
// Fail closed. An unreadable endpoint, a missing Release, a missing descriptor or a non-200 answer
// is a FAIL naming the endpoint. Until the first public release this row is red, by design.
//
// Tiers. The default run is full tier: gh api and public HTTPS reads. --self-test is honestly
// --quick: node:crypto plus text files in mkdtemp and one loopback HTTP server reached through an
// injected transport. No build, browser, display or public network, and nothing written in the repo.
// The row and its self-test only read, so two concurrent runs change nothing.
//
// Usage:
//   node scripts/verify-channel-live.mjs [--manifest <release-manifest.json>]
//   node scripts/verify-channel-live.mjs --form-only --manifest <path> --descriptors <dir>
//   node scripts/verify-channel-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, marDigest, parseUpdateXml } from './verify-mar-update-hop.mjs';
import { API_VERSION_HEADER, repoSlug } from './verify-repo-controls.mjs';
import { marOrigin, releaseIdentity, resolveConfig, updateChannel } from './generate.mjs';
import { DOCS_REL, RELEASE_KEY_RE, targetTokenOf } from './lib/channel-identity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'channel-live';
const SELF_REL = 'scripts/verify-channel-live.mjs';
const MANIFEST_ASSET = 'release-manifest.json';
const UPDATES_SUFFIX = '-updates';
const NEXT_AUTH = 'Next step: run gh auth status; the row needs read access to the repository and the updates repo.';
// Publishing the manifest as a Release asset is an open owner decision (its host field names the build machine).
const MANIFEST_DECISION = '.planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md, section "49-04", item 2';
const show = v => JSON.stringify(v ?? null);
// The Gecko [AppUpdate] URL path (upstream/build/application.ini.in, URL=https://@MOZ_APPUPDATE_HOST@/...), the
// 11-segment shape the updates host's _redirects rule (updates-staging/_redirects) rewrites. The host comes from
// configuration.toml [urls] update, which generate.mjs emits as MOZ_APPUPDATE_HOST.
// shortcut: a copy of the pinned upstream line, because the hosted job does not fetch upstream/; the self-test compares it with upstream/build/application.ini.in wherever that checkout exists.
export const UPDATE_PATH = '/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml';
// One BUILD_TARGET token (OS_TARGET_TARGET_XPCOM_ABI). It becomes a path segment, so nothing else is admitted.
const TARGET_TOKEN = /^[A-Za-z0-9_-]+$/;
const targetsOf = v => String(v).split(/[\s,]+/).filter(Boolean);

// --- reads ------------------------------------------------------------------

/** One fail-closed gh api GET with the pinned API version. Returns { ok, body } or { ok: false, status, why }. */
export function ghGet(path, { accept = 'application/vnd.github+json', exec = execFileSync } = {}) {
    let out;
    try {
        out = exec('gh', ['api', '-H', API_VERSION_HEADER, '-H', `Accept: ${accept}`, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, status: /\(HTTP 404\)/.test(first) ? 404 : null, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
    try {
        return { ok: true, body: JSON.parse(out) };
    } catch {
        return { ok: false, status: null, why: `GET ${path} could not be read (the response is not JSON). ${NEXT_AUTH}` };
    }
}

/** One fail-closed HTTP request; redirects are not followed, so a 3xx is a non-200 answer. */
async function httpRead(url, method) {
    try {
        const res = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(300000) });
        const bytes = method === 'HEAD' ? null : Buffer.from(await res.arrayBuffer());
        return { ok: true, status: res.status, length: res.headers.get('content-length'), bytes };
    } catch (e) {
        return { ok: false, why: String(e?.cause?.message ?? e?.message ?? e).split('\n')[0] };
    }
}

// --- derivation -------------------------------------------------------------

const FIELDS = Object.freeze({
    release_key: v => typeof v === 'string' && RELEASE_KEY_RE.test(v),
    version: v => typeof v === 'string' && /^\d+(\.\d+)*$/.test(v),
    build_id: v => typeof v === 'string' && /^\d{14}$/.test(v),
    build_target: v => typeof v === 'string' && targetsOf(v).length > 0 && targetsOf(v).every(t => TARGET_TOKEN.test(t)),
    update_channel: v => typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v),
    update_url: v => typeof v === 'string' && v.startsWith('https://') && v.includes('%BUILD_TARGET%') && v.includes('%CHANNEL%'),
    mar_origin: v => typeof v === 'string' && v.startsWith('https://'),
});

/** The named manifest fields, each validated. Returns the problems, empty when every field holds. Pure. */
export function manifestProblems(doc, keys = Object.keys(FIELDS)) {
    if (doc === null || typeof doc !== 'object') return [`the manifest is not a JSON object, so no channel value can be derived. Next step: pass the build job's ${MANIFEST_ASSET}`];
    return keys.filter(k => !FIELDS[k](doc[k])).map(k => `the manifest field ${k} is ${show(doc[k])}, which is missing or malformed${k === 'build_target' ? ' (each BUILD_TARGET token must match [A-Za-z0-9_-]+, because it becomes a path segment)' : ''}${k === 'mar_origin' ? ' (a null mar_origin means configuration.toml [urls] mar_origin was unset at build time)' : ''}. Next step: rebuild with powerbrowser/packaging/package-linux.sh, which writes it`);
}

/** The published MAR asset name, derived from the tree exactly as build-update-xml.mjs derives it. */
export function marAssetName(root, releaseKey) {
    let config;
    try {
        config = resolveConfig(join(root, 'configuration.toml')).config;
    } catch {
        config = undefined;
    }
    let docs = null;
    try {
        docs = readFileSync(join(root, DOCS_REL), 'utf8');
    } catch { /* reported below */ }
    const token = targetTokenOf(docs);
    const app = config?.identity?.app_basename;
    if (typeof app !== 'string' || token === null) {
        return { why: `the MAR asset name cannot be derived: configuration.toml [identity] app_basename is ${show(app)} and ${DOCS_REL} names target token ${show(token)}. Next step: restore both` };
    }
    // shortcut: one MAR asset name for every BUILD_TARGET, as the emitter writes today (one Linux target); upgrade with its per-target MAR map.
    return { asset: `${app}-${releaseKey.slice(1)}.${token}.complete.mar` };
}

/**
 * The string-level patch-URL form: https, the manifest's MAR origin host, path exactly /<tag>/<asset>.
 * Returns null when the form holds, else the reason. Runs on the URL as written. Pure.
 */
export function patchUrlForm(url, manifest, asset) {
    if (typeof url !== 'string' || /[\s\x00-\x1f]/.test(url)) return `is ${show(url)}, not a clean URL`;
    let u;
    let origin;
    try {
        u = new URL(url);
    } catch {
        return `is ${show(url)}, which does not parse as a URL`;
    }
    try {
        origin = new URL(manifest.mar_origin);
    } catch {
        return `cannot be judged: the manifest mar_origin is ${show(manifest?.mar_origin)}`;
    }
    const want = `/${manifest.release_key}/${asset}`;
    if (u.hostname === 'github.com' && u.pathname.includes('/releases/download/')) {
        return `${show(url)} is a github.com Releases download URL; github.com is user-initiated, so the unattended fetch fails. Next step: name ${origin.origin}${want}`;
    }
    if (u.hostname.startsWith('release-assets.')) {
        return `${show(url)} is a release-assets signed URL, which expires about one hour after issue. Next step: name ${origin.origin}${want}`;
    }
    if (u.protocol !== 'https:') return `${show(url)} is not https. Next step: name ${origin.origin}${want}`;
    if (u.host !== origin.host) return `${show(url)} names host ${u.host}, not the MAR origin host ${origin.host}. Next step: name ${origin.origin}${want}`;
    if (u.pathname !== want || u.search !== '' || u.hash !== '' || u.username !== '' || u.password !== '') {
        return `${show(url)} has path ${show(u.pathname + u.search + u.hash)}, not ${want}. Next step: name ${origin.origin}${want}`;
    }
    return null;
}

/**
 * The patch URL of one descriptor text, checked by patchUrlForm. The URL judged is the one parseUpdateXml returns,
 * the value the live fetch uses, so the gate and the parser cannot read different attributes. The emitter writes
 * exactly one complete patch, and parseUpdateXml reads the first, so any other patch count is refused. Pure.
 */
function descriptorFormProblems(label, text, manifest, asset) {
    const p = parseUpdateXml(text);
    if (p === null) return [`${label} does not carry the descriptor shape. Next step: emit it with scripts/build-update-xml.mjs`];
    const patches = (text.match(/<patch\b/g) ?? []).length;
    if (patches !== 1) return [`${label} carries ${patches} patch elements, not the one complete patch the emitter writes, so a patch URL would go unjudged. Next step: emit it with scripts/build-update-xml.mjs`];
    const r = patchUrlForm(p.url, manifest, asset);
    return r === null ? [] : [`${label} patchURL ${r}`];
}

function listDescriptors(dir) {
    const out = [];
    const walk = d => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name === 'update.xml') out.push(p);
        }
    };
    walk(dir);
    return out.sort();
}

/**
 * The tree is the authority for the MAR origin and the update channel: the manifest is written by the
 * untrusted build job, so its mar_origin, update_channel and update_url are claims compared with configuration.toml
 * (marOrigin, updateChannel), the way release.yml compares the manifest's release_key. Returns
 * { tree, problems }; tree carries the values every later check uses.
 */
export function treeAuthority(root, manifest) {
    let config;
    try {
        config = resolveConfig(join(root, 'configuration.toml')).config;
    } catch {
        config = undefined;
    }
    let origin = null;
    let channel = null;
    let updateUrl = null;
    try {
        origin = config === undefined ? null : marOrigin(config);
        channel = config === undefined ? null : updateChannel(config).channel;
        updateUrl = config === undefined ? null : `https://${new URL(config.urls.update).host}${UPDATE_PATH}`;
    } catch { /* reported below */ }
    if (origin === null || channel === null || updateUrl === null) {
        return { tree: null, problems: [`configuration.toml does not yield a MAR origin, an update channel and an update host (got ${show(origin)}, ${show(channel)} and ${show(updateUrl)}), so the manifest cannot be checked against the tree. Next step: set [urls] mar_origin and [urls] update, then run node scripts/generate.mjs`] };
    }
    const problems = [];
    if (manifest.mar_origin !== origin) problems.push(`the manifest mar_origin ${show(manifest.mar_origin)} differs from configuration.toml [urls] mar_origin ${show(origin)}; the build output is data and the tree decides. Next step: rebuild from the dispatched commit`);
    if (manifest.update_channel !== channel) problems.push(`the manifest update_channel ${show(manifest.update_channel)} differs from the tree's update channel ${show(channel)}; the build output is data and the tree decides. Next step: rebuild from the dispatched commit`);
    // update_url is checked whenever the manifest carries it, so --form-only judges it as well (package-linux.sh always writes it).
    if (manifest.update_url !== undefined && manifest.update_url !== updateUrl) problems.push(`the manifest update_url ${show(manifest.update_url)} differs from ${show(updateUrl)}, derived from configuration.toml [urls] update and the Gecko update path; the build output is data and the tree decides. Next step: rebuild from the dispatched commit`);
    return { tree: { ...manifest, mar_origin: origin, update_channel: channel, update_url: updateUrl }, problems };
}

/** --form-only: the pre-commit gate over a local descriptor tree. No network. */
export function formOnly(root, manifestDoc, dir) {
    const problems = manifestProblems(manifestDoc, ['release_key', 'mar_origin', 'update_channel']);
    if (problems.length > 0) return problems;
    const { tree: manifest, problems: drift } = treeAuthority(root, manifestDoc);
    if (drift.length > 0) return drift;
    const { asset, why } = marAssetName(root, manifest.release_key);
    if (why) return [why];
    let files;
    try {
        files = statSync(dir).isDirectory() ? listDescriptors(dir) : [];
    } catch {
        files = [];
    }
    if (files.length === 0) return [`${dir} holds no update.xml, so nothing was emitted to judge. Next step: run node scripts/build-update-xml.mjs --emit --outdir ${dir} first`];
    return files.flatMap(f => descriptorFormProblems(relative(dir, f), readFileSync(f, 'utf8'), manifest, asset));
}

/** The baked [AppUpdate] URL template with one target's values; the other segments are probe values. */
function bakedUrl(manifest, target) {
    const values = {
        PRODUCT: 'channel-live', VERSION: manifest.version, BUILD_ID: manifest.build_id, BUILD_TARGET: encodeURIComponent(target),
        LOCALE: 'en-US', CHANNEL: encodeURIComponent(manifest.update_channel), OS_VERSION: encodeURIComponent('Linux 6.0'),
        SYSTEM_CAPABILITIES: encodeURIComponent('ISET:SSE4_2,MEM:16000'), DISTRIBUTION: 'default', DISTRIBUTION_VERSION: 'default',
    };
    return manifest.update_url.replace(/%([A-Z_]+)%/g, (m, k) => values[k] ?? m);
}

// --- the live comparison -----------------------------------------------------

/**
 * The liveness comparison. overrides: manifest (a parsed doc) or manifestPath, get (gh api getter),
 * transport (url -> the url actually fetched; the form check never sees it). Returns { failures, targets }.
 */
export async function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = msg => failures.push(msg);
    const get = overrides.get ?? (path => ghGet(path));
    const transport = overrides.transport ?? (url => url);
    let slug;
    try {
        slug = repoSlug(root);
    } catch (e) {
        fail(String(e.message));
        return { failures, targets: 0 };
    }
    const latestPath = `repos/${slug.owner}/${slug.repo}/releases/latest`;
    const latest = get(latestPath);
    if (!latest?.ok) {
        fail(latest?.status === 404
            ? `GET ${latestPath} found no published Release, so the channel has nothing to equal. Next step: this row stays red until the first public release; publish one through release.yml`
            : String(latest?.why ?? `GET ${latestPath} could not be read. ${NEXT_AUTH}`));
    }
    const latestTag = latest?.ok ? latest.body?.tag_name : null;

    let manifest = overrides.manifest ?? null;
    if (manifest === null && overrides.manifestPath !== undefined) {
        try {
            manifest = JSON.parse(readFileSync(overrides.manifestPath, 'utf8'));
        } catch (e) {
            fail(`${overrides.manifestPath} could not be read as JSON (${String(e.message).split('\n')[0]}). Next step: pass the build job's ${MANIFEST_ASSET}`);
            return { failures, targets: 0 };
        }
    } else if (manifest === null) {
        if (!latest?.ok) return { failures, targets: 0 };
        const a = (latest.body?.assets ?? []).find(x => x?.name === MANIFEST_ASSET);
        if (a === undefined) {
            fail(`the latest Release ${show(latestTag)} carries no ${MANIFEST_ASSET} asset, so the channel values cannot be derived and this row stays red. Next step: the owner decides whether ${MANIFEST_ASSET} is published as a Release asset, and whether without its host field (${MANIFEST_DECISION}); until then run the row with --manifest <path>`);
            return { failures, targets: 0 };
        }
        const r = get(`repos/${slug.owner}/${slug.repo}/releases/assets/${a.id}`, { accept: 'application/octet-stream' });
        if (!r?.ok) {
            fail(String(r?.why));
            return { failures, targets: 0 };
        }
        manifest = r.body;
    }
    const problems = manifestProblems(manifest);
    if (problems.length > 0) {
        problems.forEach(fail);
        return { failures, targets: 0 };
    }
    const authority = treeAuthority(root, manifest);
    if (authority.problems.length > 0) {
        authority.problems.forEach(fail);
        return { failures, targets: 0 };
    }
    manifest = authority.tree;
    if (latestTag !== null && latestTag !== manifest.release_key) {
        fail(`the manifest offers ${manifest.release_key} but the latest published Release is ${show(latestTag)}. Next step: run the descriptor job for the latest Release`);
    }
    const { asset, why } = marAssetName(root, manifest.release_key);
    if (why) {
        fail(why);
        return { failures, targets: 0 };
    }

    const targets = targetsOf(manifest.build_target);
    for (const target of targets) {
        const rel = `${manifest.update_channel}/${target}/update.xml`;
        const publicUrl = bakedUrl(manifest, target);
        const pub = await httpRead(transport(publicUrl), 'GET');
        if (!pub.ok || pub.status !== 200) {
            fail(`${target}: GET ${publicUrl} answered ${pub.ok ? pub.status : `nothing (${pub.why})`}, so the descriptor is missing from the public channel. Next step: run the descriptor job`);
            continue;
        }
        const text = pub.bytes.toString('utf8');
        const copyPath = `repos/${slug.owner}/${slug.repo}${UPDATES_SUFFIX}/contents/${[manifest.update_channel, target, 'update.xml'].map(encodeURIComponent).join('/')}?ref=main`;
        const copy = get(copyPath);
        if (!copy?.ok || typeof copy.body?.content !== 'string') {
            fail(`${target}: ${copy?.why ?? `GET ${copyPath} carries no content`}`);
        } else if (!Buffer.from(copy.body.content, 'base64').equals(pub.bytes)) {
            fail(`${target}: the public ${rel} is not byte-equal to the updates repo copy at ${copyPath}. Next step: wait for the host deploy, or re-run the descriptor job`);
        }
        const form = descriptorFormProblems(`${target} ${rel}`, text, manifest, asset);
        if (form.length > 0) {
            form.forEach(fail);
            continue;
        }
        const p = parseUpdateXml(text);
        if (p.appVersion !== manifest.version) fail(`${target}: appVersion ${show(p.appVersion)} is not the manifest version ${show(manifest.version)}`);
        if (p.buildID !== manifest.build_id) fail(`${target}: buildID ${show(p.buildID)} is not the manifest build_id ${show(manifest.build_id)}`);
        if (latestTag !== null && `v${p.displayVersion}` !== latestTag) {
            fail(`${target}: the offered version ${show(p.displayVersion)} is not the latest Release ${show(latestTag)}`);
        }
        const head = await httpRead(transport(p.url), 'HEAD');
        if (!head.ok || head.status !== 200) {
            fail(`${target}: HEAD ${p.url} answered ${head.ok ? head.status : `nothing (${head.why})`}, not 200. Next step: copy the signed MAR to the MAR origin`);
            continue;
        }
        if (head.length !== p.size) fail(`${target}: HEAD ${p.url} Content-Length ${show(head.length)} is not the descriptor size ${show(p.size)}`);
        const body = await httpRead(transport(p.url), 'GET');
        if (!body.ok || body.status !== 200) {
            fail(`${target}: GET ${p.url} answered ${body.ok ? body.status : `nothing (${body.why})`}, not 200`);
            continue;
        }
        const got = marDigest(body.bytes);
        if (got.hashValue !== p.hashValue) fail(`${target}: GET ${p.url} hashes to sha512 ${got.hashValue}, not the descriptor hashValue ${p.hashValue}. Next step: the MAR origin serves other bytes than the descriptor pins; re-copy the signed MAR`);
        if (got.size !== p.size) fail(`${target}: GET ${p.url} returned ${got.size} bytes, not the descriptor size ${p.size}`);
    }
    return { failures, targets: targets.length };
}

// --- self-test --------------------------------------------------------------

async function selfTest() {
    const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    const slug = repoSlug(REPO_ROOT, config);
    const tag = releaseIdentity(config).releaseKey;
    const origin = marOrigin(config);
    const { asset, why } = marAssetName(REPO_ROOT, tag);
    if (origin === null || why) {
        console.error(`${NAME}: --self-test FAIL -- the fixture cannot be derived (${why ?? 'configuration.toml [urls] mar_origin is unset'})`);
        return 1;
    }
    // UPDATE_PATH is a copy; where the pinned upstream checkout exists, it must equal the source line.
    let ini = null;
    try {
        ini = readFileSync(join(REPO_ROOT, 'upstream/build/application.ini.in'), 'utf8');
    } catch { /* no checkout: the copy stands */ }
    const upstreamPath = ini === null ? UPDATE_PATH : /^URL=https:\/\/@MOZ_APPUPDATE_HOST@(\S+)$/m.exec(ini)?.[1];
    if (upstreamPath !== UPDATE_PATH) {
        console.error(`${NAME}: --self-test FAIL -- UPDATE_PATH ${show(UPDATE_PATH)} differs from upstream/build/application.ini.in ${show(upstreamPath)}. Next step: re-copy the path from the pinned upstream file`);
        return 1;
    }
    const target = 'SelfTest_fixture-abi';
    const manifest = {
        release_key: tag, version: tag.slice(1, tag.lastIndexOf('-')), build_id: '20261031120000', build_target: target,
        update_channel: updateChannel(config).channel, mar_origin: origin,
        update_url: `https://${new URL(config.urls.update).host}${UPDATE_PATH}`,
    };
    const mar = Buffer.from('channel-live self-test MAR bytes\n');
    const goodUrl = `${origin}/${tag}/${asset}`;
    const emit = (marUrl = goodUrl, o = {}) => buildUpdateXml({ marBytes: mar, marUrl, appVersion: manifest.version, platformVersion: manifest.version, buildID: manifest.build_id, displayVersion: tag.slice(1), detailsURL: config.urls.release_notes, ...o });

    const dir = mkdtempSync(join(tmpdir(), 'channel-live-'));
    const xmlFile = join(dir, 'tree', manifest.update_channel, target, 'update.xml');
    const marFile = join(dir, 'origin', tag, asset);
    const hits = { mar: 0, all: 0 };
    const server = createServer((req, res) => {
        hits.all += 1;
        const path = decodeURIComponent(req.url.split('?')[0]);
        const seg = path.split('/').filter(Boolean);
        // The _redirects rule: /update/6/<10 placeholders>/update.xml -> /<channel>/<target>/update.xml.
        const file = seg[0] === 'update' && seg.length === 13 ? join(dir, 'tree', seg[7], seg[5], 'update.xml') : join(dir, 'origin', ...seg);
        if (file.startsWith(join(dir, 'origin'))) hits.mar += 1;
        let bytes;
        try {
            bytes = readFileSync(file);
        } catch {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'content-length': String(bytes.length) });
        res.end(req.method === 'HEAD' ? undefined : bytes);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const loop = `http://127.0.0.1:${server.address().port}`;
    const mapped = new Set([new URL(origin).host, new URL(manifest.update_url).host]);
    const transport = url => {
        const u = new URL(url);
        return mapped.has(u.host) ? `${loop}${u.pathname}${u.search}` : url;
    };
    const latestPath = `repos/${slug.owner}/${slug.repo}/releases/latest`;
    // Plantable answers: the latest Release, and the updates repo copy (null serves the same file the loopback serves).
    const state = { latest: null, repoXml: null };
    const get = path => {
        if (path === latestPath) return state.latest ?? { ok: true, body: { tag_name: tag, draft: false, assets: [] } };
        if (path === `repos/${slug.owner}/${slug.repo}${UPDATES_SUFFIX}/contents/${manifest.update_channel}/${target}/update.xml?ref=main`) {
            try {
                return { ok: true, body: { content: (state.repoXml === null ? readFileSync(xmlFile) : Buffer.from(state.repoXml)).toString('base64') } };
            } catch {
                return { ok: false, status: 404, why: `GET ${path} could not be read (HTTP 404)` };
            }
        }
        return { ok: false, status: null, why: `GET ${path} is not a fixture` };
    };
    const reset = (xml = emit(), withMar = true, planted = {}) => {
        state.latest = planted.latest ?? null;
        state.repoXml = planted.repoXml ?? null;
        rmSync(join(dir, 'tree'), { recursive: true, force: true });
        rmSync(join(dir, 'origin'), { recursive: true, force: true });
        if (xml !== null) {
            mkdirSync(dirname(xmlFile), { recursive: true });
            writeFileSync(xmlFile, xml);
        }
        if (withMar) {
            mkdirSync(dirname(marFile), { recursive: true });
            writeFileSync(marFile, mar);
        }
        hits.mar = 0;
        hits.all = 0;
    };
    const run = () => runChecks(REPO_ROOT, { manifest, get, transport });
    let failed = 0;
    try {
        reset();
        const base = await run();
        const baseForm = formOnly(REPO_ROOT, manifest, join(dir, 'tree'));
        if (base.failures.length > 0 || baseForm.length > 0 || hits.mar < 2) {
            console.error(`${NAME}: --self-test FAIL -- the clean fixture is not green (MAR reads ${hits.mar}): ${[...base.failures, ...baseForm].join(' | ') || '(no failures)'}`);
            return 1;
        }
        console.log(`  ok  baseline -> green (${base.targets} target, descriptor through the baked path, HEAD and GET of ${goodUrl} through the loopback)`);

        const digest = marDigest(Buffer.from('planted other bytes')).hashValue;
        const wrongHash = emit().replace(/hashValue="[0-9a-f]+"/, `hashValue="${digest}"`);
        const wrongSize = emit().replace(/size="\d+"/, `size="${mar.length + 1}"`);
        const ghHost = ['github', 'com'].join('.');
        const otherTag = 'v0.0.0-1';
        const network = [
            ['wrong hashValue', () => reset(wrongHash), digest],
            ['missing target file', () => reset(null), 'answered 404, so the descriptor is missing'],
            ['404 MAR', () => reset(emit(), false), `HEAD ${goodUrl} answered 404`],
            ['size mismatch', () => reset(wrongSize), `"${mar.length + 1}"`],
            // The repo copy differs from the public bytes by one byte (the trailing newline).
            ['public descriptor not byte-equal to the repo copy', () => reset(emit(), true, { repoXml: `${emit()}\n` }), 'is not byte-equal to the updates repo copy'],
            ['descriptor appVersion off the manifest', () => reset(emit(goodUrl, { appVersion: '0.0.1' })), 'appVersion "0.0.1"'],
            ['descriptor buildID off the manifest', () => reset(emit(goodUrl, { buildID: '20000101000000' })), 'buildID "20000101000000"'],
            ['offered version off the latest Release', () => reset(emit(goodUrl, { displayVersion: '0.0.1' })), 'offered version "0.0.1"'],
            ['latest Release tag off the manifest release_key', () => reset(emit(), true, { latest: { ok: true, body: { tag_name: otherTag, draft: false, assets: [] } } }), `offered version ${show(tag.slice(1))} is not the latest Release ${show(otherTag)}`],
        ];
        // Checks that name the endpoint or the release key rather than a target.
        const release = [
            ['no published Release (404)', { latest: { ok: false, status: 404, why: 'HTTP 404' } }, `GET ${latestPath} found no published Release`],
            ['latest Release tag disagreeing with release_key', { latest: { ok: true, body: { tag_name: otherTag, draft: false, assets: [] } } }, `offers ${tag} but the latest published Release is ${show(otherTag)}`],
        ];
        const strings = [
            ['github.com Releases download patch URL', `https://${ghHost}/${slug.owner}/${slug.repo}/releases/download/${tag}/${asset}`],
            ['release-assets patch URL', `https://release-assets.githubusercontent.com/github-production-release-asset/1/${asset}`],
            ['patch URL on another host', `https://mirror.example.invalid/${tag}/${asset}`],
            ['patch path that is not /<tag>/<asset>', `${origin}/latest/${asset}`],
            ['non-https patch URL', `http://${new URL(origin).host}/${tag}/${asset}`],
        ];
        for (const [name, plant, value] of network) {
            plant();
            const { failures } = await run();
            const hit = failures.find(f => f.includes(target) && f.includes(value));
            if (hit) console.log(`  ok  ${name} -> red naming ${target} and ${value}`);
            else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${target} and ${value}; got: ${failures.join(' | ') || '(no failures)'}`);
                failed += 1;
            }
        }
        // The gate judges the URL the parser returns: a decoy data-URL carrying the good URL beside an evil URL is red,
        // and a second patch element (which the parser would not read) is refused.
        const evil = 'https://evil.example.invalid/x.mar';
        const decoys = [
            ['decoy data-URL beside an evil URL', emit(evil).replace(/ URL="[^"]*"/, m => `${m} data-URL="${goodUrl}"`), evil],
            ['decoy data-URL ahead of an evil URL', emit(evil).replace(/<patch /, `<patch data-URL="${goodUrl}" `), evil],
            ['second patch element with an evil URL', emit().replace(/(<patch [^>]*\/>)/, `$1\n    <patch type="partial" URL="${evil}" hashFunction="sha512" hashValue="00" size="1"/>`), '2 patch elements'],
        ];
        for (const [name, xml, value] of decoys) {
            if (!xml.includes(evil)) throw new Error(`self-test plant '${name}' did not apply`);
            reset(xml);
            const { failures } = await run();
            const form = formOnly(REPO_ROOT, manifest, join(dir, 'tree'));
            if (failures.some(f => f.includes(target) && f.includes(value)) && hits.mar === 0 && form.some(f => f.includes(value))) console.log(`  ok  ${name} -> red naming ${target} and ${value}, before any MAR fetch, live and --form-only`);
            else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${target} and ${value} before any MAR fetch (MAR reads ${hits.mar}); got: ${[...failures, ...form].join(' | ') || '(no failures)'}`);
                failed += 1;
            }
        }
        for (const [name, planted, value] of release) {
            reset(emit(), true, planted);
            const { failures } = await run();
            if (failures.some(f => f.includes(value))) console.log(`  ok  ${name} -> red naming ${value}`);
            else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${value}; got: ${failures.join(' | ') || '(no failures)'}`);
                failed += 1;
            }
        }
        for (const [name, url] of strings) {
            reset(emit(url));
            const { failures } = await run();
            const form = formOnly(REPO_ROOT, manifest, join(dir, 'tree'));
            const hit = failures.find(f => f.includes(target) && f.includes(url));
            if (hit && hits.mar === 0 && form.some(f => f.includes(url))) console.log(`  ok  ${name} -> red naming ${target} and ${url}, before any MAR fetch, live and --form-only`);
            else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${target} and ${url} before any MAR fetch (MAR reads ${hits.mar}); got: ${[...failures, ...form].join(' | ') || '(no failures)'}`);
                failed += 1;
            }
        }
        // The manifest is build output: a mar_origin that disagrees with the tree is red naming both values.
        reset();
        const drifted = 'https://mirror.example.invalid';
        const driftLive = (await runChecks(REPO_ROOT, { manifest: { ...manifest, mar_origin: drifted }, get, transport })).failures;
        const driftForm = formOnly(REPO_ROOT, { ...manifest, mar_origin: drifted }, join(dir, 'tree'));
        const names = f => f.includes(drifted) && f.includes(origin);
        if (driftLive.some(names) && driftForm.some(names) && hits.mar === 0) console.log(`  ok  manifest mar_origin disagreeing with the tree -> red naming ${drifted} and ${origin}, live and --form-only`);
        else {
            console.error(`${NAME}: --self-test FAIL -- a manifest mar_origin ${drifted} did not go red naming it and the tree's ${origin}; got: ${[...driftLive, ...driftForm].join(' | ') || '(no failures)'}`);
            failed += 1;
        }
        // Two more build-output claims, each refused before any request: an update_url off the tree, and a
        // BUILD_TARGET carrying a path separator and a parent segment.
        const claims = [
            ['manifest update_url disagreeing with the tree', { update_url: `https://mirror.example.invalid${UPDATE_PATH}` }, [`https://mirror.example.invalid${UPDATE_PATH}`, manifest.update_url]],
            ['manifest build_target carrying ../ and a path separator', { build_target: '../../contents/evil' }, ['../../contents/evil']],
        ];
        for (const [name, patch, values] of claims) {
            reset();
            const { failures } = await runChecks(REPO_ROOT, { manifest: { ...manifest, ...patch }, get, transport });
            if (failures.some(f => values.every(v => f.includes(v))) && hits.all === 0) console.log(`  ok  ${name} -> red naming ${values.join(' and ')}, before any request`);
            else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${values.join(' and ')} before any request (requests ${hits.all}); got: ${failures.join(' | ') || '(no failures)'}`);
                failed += 1;
            }
        }
        // The full-tier row without --manifest reads the manifest asset; its absence is red naming the open decision.
        reset();
        const noAsset = (await runChecks(REPO_ROOT, { get, transport })).failures;
        let decision = '';
        try {
            decision = readFileSync(join(REPO_ROOT, MANIFEST_DECISION.split(',')[0]), 'utf8');
        } catch { /* reported below */ }
        if (noAsset.some(f => f.includes(MANIFEST_ASSET) && f.includes('BLOCKED.md')) && decision.includes('## 49-04') && hits.all === 0) console.log(`  ok  latest Release without the ${MANIFEST_ASSET} asset -> red naming the asset and BLOCKED.md, before any request`);
        else {
            console.error(`${NAME}: --self-test FAIL -- a latest Release without ${MANIFEST_ASSET} did not go red naming it and BLOCKED.md, or BLOCKED.md lacks its 49-04 section; got: ${noAsset.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- the clean fixture is green and ${network.length + release.length + strings.length + decoys.length + 2 + claims.length} planted faults each went red naming the target and the value`);
        return 0;
    } finally {
        server.close();
        rmSync(dir, { recursive: true, force: true });
    }
}

// --- main -------------------------------------------------------------------

function usage(msg) {
    console.error(`${NAME}: FAIL -- ${msg}`);
    console.error(`  Next step: run: node ${SELF_REL} [--manifest <release-manifest.json>], node ${SELF_REL} --form-only --manifest <path> --descriptors <dir>, or add --self-test.`);
    return 2;
}

async function main(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--self-test' || a === '--form-only') opts[a] = true;
        else if ((a === '--manifest' || a === '--descriptors') && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') && opts[a] === undefined) {
            opts[a] = argv[i + 1];
            i += 1;
        } else return usage(`unknown, repeated or incomplete argument '${a}'`);
    }
    if (opts['--self-test']) return Object.keys(opts).length === 1 ? selfTest() : usage('--self-test takes no other flags');
    if (opts['--form-only']) {
        if (opts['--manifest'] === undefined || opts['--descriptors'] === undefined) return usage('--form-only needs --manifest <path> and --descriptors <dir>');
        let manifest;
        try {
            manifest = JSON.parse(readFileSync(opts['--manifest'], 'utf8'));
        } catch (e) {
            manifest = null;
        }
        const problems = formOnly(REPO_ROOT, manifest, resolve(opts['--descriptors']));
        if (problems.length > 0) {
            console.error(`${NAME}: --form-only FAIL -- ${problems.length} problem(s); no descriptor may be committed`);
            problems.forEach(p => console.error(`  - ${p}`));
            return 1;
        }
        console.log(`${NAME}: --form-only PASS -- every patch URL under ${opts['--descriptors']} is https on the manifest's MAR origin at /<tag>/<asset>`);
        return 0;
    }
    if (opts['--descriptors'] !== undefined) return usage('--descriptors is read by --form-only only');
    const { failures, targets } = await runChecks(REPO_ROOT, { manifestPath: opts['--manifest'] });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s); the public channel is not proven equal to the latest Release`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${targets} target(s): each public update.xml byte-equals its updates repo copy, names the MAR origin at /<tag>/<asset>, answers HEAD 200 with its size, hashes to its hashValue, and offers the latest Release`);
    return 0;
}

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
if (DIRECT_RUN) process.exitCode = await main(process.argv.slice(2));
