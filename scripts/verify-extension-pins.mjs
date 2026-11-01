#!/usr/bin/env node
// scripts/verify-extension-pins.mjs
//
// The declared-extensions pin gate (04-02, EXT-01): every [[extensions]]
// entry in configuration.toml reaches the sidecar build as the exact bytes
// its pin names, and nothing else does.
//
// WHAT IT ASSERTS, in pipeline order. All three expectations are DERIVED at
// check time -- from the manifest through scripts/generate.mjs's own
// resolver and emitter -- never kept here, so a new entry is covered the
// day it is declared:
//
//  1. generated/theia-plugins.json parses and equals what the manifest
//     emits right now (missing/extra/drifted ids fail naming the id).
//  2. theia/applications/browser/package.json's theiaPlugins block equals
//     that same map (a manifest with entries and a stock package.json is
//     stale output, not a clean tree), every Open VSX block URL carries its
//     pinned version as a /<version>/ segment (rejects a latest-floating
//     URL even one faithfully copied from a drifted fragment), and a
//     manifest with NO entries carries NO block (removing the last entry
//     without removing the block would leave a stale download behind).
//  3. For each entry, the packed archive the build's download step keeps --
//     <pluginsDir>/<id>.vsix (.theia/.tar.gz by URL suffix; npm `.tgz`
//     tarballs and local-path packed references hash the `.tar.gz` slot) --
//     exists and its sha256 equals the manifest pin. A flipped byte, a
//     re-resolved float, or a never-downloaded tree all fail naming the
//     entry id. A local-path entry whose source folder is absent or
//     unpackable fails naming the entry id before any hash is taken.
//
// WHY PACKED ARCHIVES. Stock `theia download:plugins` in its default mode
// decompresses every archive into plugins/<id>/ directories, leaving no
// byte artifact a hash can be taken over. The build therefore downloads
// with --packed (wired in the application package.json's download:plugins
// script), which keeps plugins/<id>.vsix files -- the exact bytes the
// manifest pin is taken over. The plugins directory itself is derived from
// the application package.json's theiaPluginsDir key, falling back to
// 'plugins' exactly as the stock downloader does.
//
// WHY THE URL-SOURCE AND LOCAL-PATH ENTRIES SKIP THE VERSION-SEGMENT RULE.
// A verbatim URL has no version to segment-check, and a local-path reference
// names a packed sibling of the stated folder, not a versioned remote; both
// pins ARE their sha256 -- a floated URL's or a drifted folder's bytes will
// not hash to the pin, so the float still goes red, at step 3 instead of
// step 2. The npm kind keeps its own float guard below (the tarball-URL
// version suffix), because a re-resolved npm float IS version-shaped.
//
// ON A TREE WITH NO ENTRIES AND NO BLOCK, THIS ROW PASSES -- and still
// asserts something: it read the tracked package.json and proved the block
// absent, so a stale block left behind by a removed entry goes red. That is
// today's tree, and a gate red on it would be a gate its readers skip. A
// manifest WITH entries but no generated fragment fails (run the
// generator); entries with no plugins directory fail (run the download).
//
// Honestly --quick: it reads text files and archive bytes off disk only and
// emits its fixture into mkdtemp directories. No build, no browser, no
// display, no network.
//
// Usage:
//   node scripts/verify-extension-pins.mjs
//   node scripts/verify-extension-pins.mjs --self-test

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { emitTheiaPlugins, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-extension-pins';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/theia-plugins.json';
const APP_DIR_REL = 'theia/applications/browser';
const APP_PKG_REL = `${APP_DIR_REL}/package.json`;
const RERUN_GENERATE = 'node scripts/generate.mjs';

function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
    };
}

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

/**
 * The archive suffix stock download:plugins keeps in --packed mode, from
 * the entry's emitted URL -- the same three endings the downloader itself
 * switches on, in the same order, plus the registry tarball ending.
 *
 * An npm tarball URL ends in `.tgz` while the downloader keeps `--packed`
 * archives by the `.tar.gz` slot this gate hashes, so `.tgz` maps to
 * `.tar.gz` here: an npm entry hashes <pluginsDir>/<id>.tar.gz, exactly
 * like a direct-URL `.tar.gz` entry. The same mapping covers local-path
 * packed-archive references, which the resolver emits with the `.tgz`
 * ending for exactly this reason.
 */
