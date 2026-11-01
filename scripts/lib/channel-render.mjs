// scripts/lib/channel-render.mjs
//
// The live render and the input checks of the channel stage (Phase 56 review fixes CR-02, WR-01, WR-02, WR-04).
// Nothing a caller supplies is ever placed in a sed program or a shell command: the stage passes each value in an
// environment variable, this module validates it against a grammar derived from the tree, and the tracked
// template is rendered by literal replacement (split and join) with a leftover-token check afterwards.
//
//  1. asset names     a plain file name ([A-Za-z0-9._-]); the Linux tarball must equal the derived name; the macOS
//                     and Windows assets must follow <app>-<version>.<target-token>.<ext> with the app and version
//                     taken from the tree; SHA256SUMS must list the name, which proves the Release published it;
//  2. digests         64 lowercase hex characters (^[0-9a-f]{64}$), never a prefix and never upper case;
//  3. asset check     the digest of the downloaded file is recomputed, must equal the one SHA256SUMS lists for that
//                     name, and must equal the digest the caller supplied;
//  4. live render     the cask or the winget set is rendered from the tracked template with the verified asset name
//                     and digest, and any @TOKEN@ left over is a failure.
//
// Honestly --quick: pure functions over text and bytes.

import { createHash } from 'node:crypto';

import { HEX_RE, channelTokenValues, renderTemplate } from './channel-identity.mjs';

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const LEFTOVER_RE = /@[A-Z][A-Z0-9_]*@/;
export const KINDS = { tarball: null, dmg: 'dmg', installer: 'exe' };

const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Null when the digest is acceptable, else the reason. */
export function digestFault(label, value) {
    if (typeof value !== 'string' || !HEX_RE.test(value)) {
        return `${label} is ${JSON.stringify(typeof value === 'string' ? value.slice(0, 20) : value)}, not 64 lowercase hex characters`;
    }
    return null;
}

/** Null when the asset name is acceptable for the kind, else the reason. */
export function assetNameFault(kind, name, facts) {
    if (!Object.hasOwn(KINDS, kind)) return `the asset kind ${JSON.stringify(kind)} is not one of ${Object.keys(KINDS).join(', ')}`;
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
        return `the asset name ${JSON.stringify(typeof name === 'string' ? name.slice(0, 40) : name)} is not a plain file name ([A-Za-z0-9._-])`;
    }
    if (kind === 'tarball') {
        return name === facts.tarballName ? null : `the Linux tarball is ${facts.tarballName} by the derivation, not ${name}`;
    }
    const shape = new RegExp(`^${esc(facts.app)}-${esc(facts.version)}\\.[a-z0-9]+(?:-[a-z0-9_]+)+\\.${KINDS[kind]}$`);
    return shape.test(name) ? null : `the ${kind} asset must be ${facts.app}-${facts.version}.<target-token>.${KINDS[kind]}, not ${name}`;
}

/** The SHA256SUMS line for the name: exactly one, in sha256sum output form. Returns the digest or null. */
export function sumsDigest(sumsText, name) {
    const hits = [];
    for (const line of (sumsText ?? '').split('\n')) {
        const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
        if (m && m[2] === name) hits.push(m[1]);
    }
    return hits.length === 1 ? hits[0] : null;
}

/**
 * Recompute the digest of a downloaded asset and compare it with SHA256SUMS and the caller's digest.
 * Returns { failures, hex }; hex is the recomputed digest, set only when every check passed.
 */
export function checkAsset({ kind, name, expect, bytes, sumsText, facts }) {
    const failures = [];
    const nameFault = assetNameFault(kind, name, facts);
    if (nameFault) failures.push(nameFault);
    const expectFault = digestFault('the supplied digest', expect);
    if (expectFault) failures.push(expectFault);
    if (failures.length > 0) return { failures, hex: null };
    const got = createHash('sha256').update(bytes).digest('hex');
    const listed = sumsDigest(sumsText, name);
    if (listed === null) {
        failures.push(`SHA256SUMS lists ${name} zero or several times, so the asset is not one this release published`);
    } else if (listed !== got) {
        failures.push(`${name} hashes to ${got} but SHA256SUMS lists ${listed}`);
    }
    if (got !== expect) failures.push(`${name} hashes to ${got} but the caller supplied ${expect}`);
    return { failures, hex: failures.length === 0 ? got : null };
}

/**
 * Validate the stage inputs (all strings from the environment). live is the string "true" or anything else.
 * A digest and an asset name travel as a pair; the Linux tarball digest is required when live.
 */
export function inputFaults(env, facts) {
    const out = [];
    const live = env.LIVE === 'true';
    const check = (label, fault) => { if (fault) out.push(`${label}: ${fault}`); };
    const tarball = env.TARBALL_SHA ?? '';
    if (live || tarball !== '') check('tarball_sha256', digestFault('the digest', tarball));
    for (const [kind, assetVar, shaVar, assetLabel, shaLabel] of [
        ['dmg', 'DMG_ASSET', 'DMG_SHA', 'dmg_asset', 'dmg_sha256'],
        ['installer', 'WINGET_ASSET', 'WINGET_SHA', 'winget_asset', 'winget_sha256'],
    ]) {
        const asset = env[assetVar] ?? '';
        const sha = env[shaVar] ?? '';
        if (asset === '' && sha === '') continue;
        if (asset === '') out.push(`${shaLabel}: supplied without ${assetLabel}`);
        else check(assetLabel, assetNameFault(kind, asset, facts));
        if (live || sha !== '') check(shaLabel, digestFault('the digest', sha));
    }
    return out;
}

/**
 * Render the tracked templates for a leg with the verified asset name and digest.
 * leg "tap": { 'Casks/powerbrowser.rb': text }. leg "winget": the three tracked winget files, comments stripped.
 * Throws with the reason when the leg is unknown or a token is left over.
 */
export function renderLive(leg, facts, read, { asset, sha }) {
    const values = { ...channelTokenValues(facts) };
    let templates;
    if (leg === 'tap') {
        values['@MACOS_DMG_ASSET@'] = asset;
        values['@MACOS_DMG_SHA256@'] = sha;
        templates = { 'Casks/powerbrowser.rb': 'homebrew-tap/Casks/powerbrowser.rb' };
    } else if (leg === 'winget') {
        values['@WINDOWS_INSTALLER_ASSET@'] = asset;
        values['@WINDOWS_INSTALLER_SHA256@'] = sha;
        const set = ['yaml', 'installer.yaml', 'locale.yaml'].map(ext => `DeBIOSFoundation.PowerBrowser.${ext}`);
        templates = Object.fromEntries(set.map(file => [file, `winget/${file}`]));
    } else {
        throw new Error(`the leg ${JSON.stringify(leg)} is not tap or winget`);
    }
    const out = {};
    for (const [file, rel] of Object.entries(templates)) {
        const template = read(rel);
        if (template === null) throw new Error(`${rel} is missing`);
        let text = renderTemplate(template, values);
        // The fixture header of the tracked winget files is not part of a submission.
        if (leg === 'winget') text = text.replace(/^#.*\n/gm, '');
        const left = LEFTOVER_RE.exec(text);
        if (left) throw new Error(`${rel} still holds the token ${left[0]} after rendering`);
        out[file] = text;
    }
    return out;
}
