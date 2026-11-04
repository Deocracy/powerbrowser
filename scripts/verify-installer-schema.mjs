#!/usr/bin/env node
// scripts/verify-installer-schema.mjs
//
// The installer-fragment gate: the NSIS defines, MSIX fields, macOS bundle
// fields and tile manifest the generator emits under generated/ are present
// and schema-complete.
//
// WHY IT EXISTS. The byte-identity gate proves each emitted file equals its
// hand-written counterpart -- but the eight installer fragments have no
// hand-written originals, so no per-file comparison can see a dropped
// !define, a malformed XML document, or a BackgroundColor line that defies
// the manifest's tile_color state. This script derives the fragment set from
// the generator's frozen TARGETS table at check time and compares as set
// equality in both directions; asserts each branding.nsi carries all six
// !define names with non-empty values; asserts each AppxManifest fragment is
// tag-balanced XML carrying DisplayName, Description and Identity Name;
// asserts each Info-plist fragment carries CFBundleName and
// CFBundleIdentifier; and asserts each tile manifest is tag-balanced XML
// whose BackgroundColor presence matches the manifest's tile_color
// set-or-unset state read from the checked root's configuration.toml at
// check time.
//
// WHAT THIS DOES NOT ASSERT. Schema-complete only -- never build-verified.
// No Windows host compiles the NSIS defines, no MSIX packager signs the
// fields, no macOS host reads the plist or the tile manifest in v1. Those
// builds land with the packaging hosts under v2 PKG-01, and any success
// copy, label or message here claiming more would mislead the release
// decision (GEN-03). The PASS line below says schema-complete and nothing
// else, for exactly that reason.
//
// WHY THE FRAGMENT SHAPES ARE WRITTEN DOWN HERE. The four path shapes, the
// six !define names and the required XML elements restate the contract
// scripts/generate.mjs builds to -- they do not derive it, because this
// script reads the bytes on disk: the writer's assertion and this one share
// the contract, not the code path, so one cannot pass by agreeing with
// itself. (The same split the icon-output checker keeps for its sizes.)
//
// ON A TREE WITH NO generated/branding/ AND NO generated/installer/, THIS
// ROW SKIPS AND PASSES, for the same reason generate --check does:
// generated/ is git-ignored, so that is the state of every fresh clone, and
// a tree that has never generated cannot disagree with itself. A PRESENT
// tree that yields no installer fragments at all is a defect and fails --
// an empty derived set proves nothing either way.
//
// Honestly --quick: it reads text files off disk only and emits its fixture
// into mkdtemp directories. No build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-installer-schema.mjs
//   node scripts/verify-installer-schema.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { TARGETS, resolveConfig } from './generate.mjs';
import { parse } from './lib/toml.cjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-installer-schema';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

// --- assertion plumbing ------------------------------------------------------
//
// Failures accumulate rather than throwing: one run should report every wrong
// fragment, not just the first. A single missing define and seven right ones
// is a typo in an emitter; eight missing files is a generate that never ran.
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

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

/** The five installer-fragment shapes, one per emitter, per variant. */
const FRAGMENT_SHAPES = Object.freeze([
    /^installer\/[^/]+\/app\.tag$/,
    /^branding\/[^/]+\/branding\.nsi$/,
    /^branding\/[^/]+\/firefox\.VisualElementsManifest\.xml$/,
    /^installer\/[^/]+\/AppxManifest-fields\.xml$/,
    /^installer\/[^/]+\/Info-plist-fields\.xml$/,
]);

function isInstallerFragment(rel) {
    return FRAGMENT_SHAPES.some(re => re.test(rel));
}

/** The six NSIS defines the emitter owns, in file order. */
const NSI_DEFINES = Object.freeze([
    'BrandFullNameInternal',
    'BrandFullName',
    'CompanyName',
    'URLInfoAbout',
    'HelpLink',
    'Channel',
]);

// --- the checks --------------------------------------------------------------

/**
 * The fragment set the generator declares, derived from the frozen TARGETS
 * table -- never hand-kept here, so adding an emitter row adds it to this
 * check with no edit.
 */
function expectedFragments() {
    return TARGETS.filter(t => isInstallerFragment(t.generated)).map(t => t.generated).sort();
}

