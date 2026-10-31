#!/usr/bin/env node
// scripts/verify-mar-update-hop.mjs
//
// The self-hosted MAR update gate (08-04, PKG-02): one real Linux N to N+1
// MAR hop from the fork update descriptor with zero Mozilla update hosts
// contacted.
//
// WHY IT EXISTS. The enabled updater and the update URL are configuration,
// and configuration that is never exercised is a story, not a proof. This
// script gates the story in two halves: a static half that reads the
// effective update URL from configuration.toml [urls] update (the build bakes
// it into application.ini [AppUpdate] as MOZ_APPUPDATE_HOST, and no
// enterprise policy overrides it, UPD-12 -- never user-branch prefs:
// Bug 1468948 silently ignores
// user-branch app.update.url edits, and app.update.url itself was removed in
// Bug 1468948's follow-up Bug 1568994, so a pref file cannot carry it at
// all), and an evidence half that re-verifies a completed proof run from the
// files it left behind.
//
// WHAT THE EVIDENCE HALF ASSERTS. The proof procedure (docs/BUILD.md,
// packaging procedure) stages one N to N+1 hop and leaves hop.json,
// update.xml, the N+1 MAR, a fork-server access log and a client resolver
// log under .mozbuild/mar-hop/. UPD-24 (46-03) extends the contract:
// hop.json also carries the observed UI transcript (the ready notification
// text with the N+1 version interpolated, the Restart-now click event, the
// post-restart version and the layout-restored flag) and the read-only
// variant (a second run with a read-only app dir recording the contracted
// cannot-update string instead of a ready string). This script asserts,
// from those files only:
// the two builds are two DISTINCT versions with two DISTINCT build IDs (a
// same-version loop is plumbing, never the exit proof); the served
// descriptor is byte-identical to what the in-file generator emits from the
// MAR bytes (hash-pinned sha512 plus size, generated twice to prove the
// format carries no timestamp or nonce); the descriptor advertises the N+1
// payload the MAR actually carries; the fork server logged serving both the
// descriptor and the MAR (a green hop with no access-log entry is a failure,
// not a pass -- Pitfall 1); and the client's resolver log, sifted with the
// anchored `Resolving host [...]` shape verify-endpoints.sh layer 3 uses
// (nsHostResolver.cpp:455), names zero *.mozilla.org / *.mozilla.net hosts
// while still naming the host that served the descriptor, so an empty
// capture cannot pass.
//
// ON A TREE WITH NO .mozbuild/mar-hop/, THIS ROW FAILS AND NAMES THE
// MISSING EVIDENCE plus the BUILD.md procedure that produces it -- the
// about-dialog-suppression precedent. A check that goes green because it
// could not find its own subject is the green-by-construction shape
// deferred-items.md records. The self-test twin below is the --quick half.
//
// SERVED:RELEASE (UPD-16, Phase 50). hop.json carries served loopback or release. loopback is the
// fork-server drill above, unchanged. release is the real-Release drill: the N+1 MAR downloaded from
// the write-once origin and the descriptor served from the update host, judged by six properties
// (hosts, hash, version, signature, allowed channels, attestation) plus the byte-identity detector.
// The fork-server access log is not demanded (Pages and R2 produce none). An absent or unknown served
// value fails naming the key; nothing defaults.
//
// Honestly --quick (self-test only): node:crypto plus text files in mkdtemp, and a fake gh for the
// attestation branch. No build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-mar-update-hop.mjs
//   node scripts/verify-mar-update-hop.mjs --self-test

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// WR-08: the shell's stdout capture of the N+1 run. PowerBrowserAPI's update
// observer logs one line per appUpdate push, which is the logged event the
// transcript's ready string is derived from.
const CLIENT_UPDATE_LOG = 'client-update.log';
const READY_EVENT_RE = /\[update-observer\] appUpdate status=ready version=(\S+)/g;
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

import { marOrigin, resolveConfig, updateChannel } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-mar-update-hop';
const EVIDENCE_DIR = join(REPO_ROOT, '.mozbuild', 'mar-hop');
const MANIFEST_REL = 'configuration.toml';
const URL_KEY = `${MANIFEST_REL} [urls] update`;
const SERVED_MODES = Object.freeze(['loopback', 'release']);
// The hosts the release update path must never contact (UPD-15 layer 3): the Release page origin
// and the signed asset redirect target, which expires and so cannot be named in a static descriptor.
const RELEASE_FORBIDDEN_HOSTS = Object.freeze(['github.com', 'release-assets.githubusercontent.com']);
// The one workflow that attests a release asset (actions/attest-build-provenance in sign-publish, a hosted runner).
const RELEASE_WORKFLOW_REL = '.github/workflows/release.yml';
const PRIMARY_DER_REL = 'powerbrowser/packaging/mar/mar-primary.der';
const MOZCONFIG_REL = 'powerbrowser/packaging/mozconfig.release';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

// --- assertion plumbing (the installer-schema skeleton) ----------------------
//
// Failures accumulate rather than throwing: one run should report every wrong
// file, not just the first.
function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
        eq(label, actual, expected, where) {
            if (actual === expected) return true;
            failures.push(
                `${label}: ${where} carries ${JSON.stringify(actual)} but must equal ` +
                `${JSON.stringify(expected)}`,
            );
            return false;
        },
    };
}

/** sha512 hex plus byte size of MAR bytes -- the two values pinning the descriptor. */
function marDigest(bytes) {
    return {
        hashValue: createHash('sha512').update(bytes).digest('hex'),
        size: String(bytes.length),
    };
}

function xmlEscape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * THE SINGLE SOURCE for the fork descriptor format. The proof procedure
 * serves exactly what this emits -- never a hand-written update.xml -- so
 * the gate below can require the served bytes byte-identical to a fresh
 * emission. Deterministic by construction: no timestamps, no nonces, no
 * random boundary. PKG-02/idempotency (regenerating from identical MAR
 * bytes is byte-identical) is asserted by emitting twice in runChecks.
 */
export function buildUpdateXml({ marBytes, marUrl, appVersion, platformVersion, buildID, displayVersion, updateType = 'minor' }) {
    const { hashValue, size } = marDigest(marBytes);
    return `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<updates>\n`
        + `  <update type="${xmlEscape(updateType)}" displayVersion="${xmlEscape(displayVersion)}" appVersion="${xmlEscape(appVersion)}" platformVersion="${xmlEscape(platformVersion)}" buildID="${xmlEscape(buildID)}">\n`
        + `    <patch type="complete" URL="${xmlEscape(marUrl)}" hashFunction="sha512" hashValue="${hashValue}" size="${size}"/>\n`
        + `  </update>\n`
        + `</updates>\n`;
}

