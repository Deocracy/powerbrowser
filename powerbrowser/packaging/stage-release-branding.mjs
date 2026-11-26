#!/usr/bin/env node
// powerbrowser/packaging/stage-release-branding.mjs -- give a staged Theia sidecar the release
// variant's branding values (PKG-05).
//
//   node powerbrowser/packaging/stage-release-branding.mjs THEIA_STAGE
//
// Why this exists. theia/applications/browser/package.json is a tracked file whose
// powerbrowserBranding block is the generator's DEV-variant emission (generate.mjs runs
// emitTheiaBranding on the dev variant; verify-theia-branding pins the tracked block to it). `yarn
// build` compiles that block into lib/frontend/bundle.js, which is where the About dialog reads it
// at run time, and the branding extension compiles the same dev sentence in as its fallback. One
// sidecar build serves the dev tree and the package, so a package staged from it showed the dev
// variant's Mozilla non-association sentence in the release About dialog (first release package,
// 2026-11-26: the packaged-identity row was red on the staged package.json).
//
// What it does, on the staged copy only (the checkout is never written):
//   1. derives the dev and the release emission of emitTheiaBranding from configuration.toml and
//      pairs every string value that differs between them (today: the one sentence that carries the
//      variant's name_suffix). A differing value that is not a string, or a key present in one
//      emission only, is a failure naming the key: this script substitutes text and nothing else.
//   2. requires THEIA_STAGE/package.json to carry exactly the dev or the release emission as its
//      powerbrowserBranding block, and writes the release emission there.
//   3. replaces each dev-only string with its release counterpart in every file under
//      THEIA_STAGE/lib. The strings sit in the bundle as string literals, so each must be free of
//      quote, backslash and control characters (then its literal text equals its value); one that is
//      not fails naming it.
//   4. fails unless lib/frontend/bundle.js carried the release strings afterwards, and unless no
//      file under THEIA_STAGE carries a dev-only string.
//
// Idempotent: a stage that already carries the release emission is left byte-identical.
// Called by package-linux.sh after it stages theia/lib and theia/package.json. The packaged-identity
// row is the verdict on the package; it derives the same two emissions independently.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitTheiaBranding, resolveConfig } from '../../scripts/generate.mjs';

const NAME = 'stage-release-branding';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = (msg) => {
    console.error(`${NAME}: FAIL -- ${msg}`);
    process.exit(1);
};

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.error('usage: node powerbrowser/packaging/stage-release-branding.mjs THEIA_STAGE');
    process.exit(2);
}
const stage = resolve(args[0]);

const { failures, config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
if (failures.length > 0) fail(`configuration.toml does not pass its own checks: ${failures.join(' | ')}`);
const variant = (id) => config.variants.find((v) => v.id === id) ?? fail(`configuration.toml declares no build variant with id ${JSON.stringify(id)}`);
const dev = JSON.parse(emitTheiaBranding(config, variant('dev')));
const release = JSON.parse(emitTheiaBranding(config, variant('release')));

/** Every [devString, releaseString] pair that differs between the two emissions, by key path. */
function differingStrings(a, b, path, out) {
    if (a === b) return out;
    if (typeof a === 'string' && typeof b === 'string') {
        out.push([a, b, path]);
        return out;
    }
    const container = (v) => v !== null && typeof v === 'object';
    if (!container(a) || !container(b) || Array.isArray(a) !== Array.isArray(b)) {
        fail(`${path} differs between the dev and the release emission and is not a string in both; this script substitutes strings only`);
    }
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k) => !Object.hasOwn(b, k))) {
        fail(`${path} has different keys in the dev and the release emission (${JSON.stringify(ka)} vs ${JSON.stringify(kb)}); this script substitutes strings only`);
    }
    for (const k of ka) differingStrings(a[k], b[k], `${path}.${k}`, out);
    return out;
}
const pairs = differingStrings(dev, release, 'powerbrowserBranding', []);
for (const [from, to, path] of pairs) {
    for (const s of [from, to]) {
        if (s === '' || JSON.stringify(s).slice(1, -1) !== s || s.includes("'") || s.includes('`')) {
            fail(`${path} value ${JSON.stringify(s)} is empty or carries a quote, backslash or control character, so its text in the bundle is not its value; build the sidecar with the release block instead`);
        }
    }
    if (to.includes(from)) fail(`${path}: the release value ${JSON.stringify(to)} contains the dev value ${JSON.stringify(from)}, so the dev value cannot be told from it in a file`);
}

// 2. the staged package.json block.
const pkgPath = join(stage, 'package.json');
let pkgText;
try {
    pkgText = readFileSync(pkgPath, 'utf8');
} catch (err) {
    fail(`${pkgPath} is unreadable (${err.message}); stage the sidecar's package.json first`);
}
const pkg = JSON.parse(pkgText);
const frontendConfig = pkg?.theia?.frontend?.config;
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
if (!frontendConfig || !Object.hasOwn(frontendConfig, 'powerbrowserBranding')) fail(`${pkgPath} carries no theia.frontend.config.powerbrowserBranding block`);
if (same(frontendConfig.powerbrowserBranding, dev)) {
    frontendConfig.powerbrowserBranding = release;
    // The tracked file is two-space JSON with a final newline; the staged copy keeps that form.
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
} else if (!same(frontendConfig.powerbrowserBranding, release)) {
    fail(`${pkgPath} powerbrowserBranding is neither the dev nor the release emission of configuration.toml; run node scripts/generate.mjs, copy the block from generated/theia-branding.json into theia/applications/browser/package.json and rebuild the sidecar`);
}

// 3. the built files.
function files(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) files(p, out);
        else if (e.isFile()) out.push(p);
    }
    return out;
}
const libDir = join(stage, 'lib');
try {
    if (!statSync(libDir).isDirectory()) throw new Error('not a directory');
} catch (err) {
    fail(`${libDir} is absent (${err.message}); stage the sidecar's lib/ first`);
}
let rewritten = 0;
for (const p of files(libDir)) {
    const before = readFileSync(p);
    if (!pairs.some(([from]) => before.includes(from))) continue;
    let text = before.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(before)) fail(`${relative(stage, p)} carries a dev-variant branding string and is not UTF-8 text; it cannot be rewritten`);
    for (const [from, to] of pairs) text = text.split(from).join(to);
    writeFileSync(p, text);
    rewritten += 1;
}

// 4. the result.
const bundlePath = join(libDir, 'frontend', 'bundle.js');
let bundle;
try {
    bundle = readFileSync(bundlePath);
} catch (err) {
    fail(`${bundlePath} is unreadable (${err.message}); the frontend bundle is where the About dialog reads the branding block`);
}
for (const [, to, path] of pairs) {
    if (!bundle.includes(to)) fail(`lib/frontend/bundle.js does not carry the release value of ${path} (${JSON.stringify(to)}); the bundle no longer holds the branding block as text, so build the sidecar with the release block instead`);
}
for (const p of files(stage)) {
    const bytes = readFileSync(p);
    for (const [from, , path] of pairs) {
        if (bytes.includes(from)) fail(`${relative(stage, p)} still carries the dev value of ${path} (${JSON.stringify(from)})`);
    }
}
console.log(`${NAME}: ${stage} carries the release branding (${pairs.length} variant-dependent string(s), ${rewritten} built file(s) rewritten)`);