/** The fragment set on disk under `root`/generated, as TARGETS-style paths. */
function actualFragments(root) {
    const out = [];
    for (const top of ['branding', 'installer']) {
        const dir = join(root, 'generated', top);
        if (!existsSync(dir)) continue;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const variantDir = join(dir, entry.name);
            for (const file of readdirSync(variantDir, { withFileTypes: true })) {
                if (!file.isFile()) continue;
                const rel = `${top}/${entry.name}/${file.name}`;
                if (isInstallerFragment(rel)) out.push(rel);
            }
        }
    }
    return out.sort();
}

/**
 * Tag-balance over one XML fragment: every opening tag matched, in order,
 * by its closer; self-closing tags and comments skipped. This is a
 * well-formedness assertion, not a schema validation against the MSIX or
 * plist grammars -- those grammars belong to the foreign packagers, and
 * claiming conformance to them here would be the build-verified claim this
 * script exists not to make.
 */
function xmlTagFailures(text, rel) {
    const failures = [];
    if (text.trim() === '') {
        failures.push(`${rel} is empty, so no installer document was asserted either way. Next step: run: node scripts/generate.mjs`);
        return failures;
    }
    const stack = [];
    const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>/g;
    let m;
    while ((m = tagRe.exec(text)) !== null) {
        const tok = m[0];
        if (tok.startsWith('<!--') || tok.startsWith('<?')) continue;
        const name = (tok.match(/^<\/?\s*([A-Za-z_][\w:.-]*)/) || [])[1];
        if (name === undefined) {
            failures.push(`${rel} carries a tag that opens no element: ${JSON.stringify(tok)}. Next step: run: node scripts/generate.mjs`);
            continue;
        }
        if (tok.startsWith('</')) {
            const open = stack.pop();
            if (open === undefined) {
                failures.push(`${rel} closes <${name}> with nothing open. Next step: run: node scripts/generate.mjs`);
            } else if (open !== name) {
                failures.push(`${rel} closes <${name}> while <${open}> is still open. Next step: run: node scripts/generate.mjs`);
            }
        } else if (!/\/\s*>$/.test(tok)) {
            stack.push(name);
        }
    }
    for (const open of stack) {
        failures.push(`${rel} leaves <${open}> unclosed. Next step: run: node scripts/generate.mjs`);
    }
    return failures;
}

/** The text of the first <name>...</name> element, or undefined. */
function elementText(text, name) {
    const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1] : undefined;
}

/** One NSIS fragment: all six defines present with non-empty values. */
function checkNsi(r, root, rel) {
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const defines = new Map();
    for (const line of bytes.toString('utf8').split('\n')) {
        const m = line.match(/^!define\s+([A-Za-z0-9_]+)\s+"(.*)"\s*$/);
        if (m) defines.set(m[1], m[2]);
    }
    for (const name of NSI_DEFINES) {
        const value = defines.get(name);
        if (value === undefined || value === '') {
            r.fail(
                `${rel}: !define ${name} is ${value === undefined ? 'absent' : 'empty'} `
                + `(expected a line '!define ${name} "..."' carrying a non-empty value). `
                + 'Next step: run: node scripts/generate.mjs',
            );
        }
    }
}

/**
 * One 7z self-extractor config (54-09, owner ruling R3): exactly upstream's
 * app.tag lines, with Title carrying the variant's display name. Both sides are
 * derived at check time: the name through the generator's own resolveConfig,
 * the other lines from the pinned upstream/browser/installer/windows/app.tag.
 */
