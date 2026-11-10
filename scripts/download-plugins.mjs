#!/usr/bin/env node
// scripts/download-plugins.mjs -- the plugin step of the Theia application build (NG-071).
// theia/applications/browser/package.json runs it as `download:plugins`, so `yarn build`
// installs every declared extension with no file placed by hand. Run with the
// application directory as cwd.
// Every theiaPlugins id must have an [[extensions]] entry; its packed archive lands in the
// slot the extension-pins gate hashes, <pluginsDir>/<id>.vsix / .theia / .tar.gz:
// - tarball kinds (npm and local-path `.tgz`, direct `.tar.gz`) are fetched or packed here;
// - every other entry goes to the stock `theia download:plugins --packed`, which rejects
//   `.tgz` URLs and decompresses a `.tar.gz` even when packed.
// An archive already at its pin is reused (local-path always repacks); any other slot is
// removed first, since the stock CLI skips a slot that exists. Then every slot is hashed
// against its manifest sha256: a mismatch removes the entry and fails the build naming it.
// Only after that is each declared archive unpacked beside itself into <pluginsDir>/<id>/
// (NG-073): Theia's plugin deployer treats a THEIA_PLUGINS / THEIA_DEFAULT_PLUGINS folder as
// system plugins and refuses packed files there, while the pin gate needs the packed bytes.
// Anything else in <pluginsDir> is removed, so the folder Theia loads holds only pinned,
// declared bytes.
// Then every bundled-extensions/<folder>/ is assembled into <pluginsDir>/.user/<id>/ (D-30): a
// built-in plugin cannot be uninstalled, and the dot keeps .user out of Theia's system scan; the
// @powerbrowser/bundled-extensions seed copies it into the profile as a user plugin instead.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { REPO_ROOT, resolveConfig } from './generate.mjs';

