#!/usr/bin/env node
// scripts/generate.mjs
//
// THE generator. It reads configuration.toml, checks it, and writes the derived
// build surfaces under generated/. It is the only thing in this tree that turns
// a brand setting into a build artifact (CFG-01).
//
// WHAT IT COVERS. Fifty-three targets: thirty-three byte-identical to the
// file Phase 1 wrote by hand -- the five Phase 2 build surfaces (the two
// branding configure.sh files, .mozconfig, and the two .desktop files), the
// eighteen GEN-01 branding-directory surfaces (per variant: brand.ftl,
// brand.properties, moz.build, content/jar.mn, content/moz.build,
// locales/jar.mn, locales/moz.build, content/aboutDialog.css and
// pref/firefox-branding.js), and the ten GEN-02 icon rasters (per variant:
// default16/32/48/64/128.png, drawn from the single brand/mark.svg through
// the system inkscape) -- plus the four GEN-02 containers (per variant:
// firefox.ico and firefox.icns, wrapped from those same rasters by pure-Node
// writers) and the eight GEN-03 installer fields (per variant:
// branding.nsi, firefox.VisualElementsManifest.xml, installer
// AppxManifest-fields.xml and Info-plist-fields.xml), plus the GEN-01
// identity carrier (generated/identity.configure: the vendor/UA lines plus
// the two fixed telemetry-policy lines patch 010 used to hard-code,
// pulled in by its include hook), plus
// the GEN-05 Theia frontend-config fragment
// (generated/theia-frontend-config.json: the brand-owned upstream keys of
// the application package.json's theia.frontend.config block --
// applicationName and defaultTheme), plus the GEN-05 Theia branding
// fragment (generated/theia-branding.json: the powerbrowserBranding key of
// that same block -- welcome/about texts, the in-app repo URL, the mark
// SVG, and the three About-dialog legal notices (06-04)), plus the TEL-01/TEL-02 telemetry fragment
// (generated/theia-telemetry.json: the powerbrowserTelemetry key of that
// same block -- level and endpoint), plus the TEL-03 endpoint-hosts
// fragment (generated/endpoint-hosts.json: the sorted hosts of the
// manifest telemetry endpoint, the [urls] values and the support URL),
// plus the EXT-01 declared-extensions map
// (generated/theia-plugins.json: the application package.json's theiaPlugins
// block, one exact download URL per [[extensions]] entry -- a versioned
// Open VSX file URL for source = "openvsx", the stated URL verbatim for
// source = "url"), plus the EXT-03 WebExtensions declaration
// (generated/webextensions-settings.json: the distribution policies.json's
// ExtensionSettings key, one force/normal install entry per
// [[webextensions]] declaration -- the add-on id, its installation mode,
// and its self-hosted install URL), plus the UPD-01 pin fragment
// (generated/upstream-pins.env: the [upstreams] tag as one shell
// assignment, sourced by scripts/fetch-upstream.sh as its default).
// That byte-identity IS
// the acceptance test for the thirty-three,
// which is why no emitter here is allowed to reformat, reorder or "tidy" what
// it reproduces; the four containers, the eight installer fragments and the
// identity carrier have no hand-written originals and are structurally
// checked instead.
//
// WHY THE PIPELINE ORDER IS LOAD-BEARING. Parse, then reject unknown settings,
// then mask, then merge, then validate, then emit, then write -- in that order
// and no other:
//
//  * Unknown-setting rejection runs BEFORE anything is merged or assigned. A
//    merge over an unchecked document assigns by computed key, and a reserved
//    key name reaches the prototype chain that way. Rejecting first means such
//    a name never reaches an assignment at all.
//  * Masking runs BEFORE the merge and on the defaults layer OBJECT, never on
//    the merged result. The two orderings agree on the wholly-absent case and
//    disagree on the PARTIAL case -- a downstream that sets some identity keys
//    and omits others -- and the partial case is the one that actually ships.
//  * Unknown-setting rejection also runs before the required-setting check, so
//    a misspelled section header is reported as the misspelling it is, rather
//    than as five separate complaints about the correctly-spelled settings it
//    shadowed.
//  * Nothing is written under generated/ until every check has passed. A failed
//    run leaves the output tree exactly as it found it.
//
// TWO COPY RULES THIS FILE OBEYS BY CONSTRUCTION (D-11, and CLAUDE.md's
// user-facing copy section). First, the parser's own error text is never
// printed: it embeds a caret diagram and parser vocabulary, so the caught error
// is re-emitted from its structured line and column fields alone. Second, every
// failure line names a setting by the dotted path a reader can find in
// configuration.toml, states the rule in plain words, and ends with a real next
// step. No stack trace, no internal variable name, no host path.
//
// ENCODING. The unset test is a plain JS code-unit trim and comparisons are
// byte-level over UTF-8. No Unicode normalisation is applied anywhere in this
// file: two values differing only in normalisation form are different values,
// and silently folding them would make a rebrand that looks right produce bytes
// that are not.
//
// The repo root is derived from this file's own location, never from the
// working directory -- scripts/verify-platform.sh invokes every check with
// absolute paths. The desktop-entry emitter carries a placeholder token in
// place of that root (see emitDesktopEntry): no emitted byte may depend on
// where this checkout happens to live.
//
// Usage:
//   node scripts/generate.mjs
//   node scripts/generate.mjs --check
//   node scripts/generate.mjs --self-test
//   node scripts/generate.mjs --out <dir>    (write the tree under <dir>, not generated/)

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, TomlError } from './lib/toml.cjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'generate';

const MANIFEST_NAME = 'configuration.toml';
const MANIFEST_PATH = join(REPO_ROOT, MANIFEST_NAME);
const SCHEMA_PATH = join(REPO_ROOT, 'scripts/lib/config-schema.json');
const OUTPUT_ROOT = join(REPO_ROOT, 'generated');
const RERUN = 'node scripts/generate.mjs';

// --- argument handling ------------------------------------------------------

const args = process.argv.slice(2);

/**
 * True only when this file is the process entry point.
 *
 * WHY IT EXISTS (02-05). scripts/verify-generated-identity.mjs imports the
 * frozen target table and the resolver from here rather than restating either,
 * which is the whole reason that check can go red on an emitter being ADDED.
 * Without this guard, that import would run the CLI as a side effect: it would
 * write generated/ during a check that promises to write nothing, it would
 * reject the IMPORTER's arguments as if they were the generator's, and its
 * process.exit(0) would end the check before it asserted anything -- a check
 * that exits green having run none of its own body.
 *
 * The comparison is between resolved absolute paths, not between argv[1] and a
 * name, so a relative invocation and an absolute one agree.
 *
 * BOTH SIDES ARE REALPATHED, and that is not belt and braces. `resolve`
 * normalises a path but does not follow a symlink, while import.meta.url has
 * ALREADY been realpath-resolved by Node. Compared with only one side resolved,
 * any symlinked invocation -- bin/generate -> ../scripts/generate.mjs, a nix
 * develop shim, a node_modules/.bin entry -- made the two differ, so main()
 * never ran, nothing was written, and the process exited 0. A CI step or a
 * Makefile target wired that way reported success having generated nothing,
 * and generate-check then called the tree stale for a reason nobody could
 * locate.
 *
 * Wrapped, returning false, because realpathSync throws on a path that is not
 * there and a nonexistent argv[1] must not take the process down.
 */
function isEntryPoint() {
    if (process.argv[1] === undefined) return false;
    try {
        return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

const IS_MAIN = isEntryPoint();

// The argument check lives INSIDE the main guard for the same reason the two
// flag dispatches do: an importer's own flags are not this file's, and
// rejecting them here would make `verify-generated-identity.mjs --self-test`
// die at import time complaining about an argument the generator never saw.
//
// Returns the --out folder, or undefined. --out is a flag and never an env
// var: an inherited variable could silently redirect generate-check (PLAT-04).
function rejectUnknownArguments() {
    let out;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--out') {
            const value = args[i + 1];
            if (value === undefined || value === '' || value.startsWith('--')) {
                console.error(`${NAME}: FAIL -- --out needs the folder to write the generated files into. Next step: run: ${RERUN} --out <folder>`);
                process.exit(1);
            }
            // Inside the project, --out would overwrite tracked files such as the root .mozconfig.
            const rel = relative(REPO_ROOT, resolve(process.cwd(), value));
            if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
                console.error(`${NAME}: FAIL -- --out must name a folder outside this project, because the generated files would overwrite files the project tracks. Next step: run: ${RERUN} --out <folder outside the project>`);
                process.exit(1);
            }
            out = value;
            i++;
        } else if (a !== '--check' && a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            process.exit(1);
        }
    }
    if (out !== undefined && (args.includes('--check') || args.includes('--self-test'))) {
        console.error(`${NAME}: FAIL -- --out cannot be combined with --check or --self-test, because those always read the generated folder of this project. Next step: run the two separately.`);
        process.exit(1);
    }
    return out;
}
// Both flags are dispatched at the BOTTOM of this file, not here. --check has
// to echo the applied defaults on its way past (D-08), and --self-test has to
// run the same pipeline the default invocation runs; neither can act before
// that pipeline is defined.

// --- the schema, and the names refused outright -----------------------------

/**
 * Names that never reach an assignment, refused by name as well as by the
 * schema. The schema alone would already reject them, but a rejection that
 * rests on one list is a rejection that a future edit to that list can remove.
 */
const RESERVED_NAMES = Object.freeze(['__proto__', 'constructor', 'prototype']);

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const SCHEMA_KEYS = Object.freeze(schema.keys);

/** The section header a reader opens to fix a setting at this dotted path. */
function sectionOf(path) {
    return `[${path.split('.')[0].replace('[]', '')}]`;
}

/** The bare setting name, without its section prefix. */
function settingOf(path) {
    return path.split('.').pop();
}

// --- 1. parse ---------------------------------------------------------------

/**
 * Parse ONE layer. The path is a parameter rather than a constant because the
 * pipeline takes two layers -- the repo-root manifest, and a downstream
 * manifest that overlays it. The downstream path arrives two ways: main()
 * passes the PB_CONFIG_DIR manifest when that variable names a folder
 * (CFG-05, 07-01), and --self-test passes per-case fixtures. The downstream
 * parameter is therefore NOT dead code awaiting a
 * caller: it is the merge's only Phase-2 coverage, and deleting it would
 * delete the merge's tests along with it.
 */
// IN-07: TOML `1.0` and `1` both parse to the number 1, so an integer setting written with a
// decimal point is visible only to a second parse that returns integers as BigInt. Maps each
// loaded layer to the integer-typed paths it writes that way; resolveConfig refuses them.
const DECIMAL_INTEGERS = new WeakMap();

function loadLayer(path) {
    let text;
    try {
        text = readFileSync(path, 'utf8');
    } catch {
        console.error(`${NAME}: FAIL -- ${MANIFEST_NAME} was not found at the top of the project.`);
        console.error(`  ${MANIFEST_NAME} holds every brand setting and the project cannot be generated without it.`);
        console.error(`  Next step: restore ${MANIFEST_NAME} at the top of the project, then run: ${RERUN}`);
        process.exit(1);
    }
    try {
        const layer = parse(text);
        const probe = parse(text, { integersAsBigInt: true });
        DECIMAL_INTEGERS.set(layer, Object.keys(SCHEMA_KEYS).filter(k => SCHEMA_KEYS[k].type === 'integer'
            && typeof readPath(probe, k) === 'number' && Number.isInteger(readPath(probe, k))));
        return layer;
    } catch (err) {
        if (!(err instanceof TomlError)) throw err;
        // Only the structured line and column are used. The caught error's own
        // text carries a caret diagram and parser vocabulary and is never shown.
        const at = `line ${err.line}, column ${err.column}`;
        console.error(`${NAME}: FAIL -- ${MANIFEST_NAME} could not be read as a settings file (${at}).`);
        console.error('  A setting is written as a name, an equals sign, and a value in double quotes, all on one line, like this: display_name = "PowerBrowser"');
        console.error('  A section header is written as the section name in square brackets, alone on its own line, like this: [identity]');
        console.error(`  Next step: open ${MANIFEST_NAME}, correct line ${err.line}, then run: ${RERUN}`);
        process.exit(1);
    }
}

// --- 2. reject unknown settings, before anything is merged ------------------

/**
 * A TOML table: an object that is neither an array nor a date. The parser
 * returns dates as a Date subclass, which is why that case is excluded by name
 * rather than by shape -- a date has own properties of its own and descending
 * into one would invent settings nobody wrote.
 */
function isTable(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && !(value instanceof Date);
}

/**
 * Flatten the document to dotted leaf paths. An element of an array of tables
 * contributes an empty-bracket segment, so every element of `[[variants]]`
 * folds onto the single schema path `variants[].id` and friends.
 */
function collectLeaves(node, prefix, leaves, refused) {
    for (const key of Object.keys(node)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (RESERVED_NAMES.includes(key)) {
            refused.push(path);
            continue;
        }
        const value = node[key];
        if (Array.isArray(value) && value.every(isTable) && value.length > 0) {
            for (const element of value) collectLeaves(element, `${path}[]`, leaves, refused);
        } else if (isTable(value)) {
            collectLeaves(value, path, leaves, refused);
        } else {
            leaves.push({ path, value });
        }
    }
}

function rejectUnknown(leaves, refused) {
    const failures = [];
    for (const path of refused) {
        failures.push(
            `unknown setting '${path}' -- that name is reserved by the settings reader and is refused outright. `
            + `Remove it from ${MANIFEST_NAME}, then run: ${RERUN}`,
        );
    }
    for (const { path, value } of leaves) {
        if (Object.hasOwn(SCHEMA_KEYS, path)) continue;
        // EXT-01 (04-02). An explicitly emptied array of tables is not an
        // unknown setting: `extensions = []` is how a downstream restates the
        // list without its entries (D-07 array-replace), and collectLeaves
        // has no element to fold onto an `extensions[].*` schema path, so the
        // bare path is all it can report. The schema's `extensions[].*` keys
        // are what prove the bare path names a declared array of tables --
        // derived, not a second list.
        if (Array.isArray(value) && value.length === 0
            && Object.keys(SCHEMA_KEYS).some(k => k.startsWith(`${path}[].`))) continue;
        failures.push(
            `unknown setting '${path}' -- ${MANIFEST_NAME} has no setting by that name. `
            + `Check the spelling of the setting and of the section header above it, then run: ${RERUN}`,
        );
    }
    return failures;
}

// --- 3. mask the defaults layer, then merge the downstream layer over it ----

/**
 * Every dotted path the schema marks required. This list is DERIVED from the
 * schema's `required` flag and is not a second list: D-06's "one schema table
 * consumed by both the masker and the validator" is satisfied by reading that
 * flag, and a required key added to the schema is masked the moment it is
 * added, with no edit here.
 *
 * An array is a leaf to the masker exactly as it is to the merge, so no
 * `variants[]` path is consulted here even though all four are now required.
 * That is deliberate and it is not the same question. The mask decides whether
 * a downstream may INHERIT a setting; the required check decides whether a
 * section a downstream DID write is complete. A downstream that states no
 * [[variants]] at all inherits this project's two, which is the intended
 * fallback -- a variant is a build arrangement, not an identity. A downstream
 * that states one and leaves out its objdir is incomplete, and that is what
 * validateVariantElements refuses.
 */
function requiredPathsOf(schemaKeys) {
    return Object.entries(schemaKeys).filter(([, spec]) => spec.required).map(([path]) => path);
}

/**
 * Copy a layer keeping only the leaves whose required-ness matches `keepRequired`.
 * Tables that end up empty are dropped rather than left as empty sections, so a
 * masked layer has no `identity` key at all rather than an `identity` holding
 * nothing -- an empty table would still merge, and would still be a table the
 * downstream's own table has to win against.
 */