function checkAppTag(r, root, rel) {
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const upstreamRel = 'upstream/browser/installer/windows/app.tag';
    const upstream = readBytes(REPO_ROOT, upstreamRel);
    if (upstream === null) {
        r.fail(`${upstreamRel} is absent, so ${rel} has nothing to be compared with. Next step: run: bash scripts/fetch-upstream.sh`);
        return;
    }
    const resolved = resolveConfig(join(root, 'configuration.toml'), undefined);
    const variantId = rel.split('/')[2];
    const variant = resolved.failures.length === 0 ? resolved.config.variants.find(v => v.id === variantId) : undefined;
    if (!variant) {
        r.fail(`${rel}: configuration.toml does not resolve a '${variantId}' variant, so the expected Title is unknown. Next step: fix the manifest, then run: node scripts/generate.mjs`);
        return;
    }
    const expected = upstream.toString('utf8').replace(/\n$/, '').split('\n');
    if (expected.filter(l => l.startsWith('Title=')).length !== 1) {
        r.fail(`${upstreamRel} no longer carries exactly one Title= line, so the emitter's template is stale. Next step: update emitAppTag in scripts/generate.mjs to the new upstream layout`);
        return;
    }
    const title = `Title="${resolved.config.identity.display_name}${variant.name_suffix}"`;
    const want = expected.map(l => (l.startsWith('Title=') ? title : l));
    const got = bytes.toString('utf8').replace(/\n$/, '').split('\n');
    for (let i = 0; i < Math.max(want.length, got.length); i++) {
        if (want[i] !== got[i]) {
            r.fail(`${rel}: line ${i + 1} is ${JSON.stringify(got[i] ?? '(missing)')}, expected ${JSON.stringify(want[i] ?? '(none)')} (${upstreamRel} with the Title from configuration.toml). Next step: run: node scripts/generate.mjs`);
            return;
        }
    }
}

/** One MSIX fragment: balanced tags plus DisplayName, Description, Identity Name. */
function checkAppx(r, root, rel) {
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const text = bytes.toString('utf8');
    r.failures.push(...xmlTagFailures(text, rel));
    for (const name of ['DisplayName', 'Description']) {
        const value = elementText(text, name);
        if (value === undefined || value === '') {
            r.fail(`${rel} carries no non-empty <${name}> element. Next step: run: node scripts/generate.mjs`);
        }
    }
    const identity = (text.match(/<Identity\b[^>]*\bName="([^"]*)"/) || [])[1];
    if (identity === undefined || identity === '') {
        r.fail(`${rel} carries no non-empty Identity Name attribute. Next step: run: node scripts/generate.mjs`);
    }
}

/** One macOS bundle fragment: CFBundleName and CFBundleIdentifier, non-empty. */
function checkInfoPlist(r, root, rel) {
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const text = bytes.toString('utf8');
    r.failures.push(...xmlTagFailures(text, rel));
    for (const name of ['CFBundleName', 'CFBundleIdentifier']) {
        const value = elementText(text, name);
        if (value === undefined || value === '') {
            r.fail(`${rel} carries no non-empty <${name}> element. Next step: run: node scripts/generate.mjs`);
        }
    }
}

/**
 * One tile manifest: balanced tags, and BackgroundColor present exactly when
 * the manifest states installer.tile_color -- read from configuration.toml
 * at check time, so a manifest edit without a regenerate goes red here
 * rather than shipping a stale tile.
 */
function checkTile(r, root, rel, tileColor) {
    const bytes = readBytes(root, rel);
    if (bytes === null) {
        r.fail(`${rel} is absent on disk. Next step: run: node scripts/generate.mjs`);
        return;
    }
    const text = bytes.toString('utf8');
    r.failures.push(...xmlTagFailures(text, rel));
    const found = (text.match(/BackgroundColor="([^"]*)"/) || [])[1];
    if (tileColor === undefined) {
        if (found !== undefined) {
            r.fail(
                `${rel} carries BackgroundColor=${JSON.stringify(found)} but configuration.toml leaves `
                + 'installer.tile_color unset, so the line must be omitted. Next step: run: node scripts/generate.mjs',
            );
        }
    } else {
        r.eq('tile BackgroundColor', found ?? '(absent)', tileColor, rel);
    }
}

/** installer.tile_color as stated, or undefined when unset -- read at check time under the passed root, so a fixture manifest disagreeing with its own tile XML is checked against itself, never the live tree. */
function readTileColor(root) {
    const manifest = parse(readFileSync(join(root, 'configuration.toml'), 'utf8'));
    const value = manifest.installer?.tile_color;
    return (typeof value === 'string' && value.trim() !== '') ? value : undefined;
}