/** Parse the one descriptor shape buildUpdateXml emits. Returns null when the shape is absent. */
export function parseUpdateXml(text) {
    const update = text.match(/<update\b([^>]*)>/);
    const patch = text.match(/<patch\b([^>]*)\/>/);
    if (!update || !patch) return null;
    const attr = (tag, name) => (tag[1].match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
    const appVersion = attr(update, 'appVersion');
    const buildID = attr(update, 'buildID');
    const platformVersion = attr(update, 'platformVersion');
    const displayVersion = attr(update, 'displayVersion');
    const url = attr(patch, 'URL');
    const hashFunction = attr(patch, 'hashFunction');
    const hashValue = attr(patch, 'hashValue');
    const size = attr(patch, 'size');
    if (!appVersion || !buildID || !url || !hashFunction || !hashValue || !size) return null;
    const unescape = s => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    return {
        appVersion: unescape(appVersion),
        buildID: unescape(buildID),
        platformVersion: platformVersion ? unescape(platformVersion) : platformVersion,
        displayVersion: displayVersion ? unescape(displayVersion) : displayVersion,
        url: unescape(url),
        hashFunction,
        hashValue,
        size,
    };
}

/**
 * The anchored resolver-log sift, same shape as verify-endpoints.sh layer 3:
 * hostnames come ONLY from `Resolving host [...]` (nsHostResolver.cpp:455).
 * An unanchored whole-log grep also matches zero-traffic names and would
 * corrupt the verdict either way.
 */
export function siftResolverHosts(logText) {
    const out = [];
    for (const line of logText.split('\n')) {
        const m = line.match(/Resolving host \[([^\]]+)\]/);
        if (m) out.push(m[1]);
    }
    return [...new Set(out)];
}

/**
 * UPD-24 (46-03): the contracted update strings, derived at check time from
 * the @powerbrowser/branding contribution (theia/extensions/branding/...),
 * never hand-kept here. The ready string interpolates <version> at render;
 * the row below interpolates the N+1 version the same way the client does.
 * Returns null when the contribution cannot be read or parsed.
 */
