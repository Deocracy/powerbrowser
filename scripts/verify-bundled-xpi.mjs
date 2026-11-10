#!/usr/bin/env node
// scripts/verify-bundled-xpi.mjs
//
// The pre-installed Gecko add-on gate (68-08, BEXT-02, P68-39). uBlock Origin ships as
// <GreD>/distribution/extensions/<id>.xpi, the AMO-signed file byte for byte, pinned by version,
// url and sha256 in powerbrowser/packaging/bundled-xpi.json and staged by
// powerbrowser/packaging/stage-bundled-xpi.sh. Gecko installs it into the profile on first start
// with no network; the user can disable it and remove it, and a removal sticks
// (extensions.installedDistroAddon.<id>). There is no ExtensionSettings policy entry, because its
// install modes forbid removal.
//
// MODES AND TIERS.
//   (default, quick)  The pin file's shape: every id a valid Gecko add-on id, an https url, a
//                     64-hex sha256, an SPDX licence id and an https source. For each pin whose
//                     download is cached at .mozbuild/bundled-xpi/<id>-<version>.xpi: its sha256
//                     equals the pin, its manifest id and version equal the pin, and it is signed
//                     (META-INF/mozilla.rsa or META-INF/cose.sig). No cached XPI is one SKIP line.
//   --packaged (full) The extracted Linux package's distribution/extensions/ holds exactly the
//                     pinned ids as <id>.xpi, each hashing to its pin.
//
// Usage:
//   node scripts/verify-bundled-xpi.mjs [--packaged]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-bundled-xpi';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN_REL = 'powerbrowser/packaging/bundled-xpi.json';
const CACHE_REL = '.mozbuild/bundled-xpi';
const STAGE_CMD = 'bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>';
// upstream/toolkit/mozapps/extensions/internal/XPIProvider.sys.mjs gIDTest: the ids Gecko accepts.
const GECKO_ID = /^(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9-._]*@[a-z0-9-._]+)$/i;
const SPDX_ID = /^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](\+)?$/;
const SIGNATURES = ['META-INF/mozilla.rsa', 'META-INF/cose.sig'];