function projectLayer(layer, prefix, required, keepRequired) {
    const out = Object.create(null);
    for (const key of Object.keys(layer)) {
        if (RESERVED_NAMES.includes(key)) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        const value = layer[key];
        if (isTable(value)) {
            const sub = projectLayer(value, path, required, keepRequired);
            if (Object.keys(sub).length > 0) out[key] = sub;
        } else if (required.includes(path) === keepRequired) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * D-06. Strip every schema-required key path out of the defaults layer, so no
 * downstream can inherit one.
 *
 * WHAT THIS PREVENTS. Without it, "the repo-root manifest IS the defaults
 * layer" means a downstream that omits [identity] silently ships under Power
 * Browser's mark, and one that omits [legal] silently ships Power Browser's
 * copyright holder and trademark notice. Removal is per key path and not per
 * table, so omitting three keys out of five behaves exactly like omitting the
 * whole table.
 *
 * The call site passes the defaults layer OBJECT and appears before the
 * mergeLayers call. Moving it after the merge would still catch a wholly
 * absent table and would silently stop catching the partial case.
 */
function maskDefaults(defaultsLayer, schemaKeys) {
    return projectLayer(defaultsLayer, '', requiredPathsOf(schemaKeys), false);
}

/**
 * The complement of the mask: the required keys alone.
 *
 * WHY POWER BROWSER IS ITS OWN DOWNSTREAM. Phase 2 has no second manifest, but
 * the merge must still have exactly one code path rather than a fast path and a
 * real one. So the root manifest is split along the mask line: its optional
 * keys are the defaults layer, its required keys are the downstream layer.
 * Their union is the manifest, which is why byte-identity survives; and the
 * split is what makes this project's own build exercise the same merge a
 * downstream will, instead of leaving it exercised only by its own test.
 */
function requiredLayer(layer, schemaKeys) {
    return projectLayer(layer, '', requiredPathsOf(schemaKeys), true);
}

const EMPTY_LAYER = Object.freeze(Object.create(null));

/**
 * Recursive, key-level merge of a downstream layer over a defaults layer.
 * Returns the resolved value AND the dotted paths whose value came from the
 * defaults layer. The provenance comes OUT of the merge rather than being
 * re-derived by a later traversal: a second traversal is a second source of
 * truth about the same fact, and it can disagree with the merge.
 *
 * A leaf present in the downstream layer wins and is never recorded, even when
 * its value equals the default -- an equal value is still a value the
 * downstream stated.
 */
function mergeLayers(defaults, downstream) {
    const defaulted = [];
    const value = mergeInto(defaults, downstream, '', defaulted);
    return { value, defaulted };
}

function mergeInto(defaults, downstream, prefix, defaulted) {
    // A null-prototype accumulator, and the reserved names skipped by name.
    // Unknown-setting rejection has already refused those names, so this is
    // belt and braces (D-12) -- but this becomes a real trust boundary in
    // Phase 7 and it costs three lines.
    const out = Object.create(null);
    for (const key of new Set([...Object.keys(defaults), ...Object.keys(downstream)])) {
        if (RESERVED_NAMES.includes(key)) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        const fromDefaults = defaults[key];
        const setDownstream = Object.hasOwn(downstream, key);

        if (isTable(fromDefaults) && isTable(downstream[key])) {
            out[key] = mergeInto(fromDefaults, downstream[key], path, defaulted);
        } else if (setDownstream) {
            // D-07. An array is a LEAF: a downstream array replaces the whole
            // default array and the two are never joined end to end. That is
            // deliberate and it is the only way a downstream can DROP a default
            // entry -- joining them makes dropping impossible. Every
            // off-the-shelf deep-merge library joins arrays by default, so a
            // reviewer's instinct is to "fix" this; the self-test case named
            // 'downstream array shorter than default' is what goes red.
            out[key] = downstream[key];
        } else if (isTable(fromDefaults)) {
            // The table is absent downstream entirely. Descend against an empty
            // layer anyway, so what gets recorded is the LEAF paths inside it
            // rather than the table's own path.
            out[key] = mergeInto(fromDefaults, EMPTY_LAYER, path, defaulted);
        } else {
            out[key] = fromDefaults;
            defaulted.push(path);
        }
    }
    return out;
}

// --- 4. validate, collecting every failure before exiting -------------------

function readPath(doc, path) {
    let node = doc;
    for (const segment of path.split('.')) {
        if (!isTable(node) || !Object.hasOwn(node, segment)) return undefined;
        node = node[segment];
    }
    return node;
}

/**
 * The exact words the required-setting failure uses, named once so the
 * self-test's `unknown key` case can assert that a MISSPELLED section header
 * never produces this phrase. That case derives the phrase from the emitter
 * here rather than copying it, so rewording the message below moves the
 * assertion with it instead of quietly making the case unfalsifiable.
 */
const UNSET_MARK = 'is not set.';

/** Unset means absent, or a string whose code-unit trim is empty. */
function isUnset(value) {
    return value === undefined || (typeof value === 'string' && value.trim() === '');
}

const VARIANT_PREFIX = 'variants[].';
const EXTENSIONS_PREFIX = 'extensions[].';
const WEBEXTENSIONS_PREFIX = 'webextensions[].';
const SEARCH_ENGINES_PREFIX = 'search_engines[].';

/** The four `source` values EXT-01 through EXT-02 implement. Anything else is a typo. */
const EXTENSION_SOURCES = Object.freeze(['openvsx', 'url', 'npm', 'local-path']);

/**
 * The keys each `source` actually reads, besides the always-allowed
 * id/source/sha256. A valid key on the wrong source (a `version` on a
 * direct-URL entry) is silently dropped by the resolver dispatch, so it
 * fails here naming the entry rather than passing as a pin it is not.
 * (Genuinely unknown keys are still caught by the schema's unknown-key
 * rejection -- this is only about known keys on the wrong source.)
 */
const EXTENSION_SOURCE_KEYS = Object.freeze({
    openvsx: ['version'],
    url: ['url'],
    npm: ['version', 'integrity'],
    'local-path': ['path'],
});

/**
 * What an npm version may be: the exact published version, full X.Y.Z with
 * an optional prerelease/build suffix -- the only form that names one
 * tarball. The schema shape admits `latest` (it is alphanumeric),
 * partials (`1`, `1.2`), x-wildcards (`1.x`, `1.2.x`), and spaceless
 * hyphen forms, so the npm conditional-pin branch owns exactness: anything
 * else resolves to whatever is newest at download time, which is the
 * unpinned behavior the pin gate cannot catch by hash alone (a fresh float
 * hashes clean on first download). An exactness test rather than a
 * float-character class, so exact prereleases (`1.2.3-beta.1`) stay pinned
 * while partials and wildcards fail.
 */
const NPM_EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** The four telemetry levels TEL-01 implements: Theia's real enum, default `off`. */
const TELEMETRY_LEVELS = Object.freeze(['off', 'crash', 'error', 'all']);
/**
 * The two installation modes EXT-03 implements: the policy engine's
 * force/normal install pair for a declared add-on id.
 *
 * No schema `regex` by design -- a mode is an enum, not a shape -- so
 * validateWebExtensionElements below owns this list, the same split
 * validateTelemetry keeps for the telemetry level. Anything else (a
 * block/allow default, a typo) fails generate naming the add-on id: an
 * unlisted mode would otherwise ship an entry the policy engine cannot
 * honour.
 */
const WEBEXTENSION_INSTALLATION_MODES = Object.freeze(['force_installed', 'normal_installed']);
/**
 * The theme ids the `[theia] default_theme` setting may name (04-04, GEN-05).
 *
 * No schema `regex` by design -- an enum is not a shape -- so validateTheia
 * below owns this list, the same split validateTelemetry keeps for the
 * telemetry level. The ids are Theia's own builtin theme contributions
 * (@theia/core 1.74.1 theming.ts BuiltinThemeProvider: dark, light,
 * hc-theia, hc-theia-light), read by ThemeService.defaultTheme through
 * FrontendApplicationConfigProvider.get().defaultTheme (theming.ts) with the
 * DefaultTheme string-or-{light,dark} shape (application-package
 * application-props.ts). A value outside this list fails generate naming
 * theia.default_theme: a typo'd theme silently falling back is the failure.
 */
const THEIA_THEME_IDS = Object.freeze(['dark', 'light', 'hc-theia', 'hc-theia-light']);
/** Accepted download archive suffixes: exactly what stock `theia download:plugins` unpacks. */
const EXTENSION_ARCHIVE_SUFFIXES = Object.freeze(['.vsix', '.theia', '.tar.gz']);

/**
 * The required-setting check for the elements of an array of tables.
 *
 * WHY IT IS A SECOND LOOP. The scalar loop above addresses a setting by a
 * dotted path through ONE document; `variants[].objdir` is not one setting, it
 * is one per element, and readPath cannot address any of them. Without this
 * loop every `variants[].*` key was unreachable by the required check whatever
 * its `required` flag said -- a `[[variants]]` section carrying nothing but an
 * id resolved with ZERO failures, emitted the literal string `undefined` into
 * .mozconfig and configure.sh, and then threw out of path.join.
 *
 * PRESENCE, NOT isUnset. The release variant's name_suffix is deliberately the
 * empty string -- that empty suffix is the whole reason the release display
 * name is shorter than the dev one -- so a trim-to-empty test would reject the
 * shipping manifest. What must be stated is the KEY; whether its value may be
 * blank is the `regex` in the schema's business, and name_suffix's is the one
 * that admits the empty string.
 */
function validateVariantElements(doc) {
    const failures = [];
    const variants = readPath(doc, 'variants');
    if (!Array.isArray(variants)) return failures;

    for (const [index, variant] of variants.entries()) {
        for (const [path, spec] of Object.entries(SCHEMA_KEYS)) {
            if (!path.startsWith(VARIANT_PREFIX) || !spec.required) continue;
            const key = path.slice(VARIANT_PREFIX.length);
            if (isTable(variant) && variant[key] !== undefined) continue;
            failures.push(
                `the ${ordinal(index + 1)} [[variants]] section (id ${JSON.stringify(variant?.id ?? '')}): `
                + `${key} ${UNSET_MARK} Open ${MANIFEST_NAME}, find that [[variants]] section, and give `
                + `${key} a value. Then run: ${RERUN}`,
            );
        }
    }
    return failures;
}

/**
 * The three ways a `[[variants]]` id can be wrong without anything noticing.
 *
 * variantById is a `find`, so it takes the FIRST match and says nothing about
 * the rest. That silence covered three distinct mistakes: a variant with no id
 * at all is unreachable dead configuration; two variants sharing an id resolve
 * to the first, so a downstream that edits the second gets no effect and no
 * message; and a typo'd `id = "relase"` surfaced only as the missing-variant
 * error for "release", sending the reader to ADD a section rather than fix a
 * letter. All three are reported here, by the id involved.
 *
 * The set of ids the project actually builds is DERIVED from the frozen target
 * table rather than written out, so adding a target adds it here with no edit.
 */
function validateVariantIds(doc) {
    const failures = [];
    const variants = readPath(doc, 'variants');
    if (!Array.isArray(variants)) return failures;

    const ids = variants.map(v => (isTable(v) ? v.id : undefined));

    for (const id of new Set(ids.filter((id, i) => id !== undefined && ids.indexOf(id) !== i))) {
        failures.push(
            `two or more [[variants]] sections both use the id ${JSON.stringify(id)}, and only the first is `
            + `ever used. Give each variant its own id in ${MANIFEST_NAME}, then run: ${RERUN}`,
        );
    }

    const built = [...new Set(TARGETS.map(t => t.variant))];
    for (const id of ids) {
        if (id === undefined || built.includes(id)) continue;
        failures.push(
            `the [[variants]] section with id ${JSON.stringify(id)} is never used; this project builds `
            + `${built.map(b => JSON.stringify(b)).join(' and ')}. Check the spelling in ${MANIFEST_NAME}, `
            + `then run: ${RERUN}`,
        );
    }

    return failures;
}

/** 1 -> "1st". Plain enough for a message that has to name one section of several. */
function ordinal(n) {
    const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
    return `${n}${suffix}`;
}

/**
 * The required-setting check for the elements of the `[[extensions]] array,
 * plus the two checks no scalar loop can express: the `source` allowlist and
 * the conditional pins.
 *
 * WHY A SECOND LOOP (same reason as validateVariantElements). `extensions[].id`
 * is one setting per element and readPath cannot address any of them.
 *
 * WHY EVERY FAILURE NAMES THE ENTRY ID. The generic regex loop below reports a
 * dotted path, and `extensions[].sha256` does not say WHICH of several
 * entries is unpinned or malformed. Every failure here names the entry's id
 * (or its ordinal where the id itself is what is missing), so a manifest with
 * five entries fails on the one that is wrong.
 *
 * CONDITIONAL PINS. `version` is required when source is `openvsx` (it builds
 * the exact versioned file URL -- latest-resolution is the unpinned behavior
 * EXT-01 forbids) and `url` is required when source is `url`. Source `npm`
 * (EXT-02) requires `version` too, but an exact full X.Y.Z (with optional
 * prerelease/build suffix): `latest`, partials, x-wildcards, and every
 * range form would resolve to whatever is newest at download time, so they
 * fail here even though the schema shape alone would admit several of them. It also
 * requires `integrity`, the registry SRI digest recorded at pin time. Source
 * `local-path` (EXT-02) requires `path`, the project-relative folder the
 * download step packs; an absent folder fails loud at the pin gate, which is
 * the check that can see the filesystem. All four carry `required: false` in
 * the schema so this function, which sees the source, is the only place that
 * demands them; `id`, `source` and `sha256` carry `required: true` and are
 * enforced by the loop below exactly like the variant elements above. A `url`
 * that stock `theia download:plugins` would refuse (anything not ending in
 * .vsix/.theia/.tar.gz) fails HERE, at generate time, rather than after the
 * download step -- same entry-naming shape.
 *
 * SHAPES ARE DERIVED, NOT RESTATED. Each value is tested against its own
 * schema `regex`, read out of SCHEMA_KEYS, so the pattern lives in exactly
 * one place. The generic regex loop skips `extensions[].*` paths for the same
 * reason: one value, one failure, naming the entry.
 */
function validateExtensionElements(doc) {
    const failures = [];
    const extensions = readPath(doc, 'extensions');
    if (!Array.isArray(extensions)) return failures;

    const labelOf = (entry, index) => (isTable(entry) && typeof entry.id === 'string' && entry.id !== ''
        ? `the [[extensions]] entry with id ${JSON.stringify(entry.id)}`
        : `the ${ordinal(index + 1)} [[extensions]] entry (no id stated)`);

    const seen = new Map();
    for (const [index, entry] of extensions.entries()) {
        if (isTable(entry) && typeof entry.id === 'string' && entry.id !== '') {
            seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
        }
    }
    for (const [id, count] of seen) {
        if (count > 1) {
            failures.push(
                `two or more [[extensions]] entries both use the id ${JSON.stringify(id)}, and only one download URL `
                + `can be emitted for it. Give each entry its own id in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
    }

    for (const [index, entry] of extensions.entries()) {
        if (!isTable(entry)) {
            failures.push(
                `the ${ordinal(index + 1)} [[extensions]] entry is not a section of settings. `
                + `Open ${MANIFEST_NAME}, write it as an [[extensions]] section with id, source and sha256, then run: ${RERUN}`,
            );
            continue;
        }
        const label = labelOf(entry, index);

        for (const [path, spec] of Object.entries(SCHEMA_KEYS)) {
            if (!path.startsWith(EXTENSIONS_PREFIX) || !spec.required) continue;
            const key = path.slice(EXTENSIONS_PREFIX.length);
            if (entry[key] !== undefined) continue;
            failures.push(
                `${label}: ${key} ${UNSET_MARK} Open ${MANIFEST_NAME}, find that [[extensions]] entry, and give `
                + `${key} a value. Then run: ${RERUN}`,
            );
        }

        const source = entry.source;
        if (source !== undefined && !EXTENSION_SOURCES.includes(source)) {
            failures.push(
                `${label}: source is ${JSON.stringify(source)}, which this project does not implement. `
                + `Write it as one of ${EXTENSION_SOURCES.map(s => JSON.stringify(s)).join(' or ')}. Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
            continue;
        }

        // Conditional pins: the key the entry's own source demands.
        if (source === 'openvsx' && entry.version === undefined) {
            failures.push(
                `${label}: version ${UNSET_MARK} An Open VSX entry without an exact version would resolve to `
                + `whatever is latest, which is the unpinned behavior this setting forbids. Open ${MANIFEST_NAME}, `
                + `find that [[extensions]] entry, and pin version. Then run: ${RERUN}`,
            );
        }
        if (source === 'url' && entry.url === undefined) {
            failures.push(
                `${label}: url ${UNSET_MARK} A direct-URL entry downloads from its url verbatim, so without one `
                + `there is nothing to download. Open ${MANIFEST_NAME}, find that [[extensions]] entry, and give `
                + `url a value. Then run: ${RERUN}`,
            );
        }
        if (source === 'npm' && entry.version === undefined) {
            failures.push(
                `${label}: version ${UNSET_MARK} An npm entry without an exact version would resolve to `
                + `whatever is latest, which is the unpinned behavior this setting forbids. Open ${MANIFEST_NAME}, `
                + `find that [[extensions]] entry, and pin version. Then run: ${RERUN}`,
            );
        }
        if (source === 'npm' && typeof entry.version === 'string'
            && !NPM_EXACT_VERSION.test(entry.version)) {
            failures.push(
                `${label}: version is ${JSON.stringify(entry.version)}, which floats -- it resolves to whatever is `
                + `newest at download time. Pin the exact version instead: confirm it with npm view ${entry.id}@<version> `
                + `dist.tarball, then run: ${RERUN}`,
            );
        }
        if (source === 'npm' && entry.integrity === undefined) {
            failures.push(
                `${label}: integrity ${UNSET_MARK} An npm entry pins its bytes twice: the exact version names the `
                + `tarball and the registry integrity digest guards a republication under that version. Open `
                + `${MANIFEST_NAME}, find that [[extensions]] entry, and record integrity from `
                + `npm view ${entry.id}@${entry.version ?? '<version>'} dist.integrity. Then run: ${RERUN}`,
            );
        }
        if (source === 'local-path' && entry.path === undefined) {
            failures.push(
                `${label}: path ${UNSET_MARK} A local-path entry packs its folder at download time, so without one `
                + `there is nothing to pack. Open ${MANIFEST_NAME}, find that [[extensions]] entry, and give `
                + `path a project-relative folder. Then run: ${RERUN}`,
            );
        }

        // Source-irrelevant keys: the resolver dispatch reads only the
        // current source's keys, so anything else on the entry is dead
        // text an operator may believe is operative.
        if (source !== undefined && Object.hasOwn(EXTENSION_SOURCE_KEYS, source)) {
            const allowed = new Set([...EXTENSION_SOURCE_KEYS[source], 'id', 'source', 'sha256']);
            for (const key of Object.keys(entry)) {
                if (!allowed.has(key)) {
                    failures.push(
                        `${label}: ${key} is set but a ${JSON.stringify(source)} entry never reads it -- the resolver silently drops it. `
                        + `Remove it in ${MANIFEST_NAME} (it is not pinning anything), then run: ${RERUN}`,
                    );
                }
            }
        }

        // Shapes, against each key's own schema pattern, naming the entry.
        for (const key of ['id', 'version', 'url', 'integrity', 'path', 'sha256']) {
            const value = entry[key];
            if (value === undefined) continue;
            const spec = SCHEMA_KEYS[`${EXTENSIONS_PREFIX}${key}`];
            if (typeof value !== 'string') {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, but this setting has to be text written inside double `
                    + `quotes. Open ${MANIFEST_NAME}, quote the value, then run: ${RERUN}`,
                );
                continue;
            }
            if (spec.regex && !new RegExp(spec.regex).test(value)) {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, which is not allowed here. Write it as ${spec.regex_help}. `
                    + `Allowed form: ${spec.regex} . A valid value looks like ${JSON.stringify(spec.regex_example)}. `
                    + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
                );
                continue;
            }
            if (key === 'url' && !EXTENSION_ARCHIVE_SUFFIXES.some(suffix => value.endsWith(suffix))) {
                failures.push(
                    `${label}: url is ${JSON.stringify(value)}, which the download step cannot unpack -- it accepts only `
                    + `${EXTENSION_ARCHIVE_SUFFIXES.join(', ')} archives. Point it at a download archive in ${MANIFEST_NAME}, `
                    + `then run: ${RERUN}`,
                );
            }
        }
    }
    return failures;
}

/**
 * The required-setting check for the elements of the `[[webextensions]]
 * array (EXT-03), plus the two checks no scalar loop can express: the
 * installation_mode enum and the install_url scheme rule.
 *
 * WHY A SECOND LOOP (same reason as validateExtensionElements).
 * `webextensions[].id` is one setting per element and readPath cannot
 * address any of them.
 *
 * WHY EVERY FAILURE NAMES THE ADD-ON ID. The generic regex loop below
 * reports a dotted path, and `webextensions[].install_url` does not say
 * WHICH of several entries carries the bad URL. Every failure here names
 * the entry's id (or its ordinal where the id itself is what is missing),
 * so a manifest with five entries fails on the one that is wrong.
 *
 * MODES ARE VALIDATED HERE, NOT IN THE SCHEMA. `installation_mode` carries
 * no schema `regex` -- its two values are an enum, not a shape -- so the
 * generic regex loop below cannot express it, the same split
 * validateTelemetry keeps for the telemetry level. An absent mode fails as
 * a missing required key; a stated-but-unknown mode fails listing the two
 * this project implements. There is deliberately no silent default: an
 * entry the policy engine cannot honour must never build.
 *
 * SHAPES ARE DERIVED, NOT RESTATED. The id and install_url values are
 * tested against their own schema `regex`, read out of SCHEMA_KEYS, so the
 * pattern lives in exactly one place. The generic regex loop skips
 * `webextensions[].*` paths for the same reason: one value, one failure,
 * naming the entry.
 */
function validateWebExtensionElements(doc) {
    const failures = [];
    const webextensions = readPath(doc, 'webextensions');
    if (!Array.isArray(webextensions)) return failures;

    const labelOf = (entry, index) => (isTable(entry) && typeof entry.id === 'string' && entry.id !== ''
        ? `the [[webextensions]] entry with id ${JSON.stringify(entry.id)}`
        : `the ${ordinal(index + 1)} [[webextensions]] entry (no id stated)`);

    const seen = new Map();
    for (const [index, entry] of webextensions.entries()) {
        if (isTable(entry) && typeof entry.id === 'string' && entry.id !== '') {
            seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
        }
    }
    for (const [id, count] of seen) {
        if (count > 1) {
            failures.push(
                `two or more [[webextensions]] entries both use the id ${JSON.stringify(id)}, and only one ExtensionSettings `
                + `entry can be emitted for it. Give each entry its own id in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
    }

    for (const [index, entry] of webextensions.entries()) {
        if (!isTable(entry)) {
            failures.push(
                `the ${ordinal(index + 1)} [[webextensions]] entry is not a section of settings. `
                + `Open ${MANIFEST_NAME}, write it as a [[webextensions]] section with id, installation_mode and install_url, then run: ${RERUN}`,
            );
            continue;
        }
        const label = labelOf(entry, index);

        for (const [path, spec] of Object.entries(SCHEMA_KEYS)) {
            if (!path.startsWith(WEBEXTENSIONS_PREFIX) || !spec.required) continue;
            const key = path.slice(WEBEXTENSIONS_PREFIX.length);
            if (entry[key] !== undefined) continue;
            failures.push(
                `${label}: ${key} ${UNSET_MARK} Open ${MANIFEST_NAME}, find that [[webextensions]] entry, and give `
                + `${key} a value. Then run: ${RERUN}`,
            );
        }

        // The mode enum: the schema carries no pattern for it by design, so
        // this check owns the allowed pair. Absence is already reported
        // above; only a stated-but-unknown value lands here.
        if (entry.installation_mode !== undefined && !WEBEXTENSION_INSTALLATION_MODES.includes(entry.installation_mode)) {
            failures.push(
                `${label}: installation_mode is ${JSON.stringify(entry.installation_mode)}, which is not an installation mode this project implements. `
                + `Write it as one of ${WEBEXTENSION_INSTALLATION_MODES.map(m => JSON.stringify(m)).join(' or ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }

        // Shapes, against each key's own schema pattern, naming the entry.
        for (const key of ['id', 'install_url']) {
            const value = entry[key];
            if (value === undefined) continue;
            const spec = SCHEMA_KEYS[`${WEBEXTENSIONS_PREFIX}${key}`];
            if (typeof value !== 'string') {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, but this setting has to be text written inside double `
                    + `quotes. Open ${MANIFEST_NAME}, quote the value, then run: ${RERUN}`,
                );
                continue;
            }
            if (spec.regex && !new RegExp(spec.regex).test(value)) {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, which is not allowed here. Write it as ${spec.regex_help}. `
                    + `Allowed form: ${spec.regex} . A valid value looks like ${JSON.stringify(spec.regex_example)}. `
                    + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
                );
            }
        }
    }
    return failures;
}
/**
 * Per-entry rules for [[search_engines]] (BAR-04). Cloned from
 * validateWebExtensionElements and for the same reason: every failure names
 * the ENTRY (its name, or its ordinal where the name itself is what is
 * missing), so a manifest with five engines fails on the one that is wrong.
 *
 * SHAPES ARE DERIVED, NOT RESTATED. name, url and suggest_url are tested
 * against their own schema `regex`, read out of SCHEMA_KEYS; the url
 * pattern is what refuses a non-https template and one without
 * {searchTerms}. The generic regex loop skips `search_engines[].*` paths
 * so one value yields one failure.
 *
 * DUPLICATE NAMES ARE COMPARED CASE-INSENSITIVELY. The policy engine keys
 * an engine by its name and Gecko drops a second engine of the same name
 * without a word (SearchService #addEngineToStore, "duplicate-title"), so
 * two entries differing only in case would ship one engine. A collision
 * with a name Firefox itself ships is scripts/verify-search-engines.mjs's
 * check: it needs upstream/, which generate does not.
 */
function validateSearchEngineElements(doc) {
    const failures = [];
    const engines = readPath(doc, 'search_engines');
    if (!Array.isArray(engines)) return failures;

    const labelOf = (entry, index) => (isTable(entry) && typeof entry.name === 'string' && entry.name.trim() !== ''
        ? `the [[search_engines]] entry named ${JSON.stringify(entry.name)}`
        : `the ${ordinal(index + 1)} [[search_engines]] entry (no name stated)`);

    const seen = new Map();
    for (const entry of engines) {
        if (isTable(entry) && typeof entry.name === 'string' && entry.name.trim() !== '') {
            const key = entry.name.toLowerCase();
            seen.set(key, [...(seen.get(key) ?? []), entry.name]);
        }
    }
    for (const names of seen.values()) {
        if (names.length > 1) {
            failures.push(
                `two or more [[search_engines]] entries use the name ${names.map(n => JSON.stringify(n)).join(' and ')}, and the browser keeps only `
                + `one engine per name (capital letters do not count as a difference). Give each entry its own name in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
    }

    for (const [index, entry] of engines.entries()) {
        if (!isTable(entry)) {
            failures.push(
                `the ${ordinal(index + 1)} [[search_engines]] entry is not a section of settings. `
                + `Open ${MANIFEST_NAME}, write it as a [[search_engines]] section with name and url, then run: ${RERUN}`,
            );
            continue;
        }
        const label = labelOf(entry, index);

        for (const [path, spec] of Object.entries(SCHEMA_KEYS)) {
            if (!path.startsWith(SEARCH_ENGINES_PREFIX) || !spec.required) continue;
            const key = path.slice(SEARCH_ENGINES_PREFIX.length);
            if (entry[key] !== undefined) continue;
            failures.push(
                `${label}: ${key} ${UNSET_MARK} Open ${MANIFEST_NAME}, find that [[search_engines]] entry, and give `
                + `${key} a value. Then run: ${RERUN}`,
            );
        }

        for (const key of ['name', 'url', 'suggest_url']) {
            const value = entry[key];
            if (value === undefined) continue;
            const spec = SCHEMA_KEYS[`${SEARCH_ENGINES_PREFIX}${key}`];
            if (typeof value !== 'string') {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, but this setting has to be text written inside double `
                    + `quotes. Open ${MANIFEST_NAME}, quote the value, then run: ${RERUN}`,
                );
                continue;
            }
            if (spec.regex && !new RegExp(spec.regex).test(value)) {
                failures.push(
                    `${label}: ${key} is ${JSON.stringify(value)}, which is not allowed here. Write it as ${spec.regex_help}. `
                    + `Allowed form: ${spec.regex} . A valid value looks like ${JSON.stringify(spec.regex_example)}. `
                    + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
                );
            }
        }
    }
    return failures;
}
/**
 * The `[telemetry]` level enum and the endpoint rule (04-03, TEL-01/TEL-02).
 *
 * WHY A DEDICATED FUNCTION (same reason as validateExtensionElements).
 * `telemetry.level` carries no schema `regex` -- its four values are an
 * enum, not a shape -- so the generic regex loop below cannot express it,
 * and the cross rule (an enabled level with nowhere to send must never
 * build) relates two keys no per-key loop can see. Both failures name the
 * dotted path, the same contract the generic loop keeps, so one value is
 * still reported exactly once: the loop skips the regex-less level, and
 * the endpoint shape stays the loop's alone.
 *
 * UNSET LEVEL IS OFF. Both keys are `required: false`; an absent (or
 * whitespace-only, D-10) level resolves to `off` in the emitter, so
 * absence alone refuses nothing here. The one refusal is an enabled
 * (non-`off`) level with no endpoint: a sender that can never deliver
 * must never build.
 */
function validateTelemetry(doc) {
    const failures = [];
    const level = readPath(doc, 'telemetry.level');
    const endpoint = readPath(doc, 'telemetry.endpoint');

    if (!isUnset(level) && !TELEMETRY_LEVELS.includes(level)) {
        failures.push(
            `telemetry.level is ${JSON.stringify(level)}, which is not a telemetry level this project implements. `
            + `Write it as one of ${TELEMETRY_LEVELS.map(l => JSON.stringify(l)).join(', ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
        );
    }

    if (!isUnset(level) && level !== 'off' && isUnset(endpoint)) {
        failures.push(
            `telemetry.level is ${JSON.stringify(level)} but telemetry.endpoint ${UNSET_MARK} An enabled level with nowhere `
            + `to send must never build. Open ${MANIFEST_NAME}, find the [telemetry] section, and give endpoint an https URL. `
            + `Then run: ${RERUN}`,
        );
    }
    return failures;
}

/**
 * The `[theia]` theme id enum (04-04, GEN-05).
 *
 * WHY A DEDICATED FUNCTION (same reason as validateTelemetry).
 * `theia.default_theme` carries no schema `regex` -- its values are Theia's
 * builtin theme ids, not a shape -- so the generic regex loop below cannot
 * express it. An absent (or whitespace-only, D-10) theme refuses nothing:
 * the emitter falls back to Theia's own default pair, so absence is a
 * clean tree, not a defect. The one refusal is an unknown id, which would
 * otherwise silently fall back and ship a theme nobody asked for.
 */
function validateTheia(doc) {
    const failures = [];
    const theme = readPath(doc, 'theia.default_theme');

    if (!isUnset(theme) && !THEIA_THEME_IDS.includes(theme)) {
        failures.push(
            `theia.default_theme is ${JSON.stringify(theme)}, which is not a theme id this project's Theia sidecar implements. `
            + `Write it as one of ${THEIA_THEME_IDS.map(t => JSON.stringify(t)).join(', ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
        );
    }
    return failures;
}

function validate(doc, leaves) {    const failures = [];
    const reportedUnset = new Set();

    for (const [path, spec] of Object.entries(SCHEMA_KEYS)) {
        if (!spec.required || path.includes('[]')) continue;
        if (isUnset(readPath(doc, path))) {
            reportedUnset.add(path);
            failures.push(
                `${path} ${UNSET_MARK} Open ${MANIFEST_NAME}, find the ${sectionOf(path)} section, and give `
                + `${settingOf(path)} a value. Then run: ${RERUN}`,
            );
        }
    }

    failures.push(...validateVariantElements(doc));
    failures.push(...validateVariantIds(doc));
    failures.push(...validateExtensionElements(doc));
    failures.push(...validateWebExtensionElements(doc));
    failures.push(...validateSearchEngineElements(doc));
    failures.push(...validateTelemetry(doc));
    failures.push(...validateTheia(doc));

    for (const { path, value } of leaves) {
        // EXT-01 (04-02), EXT-03 and BAR-04. extensions[], webextensions[]
        // and search_engines[] leaves are validated by their element
        // validators above, which name the ENTRY -- the generic shape below
        // can only name the dotted path, so letting both run would report
        // one value twice.
        if (path.startsWith(EXTENSIONS_PREFIX) || path.startsWith(WEBEXTENSIONS_PREFIX)
            || path.startsWith(SEARCH_ENGINES_PREFIX)) continue;
        // An explicitly emptied array (extensions = []) carries no spec by
        // construction -- rejectUnknown vetted it above, and there is no
        // value to check a pattern against. Without this guard the spec
        // lookup below throws past report() into a stack trace.
        const spec = SCHEMA_KEYS[path];
        if (spec === undefined) continue;
        if (reportedUnset.has(path)) continue;
        if (spec.type === 'string' && typeof value !== 'string') {
            failures.push(
                `${path} is ${JSON.stringify(value)}, but this setting has to be text written inside double `
                + `quotes. Open ${MANIFEST_NAME}, quote the value, then run: ${RERUN}`,
            );
            continue;
        }
        // REL-01 (40-03). A quoted "1" or a fractional 1.5 is refused here, never coerced.
        if (spec.type === 'integer' && (!Number.isInteger(value) || value < spec.minimum)) {
            failures.push(
                `${path} is ${JSON.stringify(value)}, but this setting has to be ${spec.type_help}. `
                + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
            continue;
        }
        if (spec.regex && typeof value === 'string' && !new RegExp(spec.regex).test(value)) {
            failures.push(
                `${path} is ${JSON.stringify(value)}, which is not allowed here. Write it as ${spec.regex_help}. `
                + `Allowed form: ${spec.regex} . A valid value looks like ${JSON.stringify(spec.regex_example)}. `
                + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
    }

    return failures;
}

function report(failures) {
    if (failures.length === 0) return;
    console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in ${MANIFEST_NAME}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

// --- 4. emit and write ------------------------------------------------------

/**
 * Characters a manifest value may never carry into an emitted build surface.
 *
 * A double quote or a backslash closes or escapes its way out of the
 * double-quoted shell assignment in configure.sh; a dollar sign or a backtick
 * makes the shell evaluate the rest as a command, and the Gecko build SOURCES
 * that file, so the evaluation happens with the developer's privileges. A line
 * break ends the assignment and starts a new shell statement -- and in a
 * freedesktop .desktop file it ends the current key and starts another, which
 * is how a Name= value injects its own Exec= line into the group.
 */
const UNEMITTABLE = /["`$\\\r\n\t\0]/;

/**
 * A manifest value on its way into a shell assignment or a freedesktop key.
 *
 * DEFENCE IN DEPTH, NOT THE PRIMARY GUARD. The primary guard is the schema:
 * every value that reaches a sink below carries a `regex` in
 * config-schema.json, so a metacharacter is rejected in validate() alongside
 * every other failure, with the whole list reported at once. This function is
 * what stops a future schema edit that drops or loosens one of those patterns
 * from silently reopening the sink -- the sink itself refuses.
 *
 * CFG-03: a bad value is REJECTED, never quietly mangled into a passing one.
 * Escaping the metacharacter would emit a build setting whose text is not what
 * the manifest says, which is the same class of surprise as silently
 * normalising Unicode. It reports through report() rather than throwing, so the
 * reader sees the same plain-language copy every other failure uses and never a
 * stack trace.
 */
function assertEmittable(path, value) {
    if (typeof value !== 'string' || UNEMITTABLE.test(value)) {
        report([
            `${path} cannot be written into a build setting as it stands. A brand value may not `
            + 'contain a quote, a backslash, a dollar sign, a backtick, a tab or a line break. '
            + `Open ${MANIFEST_NAME}, correct it, then run: ${RERUN}`,
        ]);
    }
    return value;
}

/**
 * Characters a manifest value may never carry into a Windows installer
 * define. A double quote closes the quoted !define value; a line break
 * ends the define and starts a new installer statement; NUL truncates.
 *
 * Dollar signs are refused by hasBareDollar below, NOT by this pattern: a
 * lookaround class cannot see $-runs of length 3+ at odd alignment (every
 * position sits beside another $, so $$$INSTDIR passed while $INSTDIR did
 * not) -- and NSIS folds $$ to one literal $ before expansion, so
 * $$$INSTDIR compiles to a literal $ followed by the expansion of
 * $INSTDIR. Stripping the $$ escapes first leaves exactly the dollars
 * NSIS would expand: a bare $NAME expands exactly like ${NAME}, so the
 * guard refuses both in one class and only $$ (the NSIS literal escape
 * for one dollar sign) passes.
 *
 * DEFENCE IN DEPTH, NOT THE PRIMARY GUARD -- same contract as
 * assertEmittable: the schema regexes are what reject these values in
 * validate() with the whole list reported at once, and this is what stops a
 * future schema edit from silently reopening the sink. CFG-03: rejection
 * only, never escaping -- an escaped URL is not the manifest's URL.
 */
const NSIS_UNEMITTABLE = /"|\r|\n|\0/;

/**
 * True when the value carries a dollar NSIS would expand at compile time.
 * The $$ pairs are the NSIS literal-dollar escape and are stripped first;
 * any $ that survives is an expansion. Non-overlapping stripping is the
 * correct alignment: $$$$$ is two escapes plus one bare dollar, and one
 * $ does survive, so it is refused.
 */
const hasBareDollar = (s) => s.replaceAll('$$', '').includes('$');

/**
 * A manifest value on its way into a Windows installer !define line.
 * Reports through report() in the same plain-words shape as
 * assertEmittable: the TOML dotted path, the rule, the re-run command.
 */
function assertNsisEmittable(path, value) {
    if (typeof value !== 'string' || NSIS_UNEMITTABLE.test(value) || hasBareDollar(value)) {
        report([
            `${path} cannot be written into a Windows installer setting as it stands. A brand value may not `
            + 'contain a double quote, a bare dollar sign (write $$ for a literal dollar), or a line break. '
            + `Open ${MANIFEST_NAME}, correct it, then run: ${RERUN}`,
        ]);
    }
    return value;
}

/**
 * Characters a manifest value may never carry into an XML installer
 * document (MSIX fields, plist fields, tile manifest). An ampersand opens
 * an entity, angle brackets open or close an element, a double quote closes
 * a quoted attribute, and a control character is not representable -- any of
 * them lets one value rewrite the document around it.
 *
 * DEFENCE IN DEPTH, NOT THE PRIMARY GUARD -- same contract as above. Every
 * value that reaches an XML sink today also carries a schema regex that
 * excludes these characters, so on a validated manifest this guard never
 * fires; it is what fires if a future schema edit drops one of those
 * patterns. CFG-03: rejection only, never escaping.
 */
const XML_UNEMITTABLE = /[&<>"\x00-\x1f\x7f]/;

/**
 * A manifest value on its way into an XML installer document. Reports
 * through report() in the same plain-words shape: the TOML dotted path,
 * the rule, the re-run command.
 */
function assertXmlEmittable(path, value) {
    if (typeof value !== 'string' || XML_UNEMITTABLE.test(value)) {
        report([
            `${path} cannot be written into an installer document as it stands. A brand value may not `
            + 'contain an ampersand, an angle bracket, a double quote, or a control character. '
            + `Open ${MANIFEST_NAME}, correct it, then run: ${RERUN}`,
        ]);
    }
    return value;
}

/**
 * The "this file is derived" banner, carried by EVERY generated target.
 *
 * ONE constant, not one per emitter. It went in as three lines on configure.sh
 * alone, which left .mozconfig and the two .desktop files equally derived,
 * equally hand-editable and equally silent about it -- and a reader could no
 * longer tell generated from hand-written by opening the file, which is the
 * banner's whole purpose. A shared constant is also what stops the
 * forty-six files drifting into forty-six wordings.
 *
 * `#` is a comment in all three formats: mozconfig is shell, configure.sh is
 * shell, and freedesktop permits comment lines in a .desktop file including
 * ahead of the first group header. The two .desktop parsers in this repo find
 * their keys by prefix rather than by line number, so a leading comment block
 * moves nothing they read.
 */
const GENERATED_BANNER = Object.freeze([
    '# Generated from configuration.toml by scripts/generate.mjs -- do not edit here.',
    '# To change it: edit configuration.toml, run: node scripts/generate.mjs, then copy the',
    '# matching file out of generated/ over this one. Phase 2 does not write it in place.',
    '# A disagreement reddens: scripts/verify-platform.sh --only generated-byte-identity',
]);

/** The dotted path a reader opens to fix a value inside one [[variants]] section. */
function variantPath(variant, key) {
    return `the [[variants]] section with id ${JSON.stringify(variant?.id ?? '')}: ${key}`;
}

/**
 * A manifest folder path resolved against the repo root, refused if it escapes.
 *
 * The schema patterns for branding_dir and objdir already forbid a leading
 * slash and a `..` segment, so this cannot fire on a validated manifest. It is
 * here for the same reason assertEmittable is: the emitted Exec= and Icon=
 * lines are absolute paths a desktop launcher runs, and a guard that rests on
 * one pattern is a guard a future edit to that pattern can remove. Resolution,
 * not string inspection -- `..` is only one of the ways a path leaves a tree.
 */
function assertUnderRepo(path, relative) {
    const absolute = resolve(REPO_ROOT, relative);
    if (absolute !== REPO_ROOT && !absolute.startsWith(REPO_ROOT + sep)) {
        report([
            `${path} is ${JSON.stringify(relative)}, which points outside the project folder. `
            + `Write it as a folder path inside the project, then run: ${RERUN}`,
        ]);
    }
    return absolute;
}

/**
 * A branding configure.sh, line for line against the files plan 01-03 wrote by
 * hand. Lines 1-3 are the Mozilla Public License boilerplate: a source-file
 * licence notice, literal emitter text, not a rebrand input.
 *
 * Lines 5-7 are D-03 STEP 2, done in plan 02-06 and not before. Until then
 * they reproduced verbatim the comment those files carried when they were
 * hand-written, because the byte-identity check had to be established GREEN
 * against the original bytes first: a comment rewritten ahead of the proof
 * would have left nothing independent to compare against. That proof was run
 * and recorded green at commit 94c47d1, and only then did these three lines
 * and the two tracked files change together in one commit. The header they now
 * carry is instructions, not description -- it names the file to edit instead,
 * the command to re-run, and the registry label that reddens on a
 * disagreement. If the emitter and either tracked file ever diverge, the
 * emitter is what changes; the tracked files are the comparand and are never
 * edited to make a check green.
 *
 * THE COPY STEP IS NAMED BECAUSE IT IS REAL. OUTPUT_ROOT is REPO_ROOT/generated
 * and the build still consumes the TRACKED file under D-01, so "edit
 * configuration.toml and run the generator" -- what these lines used to say --
 * changes nothing a reader can see and then reddens generated-byte-identity
 * with no documented recovery other than the one thing the first line forbids.
 * The header now says to copy the emitted file over the tracked one, which is
 * the procedure that actually works in Phase 2. A --write-tracked mode would
 * replace that sentence; until one exists, the sentence stays honest.
 *
 * ONE emitter serves BOTH variants. The dev and release files differ in exactly
 * one line, and that difference is entirely the variant's name_suffix -- the
 * release variant's is empty, which is what yields the shorter display name. If
 * the two emitted files ever differ by anything else, the emitter is wrong, not
 * the variant, and a second emitter would be the wrong repair.
 *
 * Joined with a literal newline, never the platform line-ending constant, which
 * would emit CRLF on a Windows host and break byte-identity.
 */
function emitConfigureSh(config, variant) {
    const lines = [
        '# This Source Code Form is subject to the terms of the Mozilla Public',
        '# License, v. 2.0. If a copy of the MPL was not distributed with this',
        '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
        '',
        ...GENERATED_BANNER,
        // Both halves pass the sink guard. This line is a double-quoted shell
        // assignment in a file the Gecko build sources, so an unchecked value
        // here executes at build time; see assertEmittable.
        `MOZ_APP_DISPLAYNAME="${assertEmittable('identity.display_name', config.identity.display_name)}`
        + `${assertEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix)}"`,
    ];
    return lines.join('\n') + '\n';
}

/**
 * A branding locale's Fluent terms, line for line against the files plan 01-03
 * wrote by hand. ONE emitter serves BOTH variants, exactly like
 * emitConfigureSh: the dev and release files differ in exactly one line, and
 * that difference is entirely the variant's name_suffix.
 *
 * THE DERIVATION POINTS, AND NOTHING ELSE. Every other line is a literal copy
 * of the tracked bytes, comments included:
 *
 *  * -brand-shorter-name, -brand-short-name and -brand-shortcut-name carry the
 *    BASE display name with no suffix; only -brand-full-name carries base plus
 *    the variant's name_suffix.
 *  * -brand-product-name is the literal Firefox per D-78: a small set of
 *    "requires Firefox" compatibility strings interpolates this term, and
 *    byte-identical UA/product naming is the same rationale D-78 already
 *    applied to the User-Agent.
 *  * -vendor-short-name carries product.vendor_display, the DISPLAY-side
 *    vendor (D-09 as amended).
 *  * trademarkInfo is the literal brace-space line exactly as the tracked file
 *    carries it. The tracked bytes win here: no manifest value reaches that
 *    line, so legal.trademark_notice is validated and required but never
 *    interpolated into this file.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
function emitBrandFtl(config, variant) {
    // Both halves pass the sink guard. A Fluent term value ends at the line
    // break, so the guard's newline rejection is what stops one value from
    // becoming two terms; the quote/backslash/dollar/backtick rejections cost
    // nothing here and keep every interpolation in this file under one rule.
    const base = assertEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const vendor = assertEmittable('product.vendor_display', config.product.vendor_display);
    const lines = [
        '# This Source Code Form is subject to the terms of the Mozilla Public',
        '# License, v. 2.0. If a copy of the MPL was not distributed with this',
        '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
        '',
        '# Display literals, hand-written (plan 01-03, Pitfall 1; canonical',
        '# single-word form pinned by NAME-01 in 08-01). The product name here is',
        '# `PowerBrowser`, composed with the variant suffix where one is declared.',
        `-brand-shorter-name = ${base}`,
        `-brand-short-name = ${base}`,
        `-brand-shortcut-name = ${base}`,
        `-brand-full-name = ${base}${suffix}`,
        '# This brand name can be used in messages where the product name needs to',
        '# remain unchanged across different versions (Nightly, Beta, etc.). Kept at',
        '# Firefox (not Power Browser) per D-78: a small set of "requires Firefox"',
        '# compatibility strings interpolate this term, and byte-identical UA/product',
        '# naming is the same rationale D-78 already applied to the User-Agent.',
        '-brand-product-name = Firefox',
        '# The DISPLAY-side vendor (D-09 as amended). The machine-side vendor is the',
        '# space-free `DeBIOS` in patches/010, because MOZ_APP_VENDOR is lowercased into',
        '# the profile path with no space stripping.',
        `-vendor-short-name = ${vendor}`,
        'trademarkInfo = { " " }',
    ];
    return lines.join('\n') + '\n';
}

/**
 * A branding locale's legacy properties file, line for line against the files
 * plan 01-03 wrote by hand. ONE emitter serves BOTH variants: the dev and
 * release files differ in exactly one line (brandFullName), and that
 * difference is entirely the variant's name_suffix.
 *
 * brandShorterName and brandShortName carry the BASE display name;
 * brandFullName carries base plus suffix -- the same split emitBrandFtl
 * applies, which is what the agreement assertion below checks.
 */
function emitBrandProperties(config, variant) {
    const base = assertEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const lines = [
        '# This Source Code Form is subject to the terms of the Mozilla Public',
        '# License, v. 2.0. If a copy of the MPL was not distributed with this',
        '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
        '',
        '# Hand-written display literals (plan 01-03). These must equal the matching',
        '# terms in this same variant\'s brand.ftl -- verify-branding-identity.mjs',
        '# surface 4 asserts BOTH files against one expected value precisely so the two',
        '# halves of one display surface cannot silently disagree.',
        `brandShorterName=${base}`,
        `brandShortName=${base}`,
        `brandFullName=${base}${suffix}`,
    ];
    return lines.join('\n') + '\n';
}

/**
 * The update channel (UPD-11): the %CHANNEL% segment of every descriptor path and
 * the suffix of the MAR channel id. Platform policy, not a manifest key -- the
 * telemetry-policy precedent below: one channel for every downstream. Patch 030
 * removed channel-dependent certificate selection, and AppConstants.IS_ESR already
 * overrides the channel for Remote Settings and search, so nothing else keys on it.
 * Changing it costs a tier-3 rebuild and re-proof of ng065 and mar-update-hop, and
 * after a release has shipped it needs a channel-transition release.
 */
export const UPDATE_CHANNEL = 'default';

/**
 * The two channel values every consumer must agree with, derived from one constant:
 * the update channel, and the MAR channel id `<app_basename>-<channel>`.
 */
export function updateChannel(config) {
    const appBasename = assertEmittable('identity.app_basename', config.identity.app_basename);
    return { channel: UPDATE_CHANNEL, marChannelId: `${appBasename}-${UPDATE_CHANNEL}` };
}

/**
 * The primary MAR origin: [urls] mar_origin, the host the update descriptor's patch URLs
 * name as <mar_origin>/<tag>/<asset> (owner ruling 2026-10-29). It is an https origin
 * that names only a host: no path, port, query, fragment, userinfo or trailing slash.
 * Unset returns null, and the release manifest then records null so the descriptor's
 * form gate fails closed. Any other value is refused here by name, as urls.update is.
 */
export function marOrigin(config) {
    const raw = config.urls?.mar_origin;
    if (isUnset(raw)) return null;
    const value = assertEmittable('urls.mar_origin', raw);
    let hostOnly = false;
    try {
        const u = new URL(value);
        hostOnly = u.protocol === 'https:' && u.pathname === '/' && u.search === '' && u.hash === ''
            && u.username === '' && u.password === '' && u.port === ''
            && value === `https://${u.hostname}`;
    } catch {
        hostOnly = false;
    }
    if (!hostOnly) {
        report([
            `urls.mar_origin is ${JSON.stringify(value)}, which is not an https origin that names only a host. `
            + `Write it as [urls] mar_origin in ${MANIFEST_NAME}, for example "https://downloads.example.org", then run: ${RERUN}`,
        ]);
    }
    return value;
}

/**
 * TEL-07 (57-02): the crash submit ORIGIN, derived from the ONE stated [urls].crash_report key. The
 * same key drives the breakpad.reportURL view-link base (verbatim, mozillaEndpointPrefs) and this
 * origin feeds --with-crashreporter-url, which moz.configure rstrips and application.ini.in joins
 * with /submit. Only the origin (scheme, host, port) is kept: the path a stated value carries is the
 * view-link base, never the submit target. Unset returns '' and emits nothing, so the tree stays
 * byte-identical while the reporter is compiled out (TEL-13 owns the flip).
 */
export function crashReporterOrigin(config) {
    const raw = config.urls?.crash_report;
    if (isUnset(raw)) return '';
    const value = assertEmittable('urls.crash_report', raw);
    let origin = '';
    try {
        origin = new URL(value).origin;
    } catch {
        origin = '';
    }
    if (!origin.startsWith('https://')) {
        report([
            `urls.crash_report is ${JSON.stringify(value)}, which is not an https URL. `
            + `Write your own https crash-report address as [urls] crash_report in ${MANIFEST_NAME}, for example "https://crash.example.org/report", then run: ${RERUN}`,
        ]);
    }
    return origin;
}

/**
 * TEL-13 (WR-09): the ONE switch that decides whether a generated mozconfig builds the native crash reporter.
 * It stays false until plan 57-04 (the TEL-13 flip). The generator owns the pairing with the crash address:
 * `--disable-crashreporter` is emitted exactly when this is false, and when it is true a configuration with no
 * [urls].crash_report fails generation, because the stock default of --with-crashreporter-url is Mozilla's
 * crash-reports.mozilla.com. The flip is therefore this constant, never the deletion of an emitted literal.
 */
const CRASH_REPORTER_ENABLED = false;

/**
 * The crash-reporter lines of a mozconfig for a derived submit origin ('' when [urls].crash_report is unset).
 * Throws when the reporter would be enabled with no origin. Exported for the self-test, which plants that fault.
 */
export function crashReporterOptions(origin, enabled = CRASH_REPORTER_ENABLED) {
    if (enabled && origin === '') {
        throw new Error(
            'the crash reporter would be built on with no crash address, so it would send to the stock Mozilla address. '
            + `Write your own https crash-report address as [urls] crash_report in ${MANIFEST_NAME}, then run: ${RERUN}`,
        );
    }
    return [
        ...(enabled ? [] : ['ac_add_options --disable-crashreporter']),
        ...(origin ? [`ac_add_options --with-crashreporter-url=${origin}`] : []),
    ];
}

/**
 * The root .mozconfig: the shared generated-from banner, a blank line, then
 * thirteen lines against the file Phase 1 wrote by hand.
 *
 * FIVE VALUES come from the manifest: the MAR channel id and accepted MAR
 * channel ids (both `<app_basename>-<UPDATE_CHANNEL>`, NG-065), the
 * --with-app-basename argument, the --with-distribution-id argument, the
 * exported MOZ_APP_REMOTINGNAME, and -- inside the MOZ_OBJDIR shell-default
 * expansion on line 1 -- the variant's objdir.
 *
 * THE --with-branding DEFAULT IS A STRING LITERAL, NOT A SIXTH VALUE. The
 * 03-01 spike proved a branding path outside topsrcdir is rejected -- the
 * moz.build sandbox refuses files outside its allowed paths -- so the flag
 * points through the topsrcdir-internal symlink
 * powerbrowser/branding-generated (itself pointing at generated/branding),
 * with the dev variant as the default a release build overrides via
 * POWERBROWSER_BRANDING. The symlink sits one level above the per-variant
 * directories it serves rather than inside powerbrowser/branding/: the
 * --with-branding VALUE must sit exactly three levels under topsrcdir,
 * because the branding moz.build reaches upstream with a ../../../ include
 * resolved against that value's own path. A link one level deeper puts the
 * value at depth four and the include escapes topsrcdir -- proven red by a
 * configure run during this plan. That spelling was chosen by configure
 * runs, not by a manifest key, and T-03-03 keeps it that way: no manifest
 * value may select the branding flag, so this line joins nothing from the
 * config.
 *
 * WHY THE DEV VARIANT, ALWAYS. There is one .mozconfig, and the two expansions
 * spell out what the build falls back on when POWERBROWSER_OBJDIR and
 * POWERBROWSER_BRANDING are unset. Those fallbacks are the DEV defaults; a
 * release build sets the two environment variables. So this emitter takes the
 * dev variant not as a default that could reasonably be parameterised, but
 * because dev IS what an unset environment means here.
 *
 * WHY THE ENVIRONMENT VARIABLE NAMES STAY LITERAL. POWERBROWSER_OBJDIR and
 * POWERBROWSER_BRANDING are read by scripts and by the developer's shell, not
 * written by this phase; renaming them is not a rebrand operation and no
 * manifest key selects them. Their VALUES are configurable; their NAMES are
 * part of the build's interface.
 *
 * WHY SIX LINES ARE LITERAL TEXT (research assumption A3, and a recorded
 * decision rather than an oversight). Lines 2, 6, 7 and 10-12 are platform
 * policy and toolchain flags -- the application selection, the wasm sandbox,
 * the libclang path, the crash reporter, the compiler cache, and the
 * branding default. None of them is a
 * rebrand input: changing a brand never changes whether the crash reporter is
 * built. Promoting one to a [build] key later is purely additive -- one schema
 * entry and one emitter line -- so the cheap direction is to leave them literal
 * until a downstream actually needs to differ.
 *
  * THE CHANNEL LINES ARE FORK POLICY, NOT BRAND DEFAULTS (non-GUI NG-065,
  * UPD-11). --enable-unverified-updates compiled every MAR check out of
  * every build (the MAR signature and MAR-channel checks sit inside #ifdef
  * MOZ_VERIFY_MAR_SIGNATURE, updater.cpp:3063, 3329); removing it turns
  * verification on, and MAR_CHANNEL_ID plus ACCEPTED_MAR_CHANNEL_IDS bake
  * one fixed MAR channel into the build and into update-settings.ini. Line 3
  * names the update channel explicitly (configure's own default is the same
  * value, so the line changes no build). Both derive from updateChannel():
  * the update channel is UPDATE_CHANNEL, and the MAR channel id is
  * `<app_basename>-<UPDATE_CHANNEL>`. No [build] table: the channel is fork
  * policy; the MAR id's prefix is the manifest's app_basename.
 *
 * Built by concatenation rather than by template interpolation on the two
 * expansion lines: `${...}` inside a JS template literal is JS interpolation,
 * and the shell-default syntax has to survive to the emitted bytes intact.
 */
function emitMozconfig(config, variant) {
    return emitMozconfigFor(config, variant, { bootstrap: false, sbKeyfile: null });
}

/**
 * PKG-17 (Phase 45): the release .mozconfig variant. Same shape as the dev
 * row, parameterised rather than forked: drops the two Nix-only lines
 * (--without-wasm-sandboxed-libraries, --with-libclang-path), adds
 * --enable-bootstrap (Mozilla clang/rust/cbindgen plus the jessie sysroot
 * flow from the container), and -- with the UPD-29 line only when
 * sbKeyfile is non-null -- the release SB keyfile mount path. The dev row
 * keeps the unbaked default (never carries the keyfile line). MAR_CHANNEL_ID
 * and ACCEPTED_MAR_CHANNEL_IDS stay equal to powerbrowser-default on both
 * rows, so a foreign-channel MAR still fails with updater error 22.
 */
const SB_KEYFILE_MOUNT = '/keys/sb-gapi.data';
function emitMozconfigFor(config, variant, { bootstrap, sbKeyfile, tail = [] }) {
    // NG-065: one MAR channel for every build of this manifest, <app_basename>-<update channel>.
    // It is baked into MAR_CHANNEL_ID and into update-settings.ini's ACCEPTED_MAR_CHANNEL_IDS,
    // so a MAR made for another product or channel is refused (updater error
    // MAR_CHANNEL_MISMATCH_ERROR).
    const { channel, marChannelId: marChannel } = updateChannel(config);
    // Every manifest value on these thirteen lines lands in a file the Gecko
    // build sources, so each passes the sink guard on its way in. The
    // --with-branding default is the one line that carries no manifest value
    // at all -- see above -- so branding_dir is neither read nor guarded
    // here. (It is still read and guarded where it IS emitted as content:
    // the desktop entry's Icon line.)
    const objdir = assertEmittable(variantPath(variant, 'objdir'), variant.objdir);
    // TEL-07: empty while [urls].crash_report is unset, so no url line is emitted and the bytes do not move.
    // WR-09: crashReporterOptions owns the disable line and the url line together.
    let crashLines = [];
    try {
        crashLines = crashReporterOptions(crashReporterOrigin(config));
    } catch (err) {
        report([err.message]);
    }
    const brandingDefault = bootstrap
        ? 'powerbrowser/branding-generated/release'
        : 'powerbrowser/branding-generated/dev';
    const lines = [
        ...GENERATED_BANNER,
        '',
        'mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/../${POWERBROWSER_OBJDIR:-' + objdir + '}',
        'ac_add_options --enable-application=browser',
        `ac_add_options --enable-update-channel=${channel}`,
        `ac_add_options MAR_CHANNEL_ID=${marChannel}`,
        `ac_add_options ACCEPTED_MAR_CHANNEL_IDS=${marChannel}`,
        ...(bootstrap ? [] : ['ac_add_options --without-wasm-sandboxed-libraries']),
        ...(bootstrap ? [] : ['ac_add_options --with-libclang-path="$LIBCLANG_PATH"']),
        ...(bootstrap ? ['ac_add_options --enable-bootstrap'] : []),
        ...(sbKeyfile ? [`ac_add_options --with-google-safebrowsing-api-keyfile=${sbKeyfile}`] : []),
        `ac_add_options --with-app-basename=${assertEmittable('identity.app_basename', config.identity.app_basename)}`,
        `ac_add_options --with-distribution-id=${assertEmittable('identity.distribution_id', config.identity.distribution_id)}`,
        ...crashLines,
        'ac_add_options --with-ccache=sccache',
        'ac_add_options --with-branding=${POWERBROWSER_BRANDING:-' + brandingDefault + '}',
        `mk_add_options "export MOZ_APP_REMOTINGNAME=${assertEmittable('identity.remoting_name', config.identity.remoting_name)}"`,
        // Per-target tail (Phase 55, PKG-14). Empty for every existing row, so
        // their bytes do not move.
        ...tail,
    ];
    return lines.join('\n') + '\n';
}

/**
 * Phase 55 (PKG-14): the per-target macOS mozconfig. ONE shared builder
 * (emitMozconfigFor) carries every line the Linux dev row carries, with its
 * own objdir suffix; each target appends only the Darwin lines below. The
 * generic-certs switch (it widens privileged-update trust, Pitfall 2) and the
 * arm64 spelling (the canonical CPU name is aarch64, Pitfall 4,
 * init.configure:565-577) appear in no line below. Nothing checks that at
 * generation time: the generated-byte-identity row compares these bytes with
 * the tracked comparands, so a change that adds either spelling must also
 * change a tracked mozconfig, and that change is then reviewed as such.
 */
const MACOS_TARGETS = Object.freeze({
    aarch64: Object.freeze({ triple: 'aarch64-apple-darwin', objdir: 'objdir-macos-aarch64' }),
    x86_64: Object.freeze({ triple: 'x86_64-apple-darwin', objdir: 'objdir-macos-x86_64' }),
});
function emitMozconfigMacos(config, variant, cpu) {
    const target = MACOS_TARGETS[cpu];
    const tail = [
        `ac_add_options --target=${target.triple}`,
        // The bootstrap SDK floor is 26.5 (toolchain.configure mac_sdk_min_version).
        'mk_add_options "export MACOS_SDK_DIR=$MOZ_FETCHES_DIR/MacOSX26.5.sdk"',
        // The DMG tools for the Linux branch of dmg.py (upstream cross-mozconfig.common).
        'mk_add_options "export MKFSHFS=$MOZ_FETCHES_DIR/hfsplus/newfs_hfs"',
        'mk_add_options "export DMG_TOOL=$MOZ_FETCHES_DIR/dmg/dmg"',
        'mk_add_options "export HFS_TOOL=$MOZ_FETCHES_DIR/dmg/hfsplus"',
    ];
    return emitMozconfigFor(config, { ...variant, objdir: target.objdir }, { bootstrap: false, sbKeyfile: null, tail });
}

/**
 * Phase 54 (PKG-11): the per-target Windows mozconfig, through the SAME shared
 * builder as the release and macOS rows (emitMozconfigFor). The release shape
 * is the cross-build shape: the container bootstrap (--enable-bootstrap, the
 * release branch's flags, the release SB keyfile mount) plus the Windows tail.
 * The tail carries the target triple and --disable-maintenance-service, which
 * keeps the NSIS maintenance service out of the build (T-54-01). No function
 * body here spells the enabling flag, so the only way a build gets it is a
 * reviewed edit to this tail, which the windows-mozconfig row then reds.
 */
// node: the powerbrowser/packaging/node-runtime.json key the Windows stage reads (PKG-13).
export const WINDOWS_TARGET = Object.freeze({ triple: 'x86_64-pc-windows-msvc', objdir: 'objdir-windows-x86_64', node: 'win32-x64' });
export function emitMozconfigWindows(config, variant) {
    const tail = [
        `ac_add_options --target=${WINDOWS_TARGET.triple}`,
        'ac_add_options --disable-maintenance-service',
    ];
    return emitMozconfigFor(config, { ...variant, objdir: WINDOWS_TARGET.objdir }, { bootstrap: true, sbKeyfile: SB_KEYFILE_MOUNT, tail });
}

/**
 * UPD-29 (Phase 45): the release-variant SB keyfile line joins the release
 * branch only. The mount path is a platform constant (the legion keydir is
 * bind-mounted read-only at /keys inside the container, per the mount
 * discipline in powerbrowser/packaging/Containerfile's neighbours), never a
 * manifest key and never the key value -- only the path travels in the tree.
 */
function emitMozconfigRelease(config, variant) {
    return emitMozconfigFor(config, variant, { bootstrap: true, sbKeyfile: SB_KEYFILE_MOUNT });
}

/**
 * The Gecko identity carrier (03-04, GEN-01 close-out; 05-01 hook-only
 * strip): the vendor/UA project_flag values plus the two telemetry-policy
 * flags patch 010 used to hard-code, emitted as imply_option lines for the
 * build to include.
 *
 * WHY AN INCLUDE, NOT MOZCONFIG EXPORTS. MOZ_APP_VENDOR and MOZ_APP_UA_NAME
 * are project_flag() values, whose template pins possible_origins to
 * ("implied",) -- only imply_option inside a moz.configure file can set
 * them. A mozconfig export line is the environment origin and configure
 * rejects it ("can not be set by environment. Values are accepted from:
 * implied", proven red by a forced configure during this plan). So the
 * carrier is a generated moz.configure fragment, pulled into the build by
 * the single include() hook patch 010 carries.
 *
 * FIXED VS CONFIGURED (05-01, MIG-05). The two telemetry lines --
 * imply_option("MOZ_SERVICES_HEALTHREPORT", False) and
 * imply_option("MOZ_NORMANDY", False) -- are FIXED platform content, not
 * manifest keys. The manifest covers identity, branding, telemetry,
 * extensions, URLs and pins; these two build flags are platform policy
 * (this tree compiles both subsystems out for every downstream), not
 * downstream-varying brand, so no manifest key feeds them and no rebrand
 * can switch them. A downstream that needs either subsystem carries its
 * own patch. This is also why the brand-value scan
 * (scripts/check-patch-surface.sh) never matches them: that scan derives
 * its set from configuration.toml, and these lines derive from nothing but
 * this emitter.
 *
 * MOZ_APP_ID is deliberately NOT carried here. The 05-01 audit proved the
 * GUID line is byte-identical stock context -- `git show
 * HEAD:browser/moz.configure` already carries
 * "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}" and patch 010 never changed it
 * (it rides the hunk as a context line, not a +line). Relocating it would
 * delete a stock line only to re-add the identical value elsewhere: churn
 * with a second source for one fact. It stays where upstream put it. (This
 * corrects the 03-04 comment that called it "patch-carried".)
 *
 * WHY ONE FILE, NOT ONE PER VARIANT. Vendor and UA name do not vary by
 * variant -- the dev/release split is name_suffix, which reaches the build
 * as MOZ_APP_DISPLAYNAME through configure.sh. One fragment on the dev
 * variant row, like the single .mozconfig.
 *
 * UA_NAME takes no manifest key by design -- it is the D-78 compat literal
 * (same rationale as -brand-product-name = Firefox in emitBrandFtl).
 * The vendor line passes the sink guard; the UA literal and the two fixed
 * policy lines carry no interpolation: the fragment executes in the
 * configure sandbox, so a quote in either vendor value would break out of
 * its string.
 *
 * The fragment reaches the build through the topsrcdir-internal symlink
 * upstream/identity.configure (setup-created by fetch-upstream.sh
 * alongside the branding overlay, never committed), which the patch
 * includes as ../identity.configure -- lexically inside topsrcdir for the
 * sandbox's basedir check, resolving to this file outside it.
 *
 * CARRIER BANNER (05-01, WR-05). The shared GENERATED_BANNER's recovery
 * pointers are wrong for this file -- there is no tracked
 * identity.configure to copy over, and until the MIG-05 comparand the
 * generated-byte-identity row skipped untracked rows -- so the carrier
 * carries its own banner naming the real pointers: this emitter, the
 * upstream symlink, and the two gates that redden on a disagreement.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
const IDENTITY_BANNER = Object.freeze([
    '# Managed by scripts/generate.mjs -- do not edit here.',
    '# The vendor and UA lines derive from configuration.toml; the telemetry',
    '# policy lines below them are fixed platform content (see emitIdentityConfigure).',
    '# To change it: edit scripts/generate.mjs, then run: node scripts/generate.mjs.',
    '# It reaches the build through the upstream/identity.configure symlink',
    '# (setup-created by scripts/fetch-upstream.sh, never committed).',
    '# A disagreement reddens: scripts/verify-platform.sh --only generated-byte-identity',
    '# and: scripts/verify-branding-preflight.mjs (check 5).',
]);
function emitIdentityConfigure(config, variant) {
    void variant;
    const vendor = assertEmittable('product.vendor_machine', config.product.vendor_machine);
    const ua = assertEmittable('product.ua_name', 'Firefox');
    const lines = [
        ...IDENTITY_BANNER,
        '',
        `imply_option("MOZ_APP_VENDOR", "${vendor}")`,
        `imply_option("MOZ_APP_UA_NAME", "${ua}")`,
        // FIXED platform policy, not manifest-derived -- see above. These
        // two lines are what patch 010 used to hard-code; the patch now
        // carries only the include hook and comments (MIG-05).
        'imply_option("MOZ_SERVICES_HEALTHREPORT", False)',
        'imply_option("MOZ_NORMANDY", False)',
    ];
    // NG-064: the update host comes from the manifest. upstream/build/moz.build:96 uses
    // CONFIG["MOZ_APPUPDATE_HOST"] instead of its aus5 default when it is set. Unset
    // means no line. A downstream that inherits the platform's own host is refused
    // before any emission (non-GUI ruling R11; resolveConfig, Task 15).
    const update = config.urls?.update;
    if (!isUnset(update)) {
        // M-2: a downstream that mistypes the update address gets the named
        // failure, not a TypeError. The schema regex already refuses non-https
        // values in validate(); this guards a bypassed validate (same split as
        // manifestEndpointSources and emitLegalNotices).
        let host;
        try {
            host = new URL(assertEmittable('urls.update', update)).host;
        } catch {
            host = '';
        }
        if (host === '') {
            report([
                `urls.update is ${JSON.stringify(update)}, which is not an https URL. `
                + `Write your own https update address as [urls] update in ${MANIFEST_NAME}, then run: ${RERUN}`,
            ]);
        }
        lines.push(`set_config("MOZ_APPUPDATE_HOST", ${JSON.stringify(host)})`);
    }
    return lines.join('\n') + '\n';
}

/**
 * The Theia application frontend-config fragment (04-01, GEN-05 tracer):
 * the brand-owned keys of theia/applications/browser/package.json's
 * `theia.frontend.config` block -- `applicationName` from
 * identity.display_name, and (04-04) `defaultTheme` from
 * theia.default_theme.
 *
 * WHICH DISPLAY FORM. identity.display_name is the BASE name -- the release
 * short name the preflight pins on the tracked package.json against the
 * inventory, never the manifest. The dev name_suffix never reaches the
 * Theia window title: there is one application manifest, not one per
 * variant, so a suffixed name would brand every window Dev.
 *
 * THEME SHAPE. Theia's DefaultTheme is a string id or a {light, dark} pair
 * (application-package application-props.ts); the manifest carries the
 * string form only, and the emitter passes it through verbatim. An unset
 * theme omits the key rather than restating Theia's own default pair --
 * restating it would make this file a second source for Theia's default.
 * validateTheia has already refused unknown ids, and the sink guard below
 * re-checks the enum so a future loosening cannot emit an arbitrary
 * string into the fragment.
 *
 * FRAGMENT, NOT THE WHOLE BLOCK. The tracked package.json carries sibling
 * keys no rebrand owns -- powerbrowserPrivilegedJs, the preferences map --
 * so emitting the whole object would make this file's literals the owner
 * of Theia behaviour flags. The copy-over is surgical instead: set ONLY
 * the keys of this fragment and leave every sibling
 * byte-identical. Whole-file byte-identity is brittle here anyway -- yarn
 * rewrites that file -- which is why the contract is block-level equality
 * on these keys rather than a tracked comparand row.
 *
 * WHY NO GENERATED_BANNER. Strict JSON carries no comment, and a `_comment`
 * key would pollute the block a reader copies from. The derivation is
 * stated here instead; freshness is generate --check's contract through
 * the frozen TARGETS row below, and the tracked side is
 * verify-branding-preflight.mjs's applicationName assertion.
 *
 * The value passes the shell sink guard. A JSON string value must refuse a
 * double quote and a backslash or one value rewrites the document around
 * it; the dollar/backtick/tab/newline rejections cost nothing here and keep
 * every interpolation in this file under one rule, exactly as emitBrandFtl
 * already does for Fluent terms. The schema patterns already exclude all
 * of these, so on a validated manifest this guard never fires -- it is
 * what fires if a future schema edit drops the display_name pattern.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
export function emitTheiaFrontendConfig(config, variant) {
    void variant;
    const name = assertEmittable('identity.display_name', config.identity.display_name);
    const lines = [
        '{',
        `  "applicationName": ${JSON.stringify(name)},`,
    ];
    const rawTheme = config.theia?.default_theme;
    if (!isUnset(rawTheme)) {
        if (!THEIA_THEME_IDS.includes(rawTheme)) {
            report([
                `theia.default_theme is ${JSON.stringify(rawTheme)}, which is not a theme id this project implements. `
                + `Write it as one of ${THEIA_THEME_IDS.map(t => JSON.stringify(t)).join(', ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
            ]);
        }
        assertEmittable('theia.default_theme', rawTheme);
        lines.push(`  "defaultTheme": ${JSON.stringify(rawTheme)},`);
    }
    // The last entry's trailing comma comes off: strict JSON, read back
    // with JSON.parse by the copy-over, like emitTheiaPlugins below.
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    lines.push('}');
    return lines.join('\n') + '\n';
}

/**
 * The single-line `<svg>` element out of brand/mark.svg, read the same way
 * scripts/verify-branding-preflight.mjs reads it (first line starting with
 * `<svg`), never restated. A missing file or a missing element is a hard
 * failure naming the asset, never an empty string the widgets would render
 * as nothing -- the icon pipeline's squareness rule already gates the
 * artwork's SHAPE at rasterize time; this gates its PRESENCE for the
 * runtime channel.
 */
function readMarkSvgElement() {
    let text;
    try {
        text = readFileSync(markSvgAbs(), 'utf8');
    } catch {
        text = null;
    }
    const line = text === null ? undefined : text.split('\n').find((l) => l.startsWith('<svg'));
    if (line === undefined) {
        report([
            `${MARK_SVG_REL} carries no single-line <svg> element to publish to the Theia runtime channel. `
            + `Restore the one-line svg element in ${MARK_SVG_REL}, then run: ${RERUN}`,
        ]);
    }
    return line.trim();
}

/**
 * The fixed predicate of the Mozilla non-association notice (06-04, VER-02).
 *
 * Named once: emitLegalNotices composes the notice from it, and
 * scripts/verify-trademark-surface.mjs anchors its mandated-sentence
 * exclusion on this same const (imported, never restated), so the two
 * cannot drift into disagreeing about which sentence the policy mandates.
 * The trademark policy requires the non-association statement to name
 * Mozilla in words, which is why the display-surface token scan must let
 * exactly this sentence shape through.
 */
export const MOZILLA_NON_ASSOCIATION_TAIL = 'is not officially associated with Mozilla or its products.';

/**
 * The three About-dialog legal notices (06-04, VER-02): the downstream's
 * own trademark notice verbatim, the Mozilla non-association sentence, and
 * the Eclipse attribution sentence.
 *
 * DERIVATION, PER NOTICE. The own notice is legal.trademark_notice
 * verbatim (required, so always stated). The Mozilla sentence
 * interpolates the manifest display identity in the same
 * display-name-plus-suffix composition the locale emitters use, with the
 * fixed tail above. The Eclipse sentence names Theia as a trademark of
 * Eclipse Foundation AISBL and identifies this product's home by the
 * manifest repo URL's domain -- REUSED via URL parsing of the already
 * derived repoUrl, never restated as a literal, so a domain move carries
 * the sentence with it. Each component passes the sink guard on the way
 * in; the fixed tails are authored literals carrying no interpolation.
 *
 * NULL-TOLERANT LIKE THE REST OF THE CHANNEL. A null repoUrl (both
 * support URL and homepage emptied downstream) emits the bare
 * attribution core without the home clause rather than failing the
 * generate: the channel already tolerates null texts the same way, and a
 * missing home link is the widgets' fallback-constant case, not a
 * manifest defect this emitter owns. An UNPARSEABLE repoUrl is different:
 * it passed the schema yet names no host, so it fails naming the key,
 * the same shape manifestEndpointSources keeps.
 *
 * ONE NOTICE PER LINE in the emitted array, deliberately: the
 * trademark-surface token scan excludes the mandated Mozilla sentence by
 * anchored line match, and a single-line array would let any other notice
 * ride that line's exclusion with it.
 */
function emitLegalNotices(config, variant, repoUrl, repoPath) {
    const own = assertEmittable('legal.trademark_notice', config.legal.trademark_notice);
    const base = assertEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const mozilla = `${base}${suffix} ${MOZILLA_NON_ASSOCIATION_TAIL}`;
    let eclipse = 'Eclipse Theia is a trademark of Eclipse Foundation AISBL.';
    if (!isUnset(repoUrl)) {
        let host = '';
        try {
            host = new URL(repoUrl).hostname;
        } catch {
            host = '';
        }
        if (host === '') {
            report([
                `${repoPath} is ${JSON.stringify(repoUrl)}, which names no host for the Eclipse attribution sentence to identify this product's home. `
                + `Write it as a web address starting with https:// in ${MANIFEST_NAME}, then run: ${RERUN}`,
            ]);
        }
        eclipse = `This product (${assertEmittable(repoPath, host)}) includes Eclipse Theia, a trademark of Eclipse Foundation AISBL.`;
    }
    return [own, mozilla, eclipse];
}

/**
 * The Theia branding fragment (04-04, GEN-05 remainder): the
 * `powerbrowserBranding` key of theia/applications/browser/package.json's
 * `theia.frontend.config` block -- welcome/about display texts, the
 * in-app repo URL, and the mark SVG -- read at runtime through
 * FrontendApplicationConfigProvider with the compiled values as boot
 * fallbacks, so a rebrand is a manifest edit plus the app-bundle step,
 * never a `.ts` edit.
 *
 * FRAGMENT, NOT THE WHOLE BLOCK (04-01's rule carried over, 04-03's
 * precedent: one fragment per brand-owned key, same package.json block).
 * No tracked comparand -- the tracked package.json is yarn-managed, so
 * whole-file byte-identity is brittle there; the copy-over sets ONLY the
 * powerbrowserBranding key from this fragment, and the byte-identity gate
 * skips rows without one while --check still covers the row through the
 * frozen table. The tracked side is pinned by
 * scripts/verify-theia-branding.mjs (fragment equality against this
 * emission, block equality on the tracked key).
 *
 * WHY NO GENERATED_BANNER. Same reason as the fragments before it:
 * strict JSON carries no comment, and a `_comment` key would pollute the
 * block a reader copies from. Derivation lives here; freshness is
 * generate --check's contract.
 *
 * UNSET TEXTS ARE NULL. welcome_text and about_text are required: false
 * with no shipped value -- an unset text emits null and the widgets render
 * no element for it, rather than inventing copy the manifest never stated.
 * An explicitly emptied string never reaches here: the schema pattern
 * needs one or more characters, so it fails validation naming the key.
 *
 * THE REPO URL IS REUSED, NOT RESTATED. There is no `urls.repo_url` key:
 * installer.support_url is already the one support URL (falling back to
 * product.homepage where a downstream states no installer section), so a
 * second key for the same value would be one setting with two paths. The
 * value is emitted verbatim -- no trailing-slash normalisation (CFG-03:
 * rejection only, never mangling).
 *
 * THE MARK IS TEXT, NOT BINARY. The 04-01 channel decision left the logo
 * BINARY channel open because a PNG cannot ride a JSON string; the mark
  * SVG is text, so it rides as a string key, read from brand/mark.svg at
  * emit time. No assertEmittable on it: the SVG legitimately carries double
  * quotes, and JSON.stringify is the correct escaping for a JSON sink --
  * the shell-sink guard would reject every real logo. Its presence is
  * asserted above; its shape is the icon pipeline's contract.
  *
  * LEGAL NOTICES (06-04) ride as a string array, one notice per line (see
  * emitLegalNotices for the per-notice derivation): the downstream's own
  * trademark notice, the Mozilla non-association sentence, and the Eclipse
  * attribution sentence. The About dialog renders them as text nodes
  * through the channel reader with compiled fallbacks where the provider
  * is unset.
  *
  * Joined with a literal newline, never the platform line-ending constant.
  */
export function emitTheiaBranding(config, variant) {
    const rawWelcome = config.theia?.welcome_text;
    const welcomeText = isUnset(rawWelcome) ? null : assertEmittable('theia.welcome_text', rawWelcome);
    const rawAbout = config.theia?.about_text;
    const aboutText = isUnset(rawAbout) ? null : assertEmittable('theia.about_text', rawAbout);
    const rawRepo = config.installer?.support_url ?? config.product?.homepage;
    const repoPath = config.installer?.support_url !== undefined ? 'installer.support_url' : 'product.homepage';
    const repoUrl = isUnset(rawRepo) ? null : assertEmittable(repoPath, rawRepo);
    const markSvg = readMarkSvgElement();
    // The variant carries the name_suffix the Mozilla sentence composes
    // with the display name; the TARGETS row below runs this on the dev
    // variant, so the sentence names the dev composition.
    const legalNotices = emitLegalNotices(config, variant, repoUrl, repoPath);
    const lines = [
        '{',
        `  "welcomeText": ${JSON.stringify(welcomeText)},`,
        `  "aboutText": ${JSON.stringify(aboutText)},`,
        `  "repoUrl": ${JSON.stringify(repoUrl)},`,
        `  "markSvg": ${JSON.stringify(markSvg)},`,
        '  "legalNotices": [',
        ...legalNotices.map((notice, i) => `    ${JSON.stringify(notice)}${i < legalNotices.length - 1 ? ',' : ''}`),
        '  ]',
        '}',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The exact versioned Open VSX file URL for a pinned entry.
 *
 * NO latest-resolution at any point in this pipeline: the version segment is
 * the manifest's pinned version, so what the build downloads is what the
 * manifest names. The publisher is everything up to the FIRST dot -- the id
 * pattern keeps dots out of the publisher half, so the first dot is the
 * separator whatever the extension name carries.
 */
export function openVsxFileUrl(entry) {
    const dot = entry.id.indexOf('.');
    const namespace = entry.id.slice(0, dot);
    const name = entry.id.slice(dot + 1);
    return `https://open-vsx.org/api/${namespace}/${name}/${entry.version}/file/${entry.id}-${entry.version}.vsix`;
}

/**
 * The registry tarball URL for a pinned npm entry (EXT-02).
 *
 * The conventional registry layout `https://registry.npmjs.org/<pkg>/-/<pkg>-<version>.tgz`,
 * with the entry id as the package name. The registry is authoritative for
 * this shape: at pin-bootstrap time the operator confirms it with
 * `npm view <id>@<version> dist.tarball dist.integrity` and records the
 * integrity digest alongside. After that the pin gate holds the line two
 * ways -- the emitted URL must equal the recorded one (block equality) and
 * must end in `-<version>.tgz` (the float guard) -- so a proxy-moved tarball
 * or a re-resolved float goes red rather than downloading silently.
 *
 * The id and version pass the sink guard on the way in: both schema shapes
 * already exclude every sink metacharacter, so on a validated manifest these
 * guards never fire -- they stop a future schema loosening from emitting a
 * hostile URL. The composed URL itself carries no downloader placeholder;
 * per-target npm layouts are not a shape this pipeline names.
 */
export function npmDistTarballUrl(entry) {
    const id = assertEmittable(`${EXTENSIONS_PREFIX}id`, entry.id);
    const version = assertEmittable(`${EXTENSIONS_PREFIX}version`, entry.version);
    return `https://registry.npmjs.org/${id}/-/${id}-${version}.tgz`;
}

/**
 * The packed-archive reference for a local-path entry (EXT-02).
 *
 * The download step packs the stated folder to canonical bytes and keeps
 * them under this reference; the manifest pin (sha256) covers those packed
 * bytes, never a raw directory listing. The `.tgz` ending routes the pin
 * gate to the same `.tar.gz` archive slot every other kind hashes.
 *
 * The path passes the sink guard on the way in, for the same defence-in-depth
 * reason as the npm resolver above. The relative-path schema shape already
 * excludes `$`, so no downloader placeholder can smuggle through here --
 * placeholder passthrough is the direct-URL kind's alone.
 */
export function localPackRef(entry) {
    const path = assertEmittable(`${EXTENSIONS_PREFIX}path`, entry.path);
    return `${path}.tgz`;
}

/**
 * The declared-extensions map (04-02, EXT-01; npm/local-path EXT-02): the application
 * package.json's `theiaPlugins` block, one exact download URL per
 * [[extensions]] entry -- the versioned file URL above for source =
 * "openvsx", the stated URL verbatim for source = "url", the registry
 * tarball URL for source = "npm", the packed-archive reference for source =
 * "local-path".
 *
 * A direct URL carrying the downloader placeholder `${targetPlatform}` passes
 * through byte-verbatim: it names the machine that runs the download, never
 * the machine that runs the generator, so expanding it here would pin one
 * platform's bytes under a universal pin. The sink guard is therefore applied
 * to resolver INPUTS (npm id/version, local path -- all `$`-free by schema
 * shape), never to an emitted URL.
 *
 * FRAGMENT, NOT THE WHOLE MANIFEST (04-01's rule carried over). The tracked
 * package.json is yarn-managed, so whole-file byte-identity is brittle
 * there; the copy-over sets ONLY the theiaPlugins block from this fragment
 * and leaves every sibling byte-identical. No tracked comparand row -- the
 * byte-identity gate skips rows without one, --check still covers this row
 * through the frozen table, and the tracked side is pinned by
 * scripts/verify-extension-pins.mjs (block equality + version segments +
 * sha256 over the packed archives).
 *
 * WHY NO GENERATED_BANNER. Same reason as the frontend-config fragment:
 * strict JSON carries no comment, and a `_comment` key would pollute the
 * block a reader copies from. Derivation lives here; freshness is
 * generate --check's contract.
 *
 * An absent [[extensions]] list emits the empty map: the no-extension tree
 * is today's tree, and its correct tracked state is NO theiaPlugins block
 * at all. A downstream drops a default entry by restating the list without
 * it (D-07 array-replace) -- restating an empty list drops them all.
 *
 * Runs AFTER validate(), so every entry below carries its source's pins in
 * the schema's shapes. The id-dot check is defence in depth for a future
 * schema edit that loosens the id pattern: without a dot there is no
 * publisher to build the file URL from.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
export function emitTheiaPlugins(config, variant) {
    void variant;
    const lines = ['{'];
    for (const entry of config.extensions ?? []) {
        if (typeof entry?.id !== 'string' || !entry.id.includes('.')
            || !EXTENSION_SOURCES.includes(entry.source)) {
            report([
                `the [[extensions]] entry with id ${JSON.stringify(entry?.id ?? '')} cannot be resolved to a download URL as it stands. `
                + `Open ${MANIFEST_NAME}, correct it, then run: ${RERUN}`,
            ]);
        }
        const url = entry.source === 'openvsx' ? openVsxFileUrl(entry)
            : entry.source === 'npm' ? npmDistTarballUrl(entry)
            : entry.source === 'local-path' ? localPackRef(entry)
            : entry.url;
        lines.push(`  ${JSON.stringify(entry.id)}: ${JSON.stringify(url)},`);
    }
    // A trailing comma after the last entry is NOT valid strict JSON, and the
    // copy-over reads this file with JSON.parse -- so the final comma comes
    // off. (Built per line rather than via JSON.stringify of the whole map to
    // keep the one-entry-per-line shape the fragment readers expect.)
    if (lines.length > 1) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    lines.push('}');
    return lines.join('\n') + '\n';
}

/**
 * The declared-WebExtensions map (EXT-03): the distribution
 * policies.json's `ExtensionSettings` key, one force/normal install entry
 * per [[webextensions]] declaration -- the add-on id, its installation
 * mode, and the self-hosted install URL the policy engine installs and
 * updates from.
 *
 * FRAGMENT, NOT THE WHOLE POLICY FILE. The tracked
 * powerbrowser/distribution/policies.json carries two sibling keys the
 * manifest does not own (DisableTelemetry, DisableFirefoxStudies; it
 * carries no update URL, UPD-12); whole-file byte-identity would wed those keys
 * to this emitter. The copy-over sets ONLY the ExtensionSettings key from
 * this fragment and leaves every sibling byte-identical. No tracked
 * comparand row -- the byte-identity gate skips rows without one, --check
 * still covers the row through the frozen table, and the tracked side is
 * pinned by scripts/verify-webextensions.mjs (key equality against this
 * emission, stale-key rejection, install_url origin coverage).
 *
 * WHY NO GENERATED_BANNER. Same reason as the theiaPlugins fragment:
 * strict JSON carries no comment, and a `_comment` key would pollute the
 * key a reader copies from. Derivation lives here; freshness is
 * generate --check's contract.
 *
 * An absent [[webextensions]] list emits the empty object: the
 * no-declared-add-on tree is today's tree, and its correct tracked state
 * is an empty ExtensionSettings key. A downstream drops an entry by
 * restating the list without it (D-07 array-replace) -- restating an
 * empty list drops them all.
 *
 * Runs AFTER validate(), so every entry below carries a known mode in the
 * schema's shapes. The mode re-check is defence in depth for a future
 * edit that loosens the validator: without a known mode there is no
 * policy entry to emit. Every emitted value passes the sink guard on the
 * way out -- the key lands in a JSON document the policy engine reads, so
 * a quote, a backslash or a line break in any value rewrites it.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
export function emitWebExtensionSettings(config, variant) {
    void variant;
    const lines = ['{'];
    for (const entry of config.webextensions ?? []) {
        if (typeof entry?.id !== 'string' || entry.id === ''
            || !WEBEXTENSION_INSTALLATION_MODES.includes(entry.installation_mode)) {
            report([
                `the [[webextensions]] entry with id ${JSON.stringify(entry?.id ?? '')} cannot be resolved to an ExtensionSettings entry as it stands. `
                + `Open ${MANIFEST_NAME}, correct it, then run: ${RERUN}`,
            ]);
        }
        const id = assertEmittable(`${WEBEXTENSIONS_PREFIX}id`, entry.id);
        const mode = assertEmittable(`${WEBEXTENSIONS_PREFIX}installation_mode`, entry.installation_mode);
        const url = assertEmittable(`${WEBEXTENSIONS_PREFIX}install_url`, entry.install_url);
        lines.push(`  ${JSON.stringify(id)}: {`);
        lines.push(`    "installation_mode": ${JSON.stringify(mode)},`);
        lines.push(`    "install_url": ${JSON.stringify(url)}`);
        lines.push('  },');
    }
    // A trailing comma after the last entry is NOT valid strict JSON, and
    // the copy-over reads this file with JSON.parse -- so the final comma
    // comes off. (Built per line rather than via JSON.stringify of the
    // whole map to keep the one-entry-per-block shape the fragment readers
    // expect.)
    if (lines.length > 1) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    lines.push('}');
    return lines.join('\n') + '\n';
}
/**
 * The configured search engines (BAR-04): the distribution policies.json's
 * `SearchEngines` key, `{Add: [{Name, URLTemplate, SuggestURLTemplate}],
 * Default: <first name>}`, one Add entry per [[search_engines]]
 * declaration in manifest order. The first entry is the default engine.
 *
 * FRAGMENT, NOT THE WHOLE POLICY FILE. Same split as
 * emitWebExtensionSettings: the tracked policies.json carries sibling keys
 * the manifest does not own, so the copy-over sets ONLY the SearchEngines
 * key from this fragment and leaves every sibling byte-identical. No
 * tracked comparand row -- the byte-identity gate skips rows without one,
 * --check still covers the row through the frozen table, and the tracked
 * side is pinned by scripts/verify-search-engines.mjs (key equality
 * against this emission, shipped-name collision, template shape).
 *
 * WHY NO GENERATED_BANNER. Same reason as the fragments before it: strict
 * JSON carries no comment, and a `_comment` key would pollute the key a
 * reader copies from.
 *
 * WHAT IS DELIBERATELY NOT EMITTED. No IconURL (an https icon is a network
 * fetch at engine install), no Method or PostData (GET only), no Remove
 * (the policy applies it only after a stock window restores, so it cannot
 * be relied on to hide Firefox's engines -- the bar's own filter does that).
 *
 * An absent [[search_engines]] table emits the empty object: no
 * SearchEngines policy, and the bar keeps Firefox's own engines. A
 * downstream replaces the list by restating it (D-07 array-replace).
 *
 * Runs AFTER validate(), so every entry carries a name and an https url
 * holding {searchTerms}. Every emitted value passes the sink guard on the
 * way out -- the key lands in a JSON document the policy engine reads.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
export function emitSearchEngines(config, variant) {
    void variant;
    const engines = config.search_engines ?? [];
    if (engines.length === 0) return '{}\n';
    const lines = ['{', '  "Add": ['];
    for (const entry of engines) {
        const name = assertEmittable(`${SEARCH_ENGINES_PREFIX}name`, entry?.name);
        const url = assertEmittable(`${SEARCH_ENGINES_PREFIX}url`, entry?.url);
        lines.push('    {');
        lines.push(`      "Name": ${JSON.stringify(name)},`);
        if (isUnset(entry.suggest_url)) {
            lines.push(`      "URLTemplate": ${JSON.stringify(url)}`);
        } else {
            const suggest = assertEmittable(`${SEARCH_ENGINES_PREFIX}suggest_url`, entry.suggest_url);
            lines.push(`      "URLTemplate": ${JSON.stringify(url)},`);
            lines.push(`      "SuggestURLTemplate": ${JSON.stringify(suggest)}`);
        }
        lines.push('    },');
    }
    // A trailing comma after the last entry is not valid strict JSON.
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    lines.push('  ],');
    lines.push(`  "Default": ${JSON.stringify(engines[0].name)}`);
    lines.push('}');
    return lines.join('\n') + '\n';
}
/**
 * The telemetry fragment (04-03, TEL-01/TEL-02): the level the sender
 * enforces and the downstream's own endpoint it delivers to, as
 * `{level, endpoint}`, plus the version and buildID TEL-06 stamps on each
 * error report (both from releaseIdentity, so they never drift from the
 * manifest).
 *
 * FRAGMENT, NOT THE WHOLE PACKAGE (04-01's rule carried over). The tracked
 * theia/applications/browser/package.json is yarn-managed, so whole-file
 * byte-identity is brittle there; the copy-over sets ONLY the
 * powerbrowserTelemetry key from this fragment and leaves every sibling
 * byte-identical. No tracked comparand row -- the byte-identity gate skips
 * rows without one, --check still covers the row through the frozen table,
 * and the tracked side is pinned by scripts/verify-telemetry.mjs (fragment
 * equality against this emission, block equality on the tracked key).
 *
 * WHY NO GENERATED_BANNER. Same reason as the two fragments before it:
 * strict JSON carries no comment, and a `_comment` key would pollute the
 * block a reader copies from. Derivation lives here; freshness is
 * generate --check's contract.
 *
 * UNSET LEVEL IS OFF. The shipped manifest states `off` explicitly, so a
 * downstream omitting the key inherits it through the standard merge with
 * the standard D-08 default-echo; a manifest with no [telemetry] at all
 * (every self-test fixture) resolves the same way here. An unset endpoint
 * emits null -- with level off there is nowhere to send and nothing is
 * ever sent, and with any other level validate() has already refused the
 * manifest, so null never reaches a live sender.
 *
 * Both values pass the sink guard on the way out, and the level passes
 * the enum a second time: the schema carries no level pattern by design
 * (an enum is not a shape), so without this check a future edit loosening
 * validateTelemetry would emit an arbitrary string into the fragment.
 * The endpoint pattern already excludes every sink metacharacter, so on a
 * validated manifest these guards never fire.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
export function emitTheiaTelemetry(config, variant) {
    void variant;
    const rawLevel = config.telemetry?.level;
    const level = isUnset(rawLevel) ? 'off' : rawLevel;
    if (!TELEMETRY_LEVELS.includes(level)) {
        report([
            `telemetry.level is ${JSON.stringify(level)}, which is not a telemetry level this project implements. `
            + `Write it as one of ${TELEMETRY_LEVELS.map(l => JSON.stringify(l)).join(', ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
        ]);
    }
    const rawEndpoint = config.telemetry?.endpoint;
    const endpoint = isUnset(rawEndpoint) ? null : rawEndpoint;
    assertEmittable('telemetry.level', level);
    if (endpoint !== null) assertEmittable('telemetry.endpoint', endpoint);
    // TEL-06: version is the ESR version and buildID the release key (v<ESR>-<revision>),
    // both from releaseIdentity so the error reports carry the build that produced them.
    // buildID is not MOZ_BUILDID: that one names the Gecko build in MAR descriptors.
    const identity = releaseIdentity(config);
    const lines = [
        '{',
        `  "level": ${JSON.stringify(level)},`,
        `  "endpoint": ${JSON.stringify(endpoint)},`,
        `  "version": ${JSON.stringify(assertEmittable('product.version', identity.esrVersion))},`,
        `  "buildID": ${JSON.stringify(assertEmittable('product.buildID', identity.releaseKey))}`,
        '}',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The placeholder standing in for the checkout's absolute path in both
 * emitted .desktop entries (02-DESIGN-G-02-11.md, option-4-placeholder). The
 * `POWERBROWSER_` prefix already appears literally in tracked files
 * (POWERBROWSER_OBJDIR and POWERBROWSER_BRANDING in .mozconfig), so the token
 * introduces no new residue class for scripts/scan-brand-residue.mjs.
 */
const DESKTOP_ROOT_TOKEN = '@POWERBROWSER_REPO_ROOT@';

/**
 * A freedesktop .desktop entry: the shared generated-from banner, one
 * install-substitution comment line, then nine lines against the files Phase 1
 * wrote by hand. One emitter, both variants; the dev and release files differ
 * in exactly three lines and all three differences come from the variant.
 *
 * THE ABSOLUTE PATHS ARE A TOKEN, NOT A PATH (D-04 as amended in
 * 02-DESIGN-G-02-11.md). A desktop entry must name an absolute executable, but
 * a tracked file carrying this checkout's absolute path is wrong at every
 * other checkout -- and the byte-identity gate comparing the tracked file
 * against the emitter output would then be red everywhere but here. So Exec
 * and Icon carry the token above followed by the variant's relative objdir /
 * branding_dir, and the substitution to a real absolute path happens at
 * install time (see the emitted comment line and docs/BUILD.md). No
 * machine-specific value enters configuration.toml -- that half of D-04 is
 * unchanged -- and the root is still never derived from the working directory.
 *
 * The header, Terminal, Type, Categories and the MimeType list are freedesktop
 * platform constants, not rebrand inputs, and are emitted literally.
 */
function emitDesktopEntry(config, variant) {
    // A .desktop group is line-oriented: a line break inside a value ends the
    // key it belongs to and starts a new one, so an unchecked Name= can write
    // its own Exec= line -- a launcher that runs an attacker-chosen command on
    // click. Every value below therefore passes the sink guard, and the two
    // folder paths are resolved and required to stay inside the project.
    const objdir = assertEmittable(variantPath(variant, 'objdir'), variant.objdir);
    const brandingDir = assertEmittable(variantPath(variant, 'branding_dir'), variant.branding_dir);
    // Resolved and required to stay inside the project, exactly as before --
    // but the resolved ABSOLUTE value no longer reaches the emitted line. The
    // guard stays because a manifest folder path escaping the tree must still
    // be refused; only the interpolation target changed to the token, which
    // carries no path and therefore cannot smuggle one past the guard.
    assertUnderRepo(variantPath(variant, 'objdir'), objdir);
    assertUnderRepo(variantPath(variant, 'branding_dir'), brandingDir);
    const binary = assertEmittable('identity.binary_name', config.identity.binary_name);
    const lines = [
        ...GENERATED_BANNER,
        `# Before installing, replace ${DESKTOP_ROOT_TOKEN} with this checkout's absolute path (docs/BUILD.md names the command).`,
        '[Desktop Entry]',
        `Name=${assertEmittable('identity.display_name', config.identity.display_name)}`
        + `${assertEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix)}`,
        `Exec=${DESKTOP_ROOT_TOKEN}/${objdir}/dist/bin/${binary} %u`,
        `Icon=${DESKTOP_ROOT_TOKEN}/${brandingDir}/default128.png`,
        'Terminal=false',
        'Type=Application',
        'Categories=Development;IDE;',
        `StartupWMClass=${assertEmittable('identity.remoting_name', config.identity.remoting_name)}`,
        'MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/vnd.mozilla.xul+xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The branding-directory layout files that carry zero manifest-derived
 * values, reproduced byte for byte. Each constant below is a literal copy of
 * its tracked counterpart at the time of writing -- dev and release are
 * byte-identical for all five, grep-verified -- and the tracked file stays
 * the independent comparand: verify-generated-identity.mjs compares every
 * new TARGETS row below against it, so a later hand edit to either side goes
 * red instead of drifting.
 *
 * A file carrying brand values would get a format emitter like emitBrandFtl
 * instead; a literal that froze a brand value would ship it under every
 * downstream's name. Nothing below interpolates the manifest, so no line
 * passes assertEmittable -- there is no sink to guard.
 */
const BRANDING_MOZ_BUILD_LINES = Object.freeze([
    '# This Source Code Form is subject to the terms of the Mozilla Public',
    '# License, v. 2.0. If a copy of the MPL was not distributed with this',
    '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
    '',
    'DIRS += ["content", "locales"]',
    '',
    'DIST_SUBDIR = "browser"',
    'export("DIST_SUBDIR")',
    '',
    'include("../../../browser/branding/branding-common.mozbuild")',
    'FirefoxBranding()',
]);

const BRANDING_CONTENT_JAR_LINES = Object.freeze([
    '# This Source Code Form is subject to the terms of the Mozilla Public',
    '# License, v. 2.0. If a copy of the MPL was not distributed with this',
    '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
    '#',
    '# Packages what this tree ships into the branding chrome package: the five',
    '# default*.png icons, and aboutDialog.css -- the branding stylesheet that',
    '# upstream\'s aboutDialog.xhtml loads as the third entry of its linkset.',
    '# Deliberately does not reference about.png, about-logo*, about-wordmark.svg,',
    '# firefox-wordmark.svg, document.ico or document_pdf.svg -- those are Mozilla',
    '# marks or assets this tree does not ship, and Phase 3\'s icon pipeline owns',
    '# the ones that will eventually be replaced.',
    '',
    'browser.jar:',
    '% content branding %content/branding/ contentaccessible=yes',
    '  content/branding/icon16.png                    (../default16.png)',
    '  content/branding/icon32.png                    (../default32.png)',
    '  content/branding/icon48.png                    (../default48.png)',
    '  content/branding/icon64.png                    (../default64.png)',
    '  content/branding/icon128.png                   (../default128.png)',
    '  content/branding/aboutDialog.css               (aboutDialog.css)',
]);

const BRANDING_CONTENT_MOZBUILD_LINES = Object.freeze([
    '# This Source Code Form is subject to the terms of the Mozilla Public',
    '# License, v. 2.0. If a copy of the MPL was not distributed with this',
    '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
    '',
    'JAR_MANIFESTS += ["jar.mn"]',
]);

const BRANDING_LOCALES_JAR_LINES = Object.freeze([
    '#filter substitution',
    '# This Source Code Form is subject to the terms of the Mozilla Public',
    '# License, v. 2.0. If a copy of the MPL was not distributed with this',
    '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
    '',
    '[localization] @AB_CD@.jar:',
    '  branding                                          (en-US/**/*.ftl)',
    '',
    '@AB_CD@.jar:',
    '% locale branding @AB_CD@ %locale/branding/',
    '# Unofficial branding only exists in en-US',
    '  locale/branding/brand.properties (en-US/brand.properties)',
]);

const BRANDING_LOCALES_MOZBUILD_LINES = Object.freeze([
    '# This Source Code Form is subject to the terms of the Mozilla Public',
    '# License, v. 2.0. If a copy of the MPL was not distributed with this',
    '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
    '',
    'JAR_MANIFESTS += ["jar.mn"]',
]);

/**
 * One literal emitter per layout file above. Each ignores its arguments --
 * writeTargets calls every emitter as emit(config, variant), and uniformity
 * there is worth more than a shorter parameter list here.
 */
function emitBrandingMozBuild() {
    return BRANDING_MOZ_BUILD_LINES.join('\n') + '\n';
}

function emitBrandingContentJarMn() {
    return BRANDING_CONTENT_JAR_LINES.join('\n') + '\n';
}

function emitBrandingContentMozBuild() {
    return BRANDING_CONTENT_MOZBUILD_LINES.join('\n') + '\n';
}

function emitBrandingLocalesJarMn() {
    return BRANDING_LOCALES_JAR_LINES.join('\n') + '\n';
}

function emitBrandingLocalesMozBuild() {
    return BRANDING_LOCALES_MOZBUILD_LINES.join('\n') + '\n';
}

/**
 * The branding stylesheet, reproduced byte for byte. It carries zero
 * manifest-derived values -- structural selectors, shell neutrals and prose
 * comments only, grep-verified -- so it is a literal like the five layout
 * files above, and for the same reason it cannot stay behind: the content
 * jar.mn above packages (aboutDialog.css), so a generated branding directory
 * without it is not a drop-in but a build break. Dev and release are
 * byte-identical.
 */
const BRANDING_ABOUT_DIALOG_CSS_LINES = Object.freeze([
    '/* This Source Code Form is subject to the terms of the Mozilla Public',
    ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
    ' * file, You can obtain one at http://mozilla.org/MPL/2.0/. */',
    '',
    '@media not ((prefers-contrast) and (prefers-color-scheme: light)) {',
    '  #aboutDialogContainer {',
    '    /* The shell\'s dominant neutral (01-UI-SPEC.md "Color"). Replaces the',
    '       inherited Mozilla brand purple, which was a Mozilla brand value sitting',
    '       inside Power Browser\'s branding directory and invisible to the residual',
    '       scan, which matches brand tokens rather than hexes. */',
    '    background-color: #1a1a1a;',
    '    color: #fff;',
    '    color-scheme: dark;',
    '  }',
    '',
    '  #bottomBox {',
    '    /* #111 at 50% -- the shell\'s diagnostics-well neutral. Replaces the',
    '       translucent form of the same Mozilla brand hue. */',
    '    background-color: rgba(17, 17, 17, 0.5);',
    '  }',
    '}',
    '',
    '/* The wordmark-positioning block that used to sit here is removed. Every',
    '   declaration in it -- background sizing, inline margin, 64px top padding --',
    '   positioned the wordmark that upstream\'s own aboutDialog.css loads from',
    '   chrome://branding/content/about-wordmark.svg. This tree does not ship that',
    '   asset and this directory\'s jar.mn correctly does not package it. While this',
    '   stylesheet was itself unpackaged the block was inert; now that it loads, the',
    '   padding would reserve an empty 64px band above the version text for an image',
    '   that 404s. Phase 3\'s icon pipeline owns the wordmark; the block returns with',
    '   the asset. */',
    '',
    '#bottomBox {',
    '  padding: 15px 10px;',
    '}',
    '',
    '/* Suppress the stock outbound-link rows (G-01-3). Upstream hard-codes every',
    '   one of these hrefs as a literal attribute in aboutDialog.xhtml, so no pref',
    '   can reach them; this stylesheet is the third and last entry in that file\'s',
    '   linkset, which is the hook upstream provides to branding for exactly this.',
    '',
    '   #contributeDesc -- renders "Make a donation" and "get involved!".',
    '   #communityDesc  -- renders the community blurb. It was not in the user',
    '                      report; it is suppressed with the others rather than',
    '                      deferred because its visible label is this product\'s own',
    '                      vendor name while its target is mozilla.org -- the',
    '                      reported defect in its worst instance.',
    '   #communityExperimentalDesc -- the same blurb in its experimental-channel',
    '                      form. It renders inside upstream\'s',
    '                      <vbox id="experimental" hidden="true"> and is unhidden by',
    '                      upstream\'s own channel logic, so its mozilla.org link is',
    '                      dormant at the current ESR channel rather than absent. It',
    '                      is suppressed rather than exempted because an exemption',
    '                      list inside the checker would be a hand-kept expectation',
    '                      that can only ever agree with the tree it was copied from',
    '                      (01-REVIEW.md WR-08, CR-02).',
    '',
    '   The bottom row is MIXED, not outbound, and that is why the third entry is',
    '   qualified by href rather than naming the container. #bottomBox\'s link row',
    '   holds three children: "Licensing Information", whose href is the internal',
    '   about:license, and "Terms of Use" and "Privacy Notice", both destined for',
    '   https://www.mozilla.org. Only the two mozilla.org-destined children are',
    '   suppressed. The licence link STAYS VISIBLE: it is this product\'s only in-UI',
    '   route to its aggregated open-source licence text, and a build that ships',
    '   MPL-covered and third-party code with no such route has no surface on which',
    '   to discharge that disclosure. The row keeps its pack="center" layout with',
    '   one visible child. #trademark is #bottomBox\'s other child and is untouched.',
    '',
    '   A container-wide rule here took the licence link down with the vendor ones',
    '   (01-VERIFICATION.md Truth 9, 01-REVIEW.md CR-01); the qualified form and',
    '   scripts/verify-about-dialog-suppression.mjs together keep that closed. */',
    '#communityDesc,',
    '#communityExperimentalDesc,',
    '#contributeDesc,',
    '#bottomBox > hbox > .bottom-link[href^="https://www.mozilla.org"] {',
    '  display: none;',
    '}',
]);

function emitBrandingAboutDialogCss() {
    return BRANDING_ABOUT_DIALOG_CSS_LINES.join('\n') + '\n';
}

/**
 * The branding pref file, reproduced byte for byte with exactly two
 * parameterised differences. The release file IS the base below plus the
 * manifest-driven telemetry/crash lines; the dev file appends the BRAND-06
 * title-bar block on top of that (lines at the end of the tracked dev
 * file), which is a VARIANT property -- dev-only by design, the release
 * tree deliberately carries no such default -- and not a brand value.
 *
 * Split as base plus dev tail rather than two full copies: the two tracked
 * files share their head, and two copies would let the shared
 * head drift into testing -- and shipping -- two things.
 *
 * THE FIRST PARAMETERISATION (04-04, TEL-03). The two endpoint prefs below
 * the DYNAMIC_PREF_ANCHOR -- toolkit.telemetry.server and
 * breakpad.reportURL -- are NOT in this const: mozillaEndpointPrefs owns
 * their values from the manifest ([telemetry] level+endpoint and
 * [urls].crash_report), and emitFirefoxBrandingJs splices them in at the
 * anchor. Everything else in this const interpolates no manifest value
 * and is a literal like the layout files.
 *
 * THE SECOND SPLICE (UPD-13). The four About-dialog link prefs follow
 * RELEASE_LINK_ANCHOR; releaseLinkPrefs owns their values from [urls].
 */
const RELEASE_LINK_ANCHOR = '// UPD-13: About-dialog release-notes and manual-update links, derived from configuration.toml [urls].';

const FIREFOX_BRANDING_BASE_LINES = Object.freeze([
    '/* This Source Code Form is subject to the terms of the Mozilla Public',
    ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
    ' * file, You can obtain one at http://mozilla.org/MPL/2.0/. */',
    '',
    '// BRAND-04 (D-83..D-88): every pref that gates an unattended callout to a',
    '// host not in powerbrowser/endpoint-allowlist.json\'s `hosts` array. Every key',
    '// here that appears in the allowlist\'s `prefs` array must match its',
    '// `expect` value exactly -- scripts/verify-endpoints.sh layer 1 asserts',
    '// this on the installed, unpreprocessed copy of this file',
    '// (branding-common.mozbuild:13-15 hardcodes the filename).',
    '//',
    '// Prefs stay UNLOCKED (plain pref(), never the locking variant) so the',
    '// developer can flip them while debugging -- D-84. No autoconfig.js / .cfg',
    '// pair exists anywhere under powerbrowser/ (D-84 rejects that mechanism',
    '// explicitly).',
    '',
    'pref("startup.homepage_override_url", "");',
    'pref("startup.homepage_welcome_url", "");',
    'pref("startup.homepage_welcome_url.additional", "");',
    '',
    RELEASE_LINK_ANCHOR,
    '',
    '// UPD-25: language packs are not updated with the app; release scope is en-US only (PKG-09). Upstream default true at browser/app/profile/firefox.js:175.',
    'pref("app.update.langpack.enabled", false);',
    '',
    '// UPD-28 (owner decision 6): Firefox Accounts and Sync are off. Upstream default true at browser/app/profile/firefox.js:2311; a fixed false in both variants, no manifest key. The FxA/Sync host family (accounts.firefox.com, profile/oauth subdomains, token.services.mozilla.com) must never be contacted; verify-endpoints proves it by set-difference over the derived contacted-host list (Phase 50 live run).',
    'pref("identity.fxaccounts.enabled", false);',
    '',
    '// --- D-86: GMP manager -- Widevine stays working, no Mozilla host involved ---',
    '// Blanked so the GMP manager never contacts aus5.mozilla.org for a plugin',
    '// manifest. Widevine\'s own CDM fetch (widevinecdm.json\'s fileUrl,',
    '// edgedl.me.gvt1.com) does not depend on this pref, and',
    '// media.gmp-manager.allowLocalSources is deliberately left at its default',
    '// (true) -- it is a fallback flag, not an unattended-callout gate.',
    'pref("media.gmp-manager.url", "");',
    '// media.gmp-widevinecdm.enabled is intentionally NOT set here (D-86): it',
    '// routes to a handler that never fetches, and already defaults true on',
    '// Linux.',
    '',
    '// --- D-87: OpenH264 -- the one genuinely unattended download at startup ---',
    'pref("media.gmp-gmpopenh264.enabled", false);',
    '',
    '// --- D-84/D-87: system-addon update callout, killed before the URL is read ---',
    'pref("extensions.systemAddon.update.enabled", false);',
    'pref("extensions.systemAddon.update.url", "");',
    '',
    '// --- Telemetry / health-report / data-submission: defence in depth. The',
    '// health-report subsystem itself is compiled out (MOZ_SERVICES_HEALTHREPORT',
    '// = False, D-84), but these prefs are set anyway so a reader of this file',
    '// sees the intent stated even if a future rebuild ever restored the flag.',
    '// The two endpoint prefs that follow the anchor below are manifest-driven',
    '// (TEL-03): toolkit.telemetry.server is blanked when [telemetry] level is',
    '// off and repointed to the manifest endpoint when a level is set, and',
    '// breakpad.reportURL is blanked without [urls].crash_report and repointed',
    '// to it when stated. The compiled-out flags around them stay exactly as',
    '// defence-in-depth -- code that is not compiled cannot be re-enabled at',
    '// runtime, and these lines state the intent at the pref layer too. ---',
    'pref("toolkit.telemetry.unified", false);',
    'pref("datareporting.healthreport.uploadEnabled", false);',
    'pref("datareporting.policy.dataSubmissionEnabled", false);',
    '',
    '// --- Captive portal: browser/app/profile/firefox.js:1375 re-enables this',
    '// after toolkit\'s own all.js:3255 default of false -- our branding file',
    '// loads last (JS_PREFERENCE_FILES, branding-common.mozbuild) so this wins. ---',
    'pref("network.captive-portal-service.enabled", false);',
    'pref("captivedetect.canonicalURL", "");',
    '',
    '// --- Normandy/Shield: MOZ_NORMANDY is compiled out (D-84), so these prefs',
    '// are moot at runtime, but disabled anyway so the intent is stated in the',
    '// one place a reader would look. ---',
    'pref("app.normandy.enabled", false);',
    'pref("app.shield.optoutstudies.enabled", false);',
    '',
    '// --- Pocket / Discover feed / sponsored New Tab content ---',
    'pref("browser.newtabpage.activity-stream.discoverystream.enabled", false);',
    'pref("browser.newtabpage.activity-stream.showSponsored", false);',
    'pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);',
    'pref("browser.topsites.contile.enabled", false);',
    '',
    '// --- Region-lookup and Web Push server URLs (both resolve',
    '// location.services.mozilla.com / push.services.mozilla.com respectively,',
    '// which powerbrowser/endpoint-allowlist.json dispositions `deny` -- both are',
    '// unattended callouts with no DRM/security-parity rationale, so both stay',
    '// blanked rather than waived). The GEOLOCATION and PUSH *APIs themselves*',
    '// (geo.enabled/geo.provider.network.url, dom.push.enabled) are deliberately',
    '// left untouched: both fire only on an explicit site request, never at',
    '// unattended startup, and disabling the API surface would remove real',
    '// browser capability this phase has no reason to take away. ---',
    'pref("browser.region.network.url", "");',
    'pref("dom.push.serverURL", "");',
    '',
    '// --- AMO (services.addons.mozilla.org): discovered only once the layer-3',
    '// observation window was corrected from 20s to 35s (see verify-endpoints.sh)',
    '// -- Firefox\'s general periodic AddonManager update-check timer',
    '// (toolkit/components/timermanager/UpdateTimerManager.sys.mjs,',
    '// app.update.timerFirstInterval defaults to 30000ms) does not fire inside a',
    '// 20-second capture, so 03-02\'s original session never observed it. The',
    '// master switch stops every AddonRepository network call (langpack',
    '// matching, addon search/discovery, browser-mappings) in one pref; the',
    '// individual URLs are blanked too, belt-and-braces. ---',
    'pref("extensions.getAddons.cache.enabled", false);',
    'pref("extensions.getAddons.get.url", "");',
    'pref("extensions.getAddons.langpacks.url", "");',
    'pref("extensions.getAddons.discovery.api_url", "");',
    'pref("extensions.getAddons.browserMappings.url", "");',
    'pref("extensions.addonAbuseReport.url", "");',
    '',
    '// --- NetworkConnectivityService: the actual source of the cloudflare-dns.com',
    '// / example.org / ipv4only.arpa hosts observed by 03-02\'s real layer-3',
    '// capture. These are NOT network.trr.mode (which already defaults to 0/off',
    '// in this build, per modules/libpref/init/StaticPrefList.yaml -- TRR is not',
    '// active) -- they come from NetworkConnectivityService.cpp\'s own DNSv4/DNSv6/',
    '// DNS_HTTPS domain probes (network.connectivity-service.DNSv4.domain =',
    '// "example.org", .DNS_HTTPS.domain = "cloudflare-dns.com") and its hardcoded',
    '// ipv4only.arpa NAT64-prefix check (netwerk/base/NetworkConnectivityService.cpp:400).',
    '// Turned off at the single master switch: no DRM/security-parity rationale',
    '// applies (unlike Remote Settings/Safe Browsing), so per D-85 this',
    '// unattended, non-Mozilla-host-producing background prober is disabled',
    '// rather than waived. ---',
    'pref("network.connectivity-service.enabled", false);',
    '',
    '// --- BRAND-04 ledger entry 5 fix (2026-08-29): Gecko speculatively',
    '// DNS-prefetches link targets rendered by the Theia frontend --',
    '// network.dns.disablePrefetch defaults false',
    '// (modules/libpref/init/StaticPrefList.yaml:15308) and',
    '// network.dns.disablePrefetchFromHTTPS also defaults false (:15161), so',
    '// the origin scheme is irrelevant. Root cause traced to',
    '// theia/extensions/branding/src/browser/powerbrowser-welcome-widget.tsx:13\'s',
    '// POWERBROWSER_REPO_URL link. Disabled rather than removing the link --',
    '// the link is a real, wanted affordance, and an explicit click is a user',
    '// request this pref does not block, only the speculative prefetch.',
    '// powerbrowser.org and github.com are `user-initiated` entries in',
    '// endpoint-allowlist.json: reachable by an explicit click, never',
    '// unattended, so a prefetch regression still fails layer 3. ---',
    'pref("network.dns.disablePrefetch", true);',
    '',
    '// --- BRAND-04 ledger entry 5 fix (2026-08-29): media.gmp-gmpopenh264.enabled',
    '// (above) does not stop the periodic auto-update task from resolving',
    '// ciscobinary.openh264.org. GMPProvider.findUpdates()',
    '// (toolkit/mozapps/extensions/internal/GMPProvider.sys.mjs:380-451) runs',
    '// on the general periodic AddonManager update timer regardless of',
    '// .enabled -- that pref only feeds GMPUtils.isPluginHidden/userDisabled,',
    '// and permissions (GMPProvider.sys.mjs:299-307) grants PERM_CAN_UPGRADE',
    '// unconditionally for a non-EME plugin like OpenH264. The real gate is',
    '// AddonManager.shouldAutoUpdate() (AddonManager.sys.mjs:4577-4598), which',
    '// falls through to this.autoUpdateDefault whenever the addon\'s own',
    '// applyBackgroundUpdates getter reports AUTOUPDATE_DEFAULT rather than an',
    '// explicit ENABLE/DISABLE -- and it always does here, because that getter',
    '// (GMPProvider.sys.mjs:347-358) gates on GMPPrefs.isSet(), which calls',
    '// Services.prefs.prefHasUserValue() and is therefore permanently false for',
    '// any value this default-branch pref file sets (media.gmp-gmpopenh264.',
    '// autoupdate cannot be closed from here at all -- confirmed live: setting',
    '// it false via this file had zero effect on the resolution). This global',
    '// switch is the one lever that IS a plain default-branch-readable bool',
    '// pref. Confirmed safe for Widevine: its own findUpdates() never reaches',
    '// this fallback at all -- media.eme.enabled defaults false on Linux',
    '// (StaticPrefList.yaml:12162-12175), so GMPProvider.appDisabled is true',
    '// for the EME plugin, and shouldAutoUpdate() returns false at the',
    '// PERM_CAN_UPGRADE check (line 4588) before applyBackgroundUpdates is',
    '// even read; a real EME/DRM request instead drives checkForUpdates() ->',
    '// simpleCheckAndInstall() (GMPProvider.sys.mjs:557-574), a separate call',
    '// path gated by its own media.gmp-widevinecdm.enabled default (true),',
    '// untouched by this pref. Traced live: with this pref at its stock true,',
    '// findUpdates() ran checkForAddons() ->',
    '// downloadLocalConfig(chrome://global/content/gmp-sources/openh264.json)',
    '// -> installAddon(), genuinely downloading and extracting the OpenH264',
    '// zip from ciscobinary.openh264.org; with it false, that call never ran.',
    '// media.gmp-gmpopenh264.enabled stays false too -- still correct, still',
    '// wanted, just not sufficient alone. ---',
    'pref("extensions.update.autoUpdateDefault", false);',
    '',
    '// Number of usages of the web console.',
    '// If this is less than 5, then pasting code into the web console is disabled',
    'pref("devtools.selfxss.count", 5);',
]);

const FIREFOX_BRANDING_DEV_TAIL_LINES = Object.freeze([
    '',
    '// --- BRAND-06 / D-82 / D-84: dev-only title bar for at-a-glance',
    '// distinguishability. Unlocked plain pref(), same mechanism as every other',
    '// entry in this file -- a developer can flip it while debugging, and no',
    '// autoconfig/.cfg pair exists anywhere under powerbrowser/ (D-84 rejects that',
    '// mechanism explicitly). This is a runtime default only: it changes no',
    '// compiled define, so no rebuild follows from editing it.',
    '//',
    '// browser.tabs.inTitlebar is a tri-state int (StaticPrefList.yaml:2096):',
    '// 0 = no (draw a real title bar), 1 = yes (tabs-in-titlebar/CSD),',
    '// 2 = default (true everywhere except Linux). The dev variant sets it to',
    '// the "no" case; the release tree deliberately carries no such default --',
    '// the absence is what makes the two variants differ.',
    '//',
    '// Mechanism chain: LookAndFeel::DrawInTitlebar()',
    '// (widget/nsXPLookAndFeel.cpp:1452, case 0 returns false) ->',
    '// Services.appinfo.drawInTitlebar -> browser-customtitlebar.js drops the',
    '// customtitlebar attribute -> a real title bar is painted, carrying the',
    '// window title (page title, then this variant\'s own -brand-full-name).',
    '//',
    '// Empirical reason this exists: 03-MANUAL-VERIFICATION.md Item A found',
    '// that with tabs-in-titlebar on, this desktop paints no title bar at all,',
    '// so the display name never reaches any surface a person can see.',
    'pref("browser.tabs.inTitlebar", 0);',
]);

/**
 * The anchor line in FIREFOX_BRANDING_BASE_LINES below which the
 * manifest-driven endpoint prefs are spliced. Named once so the emitter
 * and the drift message below cannot disagree about where the dynamic
 * lines live: if the const ever loses this line, emission fails naming
 * the anchor rather than silently dropping both prefs.
 */
const DYNAMIC_PREF_ANCHOR = 'pref("toolkit.telemetry.unified", false);';

/**
 * The two Mozilla endpoint prefs TEL-03 drives from the manifest (04-04).
 *
 * toolkit.telemetry.server (stock https://incoming.telemetry.mozilla.org,
 * upstream/modules/libpref/init/all.js:534) is blanked when [telemetry]
 * level is off or unset and repointed to the manifest endpoint VERBATIM
 * when a level is set -- no origin-trimming, no path-stripping (CFG-03:
 * rejection only, never mangling). The [telemetry] level selects
 * repoint-vs-blank; the compiled-out flags around it stay as
 * defence-in-depth and are never flipped here.
 *
 * breakpad.reportURL (stock https://crash-stats.mozilla.org/report/index/,
 * upstream/browser/app/profile/firefox.js:1551, read by
 * toolkit/crashreporter/CrashReports.sys.mjs:15 and content/crashes.js:42)
 * is blanked without [urls].crash_report and repointed to it verbatim when
 * stated. Blank-by-default is load-bearing, not tidy: omitting the line
 * would leave the stock Mozilla URL standing (this branding file loads
 * last and wins, so only a stated value overrides it).
 *
 * BOTH VALUES pass the sink guard on the way out: a pref() line is a
 * double-quoted JS string, so a quote, a backslash or a line break in the
 * URL breaks out of it. The schema https pattern already excludes
 * whitespace and controls but admits those three, so on a validated
 * manifest this guard never fires -- it is what fires if a future schema
 * edit loosens the pattern.
 *
 * THE SINGLE SOURCE for these two values. emitFirefoxBrandingJs below
 * splices them into the branding pref files, and
 * scripts/verify-theia-endpoints.mjs asserts the endpoint allowlist's
 * `expect` entries equal them -- one derivation, two gates, so the gates
 * cannot disagree. Returns [{name, value}] in file order.
 */
export function mozillaEndpointPrefs(config) {
    const rawLevel = config.telemetry?.level;
    const level = isUnset(rawLevel) ? 'off' : rawLevel;
    if (!TELEMETRY_LEVELS.includes(level)) {
        report([
            `telemetry.level is ${JSON.stringify(level)}, which is not a telemetry level this project implements. `
            + `Write it as one of ${TELEMETRY_LEVELS.map(l => JSON.stringify(l)).join(', ')} in ${MANIFEST_NAME}, then run: ${RERUN}`,
        ]);
    }
    const rawEndpoint = config.telemetry?.endpoint;
    const server = (level === 'off' || isUnset(rawEndpoint)) ? '' : assertEmittable('telemetry.endpoint', rawEndpoint);
    const rawCrash = config.urls?.crash_report;
    const reportURL = isUnset(rawCrash) ? '' : assertEmittable('urls.crash_report', rawCrash);
    return [
        { name: 'toolkit.telemetry.server', value: server },
        { name: 'breakpad.reportURL', value: reportURL },
    ];
}

/**
 * The About dialog's release-notes and manual-update links (UPD-13), spliced
 * after RELEASE_LINK_ANCHOR in file order. app.releaseNotesURL{,.aboutDialog}
 * fall back to about:blank, which aboutDialog.js reads as "hide the link";
 * the update-wizard URLs fall back to "". These are click destinations, NOT
 * unattended callouts: they deliberately stay out of mozillaEndpointPrefs
 * (the unattended gate set, which verify-theia-endpoints check 4 pairs with
 * allowlist `prefs` rows), and their hosts are `user-initiated` allowlist
 * entries. Each stated value passes the same sink guard. Returns [{name, value}].
 */
export function releaseLinkPrefs(config) {
    const url = key => (isUnset(config.urls?.[key]) ? null : assertEmittable(`urls.${key}`, config.urls[key]));
    const notes = url('release_notes');
    const home = url('homepage');
    return [
        { name: 'app.releaseNotesURL', value: notes ?? 'about:blank' },
        { name: 'app.releaseNotesURL.aboutDialog', value: notes ?? 'about:blank' },
        { name: 'app.update.url.manual', value: home ?? '' },
        { name: 'app.update.url.details', value: notes ?? '' },
    ];
}

/**
 * Every manifest URL that names a host this build may contact (04-04,
 * TEL-03): the [telemetry] endpoint when stated, each stated [urls] value,
 * each [[search_engines]] url and suggest_url (BAR-03), and
 * installer.support_url -- the in-app link target the welcome and
 * about surfaces render (powerbrowserBranding.repoUrl), whose host
 * powerbrowser/endpoint-allowlist.json already tracks. product.homepage is
 * deliberately NOT here: it is product metadata, not a contacted surface.
 * There is no urls.support_url key by design: installer.support_url IS the
 * one support URL (one setting, one path).
 *
 * Returns [{path, url}] in this fixed order. A value that parses as no
 * host is a hard failure naming the dotted path, never a skipped entry --
 * the schema https pattern already refuses such values in validate(), so
 * this fires only on a bypassed validate, which is exactly when a loud
 * failure matters.
 */
export function manifestEndpointSources(config) {
    const sources = [];
    const take = (path, value) => {
        if (isUnset(value)) return;
        let host;
        try {
            host = new URL(value).hostname;
        } catch {
            host = '';
        }
        if (host === '') {
            report([
                `${path} is ${JSON.stringify(value)}, which names no host to cover in the endpoint allowlist. `
                + `Write it as an https URL in ${MANIFEST_NAME}, then run: ${RERUN}`,
            ]);
        }
        sources.push({ path, url: value, host });
    };
    take('telemetry.endpoint', config.telemetry?.endpoint);
    // mar_origin: the primary MAR origin is an unattended update fetch host (DIST-08, owner ruling 2026-10-29).
    for (const key of ['release_notes', 'update', 'mar_origin', 'crash_report', 'homepage', 'search']) {
        take(`urls.${key}`, config.urls?.[key]);
    }
    // BAR-01/BAR-03: each configured search engine's search and suggest
    // hosts are deliberate egress. {searchTerms} parses inside new URL, so
    // the host derives as for any other key.
    for (const [i, entry] of (config.search_engines ?? []).entries()) {
        take(`search_engines[${i}].url`, entry?.url);
        take(`search_engines[${i}].suggest_url`, entry?.suggest_url);
    }
    take('installer.support_url', config.installer?.support_url);
    return sources;
}

/**
 * The sorted unique hosts of manifestEndpointSources above -- the set the
 * endpoint-allowlist coverage check measures. Sorted so the fragment bytes
 * are stable regardless of manifest key order.
 */
export function manifestEndpointHosts(config) {
    return [...new Set(manifestEndpointSources(config).map(s => s.host))].sort();
}

/**
 * The endpoint-hosts fragment (04-04, TEL-03): the sorted host array above
 * as JSON. No tracked comparand -- there is no hand-written original (the
 * hosts are derived, never authored); the byte-identity gate skips rows
 * without one, --check still covers the row through the frozen table, and
 * scripts/verify-theia-endpoints.mjs pins the tracked side (fragment
 * equality against this emission, then coverage against the allowlist).
 *
 * WHY NO GENERATED_BANNER. Same reason as the fragments before it:
 * strict JSON carries no comment, and a `_comment` key would pollute the
 * array a reader compares against the allowlist.
 */
export function emitEndpointHosts(config, variant) {
    void variant;
    const hosts = manifestEndpointHosts(config);
    return `[\n${hosts.map(h => `  ${JSON.stringify(h)}`).join(',\n')}${hosts.length > 0 ? '\n' : ''}]\n`;
}

/**
 * The shell-consumable pin fragment (05-02, UPD-01): the [upstreams] tag
 * as one KEY=value assignment, sourced by scripts/fetch-upstream.sh as
 * its TAG default.
 *
 * WHY NO GENERATED_BANNER. Same reason as the JSON fragments: there is no
 * tracked file to copy over -- the fragment is read from generated/
 * directly, never copied -- so the banner's copy step would name a
 * procedure that does not exist. The carrier lines below name the real
 * pointers instead: the manifest key, the rerun command, and the sourcing
 * script.
 *
 * THE SINK GUARD IS THE SHAPE, enforced twice. The schema already refuses
 * anything outside the plain-tag-name class in validate(), and the emitter
 * re-checks the same class here: an unquoted shell assignment has no
 * quoting to hide behind, so a value outside that class must be refused
 * naming the key, never emitted. A tag carrying a space would otherwise
 * source as an assignment plus a stray command.
 *
 * Joined with a literal newline, never the platform line-ending constant.
 */
const UPSTREAM_PINS_BANNER = Object.freeze([
    '# Generated from configuration.toml by scripts/generate.mjs -- do not edit here.',
    '# To change it: edit configuration.toml ([upstreams] firefox_esr_tag), run: node scripts/generate.mjs.',
    '# Sourced by scripts/fetch-upstream.sh as its TAG default.',
]);
const TAG_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
export function emitUpstreamPins(config, variant) {
    void variant;
    const tag = config.upstreams?.firefox_esr_tag;
    if (typeof tag !== 'string' || !TAG_NAME_PATTERN.test(tag)) {
        report([
            `upstreams.firefox_esr_tag is ${JSON.stringify(tag)}, which is not a plain tag name. `
            + `Write it as letters, digits, dots, underscores and hyphens only in ${MANIFEST_NAME}, then run: ${RERUN}`,
        ]);
    }
    assertEmittable('upstreams.firefox_esr_tag', tag);
    return [...UPSTREAM_PINS_BANNER, `FIREFOX_ESR_TAG=${tag}`, ''].join('\n');
}

/**
 * REL-01 (40-03). The release identity: one key, v<ESR>-<revision>, derived
 * from the ESR pin and [product] revision. A _BUILDn candidate tag is refused:
 * a release is only ever cut from an esr_RELEASE tag. esrVersion is the
 * numeric groups joined by dots -- two parts for an x.0 release, three for a
 * point release -- which is the string upstream writes in config/milestone.txt.
 */
const ESR_RELEASE_TAG = /^[A-Za-z]+_(\d+)_(\d+)(?:_(\d+))?esr_RELEASE$/;
export function releaseIdentity(config) {
    const tag = config.upstreams?.firefox_esr_tag;
    const m = typeof tag === 'string' ? ESR_RELEASE_TAG.exec(tag) : null;
    if (m === null) {
        report([
            `upstreams.firefox_esr_tag is ${JSON.stringify(tag)}, which is not an ESR release tag. `
            + `It must be an *esr_RELEASE tag, never a _BUILD candidate. Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
        ]);
    }
    const esrVersion = m.slice(1).filter(g => g !== undefined).join('.');
    const revision = config.product.revision;
    return Object.freeze({ esrVersion, revision, releaseKey: `v${esrVersion}-${revision}` });
}

/**
 * The two version files (REL-01): release metadata read by release tooling
 * (release key, descriptor appVersion, asset names), never a Gecko build input.
 * WHY NO GENERATED_BANNER. Same reason as the JSON fragments: each is a
 * one-value file its reader takes whole, so a comment line would be read as
 * the value.
 */
export function emitVersionTxt(config, variant) {
    void variant;
    return `${releaseIdentity(config).esrVersion}\n`;
}
export function emitReleaseTxt(config, variant) {
    void variant;
    // The release path reads mar_origin only after a 50-minute build (package-linux.sh); refuse a bad
    // value here, in generate and generate --check, before any build (review WR-04).
    marOrigin(config);
    return `${releaseIdentity(config).releaseKey}\n`;
}

/**
 * The one emitter both pref rows share. The dev-only tail is a property of
 * the VARIANT, not of the brand: no manifest value selects it, so the branch
 * is on the variant id, the two values this project builds. The
 * manifest-driven endpoint prefs are spliced below the DYNAMIC_PREF_ANCHOR
 * line above (TEL-03): if the anchor ever leaves the const, emission fails
 * naming it rather than shipping pref files with no telemetry/crash lines.
 */
function emitFirefoxBrandingJs(config, variant) {
    const base = variant.id === 'dev'
        ? [...FIREFOX_BRANDING_BASE_LINES, ...FIREFOX_BRANDING_DEV_TAIL_LINES]
        : FIREFOX_BRANDING_BASE_LINES;
    if (!base.includes(RELEASE_LINK_ANCHOR)) {
        report([
            `the branding pref emitter lost its anchor line ${JSON.stringify(RELEASE_LINK_ANCHOR)} -- the About dialog's `
            + `release-notes and manual-update links would ship nowhere. Next step: report this; ${MANIFEST_NAME} is not the cause and editing it will not help.`,
        ]);
    }
    if (!base.includes(DYNAMIC_PREF_ANCHOR)) {
        report([
            `the branding pref emitter lost its anchor line ${JSON.stringify(DYNAMIC_PREF_ANCHOR)} -- the manifest-driven `
            + `telemetry and crash-report prefs would ship nowhere. Next step: report this; ${MANIFEST_NAME} is not the cause and editing it will not help.`,
        ]);
    }
    const dynamic = mozillaEndpointPrefs(config).map(({ name, value }) => `pref("${name}", ${JSON.stringify(value)});`);
    const links = releaseLinkPrefs(config).map(({ name, value }) => `pref("${name}", ${JSON.stringify(value)});`);
    const lines = [];
    for (const line of base) {
        lines.push(line);
        if (line === DYNAMIC_PREF_ANCHOR) lines.push(...dynamic);
        if (line === RELEASE_LINK_ANCHOR) lines.push(...links);
    }
    return lines.join('\n') + '\n';
}

/**
 * One `name = value` term out of an in-memory locale body. The same shape as
 * verify-branding-preflight.mjs's ftlTerm/propTerm: a line-anchored match on
 * the term name, trimmed. All three agreement keys below are letters and
 * hyphens only, so no escaping is needed to interpolate them.
 */
function localeTermValue(body, key) {
    const m = body.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : null;
}

/**
 * The ftl-versus-properties term pairs that must agree within one variant.
 * Each row names the Fluent term, the properties key, and the plain-words
 * surface they are two halves of.
 */
const LOCALE_AGREEMENT_PAIRS = Object.freeze([
    Object.freeze({ ftl: '-brand-full-name', props: 'brandFullName', what: 'the full name' }),
    Object.freeze({ ftl: '-brand-short-name', props: 'brandShortName', what: 'the short name' }),
    Object.freeze({ ftl: '-brand-shorter-name', props: 'brandShorterName', what: 'the shorter name' }),
]);

/**
 * Assert the cross-file agreement on the IN-MEMORY bodies of one emit pass,
 * before anything is written. A mismatch here means the two emitters
 * disagree with each other -- both derive from the same manifest, so
 * configuration.toml is never the cause and the message says so, naming
 * both files and both values.
 *
 * Returns failures rather than reporting them, so writeTargets folds them
 * into its single emit-all-then-write report and --self-test drives this
 * function directly on crafted bodies.
 */
function localeAgreementFailures(entries) {
    const groups = new Map();
    for (const { rel, body } of entries) {
        const base = rel.split('/').pop();
        if (base !== 'brand.ftl' && base !== 'brand.properties') continue;
        const dir = rel.slice(0, rel.length - base.length);
        let group = groups.get(dir);
        if (group === undefined) {
            group = {};
            groups.set(dir, group);
        }
        group[base === 'brand.ftl' ? 'ftl' : 'props'] = { rel, body };
    }
    const failures = [];
    for (const group of groups.values()) {
        if (group.ftl === undefined || group.props === undefined) continue;
        for (const { ftl, props, what } of LOCALE_AGREEMENT_PAIRS) {
            const ftlValue = localeTermValue(group.ftl.body, ftl);
            const propsValue = localeTermValue(group.props.body, props);
            if (ftlValue !== propsValue) {
                failures.push(
                    `generated/${group.ftl.rel}'s ${ftl} carries ${JSON.stringify(ftlValue)} but generated/${group.props.rel}'s ${props} carries ${JSON.stringify(propsValue)} -- the two halves of ${what} disagree. `
                    + `Next step: report this; ${MANIFEST_NAME} is not the cause and editing it will not help.`,
                );
            }
        }
    }
    return failures;
}

// --- GEN-02: the icon pipeline ------------------------------------------------
//
// brand/mark.svg is the ONLY icon input a downstream touches. Five square PNG
// rasters per variant are drawn from it through the system inkscape, and the
// Windows ICO plus macOS ICNS containers (this plan's second task) wrap those
// same bytes. No manifest key selects the source artwork, the sizes, or the
// outputs: the source is the relative literal below resolved against the
// asset root (REPO_ROOT, or the PB_CONFIG_DIR folder when set -- CFG-05), the
// sizes are the frozen array below, and the ten destination paths are TARGETS
// rows like every other output. That is structurally what stops a hostile
// filename reaching the inkscape command line: no manifest value is ever
// joined into it (T-03-04).
//
// The raster runs INSIDE the emit pass, before any write: writeTargets calls
// rasterizeIcons before its text emitters and long before its write loop, so
// a missing or non-square source fails with the tree exactly as it was found.
// A source already at a target size takes the same path -- there is no
// passthrough shortcut to drift out of sync with the rest. Dev and release
// rasters come from the same source, so their bytes are identical, and they
// are still written as ten separate files: separate, never merged or
// deduplicated.

/** The icon sizes in pixels, ascending. The raster order is this order. */
const ICON_SIZES = Object.freeze([16, 32, 48, 64, 128]);

/**
 * The single source artwork. A fixed RELATIVE literal, never a manifest
 * value -- see above -- so the path a reader restores on a missing-source
 * failure is always this one.
 *
 * CFG-05 (07-01). The ROOT it resolves against is the one asset-root source
 * of truth: REPO_ROOT by default, the resolved PB_CONFIG_DIR folder when an
 * external config is in force (set once in main(), before anything reads).
 * Every artwork read -- iconSourceFailures, the inkscape argv in
 * iconPngBytes, readMarkSvgElement -- flows through markSvgAbs(), and every
 * failure names MARK_SVG_REL, never the absolute path: the fixed asset a
 * reader restores, not a host path of the invoking machine.
 */
const MARK_SVG_REL = 'brand/mark.svg';
let ASSET_ROOT = REPO_ROOT;
function markSvgAbs() {
    return join(ASSET_ROOT, MARK_SVG_REL);
}

/** The first eight bytes of every PNG, checked on each raster output. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The squareness rule against one SVG document's text. Returns failures
 * rather than reporting them, so writeTargets folds them into its single
 * emit-all-then-write report and --self-test drives this function directly
 * on crafted fixtures -- the same split localeAgreementFailures uses.
 *
 * P-GEN-02: a non-square source is a hard failure naming the asset and the
 * rule, never a stretch, a letterbox, or a quiet substitution.
 */
function iconSourceFailuresForText(svgText) {
    const m = svgText.match(/viewBox\s*=\s*"([^"]+)"/);
    if (m === null) {
        return [
            `${MARK_SVG_REL} does not declare a viewBox, so its shape cannot be checked against the square-artwork rule every icon depends on. `
            + `Give the svg element a square viewBox, then run: ${RERUN}`,
        ];
    }
    const parts = m[1].split(/[\s,]+/).filter(p => p !== '').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
        return [
            `${MARK_SVG_REL} declares a viewBox of ${JSON.stringify(m[1])}, which is not four numbers, so its shape cannot be checked against the square-artwork rule. `
            + `Give the svg element a square viewBox, then run: ${RERUN}`,
        ];
    }
    const width = parts[2];
    const height = parts[3];
    if (!(width > 0) || width !== height) {
        return [
            `${MARK_SVG_REL} is ${width} wide by ${height} tall, but every icon must come from square artwork. `
            + `Replace it with a square logo, then run: ${RERUN}`,
        ];
    }
    return [];
}

/**
 * The squareness rule against the source file. `readFrom` is a parameter for
 * one reason: --self-test points it at a path that is not there, to prove
 * the missing-source message, without touching the real artwork. The message
 * still names MARK_SVG_REL -- the fixed asset a reader restores, not the
 * probe's throwaway path, which must never reach what a reader sees.
 */
function iconSourceFailures(readFrom = markSvgAbs()) {
    let svgText;
    try {
        svgText = readFileSync(readFrom, 'utf8');
    } catch {
        return [
            `${MARK_SVG_REL} is missing, so the icons for both variants cannot be generated. `
            + `Restore ${MARK_SVG_REL} at the top of the project, then run: ${RERUN}`,
        ];
    }
    if (svgText.length === 0) {
        return [
            `${MARK_SVG_REL} is empty, so the icons for both variants cannot be generated. `
            + `Restore the artwork in ${MARK_SVG_REL}, then run: ${RERUN}`,
        ];
    }
    return iconSourceFailuresForText(svgText);
}

/**
 * Raster bytes by size, warmed once per process. The inkscape invocation is
 * a fixed argument array -- no shell, no joined strings, sizes from the
 * frozen array -- with the scratch output under a mkdtemp directory removed
 * in a finally.
 */
const iconRasterCache = new Map();

// PLAT-04 cause A: inkscape 1.4.4 aborts (Gio::DBus::Error) when several instances register on the session bus at once.
export const RASTER_ENV = Object.freeze({ ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' });

const RASTER_BUS_FAILURE = 'inkscape would join the session bus, where icon exports started at the same moment can abort one another. '
    + `Keep every icon export off the session bus, then run: ${RERUN}`;

// Assembled, so this file's text carries the call shape only at the real spawn site.
const INKSCAPE_SPAWN = ['spawnSync(', "'inkscape'"].join('');

/**
 * The [start, end) span of the options object of every inkscape spawnSync
 * call in `sourceText`: the last brace-matched object at the call's top
 * level. Strings are skipped so a quoted bracket cannot shift the depth.
 */
function inkscapeSpawnOptionSpans(sourceText) {
    const spans = [];
    for (let at = sourceText.indexOf(INKSCAPE_SPAWN); at !== -1; at = sourceText.indexOf(INKSCAPE_SPAWN, at + 1)) {
        let depth = 0;
        let objectStart = -1;
        let last = null;
        for (let i = at + 'spawnSync'.length; i < sourceText.length; i++) {
            const ch = sourceText[i];
            if (ch === "'" || ch === '"' || ch === '`') {
                for (i++; i < sourceText.length && sourceText[i] !== ch; i++) if (sourceText[i] === '\\') i++;
                continue;
            }
            if (ch === '(' || ch === '[' || ch === '{') {
                if (depth === 1 && ch === '{') objectStart = i;
                depth++;
            } else if (ch === ')' || ch === ']' || ch === '}') {
                depth--;
                if (depth === 1 && ch === '}' && objectStart !== -1) last = [objectStart, i + 1];
                if (depth === 0) break;
            }
        }
        spans.push(last);
    }
    return spans;
}

/**
 * PLAT-04 cause A's guard: the raster env must keep inkscape off the session
 * bus, and every inkscape spawn in `sourceText` must pass that env. No spawn
 * site at all is the same failure: the guard would be checking nothing.
 */
function rasterBusFailures(env, sourceText) {
    if (env.DBUS_SESSION_BUS_ADDRESS !== 'disabled:') return [RASTER_BUS_FAILURE];
    const spans = inkscapeSpawnOptionSpans(sourceText);
    if (spans.length === 0) return [RASTER_BUS_FAILURE];
    for (const span of spans) {
        if (span === null || !/\benv:\s*RASTER_ENV\b/.test(sourceText.slice(span[0], span[1]))) return [RASTER_BUS_FAILURE];
    }
    return [];
}

function iconPngBytes(size) {
    const hit = iconRasterCache.get(size);
    if (hit !== undefined) return hit;
    // Validated on every cold miss, not only on the writeTargets path, so a
    // direct emitter call -- the byte-identity gate, the agreement mirror --
    // fails with the same plain-words message instead of spawning inkscape
    // on artwork that already failed the rule.
    report(iconSourceFailures());
    const scratch = mkdtempSync(join(tmpdir(), 'generate-icons-'));
    try {
        const out = join(scratch, `icon${size}.png`);
        const child = spawnSync('inkscape', [
            markSvgAbs(),
            '--export-filename', out,
            '-w', String(size),
            '-h', String(size),
        ], { encoding: 'utf8', env: RASTER_ENV });
        // The child's own output is deliberately unread: a failure here must
        // speak plain words, never inkscape's vocabulary or this machine's
        // paths, which the self-test's no-internals assertion enforces.
        let bytes = null;
        try {
            bytes = readFileSync(out);
        } catch {
            bytes = null;
        }
        if (child.error !== undefined || child.status !== 0 || bytes === null
            || bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
            || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) {
            report([
                `${MARK_SVG_REL} could not be turned into the ${size}-pixel icon. `
                + `Check that the artwork opens as an image, then run: ${RERUN}`,
            ]);
        }
        iconRasterCache.set(size, bytes);
        return bytes;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

/**
 * GEN-02's named step: validate the source once, then rasterize every size
 * in the frozen ascending order. Called from writeTargets inside the emit
 * pass, before any write.
 */
function rasterizeIcons() {
    report(iconSourceFailures());
    for (const size of ICON_SIZES) iconPngBytes(size);
}

/**
 * One TARGETS row's emitter per size: the cached raster bytes for it. The
 * variant contributes nothing -- both variants rasterize the same source --
 * and uniformity with every other row's emit(config, variant) signature is
 * worth more than a shorter parameter list here.
 */
function emitIconPng(size) {
    return (config, variant) => {
        void config;
        void variant;
        return iconPngBytes(size);
    };
}

// --- GEN-02: the Windows ICO and macOS ICNS containers ------------------------
//
// The five PNG rasters above are the Linux icon set. The Windows and macOS
// builds need the same pixels wrapped in their own containers, so two
// pure-Node writers do the wrapping with zero new packages: an ICO file is a
// 6-byte header plus 16-byte directory entries over byte-identical PNG
// payloads, and an ICNS file is an 8-byte header plus typed chunks over the
// same. No manifest value reaches either writer beyond the pixels
// iconPngBytes already rasterized -- payload sizes, entry counts and chunk
// types are frozen below (T-03-04, the same structural reason as the raster
// step), and Buffer.concat carries the payloads through untouched.
//
// macOS-host rendering stays explicitly deferred to v2 PKG-01 per GEN-03:
// what these writers guarantee is structural validity -- magic, counts,
// lengths, payload identity -- asserted twice: by the structure functions
// below over the bytes just built (--self-test plants a truncation and a
// wrong magic against them), and by scripts/verify-icon-ihdr.mjs over the
// files on disk. The two assertions share the contract, not the code path,
// so one cannot pass by agreeing with itself -- the same split the locale
// agreement and the branding-agreement checker keep.

/**
 * A complete Windows .ico file over the three smallest raster PNGs, in the
 * fixed ascending order 16, 32, 48. The 6-byte header carries reserved byte
 * 0, image type 1 and the entry count; each 16-byte directory entry carries
 * the width, the height, a zero color count, a zero reserved byte, two
 * planes, 32 bits per pixel, the PNG payload length and the running payload
 * offset. The payloads follow byte-identical.
 */
function emitFirefoxIco(png16, png32, png48) {
    const payloads = [png16, png32, png48];
    const sizes = [16, 32, 48];
    const count = payloads.length;
    const header = Buffer.alloc(6 + 16 * count);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(count, 4);
    let offset = header.length;
    payloads.forEach((payload, i) => {
        const at = 6 + 16 * i;
        header.writeUInt8(sizes[i], at);
        header.writeUInt8(sizes[i], at + 1);
        header.writeUInt8(0, at + 2);
        header.writeUInt8(0, at + 3);
        header.writeUInt16LE(2, at + 4);
        header.writeUInt16LE(32, at + 6);
        header.writeUInt32LE(payload.length, at + 8);
        header.writeUInt32LE(offset, at + 12);
        offset += payload.length;
    });
    return Buffer.concat([header, ...payloads]);
}

/**
 * The ICNS chunk type codes for the three wrapped sizes, largest first. From
 * the Apple TN0617 icon-family table: ic07 is the 128-pixel family member,
 * icp5 the 32-pixel one, icp4 the 16-pixel one. Modern macOS accepts
 * PNG-compressed payloads in these chunks.
 */
const ICNS_TYPES = Object.freeze(['ic07', 'icp5', 'icp4']);

/**
 * A complete macOS .icns file over the 128, 32 and 16 raster PNGs, in that
 * order. The 8-byte header carries the icns magic plus the total file length
 * as big-endian uint32; each chunk carries its four-character type code plus
 * its own big-endian total length -- header included -- plus the PNG payload.
 */
function emitFirefoxIcns(png128, png32, png16) {
    const payloads = [png128, png32, png16];
    const chunks = payloads.map((payload, i) => {
        const chunk = Buffer.alloc(8 + payload.length);
        chunk.write(ICNS_TYPES[i], 0, 'ascii');
        chunk.writeUInt32BE(chunk.length, 4);
        payload.copy(chunk, 8);
        return chunk;
    });
    const body = Buffer.concat(chunks);
    const header = Buffer.alloc(8);
    header.write('icns', 0, 'ascii');
    header.writeUInt32BE(header.length + body.length, 4);
    return Buffer.concat([header, body]);
}

/**
 * Structural failures of one ICO's bytes, naming `rel` with the file and the
 * offending values. Walks the directory the header declares: a count the
 * file cannot hold, an entry pointing past the end, or trailing bytes past
 * the last payload each fail. A header that does not open as an icon fails
 * at once, with nothing further read off it.
 */
function icoStructureFailures(bytes, rel) {
    if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
        return [
            `${rel} does not open as a Windows icon: the header must carry reserved byte 0 and image type 1. `
            + `Next step: run: ${RERUN}`,
        ];
    }
    const count = bytes.readUInt16LE(4);
    if (count === 0 || 6 + 16 * count > bytes.length) {
        return [
            `${rel} declares ${count} icon(s) but the file ends inside the directory. `
            + `Next step: run: ${RERUN}`,
        ];
    }
    const failures = [];
    let end = 6 + 16 * count;
    for (let i = 0; i < count; i++) {
        const at = 6 + 16 * i;
        const length = bytes.readUInt32LE(at + 8);
        const offset = bytes.readUInt32LE(at + 12);
        if (offset + length > bytes.length) {
            failures.push(
                `${rel} entry ${i} points at bytes ${offset}..${offset + length} but the file is only ${bytes.length} bytes long. `
                + `Next step: run: ${RERUN}`,
            );
            continue;
        }
        end = Math.max(end, offset + length);
    }
    if (failures.length === 0 && end !== bytes.length) {
        failures.push(
            `${rel} carries ${bytes.length - end} trailing byte(s) past its last icon payload. `
            + `Next step: run: ${RERUN}`,
        );
    }
    return failures;
}

/**
 * Structural failures of one ICNS's bytes, naming `rel` with the file and
 * the offending values. A header without the icns magic or with a total
 * length that is not the file size fails at once; otherwise the chunk chain
 * is walked and a short header, a short payload or trailing bytes each fail.
 */
function icnsStructureFailures(bytes, rel) {
    const magic = bytes.length >= 4 ? bytes.subarray(0, 4).toString('ascii') : '';
    if (bytes.length < 8 || magic !== 'icns' || bytes.readUInt32BE(4) !== bytes.length) {
        return [
            `${rel} does not open as a macOS icon: the header must carry the magic ${JSON.stringify('icns')} `
            + `and a total length equal to the file size of ${bytes.length} bytes, but carries ${JSON.stringify(magic)}. `
            + `Next step: run: ${RERUN}`,
        ];
    }
    const failures = [];
    let at = 8;
    while (at < bytes.length) {
        if (at + 8 > bytes.length) {
            failures.push(
                `${rel} ends inside an icon chunk header at byte ${at}. `
                + `Next step: run: ${RERUN}`,
            );
            break;
        }
        const type = bytes.subarray(at, at + 4).toString('ascii');
        const length = bytes.readUInt32BE(at + 4);
        if (length < 8 || at + length > bytes.length) {
            failures.push(
                `${rel} chunk ${JSON.stringify(type)} declares a length of ${length} byte(s) but only ${bytes.length - at} remain from byte ${at}. `
                + `Next step: run: ${RERUN}`,
            );
            break;
        }
        at += length;
    }
    if (failures.length === 0 && at !== bytes.length) {
        failures.push(
            `${rel} carries ${bytes.length - at} trailing byte(s) past its last icon chunk. `
            + `Next step: run: ${RERUN}`,
        );
    }
    return failures;
}

/**
 * The TARGETS-row shape over the container writers: the just-rasterized
 * buffers for this process, wrapped inside the same emit pass. The variant
 * contributes nothing -- both variants wrap the same rasters -- and uniformity
 * with every other row's emit(config, variant) signature is worth more than a
 * shorter parameter list here (the same trade emitIconPng makes).
 */
function emitFirefoxIcoFile(config, variant) {
    void config;
    void variant;
    return emitFirefoxIco(iconPngBytes(16), iconPngBytes(32), iconPngBytes(48));
}

function emitFirefoxIcnsFile(config, variant) {
    void config;
    void variant;
    return emitFirefoxIcns(iconPngBytes(128), iconPngBytes(32), iconPngBytes(16));
}

/**
 * Phase 55 (PKG-14): the five cocoa and DMG branding inputs. Each is emitted into
 * generated/ with no tracked comparand and no brand directory input, so a brand
 * change never adds a file to the tree. The two upstream consumers name them:
 * upstream/browser/app/Makefile.in copies firefox.icns, document.icns and
 * Assets.car into the bundle, and upstream/toolkit/moz.configure passes dsstore,
 * background.png and disk.icns to the DMG step.
 *
 * Honest placeholders. These are not designed artwork:
 *  - document.icns and disk.icns are the application icon's own raster set through
 *    the same icns writer (emitFirefoxIcnsFile).
 *  - background.png is the 128-pixel application raster, used as a backdrop.
 *  - dsstore is an empty file. The DMG extra-file copy finds a file, and Finder
 *    falls back to its default window layout.
 *  - Assets.car is an empty file. The unconditional Makefile copy succeeds without
 *    copying third-party artwork.
 * RISK, stated plainly: Info.plist declares both CFBundleIconFile firefox.icns and
 * CFBundleIconName AppIcon. macOS prefers the name, which it resolves out of
 * Assets.car, so an empty Assets.car is expected to degrade the Dock and Finder
 * icon to a generic one. Upgrade path: build a real asset catalog with actool
 * (xcrun actool) on a Mac, then replace this emitter's output. The Mac session in
 * plan 55-04 observes the icon and records it.
 */
function emitDmgBackgroundPng(config, variant) {
    void config;
    void variant;
    return iconPngBytes(128);
}

function emitDmgDsStorePlaceholder(config, variant) {
    void config;
    void variant;
    return Buffer.alloc(0);
}

function emitAssetsCarPlaceholder(config, variant) {
    void config;
    void variant;
    return Buffer.alloc(0);
}

/**
 * The installer support address both NSIS URL defines carry.
 *
 * installer.support_url first; product.homepage as the fallback, so a
 * downstream that states no [installer] section still ships working links
 * rather than empty defines. When BOTH are unset the emitter hard-fails
 * naming both keys: an empty URLInfoAbout is a broken installer page, not a
 * default. The returned value passes the NSIS sink guard on the way out --
 * whichever key supplied it.
 */
function installerSupportUrl(config) {
    const direct = config.installer?.support_url;
    if (typeof direct === 'string' && !isUnset(direct)) {
        return assertNsisEmittable('installer.support_url', direct);
    }
    const home = config.product?.homepage;
    if (typeof home === 'string' && !isUnset(home)) {
        return assertNsisEmittable('product.homepage', home);
    }
    report([
        'installer.support_url and product.homepage are both unset, and the Windows installer defines need one of them. '
        + `Open ${MANIFEST_NAME}, give one of those two settings a value, then run: ${RERUN}`,
    ]);
}

/**
 * The per-downstream subset of branding.nsi: the six defines that vary with
 * the manifest. Everything else in upstream's file -- dialog units, fonts,
 * colors, stub URLs, certificate names -- is installer layout constant and
 * stays with the packager (v2 PKG-01), which splices these six lines into
 * the full file.
 *
 * BrandFullNameInternal and BrandFullName carry display_name plus the
 * variant's name_suffix (the unofficial split the RESEARCH excerpt records);
 * CompanyName reuses product.vendor_display and introduces no second vendor
 * string; URLInfoAbout and HelpLink carry the support address resolved
 * above; Channel is the literal unofficial -- never release, never official.
 * Every interpolated value passes the NSIS sink guard.
 */
export function emitBrandingNsi(config, variant) {
    const base = assertNsisEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertNsisEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const vendor = assertNsisEmittable('product.vendor_display', config.product.vendor_display);
    const url = installerSupportUrl(config);
    const lines = [
        '# This Source Code Form is subject to the terms of the Mozilla Public',
        '# License, v. 2.0. If a copy of the MPL was not distributed with this',
        '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
        '',
        '# The per-downstream subset of branding.nsi (GEN-03, schema-complete only).',
        `!define BrandFullNameInternal "${base}${suffix}"`,
        `!define BrandFullName "${base}${suffix}"`,
        `!define CompanyName "${vendor}"`,
        `!define URLInfoAbout "${url}"`,
        `!define HelpLink "${url}"`,
        '!define Channel "unofficial"',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The per-downstream MSIX fields as a fragment: DisplayName and Description
 * from display_name plus the variant's name_suffix, Identity Name from
 * distribution_id plus app_basename. The MSIX publisher, version and
 * architecture attributes are packager inputs, not brand values, and stay
 * out -- the v2 packager splices this fragment into AppxManifest.xml.in.
 * Schema-complete only: no Windows host builds or signs this in v1.
 * Every interpolated value passes the XML sink guard.
 */
export function emitAppxManifestFields(config, variant) {
    const base = assertXmlEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertXmlEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const identityName = `${assertXmlEmittable('identity.distribution_id', config.identity.distribution_id)}`
        + `.${assertXmlEmittable('identity.app_basename', config.identity.app_basename)}`;
    const lines = [
        '<!-- This Source Code Form is subject to the terms of the Mozilla Public',
        '   - License, v. 2.0. If a copy of the MPL was not distributed with this file,',
        '   - You can obtain one at http://mozilla.org/MPL/2.0/. -->',
        '<!-- The per-downstream MSIX fields (GEN-03, schema-complete only). -->',
        '<AppxManifestFields>',
        `  <DisplayName>${base}${suffix}</DisplayName>`,
        `  <Description>${base}${suffix}</Description>`,
        `  <Identity Name="${identityName}" />`,
        '</AppxManifestFields>',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The per-downstream macOS bundle fields as a fragment: CFBundleName from
 * the display name plus the variant's name_suffix, CFBundleIdentifier as
 * distribution_id plus the sanitized display form -- upstream derives the
 * bundle id as the lowercased display name with everything outside [a-z-]
 * stripped (toolkit/moz.configure), so the derivation is reproduced here
 * rather than minted as a new manifest key. The firefox.icns and
 * document.icns file names are literals: the application icon ships from
 * this phase's icon step, and the document icon is a PKG-01 input (T-03-10)
 * the v2 packager expands into CFBundleDocumentTypes.
 * Schema-complete only: no macOS host builds or signs this in v1.
 * Every interpolated value passes the XML sink guard.
 */
export function emitInfoPlistFields(config, variant) {
    const base = assertXmlEmittable('identity.display_name', config.identity.display_name);
    const suffix = assertXmlEmittable(variantPath(variant, 'name_suffix'), variant.name_suffix);
    const sanitized = `${base}${suffix}`.toLowerCase().replace(/[^a-z-]/g, '');
    if (sanitized === '') {
        report([
            `identity.display_name is ${JSON.stringify(config.identity.display_name)}, which leaves nothing `
            + 'once lowercased for the macOS bundle identifier. Give the display name a letter, '
            + `then run: ${RERUN}`,
        ]);
    }
    const bundleId = `${assertXmlEmittable('identity.distribution_id', config.identity.distribution_id)}.${sanitized}`;
    const lines = [
        '<!-- This Source Code Form is subject to the terms of the Mozilla Public',
        '   - License, v. 2.0. If a copy of the MPL was not distributed with this file,',
        '   - You can obtain one at http://mozilla.org/MPL/2.0/. -->',
        '<!-- The per-downstream macOS bundle fields (GEN-03, schema-complete only). -->',
        '<InfoPlistFields>',
        `  <CFBundleName>${base}${suffix}</CFBundleName>`,
        `  <CFBundleIdentifier>${bundleId}</CFBundleIdentifier>`,
        '  <CFBundleIconFile>firefox.icns</CFBundleIconFile>',
        '  <DocumentIconFile>document.icns</DocumentIconFile>',
        '</InfoPlistFields>',
    ];
    return lines.join('\n') + '\n';
}

/**
 * The Windows tile manifest, whole: the upstream
 * firefox.VisualElementsManifest.xml layout with the per-downstream value
 * filled in. BackgroundColor carries installer.tile_color when set; when
 * unset the whole attribute line is omitted -- valid per the Windows tile
 * schema, falling back to the app tile default -- and no color is invented.
 * The logo paths are upstream literals the v2 packager provides; the tile
 * rasters are PKG-01 inputs alongside the document icon above.
 *
 * ONE emitter serves BOTH variants: [installer] is a global table, not a
 * per-variant one, so the two files are byte-identical -- the same trade the
 * ICO/ICNS rows make, with the same uniformity reason.
 * Schema-complete only: no Windows host reads this in v1.
 */
export function emitVisualElementsManifest(config, variant) {
    void variant;
    const tileColor = config.installer?.tile_color;
    const colorLine = (typeof tileColor === 'string' && !isUnset(tileColor))
        ? [`      BackgroundColor="${assertXmlEmittable('installer.tile_color', tileColor)}"`]
        : [];
    const lines = [
        '<!-- This Source Code Form is subject to the terms of the Mozilla Public',
        '   - License, v. 2.0. If a copy of the MPL was not distributed with this file,',
        '   - You can obtain one at http://mozilla.org/MPL/2.0/. -->',
        "<Application xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'>",
        '  <VisualElements',
        "      ShowNameOnSquare150x150Logo='on'",
        "      Square150x150Logo='browser\\VisualElements\\VisualElements_150.png'",
        "      Square70x70Logo='browser\\VisualElements\\VisualElements_70.png'",
        "      ForegroundText='light'",
        ...colorLine,
        ' />',
        '</Application>',
    ];
    return lines.join('\n') + '\n';
}

/**
 * Every output path lives here and nowhere else, and the default run, --check
 * and plan 02-05's byte-identity gate all iterate this one array.
 *
 * BOTH PATHS IN EVERY ENTRY ARE STRING LITERALS. No value out of
 * configuration.toml is ever joined into a write path -- a variant carries
 * branding_dir and objdir as emitted CONTENT, never as a write target. That is
 * structurally what stops a config key directing a write outside generated/
 * (T-02-02, GEN-04), and it is why the variant schema carries no
 * output-filename key at all: there is nowhere for one to be honoured.
 *
 * THAT PROPERTY IS ABOUT WRITE PATHS AND NOTHING ELSE. It says where the bytes
 * land, not what they say, and reading it as the whole threat model is a
 * mistake this comment used to invite: manifest values ARE joined into the
 * emitted CONTENT, and that content is a shell script the Gecko build sources
 * and a launcher the desktop runs. Those sinks have their own guard --
 * a schema pattern per key, backed by assertEmittable at each interpolation.
 *
 * The two generated .desktop filenames are FIXED platform identifiers in Phase
 * 2. Naming a downstream's installed desktop entry after its own binary is
 * GEN-03 and belongs to Phase 3's packaging surfaces; doing it here would mean
 * a manifest value chose a filename, which is exactly the property above.
 */
export const TARGETS = Object.freeze([
    Object.freeze({
        generated: '.mozconfig',
        tracked: '.mozconfig',
        variant: 'dev',
        emit: emitMozconfig,
    }),
    // NEW (Phase 55, PKG-14): the aarch64 macOS mozconfig through the shared
    // builder. The variant is 'dev' because the macOS row carries no variant
    // of its own: the objdir suffix and the Darwin tail come from the emitter.
    // A frozen copy authored once from the emitter; never edited to go green.
    Object.freeze({
        generated: 'packaging/mozconfig-macos-aarch64',
        tracked: 'powerbrowser/packaging/mozconfig-macos-aarch64',
        variant: 'dev',
        emit: (config, variant) => emitMozconfigMacos(config, variant, 'aarch64'),
    }),
    // NEW (Phase 55, PKG-14): the x86_64 macOS mozconfig through the same shared
    // builder as the aarch64 row above. Only the Darwin tail and the objdir suffix
    // differ; the shared lines are identical by construction.
    Object.freeze({
        generated: 'packaging/mozconfig-macos-x86_64',
        tracked: 'powerbrowser/packaging/mozconfig-macos-x86_64',
        variant: 'dev',
        emit: (config, variant) => emitMozconfigMacos(config, variant, 'x86_64'),
    }),
    // NEW (Phase 54, PKG-11): the x86_64 Windows mozconfig through the shared
    // builder. A frozen copy authored once from the emitter, never edited to go green.
    Object.freeze({
        generated: 'packaging/mozconfig-windows-x86_64',
        tracked: 'powerbrowser/packaging/mozconfig-windows-x86_64',
        variant: 'dev',
        emit: emitMozconfigWindows,
    }),
    // NEW (Phase 45, PKG-17): the release .mozconfig variant. A frozen copy
    // of the release emission, authored once from the emitter and committed,
    // same contract as the hand-written files: on a red, the emitter is what
    // changes; this file is never edited to make the gate green. The release
    // build configures with MOZCONFIG pointing at the generated copy of
    // these bytes (objdir-release, --enable-bootstrap, SB keyfile mount).
    Object.freeze({
        generated: 'packaging/mozconfig.release',
        tracked: 'powerbrowser/packaging/mozconfig.release',
        variant: 'release',
        emit: emitMozconfigRelease,
    }),
    // 03-04: the GEN-01 identity carrier. 05-01: the relocated
    // telemetry-policy lines are byte-identity gated through the tracked
    // comparand below -- a frozen copy of the emission, authored once from
    // the emitter and never edited to make the gate green (same contract
    // as the hand-written files: on a red, the emitter is what changes).
    // --check still covers the row through the frozen table, and rows
    // without a tracked path keep skipping the byte-identity comparison.
    Object.freeze({
        generated: 'identity.configure',
        tracked: 'powerbrowser/identity.configure.comparand',
        variant: 'dev',
        emit: emitIdentityConfigure,
    }),
    // NEW (Phase 40, REL-01): the release identity, byte-identity gated
    // through tracked comparands authored once from the emitter. Release
    // metadata (release key, descriptor appVersion, asset names), never a
    // Gecko build input: nothing passes these to --with-version-file-path,
    // because a display version not ending in `esr` clears AppConstants.IS_ESR.
    Object.freeze({
        generated: 'packaging/version/version.txt',
        tracked: 'powerbrowser/packaging/version/version.txt',
        variant: 'dev',
        emit: emitVersionTxt,
    }),
    Object.freeze({
        generated: 'packaging/version/release.txt',
        tracked: 'powerbrowser/packaging/version/release.txt',
        variant: 'dev',
        emit: emitReleaseTxt,
    }),
    // NEW (04-01): GEN-05's Theia frontend-config fragment. No tracked
    // comparand -- the tracked theia/applications/browser/package.json is
    // yarn-managed, so whole-file byte-identity is brittle there; the
    // copy-over sets ONLY the applicationName key from this fragment, and
    // the byte-identity gate skips rows without a tracked path while
    // --check still covers the row through the frozen table. The tracked
    // side is pinned by verify-branding-preflight.mjs against the
    // inventory, never the manifest.
    Object.freeze({
        generated: 'theia-frontend-config.json',
        variant: 'dev',
        emit: emitTheiaFrontendConfig,
    }),
    // NEW (04-02): EXT-01's declared-extensions map. No tracked
    // comparand -- the tracked theia/applications/browser/package.json is
    // yarn-managed, so whole-file byte-identity is brittle there; the
    // copy-over sets ONLY the theiaPlugins block from this fragment, and
    // the byte-identity gate skips rows without a tracked path while
    // --check still covers the row through the frozen table. The tracked
    // side is pinned by scripts/verify-extension-pins.mjs (block equality
    // against this fragment, version segments, sha256 over the packed
    // archives), never the manifest.
    Object.freeze({
        generated: 'theia-plugins.json',
        variant: 'dev',
        emit: emitTheiaPlugins,
    }),
    // NEW (EXT-03): the declared-WebExtensions map. No tracked
    // comparand -- the tracked powerbrowser/distribution/policies.json
    // carries sibling keys the manifest does not own, so whole-file
    // byte-identity is brittle there; the copy-over sets ONLY the
    // ExtensionSettings key from this fragment, and the byte-identity gate
    // skips rows without a tracked path while --check still covers the row
    // through the frozen table. The tracked side is pinned by
    // scripts/verify-webextensions.mjs (key equality against this
    // emission, stale-key rejection, install_url origin coverage), never
    // the manifest.
    Object.freeze({
        generated: 'webextensions-settings.json',
        variant: 'dev',
        emit: emitWebExtensionSettings,
    }),
    // NEW (BAR-04): the configured search engines. No tracked comparand --
    // same split as the webextensions row: the copy-over sets ONLY the
    // SearchEngines key of powerbrowser/distribution/policies.json from
    // this fragment, the byte-identity gate skips rows without a tracked
    // path, and --check still covers the row through the frozen table. The
    // tracked side is pinned by scripts/verify-search-engines.mjs (key
    // equality against this emission, shipped-name collision, template
    // shape), never the manifest.
    Object.freeze({
        generated: 'search-engines.json',
        variant: 'dev',
        emit: emitSearchEngines,
    }),
    // NEW (04-03): TEL-01/TEL-02's telemetry fragment. No tracked
    // comparand -- the tracked theia/applications/browser/package.json is
    // yarn-managed, so whole-file byte-identity is brittle there; the
    // copy-over sets ONLY the powerbrowserTelemetry key from this fragment,
    // and the byte-identity gate skips rows without a tracked path while
    // --check still covers the row through the frozen table. The tracked
    // side is pinned by scripts/verify-telemetry.mjs (fragment equality
    // against this emission, block equality on the tracked key).
    Object.freeze({
        generated: 'theia-telemetry.json',
        variant: 'dev',
        emit: emitTheiaTelemetry,
    }),
    // NEW (04-04): GEN-05's branding fragment. No tracked comparand -- same
    // yarn-managed package.json, same reason; the copy-over sets ONLY the
    // powerbrowserBranding key from this fragment, and the byte-identity
    // gate skips rows without a tracked path while --check still covers
    // the row through the frozen table. The tracked side is pinned by
    // scripts/verify-theia-branding.mjs (fragment equality against this
    // emission, block equality on the tracked key).
    Object.freeze({
        generated: 'theia-branding.json',
        variant: 'dev',
        emit: emitTheiaBranding,
    }),
    // NEW (04-04): TEL-03's endpoint-hosts fragment. No tracked comparand
    // -- the hosts are derived, never hand-written; the byte-identity gate
    // skips rows without a tracked path while --check still covers the row
    // through the frozen table. The tracked side is pinned by
    // scripts/verify-theia-endpoints.mjs (fragment equality against this
    // emission, then coverage against powerbrowser/endpoint-allowlist.json).
    Object.freeze({
        generated: 'endpoint-hosts.json',
        variant: 'dev',
        emit: emitEndpointHosts,
    }),
    // NEW (05-02): UPD-01's pin fragment. No tracked comparand -- the tag
    // is derived from the manifest, never hand-written; the byte-identity
    // gate skips rows without a tracked path while --check still covers
    // the row through the frozen table. The tracked side is pinned by
    // scripts/verify-upstream-pins.mjs (manifest-to-fragment equality plus
    // the workflow-mirror and no-second-literal agreement).
    Object.freeze({
        generated: 'upstream-pins.env',
        variant: 'dev',
        emit: emitUpstreamPins,
    }),
    Object.freeze({
        generated: 'branding/dev/configure.sh',
        tracked: 'powerbrowser/branding/dev/configure.sh',
        variant: 'dev',
        emit: emitConfigureSh,
    }),
    Object.freeze({
        generated: 'branding/release/configure.sh',
        tracked: 'powerbrowser/branding/release/configure.sh',
        variant: 'release',
        emit: emitConfigureSh,
    }),
    Object.freeze({
        generated: 'powerbrowser.desktop',
        tracked: 'powerbrowser/powerbrowser.desktop',
        variant: 'dev',
        emit: emitDesktopEntry,
    }),
    Object.freeze({
        generated: 'powerbrowser-release.desktop',
        tracked: 'powerbrowser/powerbrowser-release.desktop',
        variant: 'release',
        emit: emitDesktopEntry,
    }),
    Object.freeze({
        generated: 'branding/dev/locales/en-US/brand.ftl',
        tracked: 'powerbrowser/branding/dev/locales/en-US/brand.ftl',
        variant: 'dev',
        emit: emitBrandFtl,
    }),
    Object.freeze({
        generated: 'branding/dev/locales/en-US/brand.properties',
        tracked: 'powerbrowser/branding/dev/locales/en-US/brand.properties',
        variant: 'dev',
        emit: emitBrandProperties,
    }),
    Object.freeze({
        generated: 'branding/release/locales/en-US/brand.ftl',
        tracked: 'powerbrowser/branding/release/locales/en-US/brand.ftl',
        variant: 'release',
        emit: emitBrandFtl,
    }),
    Object.freeze({
        generated: 'branding/release/locales/en-US/brand.properties',
        tracked: 'powerbrowser/branding/release/locales/en-US/brand.properties',
        variant: 'release',
        emit: emitBrandProperties,
    }),
    Object.freeze({
        generated: 'branding/dev/moz.build',
        tracked: 'powerbrowser/branding/dev/moz.build',
        variant: 'dev',
        emit: emitBrandingMozBuild,
    }),
    Object.freeze({
        generated: 'branding/dev/content/jar.mn',
        tracked: 'powerbrowser/branding/dev/content/jar.mn',
        variant: 'dev',
        emit: emitBrandingContentJarMn,
    }),
    Object.freeze({
        generated: 'branding/dev/content/moz.build',
        tracked: 'powerbrowser/branding/dev/content/moz.build',
        variant: 'dev',
        emit: emitBrandingContentMozBuild,
    }),
    Object.freeze({
        generated: 'branding/dev/locales/jar.mn',
        tracked: 'powerbrowser/branding/dev/locales/jar.mn',
        variant: 'dev',
        emit: emitBrandingLocalesJarMn,
    }),
    Object.freeze({
        generated: 'branding/dev/locales/moz.build',
        tracked: 'powerbrowser/branding/dev/locales/moz.build',
        variant: 'dev',
        emit: emitBrandingLocalesMozBuild,
    }),
    Object.freeze({
        generated: 'branding/dev/content/aboutDialog.css',
        tracked: 'powerbrowser/branding/dev/content/aboutDialog.css',
        variant: 'dev',
        emit: emitBrandingAboutDialogCss,
    }),
    Object.freeze({
        generated: 'branding/dev/pref/firefox-branding.js',
        tracked: 'powerbrowser/branding/dev/pref/firefox-branding.js',
        variant: 'dev',
        emit: emitFirefoxBrandingJs,
    }),
    Object.freeze({
        generated: 'branding/release/moz.build',
        tracked: 'powerbrowser/branding/release/moz.build',
        variant: 'release',
        emit: emitBrandingMozBuild,
    }),
    Object.freeze({
        generated: 'branding/release/content/jar.mn',
        tracked: 'powerbrowser/branding/release/content/jar.mn',
        variant: 'release',
        emit: emitBrandingContentJarMn,
    }),
    Object.freeze({
        generated: 'branding/release/content/moz.build',
        tracked: 'powerbrowser/branding/release/content/moz.build',
        variant: 'release',
        emit: emitBrandingContentMozBuild,
    }),
    Object.freeze({
        generated: 'branding/release/locales/jar.mn',
        tracked: 'powerbrowser/branding/release/locales/jar.mn',
        variant: 'release',
        emit: emitBrandingLocalesJarMn,
    }),
    Object.freeze({
        generated: 'branding/release/locales/moz.build',
        tracked: 'powerbrowser/branding/release/locales/moz.build',
        variant: 'release',
        emit: emitBrandingLocalesMozBuild,
    }),
    Object.freeze({
        generated: 'branding/release/content/aboutDialog.css',
        tracked: 'powerbrowser/branding/release/content/aboutDialog.css',
        variant: 'release',
        emit: emitBrandingAboutDialogCss,
    }),
    Object.freeze({
        generated: 'branding/release/pref/firefox-branding.js',
        tracked: 'powerbrowser/branding/release/pref/firefox-branding.js',
        variant: 'release',
        emit: emitFirefoxBrandingJs,
    }),
    // NEW (03-02): GEN-02's icon rasters. Five exact-size PNGs per variant
    // drawn from the single brand/mark.svg through the system inkscape, with
    // the tracked Phase 1 rasters as comparands -- inkscape 1.4.4 on this
    // host reproduces those bytes deterministically. Dev and release come
    // from the same source, so their bytes are identical, and they are still
    // ten separate rows and ten separate files, never merged or deduplicated.
    Object.freeze({
        generated: 'branding/dev/default16.png',
        tracked: 'powerbrowser/branding/dev/default16.png',
        variant: 'dev',
        emit: emitIconPng(16),
    }),
    Object.freeze({
        generated: 'branding/dev/default32.png',
        tracked: 'powerbrowser/branding/dev/default32.png',
        variant: 'dev',
        emit: emitIconPng(32),
    }),
    Object.freeze({
        generated: 'branding/dev/default48.png',
        tracked: 'powerbrowser/branding/dev/default48.png',
        variant: 'dev',
        emit: emitIconPng(48),
    }),
    Object.freeze({
        generated: 'branding/dev/default64.png',
        tracked: 'powerbrowser/branding/dev/default64.png',
        variant: 'dev',
        emit: emitIconPng(64),
    }),
    Object.freeze({
        generated: 'branding/dev/default128.png',
        tracked: 'powerbrowser/branding/dev/default128.png',
        variant: 'dev',
        emit: emitIconPng(128),
    }),
    Object.freeze({
        generated: 'branding/release/default16.png',
        tracked: 'powerbrowser/branding/release/default16.png',
        variant: 'release',
        emit: emitIconPng(16),
    }),
    Object.freeze({
        generated: 'branding/release/default32.png',
        tracked: 'powerbrowser/branding/release/default32.png',
        variant: 'release',
        emit: emitIconPng(32),
    }),
    Object.freeze({
        generated: 'branding/release/default48.png',
        tracked: 'powerbrowser/branding/release/default48.png',
        variant: 'release',
        emit: emitIconPng(48),
    }),
    Object.freeze({
        generated: 'branding/release/default64.png',
        tracked: 'powerbrowser/branding/release/default64.png',
        variant: 'release',
        emit: emitIconPng(64),
    }),
    Object.freeze({
        generated: 'branding/release/default128.png',
        tracked: 'powerbrowser/branding/release/default128.png',
        variant: 'release',
        emit: emitIconPng(128),
    }),
    // NEW (03-02): GEN-02's Windows and macOS containers, one pair per
    // variant, wrapped from the just-rasterized PNG buffers inside the same
    // emit pass. No tracked comparand: no hand-written originals exist, so
    // the byte-identity gate skips these rows and scripts/verify-icon-ihdr.mjs
    // owns their structure (magic, counts, lengths, payload identity).
    Object.freeze({
        generated: 'branding/dev/firefox.ico',
        variant: 'dev',
        emit: emitFirefoxIcoFile,
    }),
    Object.freeze({
        generated: 'branding/dev/firefox.icns',
        variant: 'dev',
        emit: emitFirefoxIcnsFile,
    }),
    Object.freeze({
        generated: 'branding/release/firefox.ico',
        variant: 'release',
        emit: emitFirefoxIcoFile,
    }),
    Object.freeze({
        generated: 'branding/release/firefox.icns',
        variant: 'release',
        emit: emitFirefoxIcnsFile,
    }),
    // NEW (Phase 55, PKG-14): the five cocoa and DMG branding inputs, per variant.
    // No tracked comparand: see emitDmgBackgroundPng for the placeholder labels and the
    // Assets.car risk. Each row is a literal path; no brand value reaches a write path.
    Object.freeze({ generated: 'branding/dev/document.icns', variant: 'dev', emit: emitFirefoxIcnsFile }),
    Object.freeze({ generated: 'branding/dev/disk.icns', variant: 'dev', emit: emitFirefoxIcnsFile }),
    Object.freeze({ generated: 'branding/dev/background.png', variant: 'dev', emit: emitDmgBackgroundPng }),
    Object.freeze({ generated: 'branding/dev/dsstore', variant: 'dev', emit: emitDmgDsStorePlaceholder }),
    Object.freeze({ generated: 'branding/dev/Assets.car', variant: 'dev', emit: emitAssetsCarPlaceholder }),
    Object.freeze({ generated: 'branding/release/document.icns', variant: 'release', emit: emitFirefoxIcnsFile }),
    Object.freeze({ generated: 'branding/release/disk.icns', variant: 'release', emit: emitFirefoxIcnsFile }),
    Object.freeze({ generated: 'branding/release/background.png', variant: 'release', emit: emitDmgBackgroundPng }),
    Object.freeze({ generated: 'branding/release/dsstore', variant: 'release', emit: emitDmgDsStorePlaceholder }),
    Object.freeze({ generated: 'branding/release/Assets.car', variant: 'release', emit: emitAssetsCarPlaceholder }),
    // NEW (03-03): GEN-03's installer branding fields. Two NSIS/tile files
    // per variant under branding/ plus two XML field fragments per variant
    // under installer/. No tracked comparand: no hand-written originals
    // exist, so the byte-identity gate skips these rows and
    // scripts/verify-installer-schema.mjs owns their schema (presence,
    // well-formedness, value derivation, tile-color omission).
    Object.freeze({
        generated: 'branding/dev/branding.nsi',
        variant: 'dev',
        emit: emitBrandingNsi,
    }),
    Object.freeze({
        generated: 'branding/dev/firefox.VisualElementsManifest.xml',
        variant: 'dev',
        emit: emitVisualElementsManifest,
    }),
    Object.freeze({
        generated: 'installer/dev/AppxManifest-fields.xml',
        variant: 'dev',
        emit: emitAppxManifestFields,
    }),
    Object.freeze({
        generated: 'installer/dev/Info-plist-fields.xml',
        variant: 'dev',
        emit: emitInfoPlistFields,
    }),
    Object.freeze({
        generated: 'branding/release/branding.nsi',
        variant: 'release',
        emit: emitBrandingNsi,
    }),
    Object.freeze({
        generated: 'branding/release/firefox.VisualElementsManifest.xml',
        variant: 'release',
        emit: emitVisualElementsManifest,
    }),
    Object.freeze({
        generated: 'installer/release/AppxManifest-fields.xml',
        variant: 'release',
        emit: emitAppxManifestFields,
    }),
    Object.freeze({
        generated: 'installer/release/Info-plist-fields.xml',
        variant: 'release',
        emit: emitInfoPlistFields,
    }),
]);

function variantById(config, id) {
    return (config.variants ?? []).find(v => v.id === id);
}

/**
 * Emit every target under `root`. The root is a PARAMETER for one reason: it is
 * what lets --check emit a fresh comparand into a temporary directory using the
 * same writer the default run uses. Two writers would let the checked bytes and
 * the written bytes drift apart, and the check would then be comparing against
 * something no run ever produces.
 *
 * The root is the ONLY thing a caller supplies. Every path underneath it still
 * comes from the frozen table, so passing a different root moves the whole tree
 * and cannot reshape it.
 */
function writeTargets(config, root) {
    // EMIT EVERYTHING FIRST, WRITE NOTHING YET. The file header promises that a
    // failed run leaves the output tree exactly as it found it, and a check
    // inside the write loop cannot keep that promise: a manifest declaring only
    // the dev variant used to write the first two targets and then exit on the
    // third, and the next --check reported two stale files and two absent ones
    // on top of the real problem. Every failure a target can raise -- a missing
    // variant here, a rejected value inside an emitter -- is raised during this
    // pass, while the tree is still untouched.
    const failures = [];
    const pending = [];
    // GEN-02. The icon source is validated and every size rasterized BEFORE
    // the text emitters run and long before the write loop below -- a missing
    // or non-square brand/mark.svg fails with the tree exactly as it was
    // found, and the ten PNG rows below read their bodies straight out of the
    // same cache, so what is written is what was just rasterized.
    rasterizeIcons();
    for (const target of TARGETS) {
        const variant = variantById(config, target.variant);
        if (variant === undefined) {
            failures.push(
                `${MANIFEST_NAME} declares no build variant with id ${JSON.stringify(target.variant)}. `
                + `Open ${MANIFEST_NAME}, add a [[variants]] section whose id is ${JSON.stringify(target.variant)}, `
                + `then run: ${RERUN}`,
            );
            continue;
        }
        pending.push({ outPath: join(root, target.generated), rel: target.generated, body: target.emit(config, variant) });
    }
    report(failures);

    // GEN-01. The ftl-versus-properties agreement runs HERE, on the in-memory
    // bodies, while the tree is still untouched -- a failed run leaves the
    // output exactly as it found it, which the file header promises. A
    // mismatch means the two emitters disagree with each other, never that
    // the manifest is wrong, so its message already says where to look.
    failures.push(...localeAgreementFailures(pending));
    report(failures);

    for (const { outPath, rel, body } of pending) {
        try {
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, body, 'utf8');
        } catch {
            // A filesystem failure, not a manifest one: keep it away from the manifest advice in the top-level catch.
            console.error(`${NAME}: FAIL -- ${rel} could not be written into the output folder. The folder is not writable, or a file stands where a folder is needed. Files written before it are left in place.`);
            console.error(`  Next step: make the output folder writable, or choose another folder with --out, then run: ${RERUN}`);
            process.exit(1);
        }
    }
    return pending.length;
}

// --- 5. --check: report whether the tree matches, and change nothing --------

/**
 * Every file under `dir`, as slash-joined paths relative to it. Recursive,
 * because the comparison has to see a leftover at any depth -- a stale
 * branding/dev/configure.sh from an emitter that was later removed sits two
 * levels down, and a top-level-only listing would never notice it.
 */
function filesUnder(dir, prefix, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) filesUnder(join(dir, entry.name), rel, out);
        else out.push(rel);
    }
    return out;
}

/**
 * The 1-based number of the first line that differs, or 0 if they are equal.
 * REPORTING AID ONLY. The assertion above is Buffer.compare -- byte-identity --
 * and this runs only after that assertion has already failed, to say where. A
 * line differ used as the check itself would call two files identical when they
 * differ in trailing whitespace or in line endings, which is exactly the class
 * of difference this phase's acceptance test is about.
 */
function firstDifferingLine(a, b) {
    const x = a.split('\n');
    const y = b.split('\n');
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        if (x[i] !== y[i]) return i + 1;
    }
    return 0;
}

/**
 * Compare what is on disk against what the manifest would produce right now.
 *
 * WRITES NOTHING UNDER generated/, EVER. The fresh copy goes into a unique
 * mkdtempSync directory removed in a finally. That is not tidiness: a check
 * that regenerates in place and then compares cannot tell "was already fresh"
 * from "I just made it fresh", and a check that cannot go red is not a check.
 * The directory is unique per invocation rather than a fixed temporary path, so
 * two runs at once compare against their own emission instead of overwriting
 * each other's (T-02-12).
 *
 * THREE OUTCOMES, THREE MESSAGES, deliberately not one. An absent generated/ is
 * the state every fresh copy of the project and every automated run begins in;
 * reporting it as fifty-two stale files reads as fifty-two problems and sends the reader
 * hunting a mismatch that does not exist.
 *
 * The set comparison runs in BOTH directions. A per-target loop alone sees a
 * file that is missing or wrong but is blind to one that should no longer be
 * there at all, so an emitter deleted later would leave its output behind
 * forever with nothing to notice.
 *
 * Returns an exit code rather than exiting, so the temporary directory's
 * cleanup is not skipped on the way out.
 *
 * `root` is a PARAMETER for the same reason writeTargets' is, and for one more:
 * --self-test drives THIS function, not a re-implementation of it, by pointing
 * it at a throwaway tree it is free to corrupt. The tracked files and the
 * real generated/ are never touched by a planted fault (02-05's rule). The
 * reported paths keep the `generated/` prefix whatever the root is, because
 * that prefix names the output surface a reader has to go and fix, not the
 * directory this invocation happened to read.
 */
function checkTargets(config, root = OUTPUT_ROOT) {
    if (!existsSync(root)) {
        // NOT A FAILURE, and the message already said so while exiting 1
        // anyway. This row's contract is IDEMPOTENCE -- that a second run
        // produces the same bytes as the first -- and a tree that has never
        // generated cannot disagree with itself. generated/ is git-ignored, so
        // that is the state of every fresh clone, which made
        // `verify-platform.sh --quick` -- the documented commit gate -- red on
        // every fresh clone for a non-defect. A gate red for a non-defect is a
        // gate its readers learn to skip, which is the failure mode
        // verify-generated-identity.mjs's own header is built to avoid.
        //
        // Whether the emitters agree with the hand-written files is the
        // DIFFERENT question generated-byte-identity answers, and it answers it
        // without needing a prior generate at all -- so nothing goes unchecked
        // on the tree this branch reports on.
        console.log(`${NAME}: --check SKIP -- nothing has been generated in this copy of the project yet, so there is nothing to compare.`);
        console.log('  The generated/ folder is not stored with the project, so a fresh copy of it starts out without one. This is not a mismatch.');
        console.log(`  To generate it, run: ${RERUN}`);
        return 0;
    }

    const dir = mkdtempSync(join(tmpdir(), 'generate-check-'));
    try {
        writeTargets(config, dir);
        const fresh = filesUnder(dir, '', []).sort();

        // Non-vacuity. A comparison whose comparand is empty agrees with
        // anything at all, so it must fail as broken instrumentation rather
        // than report a clean diff of nothing against nothing.
        if (fresh.length === 0) {
            console.error(`${NAME}: FAIL -- the check produced no files of its own to compare against, so its result would mean nothing either way.`);
            console.error(`  Next step: report this; ${MANIFEST_NAME} is not the cause and editing it will not help.`);
            return 1;
        }

        const onDisk = filesUnder(root, '', []).sort();

        // The two classes are collected SEPARATELY because they have different
        // next steps, and a next step that does not fix the thing it is offered
        // for is worse than none: regenerating replaces a file that differs, but
        // it never removes one that should not be there.
        const stale = [];
        const extra = [];

        for (const rel of fresh) {
            if (!onDisk.includes(rel)) {
                stale.push(`generated/${rel} -- is not there`);
                continue;
            }
            const want = readFileSync(join(dir, rel));
            const have = readFileSync(join(root, rel));
            if (Buffer.compare(want, have) !== 0) {
                const at = firstDifferingLine(have.toString('utf8'), want.toString('utf8'));
                stale.push(`generated/${rel} -- differs, from line ${at}`);
            }
        }

        for (const rel of onDisk) {
            if (!fresh.includes(rel)) {
                extra.push(`generated/${rel} -- is not one of the files this project generates`);
            }
        }

        if (stale.length === 0 && extra.length === 0) {
            console.log(`${NAME}: --check PASS -- all ${fresh.length} generated file(s) match ${MANIFEST_NAME}`);
            return 0;
        }

        console.error(`${NAME}: FAIL -- ${stale.length + extra.length} file(s) under generated/ do not match ${MANIFEST_NAME}`);
        for (const line of [...stale, ...extra]) console.error(`  ${line}`);
        if (stale.length > 0) {
            console.error(`  Next step: run: ${RERUN}`);
            console.error(`  Anything changed by hand under generated/ is overwritten by that -- make the change in ${MANIFEST_NAME} instead.`);
        }
        if (extra.length > 0) {
            console.error('  Next step for the file(s) above that this project does not generate: delete them, or move them out of generated/ if you meant to keep them.');
        }
        return 1;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// --- the pipeline ------------------------------------------------------------

/**
 * Parse both layers, reject unknown settings in either, mask, merge, validate.
 *
 * RETURNS rather than exits on a validation failure, because --self-test has to
 * read the failures a planted fault produced. Only the two conditions a
 * self-test can never provoke -- a missing file and an unparseable one -- still
 * exit from inside loadLayer.
 *
 * The defaults path DEFAULTS to this repo's manifest so an importer -- 02-05's
 * byte-identity gate -- can ask for the resolved config without being handed a
 * fourth export naming the manifest, and without spelling that filename a
 * second time somewhere it could drift.
 */
export function resolveConfig(defaultsPath = MANIFEST_PATH, downstreamPath) {
    const defaultsLayer = loadLayer(defaultsPath);
    const downstreamLayer = downstreamPath === undefined
        ? requiredLayer(defaultsLayer, SCHEMA_KEYS)
        : loadLayer(downstreamPath);

    const leaves = [];
    const refused = [];
    collectLeaves(defaultsLayer, '', leaves, refused);
    collectLeaves(downstreamLayer, '', leaves, refused);
    const unknown = [...new Set(rejectUnknown(leaves, refused))];
    if (unknown.length > 0) return { failures: unknown, config: undefined, defaulted: [] };

    const masked = maskDefaults(defaultsLayer, SCHEMA_KEYS);
    const { value: config, defaulted } = mergeLayers(masked, downstreamLayer);

    const mergedLeaves = [];
    collectLeaves(config, '', mergedLeaves, []);
    const failures = validate(config, mergedLeaves);
    for (const layer of [defaultsLayer, downstreamLayer]) {
        for (const path of DECIMAL_INTEGERS.get(layer) ?? []) {
            failures.push(
                `${path} is written with a decimal point, but this setting has to be ${SCHEMA_KEYS[path].type_help}. `
                + `Correct it in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
    }

    // R11 (NG-064): a downstream build (PB_CONFIG_DIR) must state its own update address.
    // Otherwise it inherits the platform's host and its users are offered the platform's
    // updates. The platform host is derived from the platform manifest, never typed here.
    if (downstreamPath !== undefined) {
        const platform = resolveConfig(defaultsPath, undefined).config;
        const platformUpdate = platform?.urls?.update;
        const update = config?.urls?.update;
        // M-2: parse inside try so a mistyped address returns the named R11
        // failure instead of throwing TypeError: Invalid URL.
        let sameHost = false;
        try {
            sameHost = !isUnset(update) && !isUnset(platformUpdate)
                && new URL(update).host === new URL(platformUpdate).host;
        } catch {
            sameHost = false;
        }
        if (sameHost) {
            failures.push(
                `urls.update is ${JSON.stringify(update)}, the platform's own update address, and a downstream build must not ship it. `
                + `Write your own https update address as [urls] update in ${MANIFEST_NAME}, then run: ${RERUN}`,
            );
        }
        // WR-04: the same for the About dialog's release-notes and manual-download links when the
        // downstream ships under a different name: an omitted key inherits the platform's page and
        // sends the downstream's users there. A copy that keeps the platform identity is exempt.
        const identityOf = c => JSON.stringify([c?.identity, c?.product?.vendor_machine, c?.product?.vendor_display]);
        if (platform !== undefined && identityOf(config) !== identityOf(platform)) {
            for (const [key, what] of [['release_notes', 'release-notes page'], ['homepage', 'download page']]) {
                const value = config?.urls?.[key];
                if (!isUnset(value) && value === platform.urls?.[key]) {
                    failures.push(
                        `urls.${key} is ${JSON.stringify(value)}, the platform's own ${what}, so the About dialog of a build under your name would send its users there. `
                        + `Write your own https address as [urls] ${key} in ${MANIFEST_NAME}, then run: ${RERUN}`,
                    );
                }
            }
            // TEL-06: the platform states its events endpoint in the defaults layer, so a downstream that
            // enables a telemetry level without stating its own would send its users' error reports to the
            // platform's host. Same rule as urls.update above: an enabled level must name its own endpoint.
            // (Level off is left alone: nothing is sent until the user raises the preference.)
            const endpoint = config?.telemetry?.endpoint;
            const platformEndpoint = platform.telemetry?.endpoint;
            let sameEndpointHost = false;
            try {
                sameEndpointHost = !isUnset(endpoint) && !isUnset(platformEndpoint)
                    && new URL(endpoint).host === new URL(platformEndpoint).host;
            } catch {
                sameEndpointHost = false;
            }
            if (config?.telemetry?.level !== 'off' && sameEndpointHost) {
                failures.push(
                    `telemetry.endpoint is ${JSON.stringify(endpoint)}, the platform's own events endpoint, while telemetry.level is ${JSON.stringify(config?.telemetry?.level)}, `
                    + `so the error reports of a build under your name would be sent to the platform. `
                    + `Write your own https address as [telemetry] endpoint in ${MANIFEST_NAME}, or keep [telemetry] level = "off", then run: ${RERUN}`,
                );
            }
        }
    }

    return { failures, config, defaulted };
}

/**
 * D-08. One line per inherited default, on stderr, on EVERY run -- so a
 * downstream is told exactly which of this project's values it is shipping
 * rather than having to diff two manifests to find out.
 *
 * Nothing is printed for a setting the downstream stated: the merge only
 * recorded the ones it defaulted, so this is a sort and a loop and not a
 * filter. Dotted key paths are unique, so the sort has no ties and needs no
 * tiebreaker. Values are rendered with JSON.stringify, which quotes a string,
 * makes an empty one visible, and puts an array on one line.
 *
 * stderr, because stdout carries the single PASS line every registered gate in
 * this repo reports through.
 */
function echoDefaults(defaulted, config) {
    for (const path of [...defaulted].sort()) {
        console.error(`${NAME}: default applied -- ${path} = ${JSON.stringify(readPath(config, path))}`);
    }
}

// --- CFG-05: the external-config directory -----------------------------------

/**
 * CFG-05 (07-01). The downstream's own folder, read once from the
 * environment. An unset or whitespace-only value counts as unset: an empty
 * export on the way past is a predictable default run, never a failure.
 * A relative value resolves against the working directory, so a reader
 * invoking from anywhere names the folder the same way their shell does.
 * An absolute value passes through resolve unchanged.
 *
 * Pure by design: it resolves but never reads, so --self-test can drive
 * the same derivation the default run uses without taking the process
 * down -- a missing folder and an unreadable manifest still exit, from
 * main(), through report().
 */
function externalConfigDir() {
    const raw = process.env.PB_CONFIG_DIR;
    if (raw === undefined || raw.trim() === '') return undefined;
    return resolve(process.cwd(), raw);
}

// --- self-test: planted faults that must each go red ------------------------

/** Every required setting, stated. Each fixture below breaks exactly one thing. */
const FIXTURE_BASE = [
    '[product]',
    'vendor_machine = "AcmeWorks"',
    'vendor_display = "Acme Works"',
    'revision = 1',
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
].join('\n');

/**
 * ONE complete build variant, stated. Written out once because two cases below
 * need it -- one whole, one with a single setting removed -- and a second copy
 * would let the two drift into testing different things.
 */
const FIXTURE_VARIANT = [
    '[[variants]]',
    'id = "dev"',
    'name_suffix = " Dev"',
    'branding_dir = "powerbrowser/branding/dev"',
    'objdir = "objdir"',
    '',
].join('\n');

/**
 * The downstream's own update address, stated once because every downstream
 * (PB_CONFIG_DIR) fixture below must carry it: R11 (NG-064) refuses a
 * downstream whose resolved update host is the platform's own, so a fixture
 * stating none inherits the platform host and goes red. Stated separately
 * from FIXTURE_BASE because endpointHostsControl's second checkOne appends
 * its own [urls] table (TOML forbids two [urls] headers in one document).
 */
const FIXTURE_URLS = [
    '[urls]',
    'update = "https://updates.example.org/update.xml"',
    'release_notes = "https://example.org/releases"',
    'homepage = "https://example.org"',
    '',
].join('\n');

/**
 * The downstream base plus variant plus the downstream's own update address,
 * for the --self-test fixtures that pass a PB_CONFIG_DIR manifest: R11
 * (NG-064) refuses a downstream whose resolved update host is the platform's
 * own, so a fixture stating none inherits the platform host and goes red.
 * Kept out of FIXTURE_BASE itself because endpointHostsControl's second
 * checkOne appends its own [urls] table, and TOML forbids two [urls]
 * headers in one document.
 */
const FIXTURE_DOWNSTREAM = `${FIXTURE_BASE}\n${FIXTURE_VARIANT}\n${FIXTURE_URLS}`;

/**
 * FOUR complete [[extensions]] entries, stated once because several cases
 * below need them -- one whole for the URL-exactness control, one with a
 * single pin removed or corrupted for each planted fault. One `openvsx`
 * entry (pinned version + sha256), one `url` entry (verbatim URL +
 * sha256), one synthetic Acme `npm` entry (exact version + registry
 * integrity + sha256) and one synthetic Acme `local-path` entry (relative
 * path + sha256), so the control proves all four resolution paths and every
 * fault below breaks exactly one thing.
 */
const FIXTURE_EXTENSION_PIN_A = 'a'.repeat(64);
const FIXTURE_EXTENSION_PIN_B = 'b'.repeat(64);
const FIXTURE_EXTENSION_PIN_C = 'c'.repeat(64);
const FIXTURE_EXTENSION_PIN_D = 'd'.repeat(64);
const FIXTURE_EXTENSION_INTEGRITY = `sha512-${'E'.repeat(86)}`;
const FIXTURE_EXTENSIONS = [
    '[[extensions]]',
    'id = "acme.gadget"',
    'source = "openvsx"',
    'version = "1.2.3"',
    `sha256 = "${FIXTURE_EXTENSION_PIN_A}"`,
    '',
    '[[extensions]]',
    'id = "acme.widget"',
    'source = "url"',
    'url = "https://example.org/acme-widget-2.0.0.vsix"',
    `sha256 = "${FIXTURE_EXTENSION_PIN_B}"`,
    '',
    '[[extensions]]',
    'id = "acme.npmpack"',
    'source = "npm"',
    'version = "2.4.1"',
    `integrity = "${FIXTURE_EXTENSION_INTEGRITY}"`,
    `sha256 = "${FIXTURE_EXTENSION_PIN_C}"`,
    '',
    '[[extensions]]',
    'id = "acme.localtool"',
    'source = "local-path"',
    'path = "extensions/acme-local"',
    `sha256 = "${FIXTURE_EXTENSION_PIN_D}"`,
    '',
].join('\n');

/**
 * TWO complete [[webextensions]] entries, stated once because several cases
 * below need them -- one whole for the emission-exactness control, one with
 * a single value corrupted for each planted fault. One force-installed
 * Acme entry over https and one normally-installed Acme entry over
 * file:///, so the control proves both sanctioned schemes and both modes.
 */
const FIXTURE_WEBEXTENSIONS = [
    '[[webextensions]]',
    'id = "acme-tool@example.org"',
    'installation_mode = "force_installed"',
    'install_url = "https://example.org/acme-tool-1.2.3.xpi"',
    '',
    '[[webextensions]]',
    'id = "acme-helper@example.org"',
    'installation_mode = "normal_installed"',
    'install_url = "file:///opt/downstream/extensions/acme-helper.xpi"',
    '',
].join('\n');

/** Does `text` carry `needle`, which is either a literal or a pattern? */
function carries(text, needle) {
    return needle instanceof RegExp ? needle.test(text) : text.includes(needle);
}

/**
 * Run `fn` with console.log and console.error COLLECTED rather than printed,
 * so a case can assert on what a caller would have seen. The freshness cases
 * drive checkTargets, which reports through the console rather than by
 * returning a failure list, and a case that could not read that report could
 * only assert the exit code -- which is 1 for every one of the distinct
 * outcomes and so cannot tell them apart.
 *
 * Restored in a finally. A self-test that left the console swallowed on its way
 * out would silence every case after it and the run would still say PASS.
 */
function capture(fn) {
    const lines = [];
    const [log, error] = [console.log, console.error];
    const collect = (...parts) => { lines.push(parts.join(' ')); };
    console.log = collect;
    console.error = collect;
    try {
        fn();
    } finally {
        console.log = log;
        console.error = error;
    }
    return lines;
}

/** Sentinel for a probe whose planted fault did not land. See BROKEN below. */
const BROKEN = 'planted-fault instrument broken --';

/**
 * The absent-output case's second assertion, named once and read from here by
 * both the probe that can emit it and the case that forbids it, so the two
 * cannot drift into agreeing about different strings.
 */
const ABSENT_EXIT_MARK = 'a fresh copy of the project was failed for something that is not a mismatch:';

/**
 * The state of generated/ as one comparable string, or the fact that it is
 * absent. CFG-03's rule is that a rejected value is REJECTED, never quietly
 * transformed into a passing one -- and a rejection that still emitted output
 * would be a half-rejection. This is what lets a case assert that.
 */
function snapshotOutputRoot() {
    return existsSync(OUTPUT_ROOT) ? filesUnder(OUTPUT_ROOT, '', []).sort().join('\n') : '(absent)';
}

/**
 * Generate a whole tree into a throwaway directory, corrupt ONE byte of ONE
 * file, and ask the freshness comparison about it. The corruption lands in a
 * mkdtemp copy and never on the tracked files: they are the independent
 * comparand this phase's acceptance test rests on, and a self-test one
 * interrupted run away from damaging them would be trading the thing proved
 * for the proof.
 */
function probeStaleOutput(config) {
    const root = mkdtempSync(join(tmpdir(), 'generate-selftest-stale-'));
    try {
        writeTargets(config, root);
        const victim = join(root, TARGETS[0].generated);
        const before = readFileSync(victim);
        writeFileSync(victim, Buffer.concat([before, Buffer.from(' ')]));
        // Mutation-landed guard. A drift the comparison then fails to notice is
        // the finding; a drift that was never written is broken instrumentation
        // reporting green, which is worse than a red.
        if (Buffer.compare(before, readFileSync(victim)) === 0) {
            return [`${BROKEN} the planted byte did not land in ${TARGETS[0].generated}`];
        }
        return capture(() => checkTargets(config, root));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

/**
 * Ask the freshness comparison about a directory that is not there -- the state
 * every fresh copy of the project and every CI runner starts in, because
 * generated/ is git-ignored. The distinct message this must produce is the
 * whole point: fifty-two phantom stale paths would read as fifty-two defects on a tree
 * with none, and a gate red for a non-defect is a gate its readers skip.
 *
 * The EXIT CODE is asserted here too, and separately from the message, because
 * the two disagreed for a while: the message said "This is not a mismatch" and
 * the function returned 1 regardless, which put the documented commit gate in a
 * FAIL state on every fresh clone. A case reading only the message could not
 * see that.
 */
function probeAbsentOutput(config) {
    const parent = mkdtempSync(join(tmpdir(), 'generate-selftest-absent-'));
    try {
        let code;
        const lines = capture(() => { code = checkTargets(config, join(parent, 'never-generated')); });
        if (code !== 0) lines.push(`${ABSENT_EXIT_MARK} it exited ${code}`);
        return lines;
    } finally {
        rmSync(parent, { recursive: true, force: true });
    }
}

/**
 * GEN-01. The ftl-versus-properties agreement, driven directly on crafted
 * bodies: the real dev pair with the ftl full-name term drifted by one
 * value. The drift lands in a throwaway pair of strings, never on a tracked
 * file and never under generated/ -- 02-05's rule.
 *
 * A probe rather than a fixture because no manifest can provoke it: both
 * emitters derive from the same config, so only a directly-called
 * localeAgreementFailures with a planted drift can go red here.
 */
function probeLocaleAgreementDrift(config) {
    const dev = (config.variants ?? []).find(v => v.id === 'dev');
    if (dev === undefined) return [`${BROKEN} the resolved config has no dev variant`];
    const clean = emitBrandFtl(config, dev);
    const drifted = clean.replace(/^(-brand-full-name = ).*$/m, '$1Planted Drift');
    // Mutation-landed guard, same contract as probeStaleOutput's: a drift
    // that was never written reporting green is worse than a red.
    if (drifted === clean) {
        return [`${BROKEN} the planted full-name drift did not land in the ftl body`];
    }
    return localeAgreementFailures([
        { rel: 'branding/dev/locales/en-US/brand.ftl', body: drifted },
        { rel: 'branding/dev/locales/en-US/brand.properties', body: emitBrandProperties(config, dev) },
    ]);
}

/**
 * GEN-02, P-GEN-02. A downstream logo that is not square, driven straight at
 * the squareness rule on fixture text. A probe rather than a fixture because
 * no manifest can provoke it: no manifest value selects the artwork, so only
 * a directly-called iconSourceFailuresForText with a non-square viewBox can
 * go red here.
 */
function probeNonSquareSource() {
    return iconSourceFailuresForText(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 64"></svg>',
    );
}

/**
 * GEN-02's empty probe: the artwork missing outright. Points the source
 * check at a path that is not there; the message still names brand/mark.svg,
 * the fixed asset a reader restores.
 */
function probeMissingSource() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nosource-'));
    try {
        return iconSourceFailures(join(dir, 'mark.svg'));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * GEN-02. One byte of one rasterized PNG changed by hand, and the freshness
 * comparison has to name THAT file -- the icon half of probeStaleOutput,
 * aimed at branding/dev/default32.png instead of TARGETS[0]. The corruption
 * lands in a mkdtemp copy and never on the tracked files: they are the
 * independent comparand this phase's acceptance test rests on.
 */
function probeIconPngDrift(config) {
    const root = mkdtempSync(join(tmpdir(), 'generate-selftest-icondrift-'));
    try {
        writeTargets(config, root);
        const victim = join(root, 'branding/dev/default32.png');
        const before = readFileSync(victim);
        const after = Buffer.from(before);
        after[after.length - 1] ^= 0xff;
        writeFileSync(victim, after);
        // Mutation-landed guard, same contract as probeStaleOutput's: a drift
        // that was never written reporting green is worse than a red.
        if (Buffer.compare(before, readFileSync(victim)) === 0) {
            return [`${BROKEN} the planted byte did not land in branding/dev/default32.png`];
        }
        return capture(() => checkTargets(config, root));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

/**
 * GEN-02. The ICO just built, with one byte shaved off the end: the last
 * directory entry then points past the end of the file, and the structure
 * assertion has to name THAT file and the entry -- proving the assertion can
 * go red on the thing that broke, not merely that the writer goes green.
 */
function probeTruncatedIco() {
    const whole = emitFirefoxIco(iconPngBytes(16), iconPngBytes(32), iconPngBytes(48));
    const cut = whole.subarray(0, whole.length - 1);
    // Mutation-landed guard, same contract as probeStaleOutput's: a
    // truncation that was never cut reporting green is worse than a red.
    if (cut.length !== whole.length - 1) {
        return [`${BROKEN} the planted truncation did not land in branding/dev/firefox.ico`];
    }
    return icoStructureFailures(cut, 'branding/dev/firefox.ico');
}

/**
 * GEN-02. The ICNS just built, with its magic overwritten: the header
 * assertion has to name THAT file carrying the planted magic and the icns it
 * must carry.
 */
function probeWrongMagicIcns() {
    const whole = emitFirefoxIcns(iconPngBytes(128), iconPngBytes(32), iconPngBytes(16));
    const bad = Buffer.from(whole);
    bad.write('XXXX', 0, 'ascii');
    if (bad.subarray(0, 4).toString('ascii') !== 'XXXX') {
        return [`${BROKEN} the planted magic did not land in branding/dev/firefox.icns`];
    }
    return icnsStructureFailures(bad, 'branding/dev/firefox.icns');
}

/**
 * GEN-03, T-03-07. A dollar-brace sequence in installer.support_url is a
 * legal URL character, so the schema admits it -- and the NSIS sink guard
 * must refuse it at emission, naming the key. In NSIS ${} expands at
 * compile time, so an uninterpolated support URL would build the wrong
 * links with exit 0.
 *
 * A child process, like probeMalformedManifest's: the guard reports through
 * report(), which exits, so driving the emitter in-process would take the
 * self-test down with it.
 */
function probeHostileSupportUrl() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nsis-'));
    try {
        const fixturePath = join(dir, 'case-nsis.toml');
        writeFileSync(
            fixturePath,
            `${FIXTURE_DOWNSTREAM}\n[installer]\nsupport_url = "https://example.org/\${HOME}/support"\n`,
            'utf8',
        );
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig, emitBrandingNsi } from ${JSON.stringify(import.meta.url)};`
            + `const r = resolveConfig(undefined, ${JSON.stringify(fixturePath)});`
            + `if (r.failures.length > 0) { console.log('UNEXPECTED-VALIDATE-RED'); process.exit(2); }`
            + `process.stdout.write(emitBrandingNsi(r.config, r.config.variants.find(v => v.id === 'dev')));`,
        ], { encoding: 'utf8' });
        if (child.status === 0) return [`${BROKEN} the hostile support_url emitted cleanly`];
        return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * WR-04. A bare dollar-name in installer.support_url -- no brace -- is a
 * legal URL character, so the schema admits it, and NSIS expands $NAME at
 * compile time exactly like ${NAME}. The pre-fix sink guard only refused
 * the braced form, so this value emitted silently into a define and
 * compiled into the wrong links with exit 0.
 *
 * A child process, like probeHostileSupportUrl's: the guard reports through
 * report(), which exits, so driving the emitter in-process would take the
 * self-test down with it.
 */
function probeHostileBareDollarUrl() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nsis-bare-'));
    try {
        const fixturePath = join(dir, 'case-nsis-bare.toml');
        writeFileSync(
            fixturePath,
            `${FIXTURE_DOWNSTREAM}\n[installer]\nsupport_url = "https://example.org/$INSTDIR/x"\n`,
            'utf8',
        );
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig, emitBrandingNsi } from ${JSON.stringify(import.meta.url)};`
            + `const r = resolveConfig(undefined, ${JSON.stringify(fixturePath)});`
            + `if (r.failures.length > 0) { console.log('UNEXPECTED-VALIDATE-RED'); process.exit(2); }`
            + `process.stdout.write(emitBrandingNsi(r.config, r.config.variants.find(v => v.id === 'dev')));`,
        ], { encoding: 'utf8' });
        if (child.status === 0) return [`${BROKEN} the hostile bare-dollar support_url emitted cleanly`];
        return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * WR-04's control: a doubled dollar for a literal dollar must still emit
 * with its dollars intact. NSIS renders $$ as one literal $, so refusing
 * it would forbid every value that names a price -- the guard refuses the
 * expansion, never the escape. Without this, a stricter guard that rejects
 * every $ would pass the fault case above while breaking legitimate
 * values.
 *
 * A child process, like probeHostileSupportUrl's: the emitter is driven
 * past validation, and a rejection exits the child with the message --
 * never the self-test.
 */
function probeEscapedDollarUrl() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nsis-escape-'));
    try {
        const fixturePath = join(dir, 'case-nsis-escape.toml');
        writeFileSync(
            fixturePath,
            `${FIXTURE_DOWNSTREAM}\n[installer]\nsupport_url = "https://example.org/$$PRICE/x"\n`,
            'utf8',
        );
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig, emitBrandingNsi } from ${JSON.stringify(import.meta.url)};`
            + `const r = resolveConfig(undefined, ${JSON.stringify(fixturePath)});`
            + `if (r.failures.length > 0) { console.log('UNEXPECTED-VALIDATE-RED'); process.exit(2); }`
            + `process.stdout.write(emitBrandingNsi(r.config, r.config.variants.find(v => v.id === 'dev')));`,
        ], { encoding: 'utf8' });
        if (child.status !== 0) {
            return [`the escaped-dollar support_url was rejected but must emit: ${`${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '').join(' | ')}`];
        }
        if (!child.stdout.includes('!define URLInfoAbout "https://example.org/$$PRICE/x"')) {
            return [`${BROKEN} the escaped-dollar support_url emitted without its literal dollars intact`];
        }
        return [];
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * WR-01 (08 review). A three-dollar run in installer.support_url -- NSIS
 * folds the leading $$ to one literal $ and then expands $INSTDIR, so
 * $$$INSTDIR compiles to a literal $ followed by the install directory.
 * The pre-fix lookaround guard matched nothing at odd alignment inside a
 * 3+ run, so this exact value emitted silently. A legal URL character, so
 * the schema admits it; the sink guard must refuse it, naming the key.
 *
 * A child process, like probeHostileSupportUrl's: the guard reports through
 * report(), which exits, so driving the emitter in-process would take the
 * self-test down with it.
 */
function probeHostileTripleDollarUrl() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nsis-triple-'));
    try {
        const fixturePath = join(dir, 'case-nsis-triple.toml');
        writeFileSync(
            fixturePath,
            `${FIXTURE_DOWNSTREAM}\n[installer]\nsupport_url = "https://example.org/$$$INSTDIR/x"\n`,
            'utf8',
        );
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig, emitBrandingNsi } from ${JSON.stringify(import.meta.url)};`
            + `const r = resolveConfig(undefined, ${JSON.stringify(fixturePath)});`
            + `if (r.failures.length > 0) { console.log('UNEXPECTED-VALIDATE-RED'); process.exit(2); }`
            + `process.stdout.write(emitBrandingNsi(r.config, r.config.variants.find(v => v.id === 'dev')));`,
        ], { encoding: 'utf8' });
        if (child.status === 0) return [`${BROKEN} the hostile triple-dollar support_url emitted cleanly`];
        return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * WR-01's control: two doubled dollars for two literal dollars must still
 * emit with their dollars intact. Stripping the $$ pairs leaves no $ behind,
 * so the guard passes it -- without this, a guard that rejects every $
 * would pass the fault case above while breaking legitimate values.
 *
 * A child process, like probeEscapedDollarUrl's: the emitter is driven
 * past validation, and a rejection exits the child with the message --
 * never the self-test.
 */
function probeQuadrupleDollarUrl() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-nsis-quad-'));
    try {
        const fixturePath = join(dir, 'case-nsis-quad.toml');
        writeFileSync(
            fixturePath,
            `${FIXTURE_DOWNSTREAM}\n[installer]\nsupport_url = "https://example.org/$$$$PRICE/x"\n`,
            'utf8',
        );
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig, emitBrandingNsi } from ${JSON.stringify(import.meta.url)};`
            + `const r = resolveConfig(undefined, ${JSON.stringify(fixturePath)});`
            + `if (r.failures.length > 0) { console.log('UNEXPECTED-VALIDATE-RED'); process.exit(2); }`
            + `process.stdout.write(emitBrandingNsi(r.config, r.config.variants.find(v => v.id === 'dev')));`,
        ], { encoding: 'utf8' });
        if (child.status !== 0) {
            return [`the quadruple-dollar support_url was rejected but must emit: ${`${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '').join(' | ')}`];
        }
        if (!child.stdout.includes('!define URLInfoAbout "https://example.org/$$$$PRICE/x"')) {
            return [`${BROKEN} the quadruple-dollar support_url emitted without its literal dollars intact`];
        }
        return [];
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * GEN-05. A double quote in the display name, driven at the frontend-config
 * emitter PAST validation -- the schema would already refuse it upstream of
 * here, so only a directly-called emitter proves the SINK guard (not just
 * the pattern) refuses it, naming the dotted path. In JSON the quote would
 * close the applicationName string and rewrite the fragment.
 *
 * A child process, like probeHostileSupportUrl's: the guard reports through
 * report(), which exits, so driving the emitter in-process would take the
 * self-test down with it.
 */
function probeHostileFrontendConfigName() {
    const child = spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        `import { emitTheiaFrontendConfig } from ${JSON.stringify(import.meta.url)};`
        + `process.stdout.write(emitTheiaFrontendConfig({ identity: { display_name: 'Acme"Browser' } }, { id: 'dev' }));`,
    ], { encoding: 'utf8' });
    if (child.status === 0) return [`${BROKEN} the hostile display_name emitted cleanly into the frontend config fragment`];
    return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
}

/**
 * A manifest that is not valid TOML, read by a CHILD process.
 *
 * It has to be a child: an unparseable layer exits from inside loadLayer rather
 * than returning failures, because there is no document to carry on with. That
 * is the right behaviour for the pipeline and it is precisely why this case
 * cannot run in-process -- it would take the self-test down with it.
 *
 * What is asserted is the copy, not just the redness: the caught parser error's
 * own text carries a caret diagram and parser vocabulary, and D-11 forbids
 * showing it. This is the case that keeps that rule from resting on a
 * reviewer's memory of it, and it is the one most likely to be quietly broken
 * by a refactor that reaches for the caught error's own message.
 */
function probeMalformedManifest() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-malformed-'));
    try {
        const fixturePath = join(dir, MANIFEST_NAME);
        writeFileSync(fixturePath, `${FIXTURE_BASE}\n[identity\ndisplay_name = "Acme"\n`, 'utf8');
        const child = spawnSync(process.execPath, [
            '--input-type=module',
            '-e',
            `import { resolveConfig } from ${JSON.stringify(import.meta.url)};`
            + `resolveConfig(undefined, ${JSON.stringify(fixturePath)});`,
        ], { encoding: 'utf8' });
        if (child.status === 0) return [`${BROKEN} the malformed fixture parsed cleanly`];
        return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * CFG-05 (07-01). The variable naming a folder with no manifest in it, run
 * as a CHILD process.
 *
 * It has to be a child: the missing-manifest failure exits from inside
 * main() through report(), and driving main() in-process would take the
 * self-test down with it -- the same reason probeMalformedManifest is a
 * child. What is asserted is the copy, not just the redness: the failure
 * must name PB_CONFIG_DIR (the variable the reader goes and fixes), in the
 * file's plain-words shape the cross-cutting no-internals assertion owns.
 */
function probeExternalConfigMissing() {
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-extmissing-'));
    try {
        const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
            encoding: 'utf8',
            env: { ...process.env, PB_CONFIG_DIR: dir },
        });
        if (child.status === 0) return [`${BROKEN} a PB_CONFIG_DIR with no ${MANIFEST_NAME} generated cleanly`];
        return `${child.stderr}${child.stdout}`.split('\n').filter(line => line !== '');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * One round of concurrent exports, started together by a node child so
 * selfTest() stays synchronous. The child inherits RASTER_ENV and passes it
 * on; it prints one "<exit code> <width> <height>" line per export.
 */
const CONCURRENT_RASTER_ROUND = `
const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const [src, dir, round] = process.argv.slice(1);
Promise.all([0, 1, 2, 3, 4, 5].map(i => new Promise(done => {
    const out = join(dir, 'r' + round + '-' + i + '.png');
    const c = spawn('inkscape', [src, '--export-filename', out, '-w', '32', '-h', '32'], { env: process.env, stdio: 'ignore' });
    c.on('error', () => done('error 0 0'));
    c.on('close', code => {
        let w = 0, h = 0;
        try {
            const b = readFileSync(out);
            if (b.length >= 24 && b.readUInt32BE(12) === 0x49484452) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
        } catch {}
        done(code + ' ' + w + ' ' + h);
    });
}))).then(lines => console.log(lines.join('\\n')));
`;

/** PLAT-04 cause A's positive half: 3 rounds of 6 concurrent exports at 32 px, never the planted crash. */
function probeConcurrentRasters(sourceText) {
    const failures = [...rasterBusFailures(RASTER_ENV, sourceText)];
    const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-rasters-'));
    try {
        for (let round = 1; round <= 3; round++) {
            const child = spawnSync(process.execPath, ['-e', CONCURRENT_RASTER_ROUND, markSvgAbs(), dir, String(round)], {
                encoding: 'utf8',
                env: RASTER_ENV,
            });
            const lines = (child.stdout ?? '').split('\n').filter(line => line !== '');
            if (child.status !== 0 || lines.length !== 6) {
                failures.push(`round ${round} of the concurrent icon exports did not report all six exports. Check that inkscape is installed, then run: ${RERUN} --self-test`);
                continue;
            }
            lines.forEach((line, i) => {
                if (line !== '0 32 32') {
                    failures.push(`export ${i + 1} of round ${round} did not finish with a 32 by 32 icon. Check that the artwork opens as an image, then run: ${RERUN} --self-test`);
                }
            });
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    return failures;
}

/**
 * THE CROSS-CUTTING ASSERTION, applied to every case's output rather than
 * written as one more case -- because it is a property of every case, and a case
 * of its own would only ever check whatever fixture that case happened to use.
 *
 * CLAUDE.md's user-facing copy rule in executable form: no failure a reader
 * sees may carry a stack frame, a module specifier, or this machine's path to
 * the project. Each marker is named so a red says which one leaked.
 */
const INTERNAL_MARKERS = Object.freeze([
    Object.freeze({ what: 'a stack-trace frame', found: text => /^\s+at\s/m.test(text) }),
    Object.freeze({ what: "a 'node:' module specifier", found: text => text.includes('node:') }),
    Object.freeze({ what: "this machine's path to the project", found: text => text.includes(REPO_ROOT) }),
]);

function internalsLeaked(output) {
    const text = output.join('\n');
    return INTERNAL_MARKERS.filter(marker => marker.found(text)).map(marker => marker.what);
}

/**
 * The malformed case's extra rule, beyond the three markers above: none of the
 * parser's own idiom may survive into the copy. Parenthesised parser vocabulary
 * and a caret alone on a line are what the caught error's text looks like, and
 * a leading-slash token is a host path.
 */
function parserIdiomLeaked(output) {
    const text = output.join('\n');
    const leaks = [];
    if (/\([^)]*\b(?:token|unexpected|expected|syntax|parse|parser|EOF)\b[^)]*\)/i.test(text)) {
        leaks.push('parser vocabulary in parentheses');
    }
    if (/^\s*\^+\s*$/m.test(text)) leaks.push('a caret diagram line');
    if (/(?:^|\s)\/\S/m.test(text)) leaks.push('an absolute filesystem path');
    return leaks;
}

/**
 * Proves the mask, the unset rule, array-replace, the required-setting check,
 * the value rules, the misspelled-header ordering, the locale agreement, the
 * icon squareness and presence guards, the container structure, all freshness
 * outcomes and the parse-failure copy actually discriminate, rather than
 * merely being intended. A check that can only go green is not a check.
 */
function selfTest() {
    // A planted-fault result measured against an already-red baseline says
    // nothing about the fault, so establish the baseline first and bail if the
    // unmodified manifest is the thing that is broken.
    const baseline = resolveConfig(MANIFEST_PATH, undefined);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified ${MANIFEST_NAME} is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }

    const clean = readFileSync(MANIFEST_PATH, 'utf8');

    // Taken ONCE, before any case runs, so the invalid-basename case can prove
    // that a rejected value left the output tree exactly as it found it.
    const outputRootBefore = snapshotOutputRoot();

    // Derived from the frozen table, not written out here: a hand-kept copy of
    // these paths could only ever agree with the table it was copied from.
    const everyTargetPath = TARGETS.map(t => t.generated);

    // GEN-01's green control, computed once: the locale pairs the emitters
    // actually produce for both variants, run through the same agreement
    // function the drift case plants against. The baseline above is already
    // established green, so a non-empty result here is a broken assertion,
    // not a broken manifest.
    const agreementControl = localeAgreementFailures(
        ['dev', 'release'].map(id => baseline.config.variants.find(v => v.id === id)).flatMap(variant => ([
            { rel: `branding/${variant.id}/locales/en-US/brand.ftl`, body: emitBrandFtl(baseline.config, variant) },
            { rel: `branding/${variant.id}/locales/en-US/brand.properties`, body: emitBrandProperties(baseline.config, variant) },
        ])),
    );

    // GEN-02's green control, computed once: the containers the writers
    // actually build, run through the same structure functions the corruption
    // cases plant against. Without this, a red result from those cases could
    // be the assertion firing on the unmodified bytes rather than on the
    // plant.
    const containerControl = [
        ...icoStructureFailures(
            emitFirefoxIco(iconPngBytes(16), iconPngBytes(32), iconPngBytes(48)),
            'branding/dev/firefox.ico',
        ),
        ...icnsStructureFailures(
            emitFirefoxIcns(iconPngBytes(128), iconPngBytes(32), iconPngBytes(16)),
            'branding/dev/firefox.icns',
        ),
    ];

    // GEN-05's green control, computed once: the frontend-config fragment
    // the emitter actually produces must parse as JSON and carry the
    // manifest's display name as applicationName. Without this, a red
    // result from the hostile case below could be the emitter broken on the
    // unmodified value rather than on the plant. The baseline above is
    // already established green, so a non-empty result here is a broken
    // emitter, not a broken manifest.
    const frontendConfigControl = (() => {
        const dev = baseline.config.variants.find(v => v.id === 'dev');
        if (dev === undefined) return ['the resolved config has no dev variant'];
        let parsed;
        try {
            parsed = JSON.parse(emitTheiaFrontendConfig(baseline.config, dev));
        } catch {
            return ['the emitted theia frontend-config fragment is not valid JSON'];
        }
        if (parsed?.applicationName !== baseline.config.identity.display_name) {
            return [
                `the emitted theia frontend-config fragment carries applicationName ${JSON.stringify(parsed?.applicationName)} `
                + `instead of the manifest display name ${JSON.stringify(baseline.config.identity.display_name)}`,
            ];
        }
        return [];
    })();

    // EXT-01's green control, computed once: the four-entry fixture below must
    // resolve with zero failures and emit a theiaPlugins block with the four
    // EXACT URLs -- the versioned Open VSX file URL for the openvsx entry
    // (no latest-resolution anywhere in the pipeline), the stated URL
    // verbatim for the url entry, the conventional registry tarball URL for
    // the npm entry, and the packed-archive reference for the local-path
    // entry. The expected URLs are literals: deriving them through
    // openVsxFileUrl (or the npm/local resolvers) would make the control
    // agree with the emitter no matter how wrong both were. Without this, a
    // red result from the fault cases below could be the emitter broken on
    // clean entries rather than on the plant.
    const extensionUrlsControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-extensions-'));
        try {
            const fixturePath = join(fixtureDir, 'extensions.toml');
            writeFileSync(fixturePath, `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS}`, 'utf8');
            const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
            if (resolved.failures.length > 0) {
                return [`the extensions fixture failed validation: ${resolved.failures.join(' | ')}`];
            }
            let parsed;
            try {
                parsed = JSON.parse(emitTheiaPlugins(
                    resolved.config,
                    resolved.config.variants.find(v => v.id === 'dev'),
                ));
            } catch {
                return ['the emitted theiaPlugins fragment is not valid JSON'];
            }
            const want = {
                'acme.gadget': 'https://open-vsx.org/api/acme/gadget/1.2.3/file/acme.gadget-1.2.3.vsix',
                'acme.widget': 'https://example.org/acme-widget-2.0.0.vsix',
                'acme.npmpack': 'https://registry.npmjs.org/acme.npmpack/-/acme.npmpack-2.4.1.tgz',
                'acme.localtool': 'extensions/acme-local.tgz',
            };
            const keys = Object.keys(parsed ?? {});
            if (keys.length !== 4 || keys.some(k => parsed[k] !== want[k])) {
                return [`the emitted theiaPlugins block is not the four exact URLs: ${JSON.stringify(parsed)}`];
            }
            return [];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // EXT-03's green control, computed once: the two-entry fixture below
    // must resolve with zero failures and emit an ExtensionSettings block
    // with the two EXACT entries -- the stated mode and URL per add-on id.
    // The expected block is a literal: deriving it through
    // emitWebExtensionSettings would make the control agree with the
    // emitter no matter how wrong both were. Without this, a red result
    // from the fault cases below could be the emitter broken on clean
    // entries rather than on the plant.
    const webExtensionsControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-webextensions-'));
        try {
            const fixturePath = join(fixtureDir, 'webextensions.toml');
            writeFileSync(fixturePath, `${FIXTURE_DOWNSTREAM}\n${FIXTURE_WEBEXTENSIONS}`, 'utf8');
            const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
            if (resolved.failures.length > 0) {
                return [`the webextensions fixture failed validation: ${resolved.failures.join(' | ')}`];
            }
            let parsed;
            try {
                parsed = JSON.parse(emitWebExtensionSettings(
                    resolved.config,
                    resolved.config.variants.find(v => v.id === 'dev'),
                ));
            } catch {
                return ['the emitted webextensions-settings fragment is not valid JSON'];
            }
            const want = {
                'acme-tool@example.org': {
                    installation_mode: 'force_installed',
                    install_url: 'https://example.org/acme-tool-1.2.3.xpi',
                },
                'acme-helper@example.org': {
                    installation_mode: 'normal_installed',
                    install_url: 'file:///opt/downstream/extensions/acme-helper.xpi',
                },
            };
            if (JSON.stringify(parsed) !== JSON.stringify(want)) {
                return [`the emitted ExtensionSettings block is not the two exact entries: ${JSON.stringify(parsed)}`];
            }
            return [];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // EXT-03's empty control, computed once: the entry-free manifest (this
    // project's own tree, which declares no [[webextensions]]) must emit
    // the empty object -- the correct tracked state of a tree with nothing
    // declared. Without this, the gate's tracked-key equality on the real
    // tree would rest on an unproved emitter default.
    const webExtensionsEmptyControl = (() => {
        let parsed;
        try {
            parsed = JSON.parse(emitWebExtensionSettings(
                baseline.config,
                baseline.config.variants.find(v => v.id === 'dev'),
            ));
        } catch {
            return ['the emitted entry-free webextensions-settings fragment is not valid JSON'];
        }
        if (JSON.stringify(parsed) !== '{}') {
            return [`the emitted entry-free ExtensionSettings block is not the empty object: ${JSON.stringify(parsed)}`];
        }
        return [];
    })();
    // EXT-02's placeholder control, computed once: a target-specific direct
    // URL carrying the downloader placeholder `${targetPlatform}` must reach
    // the emitted fragment byte-verbatim -- the placeholder names the machine
    // that runs the download, never the generator host, so expanding it here
    // would pin one platform's bytes under a universal pin. The expected URL
    // is a literal, and the control additionally refuses any platform literal
    // the generator host could have substituted (its own platform string and
    // the three stock target triples).
    const targetPlaceholderControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-placeholder-'));
        try {
            const placeholderUrl = 'https://example.org/acme-target-${targetPlatform}-1.0.0.vsix';
            const fixturePath = join(fixtureDir, 'placeholder.toml');
            writeFileSync(
                fixturePath,
                `${FIXTURE_DOWNSTREAM}\n`
                + '[[extensions]]\n'
                + 'id = "acme.targeted"\n'
                + 'source = "url"\n'
                + `url = "${placeholderUrl}"\n`
                + `sha256 = "${FIXTURE_EXTENSION_PIN_A}"\n`,
                'utf8',
            );
            const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
            if (resolved.failures.length > 0) {
                return [`the placeholder fixture failed validation: ${resolved.failures.join(' | ')}`];
            }
            let parsed;
            try {
                parsed = JSON.parse(emitTheiaPlugins(
                    resolved.config,
                    resolved.config.variants.find(v => v.id === 'dev'),
                ));
            } catch {
                return ['the emitted theiaPlugins fragment is not valid JSON'];
            }
            if (parsed?.['acme.targeted'] !== placeholderUrl) {
                return [`the placeholder URL did not reach the fragment verbatim: ${JSON.stringify(parsed)}`];
            }
            const hostLiterals = [process.platform, 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64'];
            const leaked = hostLiterals.filter(literal => parsed['acme.targeted'].includes(literal));
            if (leaked.length > 0) {
                return [`the emitted URL carries generator-host platform literals: ${leaked.join(', ')}`];
            }
            return [];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // TEL-01/TEL-02's green control, computed once: a [telemetry] fixture
    // at level error validates clean and emits a fragment carrying that
    // level and endpoint verbatim -- and a fixture with no [telemetry] at
    // all resolves to off/null, which is the default the emitter owns.
    // Without this, a red result from the three fault cases below could be
    // the emitter broken on a clean value rather than on the plant. The
    // expected pairs are literals: deriving them through emitTheiaTelemetry
    // would make the control agree with the emitter no matter how wrong
    // both were.
    // TEL-07 (57-02): the crash origin control. A stated https crash_report derives its origin (path
    // dropped) and emits the --with-crashreporter-url line; an unset key derives '' and emits nothing.
    // The expected values are literals, so the control cannot agree with the emitter by construction.
    const crashOriginControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-crash-origin-'));
        try {
            const checkOne = (toml, wantOrigin, label) => {
                const fixturePath = join(fixtureDir, `crash-origin-${label}.toml`);
                writeFileSync(fixturePath, toml, 'utf8');
                const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
                if (resolved.failures.length > 0) {
                    return [`the crash-origin ${label} fixture failed validation: ${resolved.failures.join(' | ')}`];
                }
                const dev = resolved.config.variants.find(v => v.id === 'dev');
                const problems = [];
                const origin = crashReporterOrigin(resolved.config);
                if (origin !== wantOrigin) problems.push(`crashReporterOrigin is ${JSON.stringify(origin)} for ${label}, not ${JSON.stringify(wantOrigin)}`);
                const mozconfig = emitMozconfig(resolved.config, dev);
                if (wantOrigin === '' && mozconfig.includes('--with-crashreporter-url')) {
                    problems.push(`${label} emitted --with-crashreporter-url though the key is unset`);
                }
                if (wantOrigin !== '' && !mozconfig.includes(`ac_add_options --with-crashreporter-url=${wantOrigin}\n`)) {
                    problems.push(`${label} did not emit ac_add_options --with-crashreporter-url=${wantOrigin}`);
                }
                return problems;
            };
            return [
                ...checkOne(`${FIXTURE_DOWNSTREAM}\ncrash_report = "https://crash.example.org/report"\n`, 'https://crash.example.org', 'stated'),
                ...checkOne(FIXTURE_DOWNSTREAM, '', 'unset'),
            ];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();
    // WR-09: the pairing of the disable line with the crash address. The expected arrays are literals.
    const crashEnableControl = (() => {
        const problems = [];
        const same = (got, want, what) => {
            if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
        };
        const URL_LINE = 'ac_add_options --with-crashreporter-url=https://crash.example.org';
        same(crashReporterOptions('', false), ['ac_add_options --disable-crashreporter'], 'compiled out, no key');
        same(crashReporterOptions('https://crash.example.org', false), ['ac_add_options --disable-crashreporter', URL_LINE], 'compiled out, key stated');
        same(crashReporterOptions('https://crash.example.org', true), [URL_LINE], 'enabled, key stated');
        let thrown = null;
        try {
            crashReporterOptions('', true);
        } catch (err) {
            thrown = err;
        }
        if (thrown === null) problems.push('the reporter enabled with no crash_report key did not fail generation, so deleting the disable literal would build one that sends to Mozilla');
        else if (!thrown.message.includes('crash_report')) problems.push(`the enabled-without-key failure does not name crash_report: ${thrown.message}`);
        // The shipped mozconfig is still compiled out.
        const shippedConfig = resolveConfig(MANIFEST_PATH, undefined).config;
        const shipped = emitMozconfig(shippedConfig, shippedConfig.variants.find(v => v.id === 'dev'));
        if (!shipped.includes('ac_add_options --disable-crashreporter\n')) problems.push('the dev mozconfig no longer carries --disable-crashreporter while the flip has not happened');
        return problems;
    })();
    const telemetryControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-telemetry-'));
        try {
            const checkOne = (toml, wantLevel, wantEndpoint) => {
                const fixturePath = join(fixtureDir, `telemetry-${wantLevel}.toml`);
                writeFileSync(fixturePath, toml, 'utf8');
                const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
                if (resolved.failures.length > 0) {
                    return [`the telemetry fixture failed validation: ${resolved.failures.join(' | ')}`];
                }
                let parsed;
                try {
                    parsed = JSON.parse(emitTheiaTelemetry(
                        resolved.config,
                        resolved.config.variants.find(v => v.id === 'dev'),
                    ));
                } catch {
                    return ['the emitted theia-telemetry fragment is not valid JSON'];
                }
                if (parsed?.level !== wantLevel || parsed?.endpoint !== wantEndpoint) {
                    return [`the emitted theia-telemetry fragment is not ${JSON.stringify(wantLevel)}/${JSON.stringify(wantEndpoint)}: ${JSON.stringify(parsed)}`];
                }
                return [];
            };
            // An omitted [telemetry] section inherits the default manifest's level and endpoint through the
            // default-echo (TEL-06 states the endpoint at level off), so the expectation is derived from it.
            const inheritedEndpoint = resolveConfig(MANIFEST_PATH, undefined).config.telemetry?.endpoint ?? null;
            return [
                ...checkOne(
                    `${FIXTURE_DOWNSTREAM}\n[telemetry]\nlevel = "error"\nendpoint = "https://example.org/telemetry/v1/events"\n`,
                    'error', 'https://example.org/telemetry/v1/events',
                ),
                ...checkOne(`${FIXTURE_DOWNSTREAM}`, 'off', inheritedEndpoint),
            ];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // GEN-05 remainder's green control, computed once: a [theia] fixture
    // with a theme id, both texts and a support URL validates clean and
    // emits a frontend-config fragment carrying the theme alongside the
    // name plus a branding fragment carrying both texts, the repo URL and
    // the mark SVG verbatim -- and a fixture with no [theia] texts at all
    // emits null texts. Without this, a red result from the three fault
    // cases below could be the emitter broken on a clean value rather than
    // on the plant. The expected pairs are literals (and the mark line is
    // read straight out of brand/mark.svg, the way the preflight reads it):
    // deriving them through the emitters would make the control agree with
    // the emitter no matter how wrong both were.
    const brandingControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-branding-'));
        try {
            const fixturePath = join(fixtureDir, 'branding.toml');
            writeFileSync(
                fixturePath,
                `${FIXTURE_DOWNSTREAM}\n[theia]\ndefault_theme = "light"\nwelcome_text = "Acme welcomes you."\nabout_text = "Acme Browser is a test product."\n[installer]\nsupport_url = "https://example.org/support"\n`,
                'utf8',
            );
            const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
            if (resolved.failures.length > 0) {
                return [`the branding fixture failed validation: ${resolved.failures.join(' | ')}`];
            }
            const dev = resolved.config.variants.find(v => v.id === 'dev');
            let frontend;
            let branding;
            try {
                frontend = JSON.parse(emitTheiaFrontendConfig(resolved.config, dev));
                branding = JSON.parse(emitTheiaBranding(resolved.config, dev));
            } catch {
                return ['the emitted theia frontend-config or branding fragment is not valid JSON'];
            }
            if (frontend?.applicationName !== 'Acme Browser' || frontend?.defaultTheme !== 'light') {
                return [`the emitted frontend-config fragment is not the stated name and theme: ${JSON.stringify(frontend)}`];
            }
            if (branding?.welcomeText !== 'Acme welcomes you.'
                || branding?.aboutText !== 'Acme Browser is a test product.'
                || branding?.repoUrl !== 'https://example.org/support') {
                return [`the emitted branding fragment is not the stated texts and repo URL: ${JSON.stringify({ ...branding, markSvg: undefined })}`];
            }
            // The legal-notice triple as literals (06-04): the downstream's
            // own notice verbatim, the Mozilla sentence over the dev
            // composition, the Eclipse sentence over the fixture support
            // URL's domain. Deriving these through the emitter would make
            // the control agree with it no matter how wrong both were.
            const wantNotices = [
                'Acme Browser is a trademark of Acme Works.',
                'Acme Browser Dev is not officially associated with Mozilla or its products.',
                'This product (example.org) includes Eclipse Theia, a trademark of Eclipse Foundation AISBL.',
            ];
            if (JSON.stringify(branding?.legalNotices) !== JSON.stringify(wantNotices)) {
                return [`the emitted branding fragment does not carry the three stated legal notices: ${JSON.stringify(branding?.legalNotices)}`];
            }
            let markLine;
            try {
                markLine = readFileSync(markSvgAbs(), 'utf8').split('\n').find((l) => l.startsWith('<svg'))?.trim();
            } catch {
                markLine = undefined;
            }
            if (typeof markLine !== 'string' || branding?.markSvg !== markLine) {
                return ['the emitted branding fragment does not carry the brand/mark.svg single-line element verbatim'];
            }
            const barePath = join(fixtureDir, 'branding-bare.toml');
            writeFileSync(barePath, `${FIXTURE_DOWNSTREAM}`, 'utf8');
            const bare = resolveConfig(MANIFEST_PATH, barePath);
            if (bare.failures.length > 0) {
                return [`the textless branding fixture failed validation: ${bare.failures.join(' | ')}`];
            }
            let bareBranding;
            try {
                bareBranding = JSON.parse(emitTheiaBranding(
                    bare.config,
                    bare.config.variants.find(v => v.id === 'dev'),
                ));
            } catch {
                return ['the emitted textless branding fragment is not valid JSON'];
            }
            if (bareBranding?.welcomeText !== null || bareBranding?.aboutText !== null) {
                return [`the emitted textless branding fragment does not default unset texts to null: ${JSON.stringify({ ...bareBranding, markSvg: undefined })}`];
            }
            // Notices are independent of the texts: a manifest stating no
            // welcome/about copy still emits all three notices.
            if (!Array.isArray(bareBranding?.legalNotices) || bareBranding.legalNotices.length !== 3) {
                return [`the emitted textless branding fragment does not carry three legal notices: ${JSON.stringify(bareBranding?.legalNotices)}`];
            }
            return [];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // TEL-03's green control, computed once: a fixture with a telemetry
    // endpoint, a crash-report URL and a support URL resolves to exactly
    // those three hosts sorted plus the inherited urls.update host, with
    // the endpoint prefs repointed to the stated URLs -- and a fixture
    // with none of them resolves to the lone inherited support host plus
    // the inherited urls.update host, with both prefs blanked. The
    // update host is inherited from this project's own manifest (an
    // optional key, so the mask never strips it): the derivation is over
    // the MERGED config, so any default-layer contactable host reaches
    // every fixture -- which is why the second fixture also carries the
    // inherited [[search_engines]] hosts, while the first restates its own
    // engine list and so carries only its own (D-07 array-replace, BAR-03).
    // Without this, a red result from the coverage gate
    // could be the derivation broken on a clean manifest rather than on
    // a drift. The expected hosts and prefs are literals: deriving them
    // through the derivation would make the control agree with it no
    // matter how wrong both were.
    const endpointHostsControl = (() => {
        const fixtureDir = mkdtempSync(join(tmpdir(), 'generate-selftest-endpoints-'));
        try {
            const checkOne = (toml, wantHosts, wantServer, wantReport) => {
                const fixturePath = join(fixtureDir, `endpoints-${wantHosts.length}.toml`);
                writeFileSync(fixturePath, toml, 'utf8');
                const resolved = resolveConfig(MANIFEST_PATH, fixturePath);
                if (resolved.failures.length > 0) {
                    return [`the endpoints fixture failed validation: ${resolved.failures.join(' | ')}`];
                }
                const hosts = manifestEndpointHosts(resolved.config);
                if (JSON.stringify(hosts) !== JSON.stringify(wantHosts)) {
                    return [`the derived endpoint hosts are not ${JSON.stringify(wantHosts)}: ${JSON.stringify(hosts)}`];
                }
                const prefs = mozillaEndpointPrefs(resolved.config);
                const server = prefs.find(p => p.name === 'toolkit.telemetry.server')?.value;
                const reportURL = prefs.find(p => p.name === 'breakpad.reportURL')?.value;
                if (server !== wantServer || reportURL !== wantReport) {
                    return [`the derived endpoint prefs are not ${JSON.stringify(wantServer)}/${JSON.stringify(wantReport)}: ${JSON.stringify(server)}/${JSON.stringify(reportURL)}`];
                }
                let fragment;
                try {
                    fragment = JSON.parse(emitEndpointHosts(
                        resolved.config,
                        resolved.config.variants.find(v => v.id === 'dev'),
                    ));
                } catch {
                    return ['the emitted endpoint-hosts fragment is not valid JSON'];
                }
                if (JSON.stringify(fragment) !== JSON.stringify(wantHosts)) {
                    return [`the emitted endpoint-hosts fragment is not ${JSON.stringify(wantHosts)}: ${JSON.stringify(fragment)}`];
                }
                return [];
            };
            return [
                ...checkOne(
                    `${FIXTURE_BASE}\n${FIXTURE_VARIANT}\n[telemetry]\nlevel = "all"\nendpoint = "https://collector.example.org/v1/events"\n[urls]\ncrash_report = "https://crash.example.org/report"\nupdate = "https://updates.example.org/update.xml"\nmar_origin = "https://downloads.example.org"\nrelease_notes = "https://notes.example.org/releases"\nhomepage = "https://example.org"\n[installer]\nsupport_url = "https://example.org/support"\n[[search_engines]]\nname = "Acme Search"\nurl = "https://search.example.org/?q={searchTerms}"\nsuggest_url = "https://suggest.example.org/?q={searchTerms}"\n`,
                    ['collector.example.org', 'crash.example.org', 'downloads.example.org', 'example.org', 'notes.example.org', 'search.example.org', 'suggest.example.org', 'updates.example.org'],
                    'https://collector.example.org/v1/events',
                    'https://crash.example.org/report',
                ),
                // BAR-03: a downstream that states no [[search_engines]] inherits the platform's
                // engines and hosts beside the platform's other inherited hosts; it states its own
                // About-dialog pages (WR-04).
                ...checkOne(
                    `${FIXTURE_BASE}\n${FIXTURE_VARIANT}\n[urls]\nupdate = "https://updates.example.org/update.xml"\nrelease_notes = "https://notes.example.org/releases"\nhomepage = "https://example.org"\n`,
                    ['ac.duckduckgo.com', 'downloads.powerbrowser.org', 'en.wikipedia.org', 'events.powerbrowser.org', 'example.org', 'lite.duckduckgo.com', 'notes.example.org', 'powerbrowser.org', 'updates.example.org'],
                    '',
                    '',
                ),
                // WR-04: a downstream under a new name that states no urls.release_notes or
                // urls.homepage inherits the platform's pages, and is refused naming both.
                ...(() => {
                    const fixturePath = join(fixtureDir, 'endpoints-inherited.toml');
                    writeFileSync(fixturePath, `${FIXTURE_BASE}\n${FIXTURE_VARIANT}\n[urls]\nupdate = "https://updates.example.org/update.xml"\n`, 'utf8');
                    const text = resolveConfig(MANIFEST_PATH, fixturePath).failures.join(' | ');
                    return text.includes('urls.release_notes') && text.includes('urls.homepage')
                        ? [] : [`a downstream inheriting the platform's About-dialog links was not refused naming urls.release_notes and urls.homepage: ${text || '(no failure)'}`];
                })(),
                // ...while a copy of the platform manifest that keeps its identity and states only
                // its own update address still resolves (the ng071/ng073 fixtures' shape).
                ...(() => {
                    const fixturePath = join(fixtureDir, 'endpoints-same-identity.toml');
                    const copy = readFileSync(MANIFEST_PATH, 'utf8').replace(/^\[urls\][\s\S]*?(?=^\[|(?![\s\S]))/m, '');
                    writeFileSync(fixturePath, `${copy}\n[urls]\nupdate = "https://updates.example.org/update.xml"\n`, 'utf8');
                    const { failures } = resolveConfig(MANIFEST_PATH, fixturePath);
                    return failures.length === 0 ? [] : [`a same-identity downstream copy was refused: ${failures.join(' | ')}`];
                })(),
                // UPD-13: unstated links fall back to about:blank (hidden) and "", stated ones map verbatim.
                ...[
                    [{}, ['about:blank', 'about:blank', '', '']],
                    [{ release_notes: 'https://notes.example.org/r', homepage: 'https://example.org' },
                        ['https://notes.example.org/r', 'https://notes.example.org/r', 'https://example.org', 'https://notes.example.org/r']],
                ].flatMap(([urls, want]) => {
                    const got = releaseLinkPrefs({ urls }).map(p => p.value);
                    return JSON.stringify(got) === JSON.stringify(want)
                        ? [] : [`the About-dialog link prefs for ${JSON.stringify(urls)} are not ${JSON.stringify(want)}: ${JSON.stringify(got)}`];
                }),
            ];
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    })();

    // CFG-05's green control, computed once: a complete downstream manifest
    // staged under a throwaway directory resolves -- through the same
    // externalConfigDir derivation main() uses, plus the shipped merge -- to
    // its own display values rather than this project's. The expected value
    // is a literal: deriving it through the merge would make the control
    // agree with the derivation no matter how wrong both were. Resolves
    // only: no asset root is switched and nothing is rasterized, so the
    // icon cache the later probes warm is untouched.
    const externalConfigControl = (() => {
        const dir = mkdtempSync(join(tmpdir(), 'generate-selftest-extdir-'));
        try {
            writeFileSync(join(dir, MANIFEST_NAME), `${FIXTURE_DOWNSTREAM}`, 'utf8');
            const saved = process.env.PB_CONFIG_DIR;
            process.env.PB_CONFIG_DIR = dir;
            try {
                const extDir = externalConfigDir();
                if (extDir === undefined) return ['PB_CONFIG_DIR was not picked up'];
                const staged = resolveConfig(MANIFEST_PATH, join(extDir, MANIFEST_NAME));
                if (staged.failures.length > 0) {
                    return [`the staged external manifest failed validation: ${staged.failures.join(' | ')}`];
                }
                if (staged.config?.identity?.display_name !== 'Acme Browser') {
                    return [`the staged external manifest resolved to ${JSON.stringify(staged.config?.identity?.display_name)} instead of "Acme Browser"`];
                }
                return [];
            } finally {
                if (saved === undefined) delete process.env.PB_CONFIG_DIR;
                else process.env.PB_CONFIG_DIR = saved;
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    })();

    // PLAT-04 cause A's spawn-site cases read this file's own text.
    const ownText = readFileSync(fileURLToPath(import.meta.url), 'utf8');

    const cases = [
        {
            // D-10. A whitespace-only value is not a value.
            name: 'whitespace identity value',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('remoting_name = "acme-browser"', 'remoting_name = "   "'),
            expect: 'identity.remoting_name',
        },
        {
            // THE case that pins the mask ORDERING. The defaults layer carries
            // binary_name, so if the mask were moved after the merge this
            // downstream would silently inherit it and the case would go green.
            // A self-test whose only identity fault is a wholly missing table
            // cannot catch that.
            name: 'partial identity table',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('binary_name = "acme-browser"\n', ''),
            expect: 'identity.binary_name',
        },
        {
            // D-07. Goes red if array-replace is ever turned into joining the
            // two arrays end to end.
            //
            // THE ONE ELEMENT IS COMPLETE, and that matters. This case used to
            // declare `id = "dev"` and nothing else, which made it pin two
            // claims at once: that a short array replaces a long one, and --
            // silently -- that an INCOMPLETE variant resolves successfully. The
            // second is a defect, and pinning it as the contract is what let a
            // partial [[variants]] table emit the literal string `undefined`
            // and then throw. Replacement is what this case exists to prove;
            // the case below is what proves incompleteness is refused.
            name: 'downstream array shorter than default',
            toml: `${FIXTURE_DOWNSTREAM}`,
            holds: 'one variant, not three',
            resolved: c => Array.isArray(c.variants) && c.variants.length === 1,
        },
        {
            // CR-03. A [[variants]] section missing one of its four settings.
            // Every variants[] key is required PER ELEMENT, and readPath cannot
            // address an element, so without validateVariantElements this
            // fixture resolved with zero failures and the emitters carried the
            // missing value straight through as `undefined`.
            name: 'variant missing a required setting',
            toml: `${FIXTURE_DOWNSTREAM.replace('objdir = "objdir"\n', '')}`,
            expect: 'objdir',
        },
        {
            // WR-08. variantById is a find, so the second of two variants
            // sharing an id was silently unreachable -- a downstream editing it
            // got no effect and no message.
            name: 'two variants sharing one id',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_VARIANT}`,
            expect: 'both use the id "dev"',
        },
        {
            // WR-08. A typo'd id used to surface only as the missing-variant
            // error for the id it was meant to be, sending the reader to ADD a
            // section rather than fix a letter.
            name: 'variant with an id nothing builds',
            toml: `${FIXTURE_DOWNSTREAM.replace('id = "dev"', 'id = "relase"')}`,
            expect: 'is never used',
        },
        {
            // IN-07. TOML 1.0 parses to the number 1; a whole number with a decimal point is still refused.
            name: 'revision written with a decimal point',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('revision = 1\n', 'revision = 1.0\n'),
            expect: 'product.revision is written with a decimal point',
        },
        {
            // CFG-02's core. A required setting is one a downstream must state
            // for itself; omitting it is a hard failure, never a quiet
            // fallback to this project's identity under someone else's name.
            name: 'missing required key',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('display_name = "Acme Browser"\n', ''),
            expect: 'identity.display_name',
        },
        {
            // CFG-03. The value is REJECTED, never transformed into a passing
            // one -- so the message has to state the length bounds in words,
            // because the pattern's quantifier is not self-explanatory to a
            // stranger, and the run has to leave generated/ untouched.
            name: 'invalid basename',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('binary_name = "acme-browser"', 'binary_name = "two words"'),
            expect: 'identity.binary_name',
            also: [SCHEMA_KEYS['identity.binary_name'].regex_help],
            extra: () => (snapshotOutputRoot() === outputRootBefore
                ? []
                : ['the rejected run changed what is under generated/']),
        },
        {
            // THE case that pins the unknown-key check's position AHEAD of the
            // merge. A misspelled table that survived to the merge would
            // produce missing-key errors naming keys that are spelled
            // correctly, sending the author to look in the wrong place -- so
            // the misspelling has to be named and the missing-key phrase has to
            // be absent. That phrase is read from the emitter, not copied.
            name: 'unknown key',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('[identity]', '[identiy]'),
            expect: 'identiy',
            notExpect: [UNSET_MARK],
        },
        {
            // D-12. One byte of one generated file changed by hand, and the
            // freshness comparison has to name THAT file -- naming some other
            // one would prove it can go red, not that it goes red on the thing
            // that drifted.
            name: 'stale generated output',
            probe: probeStaleOutput,
            expect: TARGETS[0].generated,
        },
        {
            // The absent-directory outcome is a DISTINCT message, not fifty-two
            // stale paths, AND it is not a failure. Asserted from three sides:
            // the message is there, no target path is, and the exit code was
            // zero -- so a future collapse of the three outcomes into one goes
            // red here, and so does a return to exiting 1 on a tree that has
            // simply never generated.
            name: 'absent generated directory',
            probe: probeAbsentOutput,
            expect: 'nothing has been generated in this copy of the project yet',
            notExpect: [...everyTargetPath, ABSENT_EXIT_MARK],
        },
        {
            // D-11. Red on the manifest and the line, and free of the parser's
            // own idiom -- see parserIdiomLeaked.
            name: 'malformed manifest',
            probe: probeMalformedManifest,
            expect: MANIFEST_NAME,
            also: [/line \d+/],
            extra: parserIdiomLeaked,
        },
        {
            // GEN-01. The agreement assertion must name BOTH files and BOTH
            // values when the ftl full-name term drifts from the properties
            // value -- a red that only says something disagrees would not
            // tell anyone which half to fix.
            name: 'locale agreement rejects a drifted full name',
            probe: probeLocaleAgreementDrift,
            expect: 'brand.ftl',
            also: ['brand.properties', 'Planted Drift', 'PowerBrowser Dev'],
        },
        {
            // GEN-01's control: the pairs the emitters actually produce --
            // both variants -- hold with zero failures. Without this, a red
            // result from the drift case above could be the assertion firing
            // on the unmodified bodies rather than on the plant.
            name: 'locale agreement holds on the emitted pairs',
            probe: () => agreementControl,
            holds: 'no failures on the matching pairs',
            resolved: () => agreementControl.length === 0,
        },
        {
            // GEN-02, P-GEN-02. A non-square downstream logo must fail naming
            // the asset and the squareness rule -- never a stretch, a
            // letterbox, or a quiet substitution of the placeholder mark.
            name: 'non-square icon source',
            probe: probeNonSquareSource,
            expect: MARK_SVG_REL,
            also: ['square'],
        },
        {
            // GEN-02's empty probe: a missing brand/mark.svg is a hard
            // failure naming the asset, never an empty icon set and never a
            // quiet reuse of the checked-in PNGs.
            name: 'missing icon source',
            probe: probeMissingSource,
            expect: MARK_SVG_REL,
            also: ['missing'],
        },
        {
            // GEN-02. One byte of one raster changed by hand, and the
            // freshness comparison has to name THAT png -- naming some other
            // file would prove it can go red, not that it goes red on the
            // thing that drifted.
            name: 'drifted icon raster',
            probe: probeIconPngDrift,
            expect: 'branding/dev/default32.png',
        },
        {
            // GEN-02's control: the containers the writers actually build
            // hold with zero structural failures. Without this, a red result
            // from the corruption cases below could be the assertion firing
            // on the unmodified bytes rather than on the plant.
            name: 'container writers hold on the emitted buffers',
            probe: () => containerControl,
            holds: 'no structural failures on the unmodified containers',
            resolved: () => containerControl.length === 0,
        },
        {
            // GEN-02. The ICO just built, with one byte shaved off the end:
            // the last directory entry then points past the end of the file,
            // and the structure assertion has to name THAT file and the entry.
            name: 'truncated ICO payload',
            probe: probeTruncatedIco,
            expect: 'branding/dev/firefox.ico',
            also: ['entry 2'],
        },
        {
            // GEN-02. The ICNS just built, with its magic overwritten: the
            // header assertion has to name THAT file carrying the planted
            // magic and the icns it must carry.
            name: 'wrong-magic ICNS',
            probe: probeWrongMagicIcns,
            expect: 'branding/dev/firefox.icns',
            also: ['icns'],
        },
        {
            // GEN-03, T-03-07. A double quote in the display name must fail
            // naming the key -- it would close the quoted NSIS !define value
            // the name is interpolated into.
            name: 'hostile double quote in display name',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('display_name = "Acme Browser"', 'display_name = "Acme \\"Browser"'),
            expect: 'identity.display_name',
        },
        {
            // GEN-03, T-03-07. A dollar-brace variable reference in the
            // support URL passes the schema (it is a legal URL character)
            // and must be refused by the NSIS sink guard at emission, naming
            // the key -- in NSIS ${} expands at compile time.
            name: 'hostile variable reference in support URL',
            probe: probeHostileSupportUrl,
            expect: 'installer.support_url',
        },
        {
            // WR-04. A bare dollar-name in the support URL passes the schema
            // (it is a legal URL character) and must be refused by the NSIS
            // sink guard at emission, naming the key -- in NSIS $NAME
            // expands at compile time exactly like ${NAME}.
            name: 'hostile bare dollar-name in support URL',
            probe: probeHostileBareDollarUrl,
            expect: 'installer.support_url',
        },
        {
            // WR-04's control: a doubled dollar for a literal dollar must
            // still emit with its dollars intact. Without this, a guard
            // that rejects every $ would pass the fault case above while
            // breaking legitimate values.
            name: 'escaped doubled dollar in support URL still emits',
            probe: probeEscapedDollarUrl,
            holds: 'the escaped URL emitted with its literal dollars intact',
            resolved: () => true,
        },
        {
            // WR-01 (08 review). A three-dollar run passes a lookaround
            // guard at odd alignment (every position sits beside another
            // $) while NSIS still folds the leading $$ and expands the
            // rest -- it must be refused by the sink guard, naming the key.
            name: 'hostile triple-dollar run in support URL',
            probe: probeHostileTripleDollarUrl,
            expect: 'installer.support_url',
        },
        {
            // WR-01's control: two doubled dollars are two literal dollars
            // and must still emit intact. Without this, a guard that
            // rejects every $ would pass the fault case above while
            // breaking legitimate values.
            name: 'escaped quadruple dollar in support URL still emits',
            probe: probeQuadrupleDollarUrl,
            holds: 'the quadruple-dollar URL emitted with its literal dollars intact',
            resolved: () => true,
        },
        {
            // GEN-03, T-03-08. An ampersand in the display name must fail
            // naming the key -- it would open an entity in the MSIX, plist
            // and tile documents the name is interpolated into.
            name: 'hostile ampersand in display name',
            toml: (FIXTURE_BASE + FIXTURE_URLS).replace('display_name = "Acme Browser"', 'display_name = "Acme & Sons"'),
            expect: 'identity.display_name',
            also: ['&'],
        },
        {
            // GEN-05. A double quote in the display name, driven past
            // validation straight at the frontend-config emitter, must fail
            // naming the dotted path -- in JSON the quote would close the
            // applicationName string and rewrite the fragment. The GEN-03
            // hostile-quote case above proves the schema refuses it; this
            // one proves the sink guard does.
            name: 'hostile double quote in theia frontend config name',
            probe: probeHostileFrontendConfigName,
            expect: 'identity.display_name',
        },
        {
            // GEN-05's control: the fragment the emitter actually produces --
            // on the unmodified manifest -- parses as JSON and carries the
            // manifest display name. Without this, a red result from the
            // hostile case above could be the emitter broken on the clean
            // value rather than on the plant.
            name: 'theia frontend config fragment parses and names the display name',
            probe: () => frontendConfigControl,
            holds: 'valid JSON carrying the manifest display name',
            resolved: () => frontendConfigControl.length === 0,
        },
        {
            // EXT-01. An Open VSX entry without its version pin must fail
            // NAMING the entry -- a version-less entry would resolve to
            // whatever is latest, which is the unpinned behavior this
            // setting forbids.
            name: 'extension entry without its version pin',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "1.2.3"\n', '')}`,
            expect: 'acme.gadget',
        },
        {
            // EXT-02. A source outside the four implemented kinds must fail
            // NAMING the entry, with the implemented set stated -- not a
            // generic schema complaint.
            name: 'extension entry with an unimplemented source',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('source = "openvsx"', 'source = "pluggy"')}`,
            expect: 'acme.gadget',
            also: ['"openvsx"'],
        },
        {
            // EXT-02. An npm entry stating `latest` must fail NAMING the
            // entry -- the schema shape alone admits it (it is
            // alphanumeric), so without this branch the float would resolve
            // to whatever is newest at download time.
            name: 'npm extension entry with a floating latest version',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', 'version = "latest"\n')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry stating a range must fail NAMING the
            // entry -- here via the exact-version rule (and the version
            // schema shape, which admits exact pins only).
            name: 'npm extension entry with a ranged version',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', 'version = "^2.4.1"\n')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry stating an x-wildcard must fail NAMING
            // the entry -- the schema shape admits it (dots and letters),
            // and only the exact-version rule catches it.
            name: 'npm extension entry with an x-wildcard version',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', 'version = "1.2.x"\n')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry stating a partial version must fail
            // NAMING the entry -- npm resolves `1.2` as a range (floating),
            // and the schema shape admits it, so only the exact-version
            // rule catches it.
            name: 'npm extension entry with a partial version',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', 'version = "1.2"\n')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry without its version pin must fail NAMING
            // the entry -- the tarball URL cannot be built without it.
            name: 'npm extension entry without its version pin',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', '')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry without its integrity digest must fail
            // NAMING the entry -- the digest guards a republication under
            // the pinned version, so version alone is not a pin.
            name: 'npm extension entry without its integrity digest',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace(`integrity = "${FIXTURE_EXTENSION_INTEGRITY}"\n`, '')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. An npm entry with a malformed integrity digest must
            // fail NAMING the entry, not just the dotted path -- with
            // several entries, `extensions[].integrity` does not say which
            // one is malformed.
            name: 'npm extension entry with a malformed integrity digest',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace(FIXTURE_EXTENSION_INTEGRITY, 'not-an-sri-digest')}`,
            expect: 'acme.npmpack',
        },
        {
            // A direct-URL entry carrying a `version` must fail NAMING the
            // entry -- the resolver never reads it, so without this branch
            // an operator's believed pin passes silent and dead.
            name: 'extension entry with a source-irrelevant version pin',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('url = "https://example.org/acme-widget-2.0.0.vsix"\n', 'url = "https://example.org/acme-widget-2.0.0.vsix"\nversion = "9.9.9"\n')}`,
            expect: 'acme.widget',
        },
        {
            // An npm entry carrying a `path` must fail NAMING the entry --
            // the pack step never reads it on an npm source.
            name: 'extension entry with a source-irrelevant path',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('version = "2.4.1"\n', 'version = "2.4.1"\npath = "extensions/acme-sneaky"\n')}`,
            expect: 'acme.npmpack',
        },
        {
            // EXT-02. A local-path entry without its path must fail NAMING
            // the entry -- there is nothing to pack without it.
            name: 'local-path extension entry without its path',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('path = "extensions/acme-local"\n', '')}`,
            expect: 'acme.localtool',
        },
        {
            // EXT-02. A local-path entry with an absolute path must fail
            // NAMING the entry -- the path is project-relative by schema
            // shape, so an absolute one escapes the project it must pack
            // from.
            name: 'local-path extension entry with an absolute path',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace('path = "extensions/acme-local"\n', 'path = "/abs/acme-local"\n')}`,
            expect: 'acme.localtool',
        },
        {
            // EXT-01. A sha256 of the wrong shape must fail NAMING the entry,
            // not just the dotted path -- with several entries,
            // `extensions[].sha256` does not say which one is malformed.
            name: 'extension entry with a malformed sha256 pin',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_EXTENSIONS.replace(FIXTURE_EXTENSION_PIN_A, 'xyz')}`,
            expect: 'acme.gadget',
        },
        {
            // EXT-01/EXT-02's control: the four-entry fixture resolves with
            // zero failures and emits the four exact URLs (versioned file URL
            // for openvsx, verbatim URL for url, registry tarball URL for
            // npm, packed-archive reference for local-path). Without this, a
            // red result from the fault cases above could be the emitter
            // broken on clean entries rather than on the plant.
            name: 'declared extensions resolve to exact versioned URLs',
            probe: () => extensionUrlsControl,
            holds: 'a theiaPlugins block with the four exact URLs',
            resolved: () => extensionUrlsControl.length === 0,
        },
        {
            // EXT-02's placeholder control: the downloader placeholder in a
            // target-specific URL reaches the fragment byte-verbatim, with no
            // generator-host platform literal substituted. Without this, a
            // red result from a future placeholder fault could be the
            // emitter broken on the clean placeholder rather than on the
            // plant.
            name: 'target placeholder in a direct URL reaches the fragment verbatim',
            probe: () => targetPlaceholderControl,
            holds: 'the placeholder URL byte-verbatim with no host platform literal',
            resolved: () => targetPlaceholderControl.length === 0,
        },
        {
            // EXT-03. An installation mode outside the force/normal pair
            // must fail NAMING the add-on id -- the schema carries no
            // pattern for the mode by design (an enum is not a shape), so
            // without this branch the unknown mode would emit an entry the
            // policy engine cannot honour.
            name: 'webextension entry with an unknown installation mode',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_WEBEXTENSIONS.replace('installation_mode = "force_installed"', 'installation_mode = "auto_installed"')}`,
            expect: 'acme-tool@example.org',
            also: ['"force_installed"'],
        },
        {
            // EXT-03. An install URL outside the two sanctioned schemes must
            // fail NAMING the add-on id, via the schema pattern -- a plain
            // http URL names no origin the allowlist leg could cover.
            name: 'webextension entry with an install URL outside https and file',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_WEBEXTENSIONS.replace('install_url = "https://example.org/acme-tool-1.2.3.xpi"', 'install_url = "http://example.org/acme-tool-1.2.3.xpi"')}`,
            expect: 'acme-tool@example.org',
        },
        {
            // EXT-03. A webextension entry without its installation mode
            // must fail NAMING the add-on id -- there is deliberately no
            // silent default, so an unstated mode is a hard failure.
            name: 'webextension entry without its installation mode',
            toml: `${FIXTURE_DOWNSTREAM}\n${FIXTURE_WEBEXTENSIONS.replace('installation_mode = "force_installed"\n', '')}`,
            expect: 'acme-tool@example.org',
        },
        {
            // EXT-03's control: the two-entry fixture resolves with zero
            // failures and emits the two exact ExtensionSettings entries
            // (stated mode and URL per add-on id, both schemes). Without
            // this, a red result from the fault cases above could be the
            // emitter broken on clean entries rather than on the plant.
            name: 'declared webextensions resolve to exact ExtensionSettings entries',
            probe: () => webExtensionsControl,
            holds: 'an ExtensionSettings block with the two exact entries',
            resolved: () => webExtensionsControl.length === 0,
        },
        {
            // EXT-03's empty control: the entry-free manifest emits the
            // empty object -- the correct tracked state of a tree with
            // nothing declared. Without this, the tracked-key equality on
            // the real tree would rest on an unproved emitter default.
            name: 'entry-free manifest emits the empty ExtensionSettings object',
            probe: () => webExtensionsEmptyControl,
            holds: 'the empty object',
            resolved: () => webExtensionsEmptyControl.length === 0,
        },
        {
            // D-07 for the extensions array: an explicitly emptied list is a
            // declared empty list, not an unknown setting -- restating the
            // list without its entries is how a downstream drops them all.
            // (The empty assignment sits BEFORE every section header: TOML
            // keys after a [table] header belong to that table, so placing
            // it after [legal] or [[variants]] would test a nested path.)
            name: 'downstream empty extensions array resolves to no entries',
            toml: `extensions = []\n${FIXTURE_DOWNSTREAM}`,
            holds: 'zero entries, not an unknown-setting failure',
            resolved: c => Array.isArray(c.extensions) && c.extensions.length === 0,
        },
        {
            // TEL-01 / TEL-06. An enabled level with no endpoint of its own must fail NAMING the key.
            // The default manifest states the platform's endpoint, so an omitted key inherits it and the
            // downstream would send its users' error reports to the platform: the refusal is the
            // R11-style rule in resolveConfig, the same as for urls.update.
            name: 'telemetry level enabled without an endpoint',
            toml: `${FIXTURE_DOWNSTREAM}\n[telemetry]\nlevel = "all"\n`,
            expect: 'telemetry.endpoint',
        },
        {
            // TEL-01. The explicit form: the endpoint is cleared, so a sender that can never deliver
            // must never build.
            name: 'telemetry level enabled with the endpoint cleared',
            toml: `${FIXTURE_DOWNSTREAM}\n[telemetry]\nlevel = "all"\nendpoint = ""\n`,
            expect: 'telemetry.endpoint',
        },
        {
            // TEL-01. A level outside the four-value enum must fail NAMING
            // the key -- the sender gates on exactly these four, and the
            // schema carries no pattern for them by design.
            name: 'telemetry level outside the four-value enum',
            toml: `${FIXTURE_DOWNSTREAM}\n[telemetry]\nlevel = "verbose"\nendpoint = "https://example.org/telemetry/v1/events"\n`,
            expect: 'telemetry.level',
        },
        {
            // TEL-02. A non-https endpoint must fail NAMING the key, via
            // the schema pattern in the established installer.support_url
            // style.
            name: 'telemetry endpoint outside https',
            toml: `${FIXTURE_DOWNSTREAM}\n[telemetry]\nlevel = "error"\nendpoint = "http://example.org/telemetry"\n`,
            expect: 'telemetry.endpoint',
        },
        {
            // TEL-01/TEL-02's control: the enabled fixture above emits the
            // stated pair verbatim, and a fixture with no [telemetry] at
            // all emits off/null. Without this, a red result from the three
            // fault cases above could be the emitter broken on a clean
            // value rather than on the plant.
            name: 'telemetry fragment carries the stated pair and defaults an unset section to off',
            probe: () => telemetryControl,
            holds: 'the stated level and endpoint verbatim, and off with the inherited default endpoint when unset',
            resolved: () => telemetryControl.length === 0,
        },
        {
            // TEL-07 (57-02): the submit origin is derived from the ONE stated crash_report key (path
            // dropped) and is inert while unset. The control proves the derivation on a fixture
            // manifest; the real manifest states no key, so the reporter stays compiled out.
            name: 'crash origin derives from the stated crash_report key and stays inert when unset',
            probe: () => crashOriginControl,
            holds: 'the stated https URL reduces to its origin and emits --with-crashreporter-url, and an unset key derives the empty origin and emits no line',
            resolved: () => crashOriginControl.length === 0,
        },
        {
            // WR-09: the flip is the generator's one constant, and it cannot be made without the crash address.
            name: 'enabling the crash reporter without a crash_report key fails generation',
            probe: () => crashEnableControl,
            holds: 'the disable line is emitted exactly while the reporter is off, and enabling it with no crash_report key throws naming the key',
            resolved: () => crashEnableControl.length === 0,
        },
        {
            // GEN-05 remainder. A theme id outside Theia's builtin set must
            // fail NAMING the key -- a typo'd theme silently falling back is
            // the failure, and the schema carries no pattern for ids by
            // design.
            name: 'theia theme outside the builtin theme ids',
            toml: `${FIXTURE_DOWNSTREAM}\n[theia]\ndefault_theme = "midnight"\n`,
            expect: 'theia.default_theme',
        },
        {
            // GEN-05 remainder. Markup in the welcome text must fail NAMING
            // the key -- the text reaches rendered UI, so an angle bracket
            // is an injection character at the schema layer, refused with
            // the whole list reported at once.
            name: 'markup-bearing theia welcome text',
            toml: `${FIXTURE_DOWNSTREAM}\n[theia]\nwelcome_text = "Acme <b>welcomes</b> you."\n`,
            expect: 'theia.welcome_text',
        },
        {
            // TEL-03. A non-https crash-report URL must fail NAMING the key,
            // via the schema pattern in the established
            // installer.support_url style -- the host feeds endpoint
            // allowlist coverage, so a value that is not an https URL is a
            // manifest bug, not a coverage gap.
            name: 'crash-report URL outside https',
            toml: `${FIXTURE_DOWNSTREAM}\ncrash_report = "http://example.org/crash"\n`,
            expect: 'urls.crash_report',
        },
        {
            // IN-01. A user name and password in the crash address would be kept verbatim in
            // breakpad.reportURL while the submit origin dropped them; the key refuses them.
            name: 'crash-report URL carrying a user name and password',
            toml: `${FIXTURE_DOWNSTREAM}\ncrash_report = "https://user:secret@crash.example.org/report"\n`,
            expect: 'urls.crash_report',
        },
        {
            // GEN-05 remainder's control: the stated theme rides the
            // frontend-config fragment, the stated texts and repo URL ride
            // the branding fragment with the mark SVG verbatim, and unset
            // texts default to null. Without this, a red result from the
            // three fault cases above could be the emitter broken on a
            // clean value rather than on the plant.
            name: 'theia branding rides the runtime channel fragments and defaults unset texts to null',
            probe: () => brandingControl,
            holds: 'the stated theme, texts, repo URL and verbatim mark, and null texts when unset',
            resolved: () => brandingControl.length === 0,
        },
        {
            // TEL-03's control: the stated endpoint, crash-report and
            // update URLs derive to exactly their hosts plus the support
            // host, with both endpoint prefs repointed -- and a fixture
            // stating only an update URL derives the lone inherited
            // support host plus the stated update host with both prefs
            // blanked. Without this, a red result from the coverage
            // gate could be the derivation broken on a clean manifest
            // rather than on a drift.
            name: 'manifest endpoint hosts derive the stated hosts and repoint the prefs',
            probe: () => endpointHostsControl,
            holds: 'the stated hosts sorted, the prefs repointed, and blanks when unstated',
            resolved: () => endpointHostsControl.length === 0,
        },
        {
            // CFG-05 (07-01). The derivation main() uses, driven in-process:
            // a staged external manifest resolves to its own display values
            // through externalConfigDir plus the shipped merge -- not a
            // restatement of either. Without this, a red result from the
            // failure case below could be the derivation broken on a clean
            // manifest rather than on the plant.
            name: 'external config dir resolves its own manifest',
            probe: () => externalConfigControl,
            holds: 'the staged display values',
            resolved: () => externalConfigControl.length === 0,
        },
        {
            // CFG-05 (07-01). The variable naming a folder with no manifest
            // in it fails naming the variable -- the re-run next step, in
            // the plain-words shape, with no host path of this checkout
            // (the cross-cutting assertion above owns that half).
            name: 'external config dir without a manifest',
            probe: probeExternalConfigMissing,
            expect: 'PB_CONFIG_DIR',
        },
        {
            // PLAT-04 cause A. An env that lost the override inherits the bus.
            name: 'concurrent-raster: env without the bus override',
            probe: () => {
                const env = { ...RASTER_ENV };
                delete env.DBUS_SESSION_BUS_ADDRESS;
                return rasterBusFailures(env, ownText);
            },
            expect: 'inkscape would join the session bus',
        },
        {
            name: 'concurrent-raster: env carrying a host bus address',
            probe: () => rasterBusFailures({ ...RASTER_ENV, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' }, ownText),
            expect: 'inkscape would join the session bus',
        },
        {
            // The spawn site itself, read from this file: removing the env
            // option there must go red even though RASTER_ENV is intact.
            name: 'concurrent-raster: spawn site without RASTER_ENV',
            probe: () => {
                const span = inkscapeSpawnOptionSpans(ownText)[0];
                if (span === undefined || span === null) return [`${BROKEN} no inkscape spawn site was found to plant against`];
                const options = ownText.slice(span[0], span[1]);
                const planted = ownText.slice(0, span[0]) + options.replace(/,?\s*env:\s*RASTER_ENV\b/, '') + ownText.slice(span[1]);
                if (planted === ownText) return [`${BROKEN} the planted removal of the env option did not land at the spawn site`];
                return rasterBusFailures(RASTER_ENV, planted);
            },
            expect: 'inkscape would join the session bus',
        },
        {
            name: 'concurrent-raster: 18 concurrent exports',
            probe: () => probeConcurrentRasters(ownText),
            holds: 'all 18 exports exit 0 with a 32x32 PNG',
            resolved: () => true,
        },
    ];

    const dir = mkdtempSync(join(tmpdir(), 'generate-self-test-'));
    let failed = 0;
    const complain = (testCase, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${testCase.name}' ${why}`);
        failed++;
    };
    try {
        cases.forEach((testCase, index) => {
            let output;
            let config;

            if (testCase.probe !== undefined) {
                // A probe plants its fault on a throwaway tree or in a child
                // process and reports what a caller would have seen. Its own
                // mutation-landed guard emits BROKEN rather than a failure, so
                // instrument damage reads as instrument damage and can never be
                // mistaken for the case passing.
                output = testCase.probe(baseline.config);
                if (output.some(line => line.includes(BROKEN))) {
                    complain(testCase, `planted no fault at all: ${output.join(' | ')}`);
                    return;
                }
            } else {
                // A fixture identical to the clean manifest plants nothing and
                // its result would be vacuous.
                if (testCase.toml === clean) {
                    complain(testCase, `plants a fixture identical to ${MANIFEST_NAME}; the case proves nothing`);
                    return;
                }
                const fixturePath = join(dir, `case-${index}.toml`);
                writeFileSync(fixturePath, testCase.toml, 'utf8');
                const resolvedCase = resolveConfig(MANIFEST_PATH, fixturePath);
                output = resolvedCase.failures;
                config = resolvedCase.config;
            }

            // Cross-cutting, applied to EVERY case: nothing a reader sees may
            // carry an internal.
            const leaked = [...internalsLeaked(output), ...(testCase.extra?.(output) ?? [])];
            if (leaked.length > 0) {
                complain(testCase, `leaked ${leaked.join(', ')} into what a reader sees: ${output.join(' | ')}`);
                return;
            }

            if (testCase.expect !== undefined) {
                const seen = output.join('\n');
                const missing = [testCase.expect, ...(testCase.also ?? [])].filter(n => !carries(seen, n));
                const present = (testCase.notExpect ?? []).filter(n => carries(seen, n));
                if (missing.length > 0) {
                    complain(testCase, `did not go red naming ${missing.map(String).join(' and ')}; got: ${output.join(' | ') || '(no failures at all)'}`);
                    return;
                }
                if (present.length > 0) {
                    complain(testCase, `went red naming ${present.map(String).join(' and ')}, which sends the reader to the wrong place: ${output.join(' | ')}`);
                    return;
                }
                console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
                return;
            }

            if (output.length === 0 && testCase.resolved(config)) {
                console.log(`  ok  ${testCase.name} -> resolved to ${testCase.holds}`);
            } else {
                complain(testCase, `did not resolve to ${testCase.holds}; failures: ${output.join(' | ') || '(none)'}`);
            }
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${cases.length} planted faults all behaved as pinned`);
    return 0;
}

// --- run --------------------------------------------------------------------

// Everything below runs ONLY when this file is the entry point. Importing it
// parses no manifest, writes no file and exits no process -- see IS_MAIN.
function main() {
    const outArg = rejectUnknownArguments();

    if (args.includes('--self-test')) return selfTest();

    // CFG-05 (07-01). The external manifest overlay: PB_CONFIG_DIR names a
    // folder, and that folder's configuration.toml becomes the downstream
    // layer of the existing merge below -- no new merge code. A resolved
    // folder with no readable manifest is a hard failure naming the
    // variable, in the file's plain-words shape: no stack trace, no host
    // path of this checkout (the reader named the folder themselves; the
    // variable name is what they go and fix).
    const extDir = externalConfigDir();
    let downstreamPath;
    if (extDir !== undefined) {
        const candidate = join(extDir, MANIFEST_NAME);
        let readable = true;
        try {
            readFileSync(candidate, 'utf8');
        } catch {
            readable = false;
        }
        if (!readable) {
            report([
                `PB_CONFIG_DIR names a folder with no readable ${MANIFEST_NAME} in it, so there is nothing to generate from. `
                + `Check that PB_CONFIG_DIR names the folder holding the downstream ${MANIFEST_NAME}, then run: ${RERUN}`,
            ]);
        }
        downstreamPath = candidate;
        ASSET_ROOT = extDir;
    }

    const { failures, config, defaulted } = resolveConfig(MANIFEST_PATH, downstreamPath);
    report(failures);
    echoDefaults(defaulted, config);

    // The default echo above has already run, so --check reports its inherited
    // defaults exactly as a default run does (D-08). That is why this dispatch
    // sits here and not next to the argument loop at the top of the file.
    if (args.includes('--check')) return checkTargets(config);

    const out = outArg === undefined ? undefined : resolve(process.cwd(), outArg);
    const count = writeTargets(config, out ?? OUTPUT_ROOT);
    console.log(
        `${NAME}: PASS -- ${count} file(s) written under ${out ?? 'generated/'} from ${MANIFEST_NAME}, `
        + `${defaulted.length} default(s) applied`,
    );
    return 0;
}

/**
 * THE LAST LINE OF THE COPY RULE. Every failure this file raises deliberately
 * goes through report(), which prints plain language and a next step -- but an
 * uncaught throw bypasses all of it and Node prints a stack trace carrying `at`
 * frames, `node:` module specifiers and this machine's path to the project.
 * That is exactly the three-marker set INTERNAL_MARKERS forbids, and until this
 * catch existed the self-test could not see it, because no case drove an
 * emitter to the point of throwing.
 *
 * The error object is deliberately not printed. There is nothing in it a reader
 * can act on that the manifest-shaped advice below does not already say better.
 */
if (IS_MAIN) {
    let code;
    try {
        code = main();
    } catch {
        console.error(`${NAME}: FAIL -- the project could not be generated from ${MANIFEST_NAME}.`);
        console.error(`  Check that every setting in ${MANIFEST_NAME} has a value, and that every [[variants]] section is complete.`);
        console.error(`  Next step: correct ${MANIFEST_NAME}, then run: ${RERUN}`);
        code = 1;
    }
    process.exit(code);
}
