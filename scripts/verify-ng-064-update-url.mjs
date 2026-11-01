#!/usr/bin/env node
// scripts/verify-ng-064-update-url.mjs -- NG-064 (wave E): the update URL comes from
// configuration.toml ([urls] update) and no update endpoint of the build points at
// aus5.mozilla.org. Reads BUILT artifacts:
//   - application.ini [AppUpdate] URL;
//   - the launcher binary and libxul.so, whose compiled-in app data carries that URL;
//   - the EFFECTIVE default prefs: greprefs.js, then browser/defaults/preferences/*.js
//     with firefox.js first and firefox-branding.js last, later wins
//     (verify-endpoints.sh layer-1 order);
//   - the tracked distribution/policies.json, which must carry NO AppUpdateURL key at all
//     (UPD-12): an enterprise policy beats application.ini, so a second source could
//     disagree with MOZ_APPUPDATE_HOST. The manifest's [urls] update is the only source.
// Hosts compare as new URL().host, so letter case and the path never decide equality.
// Only `https://aus5.mozilla.org` URLs count. Two bare-host mentions are not endpoints
// (decisions.md R10): nsHttpChannel.cpp's HTTP/3 exclusion list in libxul, and the
// Remote Settings from/to fallback dump.
// R11: a downstream manifest (PB_CONFIG_DIR) that does not state its own [urls] update
// inherits the platform's host, and the generator must refuse it. It must write nothing
// under generated/ and name urls.update. Driven through the real CLI (node
// scripts/generate.mjs) in a child process.
// Tier: full (needs the Gecko build). Marker: live-main.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './generate.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'ng064-update-url-from-manifest';
const BIN = join(REPO_ROOT, 'objdir/dist/bin');
const MOZ = 'https://aus5.mozilla.org';
const failures = [];

const { failures: rf, config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'), undefined);
if (rf.length) failures.push(`configuration.toml does not resolve: ${rf.join('; ')}`);
const update = config?.urls?.update;
// The host of an https URL, or undefined; new URL() lower-cases it.
const hostOf = (u) => {
    try {
        const url = new URL(u);
        return url.protocol === 'https:' ? url.host : undefined;
    } catch {
        return undefined;
    }
};
const host = typeof update === 'string' ? hostOf(update) : undefined;
if (!host) failures.push(`configuration.toml [urls] update is ${JSON.stringify(update)} -- the update URL must come from the manifest`);

const ini = readFileSync(join(BIN, 'application.ini'), 'utf8');
const appUrl = /\[AppUpdate\][^[]*?^URL=(\S+)/m.exec(ini)?.[1];
const appHost = appUrl && hostOf(appUrl);
if (!appHost) failures.push('application.ini carries no https [AppUpdate] URL');
else if (appHost !== host) failures.push(`application.ini [AppUpdate] URL host is ${appHost}, the manifest says ${host}`);

for (const f of [`${config.identity.binary_name}-bin`, 'libxul.so']) {
    const file = join(BIN, f);
    if (!existsSync(file)) { failures.push(`objdir/dist/bin/${f} is absent -- its compiled-in update URL cannot be read`); continue; }
    // grep exits 1 for "no match" and 2 for "could not read": only 2 is an instrument failure.
    const found = spawnSync('grep', ['-a', '-o', '-E', 'https://[a-z0-9.-]+/update/6/', file], { encoding: 'latin1', maxBuffer: 1 << 26 });
    const moz = spawnSync('grep', ['-a', '-q', '-F', MOZ, file], { encoding: 'utf8' });
    if (found.status === 2 || moz.status === 2) { failures.push(`grep could not read ${f}: ${(found.stderr || moz.stderr).trim()}`); continue; }
    for (const u of new Set(found.stdout.split('\n').filter(Boolean))) if (hostOf(u) !== host) failures.push(`${f} carries the update URL ${u}`);
    if (moz.status === 0) failures.push(`${f} carries a ${MOZ} URL`);
}

const prefDir = join(BIN, 'browser/defaults/preferences');
const later = readdirSync(prefDir).filter(n => n.endsWith('.js') && n !== 'firefox.js' && n !== 'firefox-branding.js').sort();
const order = [join(BIN, 'greprefs.js'), join(prefDir, 'firefox.js'), ...later.map(n => join(prefDir, n)), join(prefDir, 'firefox-branding.js')];
const PREF = /(?:^|\n)\s*(?:sticky_)?pref\(\s*"([^"]+)"\s*,\s*("(?:[^"\\]|\\.)*"|[^)]*?)\s*\)\s*;/g;
const effective = new Map();
for (const file of order) for (const m of readFileSync(file, 'utf8').matchAll(PREF)) effective.set(m[1], m[2]);
for (const [name, value] of effective) if (value.includes('aus5.mozilla.org')) failures.push(`effective default pref ${name} = ${value}`);

// UPD-12: key presence fails whatever the value, an empty string included.
const policy = JSON.parse(readFileSync(join(REPO_ROOT, 'powerbrowser/distribution/policies.json'), 'utf8')).policies ?? {};
if (Object.hasOwn(policy, 'AppUpdateURL')) failures.push('policies.json carries an update-URL policy; MOZ_APPUPDATE_HOST from configuration.toml [urls] update must be the only update URL source (UPD-12)');

// R11: a downstream copy of the platform manifest with a new identity and no [urls] table.
if (host) {
    const gen = join(REPO_ROOT, 'generated');
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
    const snapshot = () => walk(gen).sort().map(f => `${f}:${createHash('sha256').update(readFileSync(f)).digest('hex')}`).join('\n');
    const before = snapshot();
    const dir = mkdtempSync(join(tmpdir(), 'ng064-downstream-'));
    try {
        cpSync(join(REPO_ROOT, 'brand'), join(dir, 'brand'), { recursive: true });
        const toml = readFileSync(join(REPO_ROOT, 'configuration.toml'), 'utf8')
            .replace(/^\[urls\][\s\S]*?(?=^\[|(?![\s\S]))/m, '')
            .replace(/^display_name = .*$/m, 'display_name = "Ng064Downstream"');
        writeFileSync(join(dir, 'configuration.toml'), toml);
        const r = spawnSync('node', [join(REPO_ROOT, 'scripts/generate.mjs')], { env: { ...process.env, PB_CONFIG_DIR: dir }, encoding: 'utf8' });
        if (r.status === 0) failures.push(`a downstream manifest without [urls] update generated cleanly -- it would ship ${host} (R11)`);
        else if (!`${r.stderr}${r.stdout}`.includes('urls.update')) failures.push(`the downstream refusal does not name urls.update: ${r.stderr.slice(-400)}`);
        if (snapshot() !== before) failures.push('the refused downstream generate changed files under generated/');
    } finally {
        rmSync(dir, { recursive: true, force: true });
        // generate.mjs writes REPO_ROOT/generated whatever PB_CONFIG_DIR says, so a downstream
        // generate that was not refused leaves foreign output there. Restore the default tree
        // the way verify-downstream-fixtures does: the default generate, PB_CONFIG_DIR unset.
        if (snapshot() !== before) {
            const env = { ...process.env };
            delete env.PB_CONFIG_DIR;
            const restore = spawnSync('node', [join(REPO_ROOT, 'scripts/generate.mjs')], { env, encoding: 'utf8' });
            if (restore.status !== 0) failures.push(`restoring generated/ with the default generate failed (exit ${restore.status}): ${`${restore.stderr}${restore.stdout}`.slice(-400)}`);
        }
    }
}

if (failures.length) {
    console.error(`${NAME}: FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- every update endpoint of the build is ${host}, from configuration.toml`);