function archiveSuffix(url) {
    if (url.endsWith('tar.gz')) return '.tar.gz';
    if (url.endsWith('.tgz')) return '.tar.gz';
    if (url.endsWith('vsix')) return '.vsix';
    if (url.endsWith('theia')) return '.theia';
    return null;
}

function sha256Hex(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function runChecks(root) {
    const r = makeReporter();

    // --- 0. the manifest resolves -----------------------------------------
    const { failures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (failures.length > 0) {
        for (const f of failures) r.fail(`${MANIFEST_REL} is red, so the pins prove nothing: ${f}`);
        return r;
    }
    const entries = config.extensions ?? [];
    const byId = new Map(entries.map(e => [e.id, e]));

    // The expectation both file comparisons below measure against: what the
    // manifest emits right now. Emitted in-process from the validated
    // config, so the emitter's own defence-in-depth guard cannot fire.
    const expected = JSON.parse(emitTheiaPlugins(config, { id: 'dev' }));

    // --- 1. the generated fragment -----------------------------------------
    const fragmentBytes = readBytes(root, FRAGMENT_REL);
    if (fragmentBytes === null) {
        if (entries.length > 0) {
            r.fail(
                `${FRAGMENT_REL} is absent but ${MANIFEST_REL} declares ${entries.length} [[extensions]] entr`
                + `${entries.length === 1 ? 'y' : 'ies'} (${entries.map(e => JSON.stringify(e.id)).join(', ')}). `
                + `The download map was never emitted. Next step: run ${RERUN_GENERATE}, then copy the theiaPlugins `
                + `block over as step 2 describes.`,
            );
        }
    } else {
        let fragment;
        try {
            fragment = JSON.parse(fragmentBytes.toString('utf8'));
        } catch {
            r.fail(
                `${FRAGMENT_REL} is not valid JSON, so it cannot be compared against ${MANIFEST_REL}. `
                + `Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`,
            );
            fragment = null;
        }
        if (fragment !== null) {
            for (const id of Object.keys(expected)) {
                if (!Object.hasOwn(fragment, id)) {
                    r.fail(
                        `${FRAGMENT_REL} is missing the [[extensions]] entry with id ${JSON.stringify(id)} -- stale output. `
                        + `Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                } else if (fragment[id] !== expected[id]) {
                    r.fail(
                        `${FRAGMENT_REL} carries ${JSON.stringify(fragment[id])} for the entry with id ${JSON.stringify(id)} `
                        + `but ${MANIFEST_REL} emits ${JSON.stringify(expected[id])} -- stale output. `
                        + `Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                }
            }
            for (const id of Object.keys(fragment ?? {})) {
                if (!Object.hasOwn(expected, id)) {
                    r.fail(
                        `${FRAGMENT_REL} carries an entry with id ${JSON.stringify(id)} that ${MANIFEST_REL} no longer declares -- `
                        + `stale output left behind by a removed entry. Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                }
            }
        }
    }

    // --- 2. the application package.json block ------------------------------
    const pkgBytes = readBytes(root, APP_PKG_REL);
    if (pkgBytes === null) {
        r.fail(`${APP_PKG_REL} does not exist, so the theiaPlugins block cannot be checked at all.`);
        return r;
    }
    let pkg;
    try {
        pkg = JSON.parse(pkgBytes.toString('utf8'));
    } catch {
        r.fail(`${APP_PKG_REL} is not valid JSON, so the theiaPlugins block cannot be checked at all.`);
        return r;
    }
    // Derived exactly as the stock downloader derives it: the
    // theiaPluginsDir key, falling back to 'plugins'.
    const pluginsDirRel = `${APP_DIR_REL}/${pkg.theiaPluginsDir || 'plugins'}`;
    const block = pkg.theiaPlugins;

    if (entries.length === 0) {
        if (block !== undefined) {
            r.fail(
                `${APP_PKG_REL} carries a theiaPlugins block (${Object.keys(block ?? {}).map(id => JSON.stringify(id)).join(', ')}) `
                + `but ${MANIFEST_REL} declares no [[extensions]] -- stale output left behind by a removed entry, and the build `
                + `would still download it. Next step: remove the theiaPlugins block, leaving every sibling key byte-identical.`,
            );
        }
        return r;
    }

    if (block === undefined || block === null || typeof block !== 'object') {
        r.fail(
            `${MANIFEST_REL} declares ${entries.length} [[extensions]] entr${entries.length === 1 ? 'y' : 'ies'} `
            + `(${entries.map(e => JSON.stringify(e.id)).join(', ')}) but ${APP_PKG_REL} carries no theiaPlugins block -- `
            + `stale output. Next step: copy the block from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical), `
            + `then re-run this check.`,
        );
    } else {
        for (const id of Object.keys(expected)) {
            if (!Object.hasOwn(block, id)) {
                r.fail(
                    `${APP_PKG_REL}'s theiaPlugins block is missing the [[extensions]] entry with id ${JSON.stringify(id)} -- `
                    + `stale output. Next step: copy the block from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical).`,
                );
            } else if (block[id] !== expected[id]) {
                r.fail(
                    `${APP_PKG_REL}'s theiaPlugins block carries ${JSON.stringify(block[id])} for the entry with id `
                    + `${JSON.stringify(id)} but ${MANIFEST_REL} emits ${JSON.stringify(expected[id])} -- stale output. `
                    + `Next step: copy the block from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical).`,
                );
            }
        }
        for (const id of Object.keys(block)) {
            if (!Object.hasOwn(expected, id)) {
                r.fail(
                    `${APP_PKG_REL}'s theiaPlugins block carries an entry with id ${JSON.stringify(id)} that ${MANIFEST_REL} no longer `
                    + `declares -- stale output left behind by a removed entry, and the build would still download it. `
                    + `Next step: copy the block from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical).`,
                );
            }
        }
        // The float guard: an Open VSX block URL must carry its pinned
        // version as a /<version>/ segment. A latest-floating URL -- even
        // one faithfully copied from a drifted fragment -- downloads
        // whatever is newest, which is the unpinned behavior EXT-01
        // forbids. (Direct-URL and local-path entries skip this rule: their
        // pin is their sha256, enforced at step 3.)
        for (const entry of entries) {
            if (entry.source !== 'openvsx' || typeof block[entry.id] !== 'string') continue;
            if (!block[entry.id].includes(`/${entry.version}/`)) {
                r.fail(
                    `${APP_PKG_REL}'s theiaPlugins URL for the entry with id ${JSON.stringify(entry.id)} is not version-pinned: `
                    + `${JSON.stringify(block[entry.id])} does not contain the pinned version ${JSON.stringify(entry.version)} as a `
                    + `/${entry.version}/ segment -- a latest-floating URL downloads whatever is newest. Next step: copy the block `
                    + `from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical).`,
                );
            }
        }
        // The npm float guard: an npm block URL must equal the recorded
        // tarball URL (block equality above already asserts this against the
        // fragment the pinned manifest emits) AND must end in the pinned
        // `-<version>.tgz` suffix. A latest-floating tarball URL -- even one
        // faithfully copied from a drifted fragment, so equality alone holds
        // -- fails the suffix, which is the control the hash alone cannot
        // give: a freshly re-resolved float hashes clean on first download.
        for (const entry of entries) {
            if (entry.source !== 'npm' || typeof block[entry.id] !== 'string') continue;
            if (!block[entry.id].endsWith(`-${entry.version}.tgz`)) {
                r.fail(
                    `${APP_PKG_REL}'s theiaPlugins URL for the entry with id ${JSON.stringify(entry.id)} is not version-pinned: `
                    + `${JSON.stringify(block[entry.id])} does not end in the pinned -${entry.version}.tgz tarball suffix -- `
                    + `a latest-floating URL downloads whatever is newest. Next step: copy the block `
                    + `from ${FRAGMENT_REL} (keys only; leave every sibling key byte-identical).`,
                );
            }
        }
    }

    // --- 3. the packed archives ----------------------------------------------
    if (!existsSync(join(root, pluginsDirRel))) {
        r.fail(
            `${entries.length} [[extensions]] entr${entries.length === 1 ? 'y is' : 'ies are'} declared but ${pluginsDirRel}/ does not exist -- `
            + `nothing was ever downloaded. Next step: run the build's download step (yarn --cwd theia download:plugins, via the theia dev shell), `
            + `then re-run this check.`,
        );
        return r;
    }
    for (const entry of entries) {
        // A local-path entry packs its stated folder at download time, so a
        // missing or unpackable folder fails HERE, naming the entry -- the
        // archive hash below would only say the download never happened,
        // which sends the reader to re-run a download that cannot succeed.
        // The pin still covers the PACKED bytes (the .tar.gz slot below),
        // never a raw directory listing.
        if (entry.source === 'local-path') {
            let packed = false;
            try {
                packed = statSync(join(root, entry.path ?? '')).isDirectory();
            } catch {
                packed = false;
            }
            if (!packed) {
                r.fail(
                    `the local-path source folder ${JSON.stringify(entry.path)} for the [[extensions]] entry with id `
                    + `${JSON.stringify(entry.id)} is absent or unpackable -- nothing can be packed from it. Next step: `
                    + `restore the folder under ${MANIFEST_REL}'s stated path, or correct the path, then run the build's `
                    + `download step (yarn --cwd theia download:plugins, via the theia dev shell).`,
                );
                continue;
            }
        }
        const suffix = archiveSuffix(expected[entry.id] ?? '');
        if (suffix === null) {
            r.fail(
                `the emitted URL for the entry with id ${JSON.stringify(entry.id)} ends in no downloadable archive type, so no packed `
                + `artifact can be named for it. Next step: report this; ${MANIFEST_REL} is not the cause and editing it will not help.`,
            );
            continue;
        }
        const rel = `${pluginsDirRel}/${entry.id}${suffix}`;
        const bytes = readBytes(root, rel);
        if (bytes === null) {
            r.fail(
                `${rel} is missing for the [[extensions]] entry with id ${JSON.stringify(entry.id)} -- not downloaded. `
                + `Next step: run the build's download step (yarn --cwd theia download:plugins, via the theia dev shell), then re-run this check.`,
            );
            continue;
        }
        const actual = sha256Hex(bytes);
        if (actual !== entry.sha256) {
            r.fail(
                `${rel} hashes to ${actual} but ${MANIFEST_REL} pins ${entry.sha256} for the entry with id ${JSON.stringify(entry.id)} -- `
                + `the bytes drifted (corrupted download, or the remote re-resolved a float). Next step: delete ${rel}, re-run the download step, `
                + `and if it stays red, re-bootstrap the pin (fetch the archive, sha256sum it, paste the digest into ${MANIFEST_REL}).`,
            );
        }
    }

    return r;
}

// --- --self-test ------------------------------------------------------------

function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), 'extension-pins-selftest-'));
    let ok = true;
    try {
        // A fully synthetic fixture: no network, no real extensions. Four
        // entries (one per source), packed archives of random bytes whose
        // pins are computed over those exact bytes, a fragment and a
        // package.json block both emitted from the resolved manifest, and
        // the local-path source folder the absence plant removes.
        const bytesA = randomBytes(64);
        const bytesB = randomBytes(64);
        const bytesC = randomBytes(64);
        const bytesD = randomBytes(64);
        const pinA = sha256Hex(bytesA);
        const pinB = sha256Hex(bytesB);
        const pinC = sha256Hex(bytesC);
        const pinD = sha256Hex(bytesD);
        const manifest = [
            '[product]',
            'revision = 1',
            'vendor_machine = "AcmeWorks"',
            'vendor_display = "Acme Works"',
            '',
            '[identity]',
            'display_name = "Acme Browser"',
            'app_basename = "acme-browser"',
            'binary_name = "acme-browser"',
            'remoting_name = "acme-browser"',
            'distribution_id = "org.acmeworks"',
            '',
            '[legal]',
            'license = "MIT"',
            'copyright_holder = "Acme Works"',
            'trademark_notice = "Acme Browser is a trademark of Acme Works."',
            '',
            '[upstreams]',
            'firefox_esr_tag = "ACME_1_2_3esr_RELEASE"',
            'theia_release = "0.0.0"',
            '',
            '[[variants]]',
            'id = "dev"',
            'name_suffix = " Dev"',
            'branding_dir = "powerbrowser/branding/dev"',
            'objdir = "objdir"',
            '',
            '[[variants]]',
            'id = "release"',
            'name_suffix = ""',
            'branding_dir = "powerbrowser/branding/release"',
            'objdir = "objdir-release"',
            '',
            '[[extensions]]',
            'id = "acme.gadget"',
            'source = "openvsx"',
            'version = "1.2.3"',
            `sha256 = "${pinA}"`,
            '',
            '[[extensions]]',
            'id = "acme.widget"',
            'source = "url"',
            'url = "https://example.org/acme-widget-2.0.0.vsix"',
            `sha256 = "${pinB}"`,
            '',
            '[[extensions]]',
            'id = "acme.npmpack"',
            'source = "npm"',
            'version = "2.4.1"',
            `integrity = "sha512-${'E'.repeat(86)}"`,
            `sha256 = "${pinC}"`,
            '',
            '[[extensions]]',
            'id = "acme.localtool"',
            'source = "local-path"',
            'path = "extensions/acme-local"',
            `sha256 = "${pinD}"`,
            '',
        ].join('\n');
        writeFileSync(join(dir, MANIFEST_REL), manifest, 'utf8');

        const { failures, config } = resolveConfig(join(dir, MANIFEST_REL), undefined);
        if (failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the synthetic fixture manifest is already red, so a red result after the plant would prove nothing:`);
            for (const f of failures) console.error(`  - ${f}`);
            ok = false;
        }
        const fragment = JSON.parse(emitTheiaPlugins(config, { id: 'dev' }));
        const appPkg = { private: true, name: 'fixture-app', theiaPlugins: fragment };
        const appPkgPath = join(dir, APP_PKG_REL);
        const fragmentPath = join(dir, FRAGMENT_REL);
        const pluginsRel = `${APP_DIR_REL}/plugins`;
        const localSrcRel = 'extensions/acme-local';
        const vsixA = join(dir, `${pluginsRel}/acme.gadget.vsix`);
        const vsixB = join(dir, `${pluginsRel}/acme.widget.vsix`);
        const tgzC = join(dir, `${pluginsRel}/acme.npmpack.tar.gz`);
        const tgzD = join(dir, `${pluginsRel}/acme.localtool.tar.gz`);
        const writeFixture = () => {
            mkdirSync(join(dir, 'generated'), { recursive: true });
            mkdirSync(join(dir, APP_DIR_REL), { recursive: true });
            mkdirSync(join(dir, pluginsRel), { recursive: true });
            mkdirSync(join(dir, localSrcRel), { recursive: true });
            writeFileSync(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
            writeFileSync(appPkgPath, `${JSON.stringify(appPkg, null, 2)}\n`, 'utf8');
            writeFileSync(vsixA, bytesA);
            writeFileSync(vsixB, bytesB);
            writeFileSync(tgzC, bytesC);
            writeFileSync(tgzD, bytesD);
            writeFileSync(
                join(dir, localSrcRel, 'package.json'),
                `${JSON.stringify({ name: 'acme-local', version: '0.0.0' }, null, 2)}\n`,
                'utf8',
            );
        };
        writeFixture();

        // Control: the unmutated fixture must be GREEN. Without this, a red
        // result after a plant below could be fixture-shaped rather than
        // plant-caused.
        const control = runChecks(dir);
        if (control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmutated fixture is already red, so a red result after the plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        }

        // Plant 1: one flipped byte in a downloaded archive. The pin check
        // must go red NAMING the entry -- a red that only says a hash
        // disagrees would not tell anyone which download to delete.
        const bad = Buffer.from(bytesA);
        bad[bad.length - 1] ^= 0xff;
        writeFileSync(vsixA, bad);
        const corrupted = runChecks(dir);
        const corruptedMsg = corrupted.failures.find(
            f => f.includes('acme.gadget') && f.includes('hashes to'),
        );
        if (!corruptedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a corrupted byte in acme.gadget.vsix was NOT rejected naming the entry and both digests`);
            for (const f of corrupted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- corrupted one byte in acme.gadget.vsix and it was REJECTED naming the entry: ${corruptedMsg}`);
        }
        writeFixture();

        // Plant 2: a latest-floating URL in BOTH the fragment and the block,
        // so block-equality still holds and only the version-segment rule
        // can go red. Proves the float guard is not the equality check
        // wearing a second message.
        const floating = 'https://open-vsx.org/api/acme/gadget/latest/file/acme.gadget-latest.vsix';
        const floatingFragment = { ...fragment, 'acme.gadget': floating };
        writeFileSync(fragmentPath, `${JSON.stringify(floatingFragment, null, 2)}\n`, 'utf8');
        const pkgRaw = JSON.parse(readFileSync(appPkgPath, 'utf8'));
        pkgRaw.theiaPlugins['acme.gadget'] = floating;
        writeFileSync(appPkgPath, `${JSON.stringify(pkgRaw, null, 2)}\n`, 'utf8');
        const unpinned = runChecks(dir);
        const unpinnedMsg = unpinned.failures.find(
            f => f.includes('acme.gadget') && f.includes('version-pinned'),
        );
        if (!unpinnedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a latest-floating URL for acme.gadget was NOT rejected by the version-segment rule`);
            for (const f of unpinned.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- floated the acme.gadget URL to latest and it was REJECTED by the version-segment rule: ${unpinnedMsg}`);
        }
        writeFixture();

        // Plant 3: block drift -- the block resolves the entry to a
        // well-formed but WRONG version while the fragment stays pinned.
        // The block-equality rule must go red NAMING the entry; a red that
        // only says something disagrees would not tell anyone which side to
        // copy from.
        const driftedRaw = JSON.parse(readFileSync(appPkgPath, 'utf8'));
        driftedRaw.theiaPlugins['acme.gadget'] = 'https://open-vsx.org/api/acme/gadget/9.9.9/file/acme.gadget-9.9.9.vsix';
        writeFileSync(appPkgPath, `${JSON.stringify(driftedRaw, null, 2)}\n`, 'utf8');
        const drifted = runChecks(dir);
        const driftedMsg = drifted.failures.find(
            f => f.includes('acme.gadget') && f.includes('theiaPlugins block carries'),
        );
        if (!driftedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a drifted theiaPlugins block for acme.gadget was NOT rejected naming the entry and both URLs`);
            for (const f of drifted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- drifted the block URL for acme.gadget and it was REJECTED naming the entry: ${driftedMsg}`);
        }
        writeFixture();

        // Plant 4: an npm tarball URL floated to latest in BOTH the fragment
        // and the block, so block-equality still holds and only the npm
        // version-suffix rule can go red. Proves the npm float guard is not
        // the equality check wearing a second message -- a freshly
        // re-resolved float would hash clean on first download, so without
        // this rule the float would pass everywhere.
        const npmFloating = 'https://registry.npmjs.org/acme.npmpack/-/acme.npmpack-latest.tgz';
        const npmFloatingFragment = { ...fragment, 'acme.npmpack': npmFloating };
        writeFileSync(fragmentPath, `${JSON.stringify(npmFloatingFragment, null, 2)}\n`, 'utf8');
        const npmPkgRaw = JSON.parse(readFileSync(appPkgPath, 'utf8'));
        npmPkgRaw.theiaPlugins['acme.npmpack'] = npmFloating;
        writeFileSync(appPkgPath, `${JSON.stringify(npmPkgRaw, null, 2)}\n`, 'utf8');
        const npmUnpinned = runChecks(dir);
        const npmUnpinnedMsg = npmUnpinned.failures.find(
            f => f.includes('acme.npmpack') && f.includes('version-pinned'),
        );
        if (!npmUnpinnedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a latest-floating tarball URL for acme.npmpack was NOT rejected by the npm version-suffix rule`);
            for (const f of npmUnpinned.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- floated the acme.npmpack tarball URL to latest and it was REJECTED by the npm version-suffix rule: ${npmUnpinnedMsg}`);
        }
        writeFixture();

        // Plant 5: the local-path source folder removed. The absence check
        // must go red NAMING the entry -- the archive hash below would only
        // say the download never happened, which sends the reader to re-run
        // a download that cannot succeed without the folder.
        rmSync(join(dir, localSrcRel), { recursive: true, force: true });
        const localAbsent = runChecks(dir);
        const localAbsentMsg = localAbsent.failures.find(
            f => f.includes('acme.localtool') && f.includes('absent or unpackable'),
        );
        if (!localAbsentMsg) {
            console.error(`${NAME}: --self-test FAIL -- a removed local-path source folder for acme.localtool was NOT rejected naming the entry`);
            for (const f of localAbsent.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- removed the acme.localtool source folder and it was REJECTED naming the entry: ${localAbsentMsg}`);
        }
        writeFixture();

        // Plant 6: one flipped byte in the npm packed archive. The pin check
        // must go red NAMING the entry -- this is the plant that proves the
        // `.tgz`-to-`.tar.gz` suffix mapping above actually routes the npm
        // entry to a hashed slot, rather than the entry passing vacuously
        // with no archive ever read.
        const badNpm = Buffer.from(bytesC);
        badNpm[badNpm.length - 1] ^= 0xff;
        writeFileSync(tgzC, badNpm);
        const npmCorrupted = runChecks(dir);
        const npmCorruptedMsg = npmCorrupted.failures.find(
            f => f.includes('acme.npmpack') && f.includes('hashes to'),
        );
        if (!npmCorruptedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a corrupted byte in acme.npmpack.tar.gz was NOT rejected naming the entry and both digests`);
            for (const f of npmCorrupted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- corrupted one byte in acme.npmpack.tar.gz and it was REJECTED naming the entry: ${npmCorruptedMsg}`);
        }
        writeFixture();

        // Plant 7: npm block drift -- the block resolves the entry to a
        // well-formed but WRONG pinned version while the fragment stays at
        // the manifest pin. The block-equality rule must go red NAMING the
        // entry and both URLs: this is the tarball-URL equality half of the
        // npm control, complementing plant 4's suffix half.
        const npmDriftedRaw = JSON.parse(readFileSync(appPkgPath, 'utf8'));
        npmDriftedRaw.theiaPlugins['acme.npmpack'] = 'https://registry.npmjs.org/acme.npmpack/-/acme.npmpack-9.9.9.tgz';
        writeFileSync(appPkgPath, `${JSON.stringify(npmDriftedRaw, null, 2)}\n`, 'utf8');
        const npmDrifted = runChecks(dir);
        const npmDriftedMsg = npmDrifted.failures.find(
            f => f.includes('acme.npmpack') && f.includes('theiaPlugins block carries'),
        );
        if (!npmDriftedMsg) {
            console.error(`${NAME}: --self-test FAIL -- a drifted theiaPlugins block for acme.npmpack was NOT rejected naming the entry and both URLs`);
            for (const f of npmDrifted.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- drifted the block URL for acme.npmpack and it was REJECTED naming the entry: ${npmDriftedMsg}`);
        }
        writeFixture();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    if (!ok) {
        console.error(`${NAME}: --self-test FAIL`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS`);
    process.exit(0);
}

if (SELF_TEST) selfTest();

const result = runChecks(REPO_ROOT);
if (result.failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${result.failures.length} extension pin(s) disagree with ${MANIFEST_REL}`);
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- every declared extension resolves to its pinned bytes, or nothing is declared and no block exists`);
process.exit(0);