function runChecks(root) {
    const brandingRoot = join(root, 'generated', 'branding');
    const installerRoot = join(root, 'generated', 'installer');
    // NOT A FAILURE. generated/ is git-ignored, so a fresh clone starts
    // without it -- and a gate red for "never generated" is a gate its
    // readers learn to skip, the failure mode generate --check's own SKIP
    // exists to avoid. A PRESENT tree that yields no fragments is a defect
    // and fails below.
    if (!existsSync(brandingRoot) && !existsSync(installerRoot)) return { skipped: true, failures: [] };

    const r = makeReporter();
    const expected = expectedFragments();

    // Non-vacuity: a comparison whose declared set is empty agrees with
    // anything at all, so it must fail as broken instrumentation rather than
    // report a clean diff of nothing against nothing.
    if (expected.length === 0) {
        r.fail(
            'no TARGETS row declares an installer fragment, so this comparison proves nothing either way. '
            + 'Next step: report this; configuration.toml is not the cause and editing it will not help.',
        );
        return { skipped: false, failures: r.failures };
    }

    const actual = actualFragments(root);

    // Non-vacuity, second half: a present tree yielding no fragments at all
    // would otherwise pass on absence rows alone without ever reading a
    // single define.
    if (actual.length === 0) {
        r.fail(
            'generated/ holds no installer fragments at all, so no define, element or tile state was asserted either way. '
            + 'Next step: run: node scripts/generate.mjs',
        );
        return { skipped: false, failures: r.failures };
    }

    // The set comparison runs in BOTH directions. A per-file loop alone sees
    // a file that is missing or wrong but is blind to one that should no
    // longer be there at all, so an emitter deleted later would leave its
    // output behind forever with nothing to notice.
    const onDisk = new Set(actual);
    const declared = new Set(expected);
    for (const rel of expected) {
        if (!onDisk.has(rel)) {
            r.fail(`generated/${rel} is declared by a TARGETS row in scripts/generate.mjs but is absent on disk. Next step: run: node scripts/generate.mjs`);
        }
    }
    for (const rel of actual) {
        if (!declared.has(rel)) {
            r.fail(`generated/${rel} is on disk but no TARGETS row in scripts/generate.mjs declares it. Next step: delete it, or move it out of generated/ if it was meant to be kept.`);
        }
    }

    // Reported and read paths keep the `generated/` prefix: that prefix
    // names the output surface a reader has to go and fix, matching the
    // convention generate --check's own messages keep.
    const tileColor = readTileColor(root);
    for (const rel of actual) {
        if (!declared.has(rel)) continue;
        const show = `generated/${rel}`;
        if (rel.endsWith('/branding.nsi')) checkNsi(r, root, show);
        else if (rel.endsWith('/AppxManifest-fields.xml')) checkAppx(r, root, show);
        else if (rel.endsWith('/Info-plist-fields.xml')) checkInfoPlist(r, root, show);
        else if (rel.endsWith('/app.tag')) checkAppTag(r, root, show);
        else if (rel.endsWith('/firefox.VisualElementsManifest.xml')) checkTile(r, root, show, tileColor);
    }

    return { skipped: false, failures: r.failures };
}

