// scripts/lib/channel-identity.mjs
//
// The derivation every Phase 56 channel row shares (PKG-19, PKG-20, INF-05, DIST-04, DIST-11,
// DIST-12). Everything here is derived at check time from the tree and never typed:
//
//  1. the release key and version   releaseIdentity(resolveConfig(configuration.toml)); the version
//                                   is the key minus its leading v, as docs/RELEASING.md states;
//  2. the app basename               [identity] app_basename;
//  3. the release home slug          owner/repo of [urls] release_notes (the Release page host and path);
//  4. the Linux target token         the first Target key of the "## Release asset names" table in
//                                   docs/RELEASING.md (the same grammar scripts/verify-release-asset-set.mjs reads);
//  5. the asset names and URLs       <app>-<version>.<token>.tar.xz under /releases/download/<key>/, the
//                                   versioned name release.yml attaches (assumption A1, corrected: no en-US token);
//  6. the SRI sentinel               the placeholder hash a channel carries until the DIST-12 bot PR fills it.
//
// Reads go through an injectable read(rel) so each row's --self-test plants faults in memory.
// Honestly --quick: text reads and the generator's own pure functions. No network, no gh.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { releaseIdentity, resolveConfig } from '../generate.mjs';

export const MANIFEST_REL = 'configuration.toml';
export const DOCS_REL = 'docs/RELEASING.md';
export const RELEASE_HASH_REL = 'nix/pkg/release-hash.json';
export const RELEASE_KEY_RE = /^v\d+(?:\.\d+)*-\d+$/;

// The sentinel is 32 ASCII bytes, so its base64 is a valid SRI sha256 that Nix evaluates, and its
// decoded text names the step that replaces it. No real digest is ever written for a release that
// does not exist. A check refuses this value under --release, naming the bot-PR step.
export const SENTINEL_TEXT = 'PLACEHOLDER-DIST12-BOT-PR-FILLME';
export const SENTINEL_BYTES = Buffer.from(SENTINEL_TEXT, 'ascii');
export const SENTINEL_SRI = `sha256-${SENTINEL_BYTES.toString('base64')}`;
export const SENTINEL_HEX = SENTINEL_BYTES.toString('hex');
export const SRI_RE = /^sha256-[A-Za-z0-9+/]{43}=$/;
export const HEX_RE = /^[0-9a-f]{64}$/;

export function diskReader(root) {
    return rel => {
        try {
            return readFileSync(join(root, rel), 'utf8');
        } catch {
            return null;
        }
    };
}

// The "## Release asset names" section, up to the next level-2 heading.
export function assetSection(docs) {
    const m = docs?.match(/^## Release asset names\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    return m ? m[1] : null;
}

// The first backticked Target key of the asset table, e.g. linux-x86_64.
export function targetTokenOf(docs) {
    const m = assetSection(docs)?.match(/^\| `([a-z0-9]+(?:-[a-z0-9_]+)+)` \|/m);
    return m ? m[1] : null;
}

export function sriToHex(sri) {
    if (typeof sri !== 'string' || !SRI_RE.test(sri)) return null;
    return Buffer.from(sri.slice('sha256-'.length), 'base64').toString('hex');
}

export function hexToSri(hex) {
    return `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
}

/**
 * Derive every channel fact. Returns { failures, facts } where failures name the file that does not
 * resolve; facts is null when the manifest or the release identity cannot be derived.
 */
export function deriveChannel(root, read = diskReader(root)) {
    const { config, failures } = resolveConfig(join(root, MANIFEST_REL));
    if (failures.length > 0) {
        return { failures: failures.map(f => `${MANIFEST_REL}: ${f}`), facts: null };
    }
    const id = releaseIdentity(config);
    const token = targetTokenOf(read(DOCS_REL));
    const repo = String(config.urls?.release_notes ?? '')
        .replace(/^https:\/\/github\.com\//, '')
        .replace(/\/releases\/?$/, '');
    const app = config.identity.app_basename;
    const version = id.releaseKey.slice(1);
    const releaseBase = `https://github.com/${repo}/releases/download/${id.releaseKey}/`;
    const tarballName = `${app}-${version}.${token}.tar.xz`;
    const facts = Object.freeze({
        app,
        esrVersion: id.esrVersion,
        revision: id.revision,
        releaseKey: id.releaseKey,
        version,
        repo,
        homeHost: new URL(config.urls.homepage).hostname,
        token,
        tarballName,
        tarballUrl: `${releaseBase}${tarballName}`,
        checkerApi: `https://api.github.com/repos/${repo}/releases/latest`,
        checkerUrlTemplate: `https://github.com/${repo}/releases/download/v$version/${app}-$version.${token}.tar.xz`,
    });
    return { failures: [], facts };
}