const NAME = 'download-plugins';
const FETCH_TIMEOUT_MS = 300_000;
const appDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
const block = pkg.theiaPlugins ?? {};
const pluginsDir = resolve(appDir, pkg.theiaPluginsDir ?? 'plugins');
if (!relative(appDir, pluginsDir) || relative(appDir, pluginsDir).startsWith('..')) {
    die(`theiaPluginsDir must name a folder inside ${appDir}; this step empties it of anything undeclared`);
}
// PB_CONFIG_DIR read as generate.mjs reads it (CFG-05): whitespace-only is unset, and a
// relative value resolves against the invoking shell's directory -- under yarn that is
// INIT_CWD, not this script's cwd (the application directory).
const rawConfigDir = process.env.PB_CONFIG_DIR;
const configDir = rawConfigDir?.trim() ? resolve(process.env.INIT_CWD ?? appDir, rawConfigDir) : undefined;
const { failures, config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'), configDir && join(configDir, 'configuration.toml'));
if (failures.length) die(`the manifest does not resolve: ${failures.join('; ')}`);
const entries = new Map((config.extensions ?? []).map(e => [e.id, e]));

const declared = Object.entries(block).map(([id, url]) => {
    const entry = entries.get(id);
    if (!entry) die(`theiaPlugins declares ${id}, which no [[extensions]] entry pins -- regenerate and copy the theiaPlugins block over`);
    const suffix = /(\.tgz|tar\.gz)$/.test(url) ? '.tar.gz' : url.endsWith('vsix') ? '.vsix' : url.endsWith('theia') ? '.theia' : null;
    if (!suffix) die(`${id}: ${url} is no archive this step can install (.vsix, .theia, .tgz or .tar.gz)`);
    return { id, url, entry, slot: join(pluginsDir, `${id}${suffix}`), dir: join(pluginsDir, id) };
});

mkdirSync(pluginsDir, { recursive: true });
const toFetch = declared.filter(d => {
    if (d.entry.source !== 'local-path' && sha256Of(d.slot) === d.entry.sha256) return false;
    rmSync(d.slot, { recursive: true, force: true });
    return true;
});
for (const d of toFetch.filter(d => d.slot.endsWith('.tar.gz'))) {
    writeFileSync(d.slot, d.entry.source === 'local-path' ? pack(resolve(configDir ?? REPO_ROOT, d.entry.path)) : await fetchBytes(d));
}
const stock = toFetch.filter(d => !d.slot.endsWith('.tar.gz'));
if (stock.length > 0) {
    const tmp = mkdtempSync(join(tmpdir(), 'pb-plugins-'));
    const theiaPlugins = Object.fromEntries(stock.map(d => [d.id, d.url]));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'pb-plugin-download', private: true, theiaPluginsDir: pluginsDir, theiaPlugins }));
    const r = spawnSync(join(REPO_ROOT, 'theia', 'node_modules', '.bin', 'theia'), ['download:plugins', '--packed'], { cwd: tmp, stdio: 'inherit' });
    rmSync(tmp, { recursive: true, force: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const d of declared) {
    const actual = sha256Of(d.slot);
    if (actual === d.entry.sha256) continue;
    rmSync(d.slot, { recursive: true, force: true });
    rmSync(d.dir, { recursive: true, force: true });
    die(actual === null
        ? `${d.id}: no ${d.entry.source} archive was placed at ${d.slot} -- nothing was installed for it`
        : `${d.id}: the ${d.entry.source} archive has sha256 ${actual}, the manifest pins ${d.entry.sha256} -- nothing was installed for it`);
}

const keep = new Set([...declared.flatMap(d => [basename(d.slot), d.id]), '.user']);
for (const name of readdirSync(pluginsDir)) {
    if (!keep.has(name)) rmSync(join(pluginsDir, name), { recursive: true, force: true });
}

// The unpacker the stock step uses in its unpacked mode, held to regular files and folders:
// decompress 4.2.1 writes links to any target, and its containment test is a bare prefix
// match, so `..` segments are refused here too.
const decompress = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('decompress');
const regular = f => (f.type === 'file' || f.type === 'directory') && !f.path.split(/[\\/]/).includes('..');
const declaredIds = new Set(declared.map(d => d.id.toLowerCase()));
for (const d of declared) {
    rmSync(d.dir, { recursive: true, force: true });
    try {
        await decompress(d.slot, d.dir, { filter: regular });
    } catch (err) {
        rmSync(d.dir, { recursive: true, force: true });
        die(`${d.id}: unpacking its ${d.entry.source} archive failed -- ${err.message}`);
    }
    console.log(`${NAME}: ${d.id} (${d.entry.source}) installed, bytes match the manifest`);
}

// Bundled extensions (D-30, P68-38): each folder is built in a temporary sibling and renamed
// into place, so a failure leaves no half-built plugin for the seed to copy.
const userDir = join(pluginsDir, '.user');
const bundledRoot = join(REPO_ROOT, 'bundled-extensions');
const bundled = existsSync(bundledRoot)
    ? readdirSync(bundledRoot).filter(n => existsSync(join(bundledRoot, n, 'package.json'))).sort()
    : [];
mkdirSync(userDir, { recursive: true });
const bundledIds = new Set();
for (const folder of bundled) {
    const src = join(bundledRoot, folder);
    const manifest = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
    const id = `${manifest.publisher}.${manifest.name}`;
    bundledIds.add(id);
    const tmp = mkdtempSync(join(userDir, `.${id}-`));
    const scratch = mkdtempSync(join(tmpdir(), 'pb-bundled-'));
    try {
        // npm ci verifies every tarball against the tracked lock's sha512; nothing from the
        // package runs (--ignore-scripts, and the inert script shell pack() uses).
        for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(src, f), join(scratch, f));
        const r = spawnSync('npm', ['ci', '--ignore-scripts', '--script-shell', 'true', '--omit=optional', '--legacy-peer-deps', '--no-audit', '--no-fund'],
            { cwd: scratch, encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`npm ci failed: ${r.stderr || r.error?.message}`);
        const lock = JSON.parse(readFileSync(join(src, 'package-lock.json'), 'utf8'));
        const want = Object.entries(lock.packages ?? {}).filter(([k, v]) => k && !v.optional).map(([k]) => k).sort();
        const got = installedPackages(join(scratch, 'node_modules')).sort();
        if (want.join('\n') !== got.join('\n')) {
            throw new Error(`node_modules holds ${got.join(', ') || 'nothing'}, the lock's non-optional packages are ${want.join(', ')}`);
        }
        const [dep] = Object.keys(manifest.dependencies ?? {});
        const theirs = readFileSync(join(scratch, 'node_modules', dep, 'LICENSE.md'), 'utf8');
        if (!readFileSync(join(src, 'LICENSE.md'), 'utf8').includes(theirs)) {
            throw new Error(`LICENSE.md does not quote ${dep}'s LICENSE.md byte for byte`);
        }
        mkdirSync(join(tmp, 'extension'));
        for (const f of ['package.json', 'LICENSE.md', 'README.md']) copyFileSync(join(src, f), join(tmp, 'extension', f));
        cpSync(join(scratch, 'node_modules'), join(tmp, 'extension', 'node_modules'),
            { recursive: true, filter: p => !lstatSync(p).isSymbolicLink() });
        // Theia reads <root>/extension/package.json only beside a VSIX manifest
        // (plugin-vscode-directory-handler.js resolveFromVSIX), so the folder carries one.
        writeFileSync(join(tmp, 'extension.vsixmanifest'), vsixManifest(manifest));
        rmSync(join(userDir, id), { recursive: true, force: true });
        renameSync(tmp, join(userDir, id));
    } catch (err) {
        rmSync(tmp, { recursive: true, force: true });
        die(`bundled-extensions/${folder}: assembling ${id} failed -- ${err.message}`);
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    console.log(`${NAME}: ${id} (bundled) assembled`);
}
for (const name of readdirSync(userDir)) {
    if (!bundledIds.has(name)) rmSync(join(userDir, name), { recursive: true, force: true });
}

// I-2: a declared extension's undeclared dependencies would be fetched unpinned from
// Open VSX at sidecar start (Theia's plugin deployer resolves extensionDependencies and
// extensionPack members by id through the registry). Refuse them here instead: every
// dependency or pack id (compared case-insensitively as publisher.name) must itself be
// declared with its own pin. <dir>/extension/package.json is the vsix layout,
// <dir>/package/package.json the npm/local-tarball layout.
for (const d of declared) {
    const manifest = readManifestOf(d);
    if (!manifest) continue;
    const missing = [];
    for (const dep of [...(manifest.extensionDependencies ?? []), ...(manifest.extensionPack ?? [])]) {
        if (typeof dep !== 'string') continue;
        if (!declaredIds.has(dep.toLowerCase())) missing.push(dep);
    }
    if (missing.length > 0) {
        const ids = missing.length === 1 ? 'id' : 'ids';
        die(`${d.id} names undeclared ${ids} ${missing.join(', ')} in extensionDependencies or extensionPack -- `
            + `declare each with its own pin as an [[extensions]] entry in ${MANIFEST_NAME_HINT}`);
    }
}

function readManifestOf(d) {
    for (const rel of ['extension/package.json', 'package/package.json']) {
        try {
            return JSON.parse(readFileSync(join(d.dir, rel), 'utf8'));
        } catch { /* not this layout */ }
    }
    return null;
}
const MANIFEST_NAME_HINT = 'configuration.toml';

// node_modules/<name> and node_modules/@scope/<name>, recursing into nested node_modules.
function installedPackages(dir, prefix = 'node_modules') {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue;
        const names = name.startsWith('@') ? readdirSync(join(dir, name)).map(n => `${name}/${n}`) : [name];
        for (const n of names) {
            out.push(`${prefix}/${n}`, ...installedPackages(join(dir, n, 'node_modules'), `${prefix}/${n}/node_modules`));
        }
    }
    return out;
}

function vsixManifest(m) {
    const x = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${x(m.name)}" Version="${x(m.version)}" Publisher="${x(m.publisher)}" />
    <DisplayName>${x(m.displayName)}</DisplayName>
    <Description xml:space="preserve">${x(m.description)}</Description>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

function sha256Of(path) {
    try {
        return createHash('sha256').update(readFileSync(path)).digest('hex');
    } catch {
        return null;
    }
}

function pack(folder) {
    const out = mkdtempSync(join(tmpdir(), 'pb-pack-'));
    // None of the folder's scripts may run before its hash. --ignore-scripts stops prepack and
    // postpack, but npm 10's directory fetcher (pacote) runs `prepare` regardless, so the
    // script shell is `true`, which runs nothing. ponytail: POSIX `true`; on Windows a folder
    // with a prepare script fails the pack (fail-closed) until a no-op .cmd shell is added.
    const r = spawnSync('npm', ['pack', folder, '--ignore-scripts', '--script-shell', 'true', '--pack-destination', out], { encoding: 'utf8' });
    const file = r.status === 0 && readdirSync(out).find(n => n.endsWith('.tgz'));
    const bytes = file && readFileSync(join(out, file));
    rmSync(out, { recursive: true, force: true });
    if (!bytes) die(`npm pack ${folder} failed: ${r.stderr}`);
    return bytes;
}

async function fetchBytes({ id, url }) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`the server answered ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } catch (err) {
        die(`${id}: fetching ${url} failed -- ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`);
    }
}

function die(message) {
    console.error(`${NAME}: FAIL -- ${message}`);
    process.exit(1);
}