// --- --self-test ---------------------------------------------------------------
//
// Mirrors the real installer fragments into mkdtemp by copying the generated
// files -- never the live tree, which the plants below must not touch --
// asserts the unmutated control is green first, then plants one mutation per
// case and requires red naming the file and both values.
function selfTest() {
    const live = join(REPO_ROOT, 'generated');
    if (!existsSync(join(live, 'branding')) && !existsSync(join(live, 'installer'))) {
        console.error(`${NAME}: --self-test FAIL -- generated/branding/ and generated/installer/ are both absent, so there is nothing to mirror; run: node scripts/generate.mjs`);
        process.exit(1);
    }

    const dir = mkdtempSync(join(tmpdir(), 'verify-installer-schema-selftest-'));
    let ok = true;
    try {
        const mirror = () => {
            for (const rel of expectedFragments()) {
                const out = join(dir, 'generated', rel);
                mkdirSync(dirname(out), { recursive: true });
                writeFileSync(out, readFileSync(join(REPO_ROOT, 'generated', rel)));
            }
            // WR-07: the tile check reads the manifest under the passed
            // root, so the mirror carries the manifest the fragments were
            // generated from -- plants below diverge the two sides
            // deliberately, and restoring them is one mirror() call.
            writeFileSync(join(dir, 'configuration.toml'), readFileSync(join(REPO_ROOT, 'configuration.toml')));
        };
        mirror();

        // Control: the unmutated mirror must be GREEN. Without this, a
        // self-test that plants a mutation and sees red proves nothing --
        // the fixture might be red for an unrelated reason and the plant
        // irrelevant.
        const control = runChecks(dir);
        if (control.skipped || control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmutated fixture is already red, so a red result after the plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unmutated installer set is GREEN`);
        }

        // Plant 1: a dropped !define -- the presence assertion exists to
        // catch exactly this. The HelpLink line is removed from the dev
        // branding.nsi.
        const nsiRel = 'generated/branding/dev/branding.nsi';
        const nsiPath = join(dir, nsiRel);
        const nsiLines = readFileSync(nsiPath, 'utf8').split('\n').filter(line => !line.startsWith('!define HelpLink'));
        writeFileSync(nsiPath, nsiLines.join('\n'));
        const dropped = runChecks(dir);
        const droppedMsg = dropped.failures.find(f => f.includes(nsiRel) && f.includes('HelpLink'));
        if (!droppedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the dropped !define (${nsiRel}) was NOT rejected naming the file and the define`);
            for (const f of dropped.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- dropped !define HelpLink from ${nsiRel} and it was REJECTED naming the file and the define: ${droppedMsg}`);
        }
        mirror();

        // Plant 2: malformed XML -- the well-formedness assertion has to name
        // the file and the element left open. The DisplayName closer is
        // removed from the dev AppxManifest fragment.
        const appxRel = 'generated/installer/dev/AppxManifest-fields.xml';
        const appxPath = join(dir, appxRel);
        writeFileSync(appxPath, readFileSync(appxPath, 'utf8').replace('</DisplayName>', ''));
        const malformed = runChecks(dir);
        const malformedMsg = malformed.failures.find(f => f.includes(appxRel) && f.includes('DisplayName'));
        if (!malformedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the malformed document (${appxRel}) was NOT rejected naming the file and the element`);
            for (const f of malformed.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- broke a tag in ${appxRel} and it was REJECTED naming the file and the element: ${malformedMsg}`);
        }
        mirror();

        // Plants 2b and 2c (54-09): the stock upstream title, and a dropped
        // RunProgram line, in the dev self-extractor config. Each must go red
        // naming the file and the line.
        const tagRel = 'generated/installer/dev/app.tag';
        const tagPath = join(dir, tagRel);
        for (const [label, mutate, needle] of [
            ['the stock Mozilla Firefox title', t => t.replace(/^Title=.*$/m, 'Title="Mozilla Firefox"'), 'Title='],
            ['a dropped RunProgram line', t => t.replace(/^RunProgram=.*\n/m, ''), 'RunProgram'],
        ]) {
            writeFileSync(tagPath, mutate(readFileSync(tagPath, 'utf8')));
            const res = runChecks(dir);
            const msg = res.failures.find(f => f.includes(tagRel) && f.includes(needle));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- ${label} in ${tagRel} was NOT rejected naming the file and ${needle}`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- planted ${label} in ${tagRel} and it was REJECTED naming the file: ${msg}`);
            }
            mirror();
        }

        // Plant 3: tile-color state mismatch -- the presence assertion must
        // track the manifest, not the file. The plant takes the OPPOSITE of
        // whatever configuration.toml states, so it stays a mismatch however
        // a future manifest sets the key.
        const tileRel = 'generated/branding/dev/firefox.VisualElementsManifest.xml';
        const tilePath = join(dir, tileRel);
        const stated = readTileColor(dir);
        if (stated === undefined) {
            writeFileSync(tilePath, readFileSync(tilePath, 'utf8').replace(' />', '\n      BackgroundColor="#123abc"\n />'));
        } else {
            writeFileSync(tilePath, readFileSync(tilePath, 'utf8').split('\n').filter(line => !line.includes('BackgroundColor')).join('\n'));
        }
        const mismatched = runChecks(dir);
        const mismatchedMsg = mismatched.failures.find(f => f.includes(tileRel) && f.includes('BackgroundColor'));
        if (!mismatchedMsg) {
            console.error(`${NAME}: --self-test FAIL -- the tile-color mismatch (${tileRel}) was NOT rejected naming the file and the state`);
            for (const f of mismatched.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- flipped the tile-color state in ${tileRel} and it was REJECTED naming the file and the state: ${mismatchedMsg}`);
        }
        mirror();

        // Plant 4: divergent-manifest tile states in BOTH polarities -- the
        // WR-07 hole itself. readTileColor used to read the live manifest,
        // so a fixture manifest disagreeing with its own tile XML was
        // checked against the wrong file and could pass either way. Each
        // polarity must go red naming the file and the state.
        const manifestPath = join(dir, 'configuration.toml');
        const manifestOriginal = readFileSync(manifestPath, 'utf8');
        const manifestWithoutTile = manifestOriginal.split('\n').filter((line) => !line.trim().startsWith('tile_color')).join('\n');
        const manifestWithTile = manifestWithoutTile.replace(/^(\[installer\])$/m, '$1\ntile_color = "#123abc"');
        if (!manifestWithTile.includes('tile_color = "#123abc"')) {
            console.error(`${NAME}: --self-test FAIL -- the divergent-manifest plant did not land: no [installer] section to carry tile_color`);
            ok = false;
        } else {
            const tileText = readFileSync(tilePath, 'utf8');
            const tileWithout = tileText.split('\n').filter((line) => !line.includes('BackgroundColor')).join('\n');
            const tileWith = tileWithout.replace(' />', '\n      BackgroundColor="#123abc"\n />');
            if (!tileWith.includes('BackgroundColor="#123abc"')) {
                console.error(`${NAME}: --self-test FAIL -- the divergent-manifest plant did not land: no self-closing tag to carry BackgroundColor`);
                ok = false;
            } else {
                // Polarity one: manifest WITH tile_color facing XML WITHOUT it.
                writeFileSync(manifestPath, manifestWithTile);
                writeFileSync(tilePath, tileWithout);
                const setVsAbsent = runChecks(dir);
                const setVsAbsentMsg = setVsAbsent.failures.find(f => f.includes(tileRel) && f.includes('BackgroundColor'));
                if (!setVsAbsentMsg) {
                    console.error(`${NAME}: --self-test FAIL -- the tile_color-set manifest facing tile XML without BackgroundColor (${tileRel}) was NOT rejected naming the file and the state`);
                    for (const f of setVsAbsent.failures) console.error(`  - ${f}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- set tile_color against tile XML without BackgroundColor in ${tileRel} and it was REJECTED naming the file and the state: ${setVsAbsentMsg}`);
                }
                // Polarity two: manifest WITHOUT tile_color facing XML WITH it.
                writeFileSync(manifestPath, manifestWithoutTile);
                writeFileSync(tilePath, tileWith);
                const unsetVsPresent = runChecks(dir);
                const unsetVsPresentMsg = unsetVsPresent.failures.find(f => f.includes(tileRel) && f.includes('BackgroundColor'));
                if (!unsetVsPresentMsg) {
                    console.error(`${NAME}: --self-test FAIL -- the tile_color-unset manifest facing tile XML with BackgroundColor (${tileRel}) was NOT rejected naming the file and the state`);
                    for (const f of unsetVsPresent.failures) console.error(`  - ${f}`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- unset tile_color against tile XML with BackgroundColor in ${tileRel} and it was REJECTED naming the file and the state: ${unsetVsPresentMsg}`);
                }
            }
        }
        mirror();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    if (!ok) {
        console.error(`${NAME}: --self-test FAIL`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then 6 planted faults all behaved as pinned`);
    process.exit(0);
}

if (SELF_TEST) selfTest();

const result = runChecks(REPO_ROOT);
if (result.skipped) {
    console.log(`${NAME}: SKIP -- generated/branding/ and generated/installer/ are both absent, so there is nothing to compare.`);
    console.log('  The generated/ folder is not stored with the project, so a fresh copy of it starts out without one. This is not a mismatch.');
    console.log('  To generate it, run: node scripts/generate.mjs');
    process.exit(0);
}
if (result.failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${result.failures.length} installer problem(s) under generated/`);
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- every installer fragment is present and schema-complete`);
process.exit(0);