// ---------------------------------------------------------------- XPI reading
// No unzip on every host; python3's zipfile is the house reader (verify-ng-072, -073).
const PY_ZIP = `import sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
if sys.argv[2]=='--list': print('\\n'.join(z.namelist()))
else: sys.stdout.buffer.write(z.read(sys.argv[2]))`;
const zipNames = xpi => execFileSync('python3', ['-I', '-c', PY_ZIP, xpi, '--list'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n').filter(Boolean);
const zipText = (xpi, member) => execFileSync('python3', ['-I', '-c', PY_ZIP, xpi, member], { encoding: 'utf8', maxBuffer: 1 << 28 });
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

function readPins(path = join(REPO_ROOT, PIN_REL)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$')));
}
const cachedXpi = (id, pin, root = REPO_ROOT) => join(root, CACHE_REL, `${id}-${pin.version}.xpi`);

// ---------------------------------------------------------------- static legs

/** The pin file's shape. */
function checkPins(pins) {
    const out = [];
    if (Object.keys(pins).length === 0) out.push(`${PIN_REL} pins no add-on`);
    for (const [id, p] of Object.entries(pins)) {
        if (!GECKO_ID.test(id)) out.push(`${id}: not a valid Gecko add-on id`);
        for (const key of ['name', 'version', 'url', 'sha256', 'licence', 'source']) {
            if (typeof p[key] !== 'string' || !p[key]) out.push(`${id}: the pin has no ${key}`);
        }
        if (typeof p.url === 'string' && !p.url.startsWith('https://')) out.push(`${id}: the url is not https: ${p.url}`);
        if (typeof p.source === 'string' && !p.source.startsWith('https://')) out.push(`${id}: the source is not https: ${p.source}`);
        if (typeof p.sha256 === 'string' && !/^[0-9a-f]{64}$/.test(p.sha256)) out.push(`${id}: the sha256 is not 64 lowercase hex digits`);
        if (typeof p.licence === 'string' && !SPDX_ID.test(p.licence)) out.push(`${id}: the licence ${p.licence} is not an SPDX id`);
    }
    return out;
}

/** One cached XPI against its pin: digest, manifest id and version, signature present. */
function checkXpi(id, pin, xpi) {
    const out = [];
    const got = sha256(xpi);
    if (got !== pin.sha256) {
        out.push(`${id}: sha256 mismatch: ${xpi} hashes to ${got}, the pin is ${pin.sha256}`);
        return out;
    }
    const names = new Set(zipNames(xpi));
    const manifest = JSON.parse(zipText(xpi, 'manifest.json'));
    const mid = manifest.browser_specific_settings?.gecko?.id ?? manifest.applications?.gecko?.id;
    if (mid !== id) out.push(`${id}: wrong manifest id: the XPI's manifest names ${mid}`);
    if (manifest.version !== pin.version) out.push(`${id}: the XPI's manifest version ${manifest.version} is not the pinned ${pin.version}`);
    if (!SIGNATURES.some(s => names.has(s))) out.push(`${id}: missing signature: the XPI has neither ${SIGNATURES.join(' nor ')}`);
    return out;
}

/** A packaged distribution/extensions/ directory against the pins, as a set both ways. */
function checkPackagedDir(dir, pins) {
    if (!existsSync(dir)) return [`the package has no ${dir.split('/').slice(-2).join('/')}/ directory`];
    const out = [];
    const want = new Set(Object.keys(pins).map(id => `${id}.xpi`));
    const have = readdirSync(dir);
    for (const f of have) if (!want.has(f)) out.push(`the packaged distribution/extensions/ carries ${f}, which no pin names`);
    for (const f of want) {
        if (!have.includes(f)) { out.push(`the packaged distribution/extensions/ lacks ${f}`); continue; }
        const id = f.slice(0, -'.xpi'.length);
        const got = sha256(join(dir, f));
        if (got !== pins[id].sha256) out.push(`the packaged ${f} hashes to ${got}, the pin is ${pins[id].sha256}`);
    }
    return out;
}

function staticLeg(root = REPO_ROOT) {
    const pins = readPins(join(root, PIN_REL));
    const failures = checkPins(pins);
    const skips = [];
    const notes = [];
    for (const [id, pin] of Object.entries(pins)) {
        const xpi = cachedXpi(id, pin, root);
        if (!existsSync(xpi)) {
            skips.push(`${id}: no cached ${CACHE_REL}/${id}-${pin.version}.xpi, so its digest, manifest and signature legs were not run (run ${STAGE_CMD})`);
            continue;
        }
        failures.push(...checkXpi(id, pin, xpi));
        notes.push(`${id} ${pin.version}`);
    }
    return { failures, skips, notes };
}

async function packagedLeg() {
    const { extractPackage } = await import('./lib/built-tree.mjs');
    let prefix;
    try {
        prefix = extractPackage();
        return checkPackagedDir(join(prefix, 'distribution', 'extensions'), readPins());
    } catch (e) {
        return [`no Linux package to check (${e.message}); build it per docs/BUILD.md "Linux package": nix develop .#firefox --command bash powerbrowser/packaging/package-linux.sh`];
    } finally {
        if (prefix) rmSync(dirname(prefix), { recursive: true, force: true });
    }
}

function report(label, failures, skips = [], pass = '') {
    for (const s of skips) console.log(`${label}: SKIP -- ${s}`);
    if (failures.length) {
        console.error(`${label}: FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`${label}: PASS -- ${pass}`);
    process.exit(0);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    const r = staticLeg();
    report(NAME, r.failures, r.skips, `the pins are well formed${r.notes.length ? `; cached, signed and equal to the pin: ${r.notes.join(', ')}` : ''}`);
} else if (args.length === 1 && args[0] === '--packaged') {
    report(`${NAME} --packaged`, await packagedLeg(), [], 'the package\'s distribution/extensions/ holds exactly the pinned XPIs, each equal to its pin');
} else {
    console.error(`usage: node scripts/verify-bundled-xpi.mjs [--packaged]  (unknown argument: ${args.join(' ')})`);
    process.exit(2);
}