export function contractedUpdateStrings(copySrc) {
    if (typeof copySrc !== 'string') return null;
    const get = (key) => {
        const m = copySrc.match(new RegExp(`${key}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
        return m ? m[1].replace(/\\'/g, "'") : null;
    };
    const readyBody = get('readyBody');
    const cannotUpdateBody = get('cannotUpdateBody');
    if (readyBody === null || cannotUpdateBody === null) return null;
    return { readyBody, cannotUpdateBody };
}

export function readyNotificationFor(version, contracted) {
    return contracted.readyBody.replace('<version>', version);
}

function isMozillaHost(host) {
    const h = host.toLowerCase();
    return h === 'mozilla.org' || h === 'mozilla.net'
        || h.endsWith('.mozilla.org') || h.endsWith('.mozilla.net');
}

function servedHost(servedUrl) {
    try {
        return new URL(servedUrl).hostname;
    } catch {
        return null;
    }
}

/** The effective update URL: the manifest's [urls] update, which the build bakes as MOZ_APPUPDATE_HOST. */
function readManifestUpdateUrl(root) {
    const p = join(root, MANIFEST_REL);
    if (!existsSync(p)) return { error: `${MANIFEST_REL} is absent, so no effective update URL is configured. Next step: restore it at the top of the project` };
    let resolved;
    try {
        resolved = resolveConfig(p);
    } catch (e) {
        return { error: `${MANIFEST_REL} could not be read (${e.message}). Next step: run node scripts/generate.mjs -- it reports the faulty line` };
    }
    if (resolved.failures.length > 0 || resolved.config === undefined) {
        return { error: `${MANIFEST_REL} does not resolve, so no effective update URL is configured. Next step: run node scripts/generate.mjs -- it reports the faulty key` };
    }
    const url = resolved.config.urls?.update;
    if (typeof url !== 'string' || url.trim() === '') {
        return { error: `${URL_KEY} is not set, so a self-updating client is impossible. Next step: point it at the fork update descriptor` };
    }
    return { url };
}

/** The hostname of a URL, or null when it does not parse. Pure. */
function hostOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * Dotted-numeric compare of two versions: -1, 0 or 1; null when either is not dotted digits. Pure.
 * Same appVersion with distinct buildIDs compares 0 and is an upgrade to the client
 * (updateIsAtLeastAsOldAs refuses an offer only when versions compare equal and buildIDs match).
 */
export function compareDotted(a, b) {
    const shape = /^\d+(\.\d+)*$/;
    if (typeof a !== 'string' || typeof b !== 'string' || !shape.test(a) || !shape.test(b)) return null;
    const x = a.split('.').map(Number);
    const y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        const p = x[i] ?? 0;
        const q = y[i] ?? 0;
        if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
}

/** The accepted MAR channel ids of mozconfig.release, or null when the line is absent. Pure. */
export function acceptedMarChannels(mozconfigText) {
    const m = /^ac_add_options ACCEPTED_MAR_CHANNEL_IDS=(\S+)\s*$/m.exec(mozconfigText);
    return m === null ? null : m[1].split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * The values the release assertions compare against, derived at check time from configuration.toml
 * (the update host, the primary MAR origin, the release notes repository, the MAR channel id) and
 * mozconfig.release (the accepted channel ids). Returns { error } on the first input that cannot be
 * derived, naming the file and key.
 */
function releaseExpectations(root) {
    const update = readManifestUpdateUrl(root);
    if (update.error) return { error: update.error };
    let config;
    try {
        config = resolveConfig(join(root, MANIFEST_REL)).config;
    } catch (e) {
        return { error: `${MANIFEST_REL} could not be read for the release assertions (${e.message}). Next step: run node scripts/generate.mjs` };
    }
    const origin = marOrigin(config);
    if (origin === null) return { error: `${MANIFEST_REL} [urls] mar_origin is unset, so the write-once MAR host is unknown. Next step: set it to the R2 origin` };
    const repo = (config.urls?.release_notes ?? '').match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
    if (repo === null) return { error: `${MANIFEST_REL} [urls] release_notes names no GitHub repository, so attestation cannot name one. Next step: set it to the Releases page of the repository` };
    const mozconfigPath = join(root, MOZCONFIG_REL);
    const accepted = existsSync(mozconfigPath) ? acceptedMarChannels(readFileSync(mozconfigPath, 'utf8')) : null;
    if (accepted === null) return { error: `${MOZCONFIG_REL} carries no ACCEPTED_MAR_CHANNEL_IDS line, so no MAR channel can be accepted. Next step: restore the line` };
    return {
        descriptorHost: hostOf(update.url),
        marHost: hostOf(origin),
        channelId: updateChannel(config).marChannelId,
        accepted,
        repo: repo[1],
    };
}

/**
 * The release assertion set (UPD-16). Every failure names its file and values. The files are the
 * descriptor as served, the Release MAR as downloaded, and the client resolver log; the hop.json
 * fields are the served URLs and the two versions. The crypto and the attestation are injected as
 * deps so the self-test can drive the same wiring without a network, and the drill runs realDeps.
 */
function runReleaseChecks(root, evDir, hop, deps, r) {
    const expect = releaseExpectations(root);
    if (expect.error) {
        r.fail(expect.error);
        return { skipped: false, failures: r.failures };
    }
    const descriptorName = hop.descriptor ?? 'update.xml';
    const missing = [descriptorName, hop.mar, 'client-resolver.log'].filter(f => !existsSync(join(evDir, f)));
    if (missing.length > 0) {
        r.fail(`release evidence under .mozbuild/mar-hop/ is absent: ${missing.join(', ')}. Next step: download the published MAR and capture the client resolver log per docs/BUILD.md (served release)`);
        return { skipped: false, failures: r.failures };
    }

    // Hosts and URLs. The descriptor comes from the update host; the MAR only from the write-once origin.
    r.eq('served descriptor host', hostOf(hop.servedUrl), expect.descriptorHost, 'hop.json servedUrl');
    const marUrl = hop.servedMarUrl;
    const marUrlParts = typeof marUrl === 'string' ? marUrl.split('/').filter(Boolean) : [];
    const writeOnce = typeof marUrl === 'string' && hostOf(marUrl) === expect.marHost
        && marUrl.startsWith('https://') && marUrlParts.length === 4 && !/latest/i.test(marUrl);
    if (!writeOnce) {
        r.fail(`hop.json servedMarUrl ${JSON.stringify(marUrl)} is not the write-once ${expect.marHost} form <origin>/<tag>/<asset>; a github.com, release-assets or latest-download URL is refused. Next step: serve the MAR from the R2 origin by its tag and asset name`);
    }

    // Descriptor bytes: the patch URL is the write-once https URL, the hash and size come from the MAR bytes, and the served bytes equal a fresh emission.
    const marPath = join(evDir, hop.mar);
    const marBytes = readFileSync(marPath);
    const served = readFileSync(join(evDir, descriptorName), 'utf8');
    const parsed = parseUpdateXml(served);
    if (!parsed) {
        r.fail(`served ${descriptorName} does not carry the fork descriptor shape (update plus complete patch). Next step: serve exactly what buildUpdateXml emits`);
    } else {
        r.eq('descriptor patch URL', parsed.url, marUrl, `${descriptorName} patch vs hop.json servedMarUrl (the patch URL must be the write-once https URL)`);
        r.eq('descriptor hashFunction', parsed.hashFunction, 'sha512', `${descriptorName} patch`);
        const digest = marDigest(marBytes);
        r.eq('descriptor hashValue', parsed.hashValue, digest.hashValue, `${descriptorName} patch vs ${hop.mar} bytes`);
        r.eq('descriptor size', parsed.size, digest.size, `${descriptorName} patch vs ${hop.mar} bytes`);
        r.eq('descriptor appVersion', parsed.appVersion, hop.nplus1.version, `${descriptorName} vs hop.json nplus1`);
        r.eq('descriptor buildID', parsed.buildID, hop.nplus1.buildID, `${descriptorName} vs hop.json nplus1`);
    }
    const gen = buildUpdateXml({
        marBytes,
        marUrl: typeof marUrl === 'string' ? marUrl : '',
        appVersion: hop.nplus1.version,
        platformVersion: hop.nplus1.platformVersion ?? hop.nplus1.version,
        buildID: hop.nplus1.buildID,
        displayVersion: hop.nplus1.displayVersion ?? hop.nplus1.version,
    });
    if (served !== gen) {
        r.fail(`served descriptor ${descriptorName} is not byte-identical to a fresh emission from the ${hop.mar} bytes (served ${served.length} bytes vs emitted ${gen.length}) -- a hand edit may have intervened. Next step: serve exactly what buildUpdateXml emits`);
    }

    // Version: distinct buildIDs, and N+1 not older than N in dotted order. Same appVersion is the ratified scheme.
    const order = compareDotted(hop.nplus1.version, hop.n.version);
    if (order === null) {
        r.fail(`hop.json versions ${JSON.stringify(hop.n.version)} and ${JSON.stringify(hop.nplus1.version)} are not dotted numbers. Next step: record both as the build reports them`);
    } else if (order < 0) {
        r.fail(`hop.json nplus1.version ${hop.nplus1.version} is older than n.version ${hop.n.version}; the client would not offer it. Next step: ship a newer revision`);
    }
    if (hop.n.buildID === hop.nplus1.buildID) {
        r.fail(`hop.json: N and N+1 share buildID ${hop.nplus1.buildID}; the client refuses an offer only when versions compare equal and buildIDs match, so this hop is not an upgrade. Next step: build N+1 with its own buildID per docs/BUILD.md`);
    }
    r.eq('hop result', hop.result, 'applied', 'hop.json');
    r.eq('post-hop version', hop.postHop.version, hop.nplus1.version, 'hop.json (the hop must land on N+1)');
    r.eq('post-hop buildID', hop.postHop.buildID, hop.nplus1.buildID, 'hop.json (the hop must land on N+1)');

    // Signature and allowed channels, checked on the MAR bytes the client downloaded.
    const sig = deps.verifySignature(marPath, join(root, PRIMARY_DER_REL));
    if (!sig.ok) {
        r.fail(`${hop.mar} fails the signature check against ${PRIMARY_DER_REL} (${sig.reason}). Next step: sign the MAR with the release key; a MAR that verifies under neither check is never offered`);
    }
    const channel = deps.marChannel(marPath);
    if (channel === null) {
        r.fail(`${hop.mar} carries no product-info channel line (signmar -T). Next step: sign the MAR with the release channel`);
    } else {
        if (!expect.accepted.includes(channel)) {
            r.fail(`${hop.mar} carries MAR channel ${JSON.stringify(channel)}, which is not in ACCEPTED_MAR_CHANNEL_IDS ${JSON.stringify(expect.accepted.join(','))} (${MOZCONFIG_REL}). Next step: rebuild with the release channel`);
        }
        r.eq('MAR channel id', channel, expect.channelId, `${hop.mar} vs updateChannel(configuration.toml)`);
    }

    // Attestation: the offline bundle when one was fetched, else a logged-in host verification. Neither is a skip.
    const bundle = hop.attestation?.bundle ? join(evDir, hop.attestation.bundle) : null;
    const att = deps.attest(marPath, expect.repo, bundle);
    if (!att.ok) {
        r.fail(`attestation for ${hop.mar} did not verify against ${expect.repo} (${att.reason}). Next step: fetch the bundle on the host and verify it offline, or log in to gh and verify on the host; an unverified attestation is never a pass`);
    }

    // Hosts over the client's own Resolving lines, with the capture-broken detectors kept.
    const hosts = siftResolverHosts(readFileSync(join(evDir, 'client-resolver.log'), 'utf8'));
    if (hosts.length === 0) {
        r.fail(`client-resolver.log yielded zero Resolving host lines -- the capture never ran. Next step: re-run the client with MOZ_LOG=nsHostResolver:5`);
    } else {
        for (const h of [expect.descriptorHost, expect.marHost]) {
            if (!hosts.includes(h)) r.fail(`client-resolver.log never resolved ${h}, a required layer-3 host. Hosts seen: ${hosts.join(', ')}. Next step: capture the update cycle again with the MAR downloaded from ${h}`);
        }
        for (const h of hosts.filter(x => RELEASE_FORBIDDEN_HOSTS.includes(x))) {
            r.fail(`client-resolver.log resolved ${h}, which the release update path must never contact (UPD-15 layer 3). Next step: remove that origin from the update path`);
        }
        const moz = hosts.filter(isMozillaHost);
        if (moz.length > 0) {
            r.fail(`client-resolver.log resolved Mozilla host(s) ${moz.join(', ')} during the hop (Pitfall 1). Full host set: ${hosts.join(', ')}`);
        }
    }
    return { skipped: false, failures: r.failures };
}

/**
 * The gh attestation verify flags that pin WHO attested: this repository's release.yml (not any workflow
 * with attestations: write), built from refs/heads/main, on a hosted runner (the attesting job,
 * sign-publish, never runs on legion). --repo alone only proves some workflow of the repository attested. Pure.
 */
export function attestPins(repo) {
    return ['--signer-workflow', `${repo}/${RELEASE_WORKFLOW_REL}`, '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners'];
}

/** The live verifiers. The signature is node:crypto plus signmar -v; the channel is signmar -T; attestation is gh. */
export function realDeps(root, { gh = process.env.GH_BIN ?? 'gh', signer = process.env.SIGNMAR, pins = attestPins } = {}) {
    const tool = (cmd, argv) => {
        const res = spawnSync(cmd, argv, { encoding: 'utf8' });
        return { ok: res.status === 0, text: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim(), error: res.error ? res.error.message : null };
    };
    const attestOf = (argv) => {
        const res = tool(gh, argv);
        return { ok: res.ok, reason: res.ok ? null : (res.text || res.error || 'gh exited non-zero') };
    };
    return {
        verifySignature(mar, der) {
            const node = tool(process.execPath, [join(root, 'scripts', 'verify-mar-signature.mjs'), mar, der]);
            if (!node.ok) return { ok: false, reason: `node:crypto check: ${node.text || node.error}` };
            if (!signer) return { ok: false, reason: 'SIGNMAR is unset, so signmar -v cannot run; point it at the signer built from the pinned source' };
            const db = mkdtempSync(join(tmpdir(), 'mar-hop-nss-'));
            try {
                const prepared = tool('certutil', ['-N', '-d', `sql:${db}`, '--empty-password']).ok
                    && tool('certutil', ['-A', '-d', `sql:${db}`, '-n', 'powerbrowser-mar', '-t', ',,', '-i', der]).ok;
                if (!prepared) return { ok: false, reason: 'the NSS database for signmar -v could not be prepared' };
                const v = tool(signer, ['-d', db, '-n', 'powerbrowser-mar', '-v', mar]);
                return v.ok ? { ok: true, reason: null } : { ok: false, reason: `signmar -v: ${v.text || v.error}` };
            } finally {
                rmSync(db, { recursive: true, force: true });
            }
        },
        marChannel(mar) {
            if (!signer) return null;
            const line = tool(signer, ['-T', mar]).text.split('\n').find(l => /[Cc]hannel[^:]*:/.test(l));
            if (line === undefined) return null;
            return line.replace(/.*[Cc]hannel[^:]*:\s*/, '').trim() || null;
        },
        attest(mar, repo, bundle) {
            if (bundle !== null && existsSync(bundle)) return attestOf(['attestation', 'verify', mar, '--repo', repo, ...pins(repo), '--bundle', bundle]);
            if (!tool(gh, ['auth', 'status']).ok) return { ok: false, reason: 'no attestation bundle was fetched and gh is not logged in' };
            return attestOf(['attestation', 'verify', mar, '--repo', repo, ...pins(repo)]);
        },
    };
}

function runChecks(root, deps = realDeps(root)) {
    const r = makeReporter();
    const evDir = root === REPO_ROOT ? EVIDENCE_DIR : join(root, '.mozbuild', 'mar-hop');

    // Static half: the manifest must carry a shippable fork URL. An
    // http URL would ship MARs over cleartext (T-08-04a tampering vector);
    // a Mozilla host would point the fork's clients at Mozilla's AUS
    // (Pitfall 1). Both fail naming the file and the value.
    const update = readManifestUpdateUrl(root);
    if (update.error) {
        r.fail(update.error);
    } else {
        let u = null;
        try { u = new URL(update.url); } catch { /* falls through */ }
        if (!u) {
            r.fail(`${URL_KEY} ${JSON.stringify(update.url)} is not a URL. Next step: set it to the fork update descriptor`);
        } else {
            r.eq('update URL scheme', u.protocol, 'https:', URL_KEY);
            if (isMozillaHost(u.hostname)) {
                r.fail(`${URL_KEY} points at Mozilla host ${JSON.stringify(u.hostname)} -- the fork's clients must never update from Mozilla (Pitfall 1). Next step: point it at the fork update descriptor`);
            }
        }
    }

    // Evidence half: every file the proof procedure leaves behind. Absent
    // evidence FAILS naming the procedure -- never skips green.
    const need = ['hop.json', 'update.xml', 'server-access.log', 'client-resolver.log'];
    const missing = need.filter(f => !existsSync(join(evDir, f)));
    if (missing.length > 0) {
        r.fail(
            `no MAR-hop proof evidence under ${root === REPO_ROOT ? '.mozbuild/mar-hop' : join(root, '.mozbuild', 'mar-hop')}: `
            + `absent ${missing.join(', ')}. Next step: run the N to N-plus-1 hop per docs/BUILD.md packaging procedure`,
        );
        return { skipped: false, failures: r.failures };
    }

    let hop;
    try {
        hop = JSON.parse(readFileSync(join(evDir, 'hop.json'), 'utf8'));
    } catch {
        r.fail(`hop.json under .mozbuild/mar-hop/ is not valid JSON. Next step: re-run the hop procedure; the file is written, never hand-edited`);
        return { skipped: false, failures: r.failures };
    }
    for (const k of ['served', 'n', 'nplus1', 'mar', 'descriptor', 'servedUrl', 'result', 'postHop']) {
        if (hop[k] === undefined) r.fail(`hop.json is missing required key ${JSON.stringify(k)}. Next step: re-run the hop procedure; the file is written, never hand-edited`);
    }
    if (r.failures.length > 0) return { skipped: false, failures: r.failures };
    // The served selector (UPD-16): the mode decides the assertion set. Unknown values fail, never default.
    if (!SERVED_MODES.includes(hop.served)) {
        r.fail(`hop.json served is ${JSON.stringify(hop.served)}; it must be one of ${SERVED_MODES.join(', ')} (the served key names the drill mode). Next step: set served to loopback for the fork-server drill or release for the published Release drill`);
        return { skipped: false, failures: r.failures };
    }
    if (hop.served === 'release') return runReleaseChecks(root, evDir, hop, deps, r);

    // UPD-24 (46-03): the experience proof. The transcript is REQUIRED: a
    // hop without one predates the experience proof and fails naming the
    // re-run procedure, never passes on plumbing alone.
    const contracted = (() => {
        try {
            const copySrc = readFileSync(join(root, 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts'), 'utf8');
            return contractedUpdateStrings(copySrc);
        } catch {
            return null;
        }
    })();
    if (contracted === null) {
        r.fail(`the contracted update strings could not be derived from theia/extensions/branding/src/browser/powerbrowser-update-copy.ts, so the transcript assertions are unproven. Next step: restore the contribution.`);
    }
    const transcript = hop.transcript;
    if (transcript === undefined || transcript === null || typeof transcript !== 'object') {
        r.fail(`hop.json carries no transcript -- the ready notification, Restart-now click, N+1 landing and layout-restore proof are absent. The plumbing below still verifies, but the experience proof needs a re-run per docs/BUILD.md mar-hop procedure. Next step: re-run the hop with the UI transcript captured`);
    } else if (contracted !== null) {
        // WR-08 (46 review): the transcript is bound to the run. The shell's stdout
        // capture (client-update.log) must hash to transcript.evidence.sha256, and
        // the ready string is derived from the logged ready event, never from the
        // transcript's own field alone.
        const capturePath = join(evDir, CLIENT_UPDATE_LOG);
        const captureText = existsSync(capturePath) ? readFileSync(capturePath, 'utf8') : null;
        if (captureText === null) {
            r.fail(`${CLIENT_UPDATE_LOG} is absent under .mozbuild/mar-hop/, so the transcript has no provenance. Next step: re-run the hop with the shell stdout captured to ${CLIENT_UPDATE_LOG}.`);
        } else {
            r.eq('transcript bound to capture (sha256)', transcript.evidence?.sha256, createHash('sha256').update(captureText).digest('hex'), `hop.json transcript evidence must hash ${CLIENT_UPDATE_LOG} (a transcript edited after the run fails here)`);
            const events = [...captureText.matchAll(READY_EVENT_RE)].map(m => m[1]);
            if (events.length === 0) {
                r.fail(`${CLIENT_UPDATE_LOG} carries no ready event ([update-observer] appUpdate status=ready version=...). Next step: re-run the hop; the ready string is derived from the logged event.`);
            } else {
                const eventVersion = events[events.length - 1];
                r.eq('ready event names N+1', eventVersion, hop.nplus1.version, `${CLIENT_UPDATE_LOG} (the logged ready event must name the N+1 version)`);
                r.eq('ready notification text', transcript.readyNotification, readyNotificationFor(eventVersion, contracted), 'hop.json transcript (must equal the contracted UPD-20 string derived from the logged ready event)');
            }
        }
        r.eq('Restart-now click', transcript.restartClicked, true, 'hop.json transcript');
        r.eq('transcript post-restart version', transcript.postVersion, hop.nplus1.version, 'hop.json transcript (Restart now must land N+1)');
        r.eq('transcript post-restart buildID', transcript.postBuildID, hop.nplus1.buildID, 'hop.json transcript (buildID must match the served MAR)');
        r.eq('layout restored', transcript.layoutRestored, true, 'hop.json transcript (shell layout + mode must survive the restart)');
    }
    const readOnly = hop.readOnly;
    if (readOnly === undefined || readOnly === null || typeof readOnly !== 'object') {
        r.fail(`hop.json carries no readOnly variant -- the read-only app-dir plant (which must produce the cannot-update message instead of a ready string) was not run. Next step: re-run the hop read-only variant per docs/BUILD.md mar-hop procedure`);
    } else if (contracted !== null) {
        r.eq('read-only cannot-update text', readOnly.cannotUpdate, contracted.cannotUpdateBody, 'hop.json readOnly (must equal the contracted UPD-21 string, never a ready string)');
        if (typeof readOnly.cannotUpdate === 'string' && typeof hop.nplus1.version === 'string' && readOnly.cannotUpdate.includes(hop.nplus1.version)) {
            r.fail(`hop.json readOnly.cannotUpdate names version ${JSON.stringify(hop.nplus1.version)} -- a read-only run must record the cannot-update message, never a ready string. Next step: re-run the read-only variant per docs/BUILD.md mar-hop procedure`);
        }
        if (readOnly.recordedReady === true) {
            r.fail(`hop.json readOnly.recordedReady is true -- the read-only run recorded a ready string instead of the cannot-update message. Next step: re-run the read-only variant per docs/BUILD.md mar-hop procedure`);
        }
    }

    // Two DISTINCT versions and build IDs. A same-version loop proves the
    // plumbing moves bytes, never that an upgrade happened -- presenting one
    // as the exit proof is prohibited, so it fails here naming both values.
    r.eq('hop result', hop.result, 'applied', 'hop.json');
    const sameVersion = hop.n.version === hop.nplus1.version;
    const sameBuild = hop.n.buildID === hop.nplus1.buildID;
    if (sameVersion || sameBuild) {
        r.fail(
            `hop.json describes a same-${sameVersion ? 'version' : 'buildID'} loop `
            + `(N ${hop.n.version}/${hop.n.buildID} vs N+1 ${hop.nplus1.version}/${hop.nplus1.buildID}) -- plumbing-only, never the exit proof. `
            + `Next step: build N+1 as a distinct version per docs/BUILD.md packaging procedure`,
        );
    }

    // The MAR the descriptor pins must exist and match, byte for byte.
    const marPath = join(evDir, hop.mar);
    if (!existsSync(marPath)) {
        r.fail(`hop.json names MAR ${JSON.stringify(hop.mar)} but it is absent under .mozbuild/mar-hop/. Next step: re-run the hop procedure`);
        return { skipped: false, failures: r.failures };
    }
    const marBytes = readFileSync(marPath);
    const served = readFileSync(join(evDir, hop.descriptor ?? 'update.xml'), 'utf8');

    // Idempotency (PKG-02): two generations from identical bytes are
    // byte-identical -- the format carries no timestamp or nonce -- and the
    // served descriptor equals a fresh emission, so no hand edit intervened.
    const genArgs = {
        marBytes,
        marUrl: hop.servedMarUrl ?? hop.servedUrl,
        appVersion: hop.nplus1.version,
        platformVersion: hop.nplus1.platformVersion ?? hop.nplus1.version,
        buildID: hop.nplus1.buildID,
        displayVersion: hop.nplus1.displayVersion ?? hop.nplus1.version,
    };
    const gen1 = buildUpdateXml(genArgs);
    const gen2 = buildUpdateXml(genArgs);
    r.eq('descriptor idempotency', gen1, gen2, 'buildUpdateXml (two generations from identical MAR bytes)');
    if (served !== gen1) {
        r.fail(
            `served descriptor ${join('.mozbuild', 'mar-hop', hop.descriptor ?? 'update.xml')} is not byte-identical to a fresh emission from the MAR bytes `
            + `(served ${served.length} bytes vs emitted ${gen1.length} bytes) -- a hand edit may have intervened. `
            + `Next step: serve exactly what buildUpdateXml emits`,
        );
    }

    const parsed = parseUpdateXml(served);
    if (!parsed) {
        r.fail(`served update.xml does not carry the fork descriptor shape (update plus complete patch). Next step: serve exactly what buildUpdateXml emits`);
    } else {
        r.eq('descriptor hashFunction', parsed.hashFunction, 'sha512', 'update.xml patch');
        const { hashValue, size } = marDigest(marBytes);
        r.eq('descriptor hashValue', parsed.hashValue, hashValue, 'update.xml patch vs MAR bytes');
        r.eq('descriptor size', parsed.size, size, 'update.xml patch vs MAR bytes');
        r.eq('descriptor appVersion', parsed.appVersion, hop.nplus1.version, 'update.xml vs hop.json nplus1');
        r.eq('descriptor buildID', parsed.buildID, hop.nplus1.buildID, 'update.xml vs hop.json nplus1');
        r.eq('post-hop version', hop.postHop.version, hop.nplus1.version, 'hop.json (the hop must land on N+1)');
        r.eq('post-hop buildID', hop.postHop.buildID, hop.nplus1.buildID, 'hop.json (the hop must land on N+1)');
    }

    // Fork-server proof: the access log must show the descriptor AND the MAR
    // actually served. No access-log entry is a failure, not a pass.
    const access = readFileSync(join(evDir, 'server-access.log'), 'utf8');
    const gotDescriptor = access.split('\n').some(l => l.includes('GET') && l.includes('/update.xml'));
    const gotMar = access.split('\n').some(l => l.includes('GET') && l.includes('.mar'));
    if (!gotDescriptor) r.fail(`server-access.log shows no GET /update.xml -- the fork server never served the descriptor. Next step: re-run the hop with the access log captured`);
    if (!gotMar) r.fail(`server-access.log shows no GET for a .mar -- the fork server never served the MAR. Next step: re-run the hop with the access log captured`);

    // Zero-Mozilla-host proof over the client's own resolver log, with the
    // layer-3 capture-broken detectors: an empty extract fails (the check
    // never ran), and the serving host must appear unless it is a literal
    // IP (no DNS resolution happens for one, so requiring it would fail a
    // correct local proof forever).
    const resolver = readFileSync(join(evDir, 'client-resolver.log'), 'utf8');
    const hosts = siftResolverHosts(resolver);
    if (hosts.length === 0) {
        r.fail(`client-resolver.log yielded zero Resolving host lines -- the capture never ran. Next step: re-run the hop client with MOZ_LOG=nsHostResolver:5 per docs/BUILD.md`);
    } else {
        const moz = hosts.filter(isMozillaHost);
        if (moz.length > 0) {
            r.fail(`client contacted Mozilla host(s) during the hop: ${moz.join(', ')} -- the hop must touch zero Mozilla update hosts (Pitfall 1). Full host set: ${hosts.join(', ')}`);
        }
        const host = servedHost(hop.servedUrl);
        if (host && isIP(host) === 0 && !hosts.includes(host)) {
            r.fail(`client-resolver.log never resolved the serving host ${JSON.stringify(host)} -- the capture may be from a different run. Hosts seen: ${hosts.join(', ')}`);
        }
    }

    return { skipped: false, failures: r.failures };
}

// --- --self-test ---------------------------------------------------------------
//
// Control green first on a mock proof, then one plant per fault class, each
// required to go red naming the file and the values. Everything lives in
// mkdtemp -- no network, no builds, no browser.
function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), 'verify-mar-update-hop-selftest-'));
    let ok = true;
    try {
        const evDir = join(dir, '.mozbuild', 'mar-hop');
        const CONTR = contractedUpdateStrings(readFileSync(join(REPO_ROOT, 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts'), 'utf8'));
        const mirror = ({ version = '153.1.1', buildID = '20260905010000', servedHost = 'updates.powerbrowser.org', staleMar = false, mozillaHost = false } = {}) => {
            mkdirSync(evDir, { recursive: true });
            writeFileSync(join(dir, MANIFEST_REL), readFileSync(join(REPO_ROOT, MANIFEST_REL)));
            // The fixture tree needs the contribution the row derives from.
            mkdirSync(join(dir, 'theia/extensions/branding/src/browser'), { recursive: true });
            writeFileSync(join(dir, 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts'), readFileSync(join(REPO_ROOT, 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts')));
            const marBytes = randomBytes(65536);
            writeFileSync(join(evDir, 'nplus1.mar'), staleMar ? Buffer.concat([marBytes, Buffer.from('x')]) : marBytes);
            const servedUrl = `http://${servedHost}:8000/update.xml`;
            const xml = buildUpdateXml({
                marBytes,
                marUrl: `http://${servedHost}:8000/nplus1.mar`,
                appVersion: version,
                platformVersion: '153.1.0',
                buildID,
                displayVersion: version,
            });
            writeFileSync(join(evDir, 'update.xml'), xml);
            // The shell's capture carries the ready event; the transcript hashes it.
            const clientUpdateLog = `[update-observer] appUpdate status=ready version=${version}\n`;
            writeFileSync(join(evDir, CLIENT_UPDATE_LOG), clientUpdateLog);
            writeFileSync(join(evDir, 'hop.json'), JSON.stringify({
                served: 'loopback',
                n: { version: '153.1.0', buildID: '20260904000000' },
                nplus1: { version, buildID, platformVersion: '153.1.0', displayVersion: version },
                mar: 'nplus1.mar',
                descriptor: 'update.xml',
                servedUrl,
                servedMarUrl: `http://${servedHost}:8000/nplus1.mar`,
                result: 'applied',
                postHop: { version, buildID },
                transcript: {
                    readyNotification: readyNotificationFor(version, CONTR),
                    evidence: { file: CLIENT_UPDATE_LOG, sha256: createHash('sha256').update(clientUpdateLog).digest('hex') },
                    restartClicked: true,
                    postVersion: version,
                    postBuildID: buildID,
                    layoutRestored: true,
                },
                readOnly: {
                    cannotUpdate: CONTR.cannotUpdateBody,
                    recordedReady: false,
                },
            }));
            const resolverLines = [
                'Resolving host [firefox.settings.services.mozilla.com]',
                `Resolving host [${servedHost}]`,
            ];
            if (mozillaHost) resolverLines.push('Resolving host [aus5.mozilla.org]');
            writeFileSync(join(evDir, 'client-resolver.log'), resolverLines.join('\n') + '\n');
            writeFileSync(
                join(evDir, 'server-access.log'),
                `127.0.0.1 - - [05/Sep/2026 01:00:00] "GET /update.xml HTTP/1.1" 200 -\n`
                + `127.0.0.1 - - [05/Sep/2026 01:00:01] "GET /nplus1.mar HTTP/1.1" 200 -\n`,
            );
        };
        const expectRed = (label, mutate, needleFile, needleValue, { setup = mirror, deps } = {}) => {
            setup();
            mutate();
            const res = runChecks(dir, deps);
            const msg = res.failures.find(f => f.includes(needleFile) && f.includes(needleValue));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- ${label} was NOT rejected naming ${needleFile} and ${needleValue}`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- ${label} REJECTED: ${msg}`);
            }
        };

        // Control: the unmutated mock proof must be GREEN.
        mirror();
        const control = runChecks(dir);
        if (control.skipped || control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmutated mock proof is already red, so a red result after a plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unmutated mock proof is GREEN`);
        }

        // Plant 1: same-version descriptor -- the plumbing-only loop.
        expectRed(
            'same-version N to N loop',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.nplus1.version = hop.n.version;
                hop.nplus1.buildID = hop.n.buildID;
                hop.postHop = { version: hop.n.version, buildID: hop.n.buildID };
                writeFileSync(hopPath, JSON.stringify(hop));
                const marBytes = readFileSync(join(evDir, 'nplus1.mar'));
                writeFileSync(join(evDir, 'update.xml'), buildUpdateXml({
                    marBytes,
                    marUrl: 'http://updates.powerbrowser.org:8000/nplus1.mar',
                    appVersion: hop.n.version,
                    platformVersion: '153.1.0',
                    buildID: hop.n.buildID,
                    displayVersion: hop.n.version,
                }));
            },
            'hop.json',
            'same-version',
        );

        // Plant 2: stale descriptor -- MAR bytes changed after generation.
        mirror();
        {
            const marPath = join(evDir, 'nplus1.mar');
            writeFileSync(marPath, Buffer.concat([readFileSync(marPath), Buffer.from('tampered')]));
            const res = runChecks(dir);
            const msg = res.failures.find(f => f.includes('hashValue'));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- the stale-hash descriptor was NOT rejected naming hashValue`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- stale MAR bytes REJECTED: ${msg}`);
            }
        }

        // Plant 3: a Mozilla host in the resolver log.
        mirror({ mozillaHost: true });
        {
            const res = runChecks(dir);
            const msg = res.failures.find(f => f.includes('aus5.mozilla.org'));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- the Mozilla host in the resolver log was NOT rejected naming it`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- Mozilla host in resolver log REJECTED: ${msg}`);
            }
        }

        // New plants (46-03 UPD-24): notification absent, version not
        // N+1, layout not restored, read-only recording a ready string.
        expectRed(
            'notification absent from the transcript',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                delete hop.transcript.readyNotification;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'transcript',
            'ready notification',
        );
        expectRed(
            'capture edited after the transcript (sha256 binding)',
            () => {
                const logPath = join(evDir, CLIENT_UPDATE_LOG);
                writeFileSync(logPath, readFileSync(logPath, 'utf8') + 'edited after the run\n');
            },
            'transcript bound to capture',
            'sha256',
        );
        expectRed(
            'ready event absent from the capture (sha re-bound so only the event fails)',
            () => {
                const logPath = join(evDir, CLIENT_UPDATE_LOG);
                const text = '[PowerBrowserAPI] info: no update event in this capture\n';
                writeFileSync(logPath, text);
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.transcript.evidence.sha256 = createHash('sha256').update(text).digest('hex');
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            CLIENT_UPDATE_LOG,
            'ready event',
        );
        expectRed(
            'post-restart version not N+1',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.transcript.postVersion = hop.n.version;
                hop.transcript.postBuildID = hop.n.buildID;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'transcript',
            'N+1',
        );
        expectRed(
            'layout not restored',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.transcript.layoutRestored = false;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'transcript',
            'layout',
        );
        expectRed(
            'read-only run recording a ready string',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.readOnly.cannotUpdate = hop.transcript.readyNotification;
                hop.readOnly.recordedReady = true;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'readOnly',
            'cannot-update',
        );
        expectRed(
            'read-only run recording no string at all',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                delete hop.readOnly.cannotUpdate;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'readOnly',
            'cannot-update',
        );

        // Literal-IP carve-out: serving from 127.0.0.1 needs no resolver
        // line for it, but a Mozilla host there must still go red.
        mirror({ servedHost: '127.0.0.1' });
        {
            const res = runChecks(dir);
            if (res.failures.length !== 0) {
                console.error(`${NAME}: --self-test FAIL -- the literal-IP proof should be green without a 127.0.0.1 resolver line:`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- literal-IP serving host correctly needs no resolver line (GREEN)`);
            }
        }
        mirror({ servedHost: '127.0.0.1', mozillaHost: true });
        {
            const res = runChecks(dir);
            const msg = res.failures.find(f => f.includes('aus5.mozilla.org'));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- the Mozilla host beside a literal-IP serve was NOT rejected`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- Mozilla host beside literal-IP serve REJECTED: ${msg}`);
            }
        }

        // The served selector: absent and unknown values fail naming the key (nothing defaults).
        expectRed(
            'served key absent from hop.json',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                delete hop.served;
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'hop.json',
            'served',
        );
        expectRed(
            'served set to an unknown mode',
            () => {
                const hopPath = join(evDir, 'hop.json');
                const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
                hop.served = 'fork';
                writeFileSync(hopPath, JSON.stringify(hop));
            },
            'hop.json',
            '"fork"',
        );

        // served:release (UPD-16). The control is green first on the release mock; the plants each
        // mutate one property and must go red naming the file and the value.
        const RELEASE_MAR_URL = 'https://downloads.powerbrowser.org/v153.1.1-1/nplus1.mar';
        const RELEASE_DESC_URL = 'https://updates.powerbrowser.org/update.xml';
        const fakes = {};
        const resetFakes = () => Object.assign(fakes, { signed: true, channel: 'powerbrowser-default', attest: () => ({ ok: true, reason: null }) });
        resetFakes();
        const fakeDeps = {
            verifySignature: () => (fakes.signed ? { ok: true, reason: null } : { ok: false, reason: 'the MAR carries no signature block' }),
            marChannel: () => fakes.channel,
            attest: (mar, repo, bundle) => fakes.attest(mar, repo, bundle),
        };
        const mirrorRelease = () => {
            resetFakes();
            mkdirSync(evDir, { recursive: true });
            writeFileSync(join(dir, MANIFEST_REL), readFileSync(join(REPO_ROOT, MANIFEST_REL)));
            mkdirSync(join(dir, 'powerbrowser', 'packaging'), { recursive: true });
            writeFileSync(join(dir, MOZCONFIG_REL), readFileSync(join(REPO_ROOT, MOZCONFIG_REL)));
            const marBytes = randomBytes(65536);
            writeFileSync(join(evDir, 'nplus1.mar'), marBytes);
            writeFileSync(join(evDir, 'update.xml'), buildUpdateXml({
                marBytes,
                marUrl: RELEASE_MAR_URL,
                appVersion: '153.1.1',
                platformVersion: '153.1.0',
                buildID: '20260905010000',
                displayVersion: '153.1.1',
            }));
            writeFileSync(join(evDir, 'hop.json'), JSON.stringify({
                served: 'release',
                n: { version: '153.1.0', buildID: '20260904000000' },
                nplus1: { version: '153.1.1', buildID: '20260905010000', platformVersion: '153.1.0', displayVersion: '153.1.1' },
                mar: 'nplus1.mar',
                descriptor: 'update.xml',
                servedUrl: RELEASE_DESC_URL,
                servedMarUrl: RELEASE_MAR_URL,
                result: 'applied',
                postHop: { version: '153.1.1', buildID: '20260905010000' },
            }));
            writeFileSync(join(evDir, 'client-resolver.log'), 'Resolving host [updates.powerbrowser.org]\nResolving host [downloads.powerbrowser.org]\n');
        };
        const editHop = (edit) => {
            const hopPath = join(evDir, 'hop.json');
            const hop = JSON.parse(readFileSync(hopPath, 'utf8'));
            edit(hop);
            writeFileSync(hopPath, JSON.stringify(hop));
        };
        const editFile = (name, edit) => writeFileSync(join(evDir, name), edit(readFileSync(join(evDir, name), 'utf8')));
        const appendResolver = (line) => writeFileSync(join(evDir, 'client-resolver.log'), readFileSync(join(evDir, 'client-resolver.log'), 'utf8') + line + '\n');
        const expectReleaseRed = (label, mutate, needleFile, needleValue, deps = fakeDeps) => expectRed(label, mutate, needleFile, needleValue, { setup: mirrorRelease, deps });

        mirrorRelease();
        const releaseControl = runChecks(dir, fakeDeps);
        if (releaseControl.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmutated release mock proof is already red, so a red result after a plant would prove nothing:`);
            for (const f of releaseControl.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unmutated served:release mock proof is GREEN (no access log demanded)`);
        }

        expectReleaseRed('release: unsigned MAR', () => { fakes.signed = false; }, 'nplus1.mar', 'signature');
        expectReleaseRed('release: wrong-channel MAR', () => { fakes.channel = 'powerbrowser-nightly'; }, 'nplus1.mar', 'powerbrowser-nightly');
        expectReleaseRed('release: tampered MAR byte', () => { writeFileSync(join(evDir, 'nplus1.mar'), Buffer.concat([readFileSync(join(evDir, 'nplus1.mar')), Buffer.from('x')])); }, 'update.xml', 'hashValue');
        expectReleaseRed('release: http patch URL', () => { editFile('update.xml', t => t.replace('https://downloads', 'http://downloads')); }, 'update.xml', 'http://downloads.powerbrowser.org');
        expectReleaseRed('release: resolver log missing the MAR host', () => { editFile('client-resolver.log', t => t.replace('Resolving host [downloads.powerbrowser.org]\n', '')); }, 'client-resolver.log', 'downloads.powerbrowser.org');
        expectReleaseRed('release: same-buildID hop (N equals N+1 buildID)', () => { editHop(h => { h.nplus1.buildID = h.n.buildID; }); }, 'hop.json', 'share buildID 20260904000000');
        expectReleaseRed('release: Mozilla host in the resolver log', () => { appendResolver('Resolving host [aus5.mozilla.org]'); }, 'client-resolver.log', 'aus5.mozilla.org');
        expectReleaseRed('release: attestation failure', () => { fakes.attest = () => ({ ok: false, reason: 'the MAR digest does not match the attested subject' }); }, 'nplus1.mar', 'attestation');
        // Built from parts: a github.com download literal in source would trip the update-download-host sweep (fixture strings are built at run time, as in release-train.mjs).
        const GH_DOWNLOAD_PATH = ['github.com', 'example/r/releases', 'download/v1/nplus1.mar'].join('/');
        expectReleaseRed('release: servedMarUrl on a github.com release-download URL', () => { editHop(h => { h.servedMarUrl = `https://${GH_DOWNLOAD_PATH}`; }); }, 'hop.json', GH_DOWNLOAD_PATH.split('/').slice(0, 5).join('/'));
        expectReleaseRed('release: resolver log carrying a github.com line', () => { appendResolver('Resolving host [github.com]'); }, 'client-resolver.log', 'github.com');
        expectReleaseRed('release: descriptor not byte-identical to a fresh emission', () => { editFile('update.xml', t => `${t} `); }, 'update.xml', 'byte-identical');

        // Attestation through the real wiring, with a gh test double (the offline bundle, the logged-in
        // host verification, and the failure branches). The double checks the repository and the MAR bytes.
        const ghDir = mkdtempSync(join(tmpdir(), 'verify-mar-update-hop-gh-'));
        const fakeGh = join(ghDir, 'gh');
        writeFileSync(fakeGh, [
            '#!/usr/bin/env node',
            "import { existsSync, readFileSync } from 'node:fs';",
            'const a = process.argv.slice(2);',
            "if (a[0] === 'auth') process.exit(process.env.FAKE_GH_LOGGED_IN === '1' ? 0 : 1);",
            "const repo = a[a.indexOf('--repo') + 1];",
            'if (repo !== process.env.FAKE_GH_REPO) { console.error(`no attestation for repository ${repo}`); process.exit(1); }',
            'const flag = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);',
            "const refuse = m => { console.error(`attestation not verified: ${m}`); process.exit(1); };",
            "if (flag('--signer-workflow') !== `${repo}/.github/workflows/release.yml`) refuse(`--signer-workflow is ${flag('--signer-workflow')}, not the release workflow of ${repo}`);",
            "if (flag('--source-ref') !== 'refs/heads/main') refuse(`--source-ref is ${flag('--source-ref')}, not refs/heads/main`);",
            "if (!a.includes('--deny-self-hosted-runners')) refuse('--deny-self-hosted-runners is absent');",
            "if (process.env.FAKE_GH_BUNDLE === '1' && !(flag('--bundle') && existsSync(flag('--bundle')))) refuse('--bundle <file> is absent');",
            "if (process.env.FAKE_GH_BUNDLE === '0' && a.includes('--bundle')) refuse('--bundle was passed with no bundle fetched');",
            "if (readFileSync(a[2]).includes('TAMPERED')) { console.error('attestation digest mismatch'); process.exit(1); }",
            'process.exit(0);',
            '',
        ].join('\n'));
        chmodSync(fakeGh, 0o755);
        const ghDeps = { ...fakeDeps, attest: realDeps(dir, { gh: fakeGh }).attest };
        const expectedRepo = releaseExpectations(REPO_ROOT).repo;
        const ENV_KEYS = ['PATH', 'FAKE_GH_REPO', 'FAKE_GH_LOGGED_IN', 'FAKE_GH_BUNDLE'];
        const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
        const setEnv = (vars) => {
            for (const [k, v] of Object.entries(vars)) {
                if (v === undefined) delete process.env[k];
                else process.env[k] = v;
            }
        };
        const withEnv = (vars, fn) => {
            setEnv(vars);
            try { return fn(); } finally { setEnv(savedEnv); }
        };
        withEnv({ FAKE_GH_REPO: expectedRepo, FAKE_GH_LOGGED_IN: '1' }, () => {
            expectReleaseRed('release: attestation of a tampered MAR (logged-in host verification)', () => { writeFileSync(join(evDir, 'nplus1.mar'), Buffer.concat([readFileSync(join(evDir, 'nplus1.mar')), Buffer.from('TAMPERED')])); }, 'nplus1.mar', 'attestation', ghDeps);
        });
        withEnv({ FAKE_GH_REPO: expectedRepo, FAKE_GH_LOGGED_IN: undefined }, () => {
            expectReleaseRed('release: attestation bundle missing and no gh login', () => { editHop(h => { h.attestation = { bundle: 'attestation-missing.jsonl' }; }); }, 'nplus1.mar', 'attestation', ghDeps);
        });
        withEnv({ FAKE_GH_REPO: 'other/repository', FAKE_GH_LOGGED_IN: '1' }, () => {
            expectReleaseRed('release: attestation against the wrong repository', () => {}, 'nplus1.mar', 'attestation', ghDeps);
        });
        // Controls for the same wiring: a logged-in verification and an offline bundle both pass.
        withEnv({ FAKE_GH_REPO: expectedRepo, FAKE_GH_LOGGED_IN: '1', FAKE_GH_BUNDLE: '0' }, () => {
            mirrorRelease();
            const logged = runChecks(dir, ghDeps);
            console.log(logged.failures.length === 0
                ? `${NAME}: --self-test -- attestation by logged-in host verification is GREEN`
                : `${NAME}: --self-test FAIL -- logged-in attestation control went red: ${logged.failures.join(' | ')}`);
            if (logged.failures.length !== 0) ok = false;
            mirrorRelease();
            writeFileSync(join(evDir, 'attestation.jsonl'), '{"bundle":"fixture"}\n');
            editHop(h => { h.attestation = { bundle: 'attestation.jsonl' }; });
            process.env.FAKE_GH_BUNDLE = '1'; // the double now requires --bundle <existing file>
            const offline = runChecks(dir, ghDeps);
            console.log(offline.failures.length === 0
                ? `${NAME}: --self-test -- attestation by offline bundle is GREEN`
                : `${NAME}: --self-test FAIL -- offline-bundle attestation control went red: ${offline.failures.join(' | ')}`);
            if (offline.failures.length !== 0) ok = false;
        });

        // The signer pins (WR-02): the double demands the exact --signer-workflow, --source-ref and
        // --deny-self-hosted-runners flags, so dropping one through the pins seam goes red naming it.
        for (const [label, pins, needle] of [
            ['signer workflow', r => attestPins(r).slice(2), '--signer-workflow'],
            ['source ref', r => [...attestPins(r).slice(0, 2), attestPins(r)[4]], '--source-ref'],
            ['hosted-runner requirement', r => attestPins(r).slice(0, 4), '--deny-self-hosted-runners'],
        ]) {
            withEnv({ FAKE_GH_REPO: expectedRepo, FAKE_GH_LOGGED_IN: '1', FAKE_GH_BUNDLE: '0' }, () => {
                expectReleaseRed(`release: attestation verified without the ${label} pin`, () => {}, 'nplus1.mar', needle, { ...fakeDeps, attest: realDeps(dir, { gh: fakeGh, pins }).attest });
            });
        }
        rmSync(ghDir, { recursive: true, force: true });

        // Control: same appVersion with a distinct buildID is an upgrade to the client (updateIsAtLeastAsOldAs
        // refuses only equal versions with matching buildIDs), so the version assertion accepts it.
        mirrorRelease();
        editHop(h => { h.n.version = '153.1.1'; });
        const sameAppVersion = runChecks(dir, fakeDeps);
        if (sameAppVersion.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- same appVersion with a distinct buildID was refused: ${sameAppVersion.failures.join(' | ')}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- same appVersion with a distinct buildID is accepted as an upgrade (GREEN)`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    if (!ok) {
        console.error(`${NAME}: --self-test FAIL`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then all planted faults behaved as pinned`);
    process.exit(0);
}

if (SELF_TEST) selfTest();

// Import guard: importing this module (to reuse buildUpdateXml as the
// descriptor's single source) must not run the gate's main. Direct
// invocation still does.
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();
if (INVOKED_DIRECTLY) {
const result = runChecks(REPO_ROOT);
if (result.failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${result.failures.length} MAR-hop problem(s)`);
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- configuration.toml [urls] update carries the fork update URL and the N to N-plus-1 hop evidence verifies end to end`);
}
