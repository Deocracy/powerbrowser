#!/usr/bin/env node
// scripts/verify-downstream-fixture.mjs
//
// DOC-02's proof instrument (07-02): a synthetic downstream external config
// yields a fully branded tree from an untouched platform tree, driven
// per-command through PB_CONFIG_DIR. Honestly --quick: reads files and runs
// the generator only -- no build, no browser, no display, no network.
//
// CONTRACT. --source <committed-fixture-dir> [--expect-fail <substring>];
// --all --fixtures-root <dir> drives every committed fixture (required by
// plan 07-04); --self-test proves the assertions discriminate. --all takes no
// default root on purpose: the phase path spells a residue probe, and no
// in-scope file may carry that token (the scanners' scope excludes
// .planning/, so callers pass the root as argv instead). Per fixture the
// harness copies the source to a mkdtemp external dir (path-independence --
// never generates from inside the repo), then runs env PB_CONFIG_DIR=<stage>
// node scripts/generate.mjs --out <stage>/out in a child process.
//
// ISOLATION (PLAT-04 cause B). The harness never reads or writes the shared
// generated/ tree. Each fixture generates into its own --out dir, and the
// platform default comparand is generated once per invocation into a private
// mkdtemp. Rewriting generated/ in place let a concurrent reader -- another
// check, another session's --quick -- see a fixture's brand.
//
// EXPECTED-PASS: exit 0; expectations derived at check time through the
// imported resolveConfig (platform manifest as defaults, staged manifest as
// downstream -- the same call main() makes), never kept here (T-07-02); exact-
// equality bytes on the dev/release configure.sh display lines, both variants'
// brand.ftl full-name terms and brand.properties brandFullName keys (each file
// agreeing with the other and with the base-plus-suffix derivation -- the
// trimmed-selection read contract, WR-01), theia-frontend-config
// applicationName, theia-branding.json legalNotices[0], the upstream-pins tag
// line, and theia-branding.json markSvg against the staged artwork line;
// absence of every platform required-slot value except on exempt lines (E1: a
// line byte-identical in the default tree's same file -- a rebrand-invariant
// emitter literal, derived per run by set comparison, never hand-kept; E2: the
// fixed forever-identifiers enumerated from docs/REBRANDING.md step 5); every
// other platform value present covered by a default-applied echo line from the
// fixture run.
//
// EXPECTED-FAIL (needed by plan 07-03): exit non-zero with stderr carrying
// <substring>, plain-words copy shape (names the setting or asset, ends with
// the re-run next step in either of the generator's two canonical casings --
// "Then run:" for required-setting failures, "then run:" for artwork ones --
// matched case-insensitively, no stack), and the fixture's private out dir
// never created (a failing run writes nothing). Under --all, a fixture dir holding an expect-fail.txt
// file runs in expect-fail mode with its trimmed content as the substring
// (CLI --expect-fail overrides); absent file means expected-pass.
//
// WHY E1 EXISTS (found during 07-02 implementation, not in the plan). Three
// emitter-authored comment literals carry platform display strings into EVERY
// emission regardless of brand: brand.ftl's D-78 rationale ("not Power
// Browser"), its machine-vendor comment ("space-free `DeBIOS`"), and
// aboutDialog.css's branding-directory comment. A sweep without E1 can never
// go green; a sweep with a hand-kept exemption list for them can only ever
// agree with the tree it was copied from (CLAUDE.md rule 2). So E1 derives
// invariance per run (same file, same line bytes under both brands), and the
// variable surfaces -- the ones a rebrand actually moves -- stay fully swept.
//
// Usage:
//   node scripts/verify-downstream-fixture.mjs --source <fixture-dir> [--expect-fail <substring>]
//   node scripts/verify-downstream-fixture.mjs --all --fixtures-root <dir>
//   node scripts/verify-downstream-fixture.mjs --self-test

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { findMatches } from './scan-brand-residue.mjs';

const NAME = 'verify-downstream-fixture';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATE = join(REPO_ROOT, 'scripts', 'generate.mjs');
const PLATFORM_MANIFEST = join(REPO_ROOT, 'configuration.toml');
const CASE_FORM = 'title';

function assertNonZeroAssertions(count) {
    return count === 0 ? 'zero assertions ran -- a drive that asserts nothing proves nothing' : null;
}

// E2: the fixed forever-identifiers, enumerated from docs/REBRANDING.md
// step 5 (not invented): a downstream renames its brand, never these.
const FIXED_PATTERNS = [
    /powerbrowser\//, // the powerbrowser/ source tree
    /@powerbrowser/, // the @powerbrowser npm scope (and @powerbrowser.org contract ids)
    /chrome:\/\/powerbrowser\/content\//, // the chrome package URI
    /Firefox/, // the Firefox user-agent name and product-name compatibility term
    /unofficial/i, // the unofficial installer channel
    /\{ec8030f7-c20a-464f-9b0e-13a3a9e97384\}/, // the untouched application ID
];

const BINARY_EXTENSIONS = new Set(['.png', '.ico', '.icns', '.jpg', '.gif', '.woff', '.woff2', '.zip']);

// --- small tree helpers -----------------------------------------------------

function isBinary(rel) {
    const dot = rel.lastIndexOf('.');
    return dot !== -1 && BINARY_EXTENSIONS.has(rel.slice(dot).toLowerCase());
}

function filesUnder(dir, prefix, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) filesUnder(join(dir, entry.name), rel, out);
        else out.push(rel);
    }
    return out;
}

/** UTF-8 text per non-binary file. Binary files are hashed, never read. */
function snapshotText(root) {
    const texts = new Map();
    try {
        if (!statSync(root).isDirectory()) return texts;
    } catch {
        return texts;
    }
    for (const rel of filesUnder(root, '', [])) {
        if (isBinary(rel)) continue;
        texts.set(rel, readFileSync(join(root, rel), 'utf8'));
    }
    return texts;
}

/** Dotted scalar leaves of a resolved config (mirrors the generator's dotted paths). */
function collectStringLeaves(node, prefix, out) {
    for (const key of Object.keys(node)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const value = node[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            collectStringLeaves(value, path, out);
        } else if (Array.isArray(value) && value.length > 0 && value.every((e) => e !== null && typeof e === 'object')) {
            value.forEach((element, i) => collectStringLeaves(element, `${path}[${i}]`, out));
        } else if (typeof value === 'string' && value !== '') {
            out.push({ path, value });
        }
    }
    return out;
}

function readPath(doc, path) {
    let node = doc;
    for (const segment of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
        if (node === null || typeof node !== 'object' || !Object.hasOwn(node, segment)) return undefined;
        node = node[segment];
    }
    return node;
}

// --- trimmed-selection readers (WR-01: select and match on the trimmed line) ---

function readFtlFullName(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith('-brand-full-name'));
    if (!line) throw new Error('no -brand-full-name entry');
    const m = line.trim().match(/^-brand-full-name\s*=\s*(.+)$/);
    if (!m || !m[1].trim()) throw new Error(`unexpected -brand-full-name shape: ${JSON.stringify(line)}`);
    return m[1].trim();
}

function readPropertiesFullName(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith('brandFullName'));
    if (!line) throw new Error('no brandFullName entry');
    const m = line.trim().match(/^brandFullName\s*=\s*(.+)$/);
    if (!m || !m[1].trim()) throw new Error(`unexpected brandFullName shape: ${JSON.stringify(line)}`);
    return m[1].trim();
}

function readConfigureDisplayLine(text) {
    const line = text.split('\n').find((l) => l.startsWith('MOZ_APP_DISPLAYNAME='));
    if (line === undefined) throw new Error('no MOZ_APP_DISPLAYNAME= line');
    return line;
}

// --- child generate ---------------------------------------------------------

/**
 * A child generate into `outDir`. An out dir is required: without one the
 * child would rewrite the shared generated/ tree other checks read.
 */
function runGenerate(envExtra, outDir) {
    if (outDir === undefined || outDir === null) {
        throw new Error('runGenerate needs a private out dir -- generating without one would rewrite the shared generated/ tree');
    }
    const env = { ...process.env };
    if (envExtra === null) delete env.PB_CONFIG_DIR;
    else if (envExtra !== undefined) env.PB_CONFIG_DIR = envExtra;
    try {
        const stdout = execFileSync(process.execPath, [GENERATE, '--out', outDir], { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
        return { status: 0, stdout, stderr: '' };
    } catch (err) {
        return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
}

/**
 * The platform default tree, generated once per invocation into a private
 * mkdtemp (removed at exit) with PB_CONFIG_DIR unset. Returns the dir, or
 * null with `defaultTreeFailure` set when the default generate fails.
 */
let defaultTreeRoot;
let defaultTreeFailure = null;
function defaultTree() {
    if (defaultTreeRoot !== undefined) return defaultTreeRoot;
    const dir = mkdtempSync(join(tmpdir(), 'pb-downstream-default-'));
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
    const run = runGenerate(null, join(dir, 'out'));
    if (run.status === 0) {
        defaultTreeRoot = join(dir, 'out');
    } else {
        defaultTreeRoot = null;
        defaultTreeFailure = `the platform default tree could not be generated (exit ${run.status}); stderr:\n${run.stderr.split('\n').slice(0, 8).join('\n')}`;
    }
    return defaultTreeRoot;
}

function parseEchoedDefaults(stderr) {
    const echoed = new Set();
    for (const line of stderr.split('\n')) {
        const m = line.match(/^generate: default applied -- (\S+) = /);
        if (m) echoed.add(m[1]);
    }
    return echoed;
}

// --- the assertion core (pure over dirs; the self-test drives these directly) ---

/**
 * Exact-equality bytes on every brand surface the plan names, plus the pin
 * and artwork flow (the CFG-05 "assets plus pins" success criterion). Returns
 * { failures, count } -- count is the non-vacuity assertion tally.
 */
function checkEmittedSurfaces(treeRoot, fxConfig, stagedSvgLine) {
    const failures = [];
    let count = 0;
    const base = fxConfig.identity.display_name;
    for (const variant of (fxConfig.variants || [])) {
        const full = `${base}${variant.name_suffix}`;
        const dir = join(treeRoot, 'branding', variant.id);
        count += 1;
        try {
            const line = readConfigureDisplayLine(readFileSync(join(dir, 'configure.sh'), 'utf8'));
            if (line !== `MOZ_APP_DISPLAYNAME="${full}"`) {
                failures.push(`${variant.id}/configure.sh display line is ${JSON.stringify(line)}, want ${JSON.stringify(`MOZ_APP_DISPLAYNAME="${full}"`)}`);
            }
        } catch (err) {
            failures.push(`${variant.id}/configure.sh unreadable: ${err.message}`);
        }
        for (const [file, reader, label] of [['brand.ftl', readFtlFullName, '-brand-full-name'], ['brand.properties', readPropertiesFullName, 'brandFullName']]) {
            count += 1;
            try {
                const value = reader(readFileSync(join(dir, 'locales', 'en-US', file), 'utf8'));
                if (value !== full) {
                    failures.push(`${variant.id}/${file} ${label} is ${JSON.stringify(value)}, want ${JSON.stringify(full)} (base-plus-suffix derivation)`);
                }
            } catch (err) {
                failures.push(`${variant.id}/${file} unreadable: ${err.message}`);
            }
        }
    }
    count += 1;
    try {
        const appName = JSON.parse(readFileSync(join(treeRoot, 'theia-frontend-config.json'), 'utf8')).applicationName;
        if (appName !== base) failures.push(`theia-frontend-config.json applicationName is ${JSON.stringify(appName)}, want ${JSON.stringify(base)}`);
    } catch (err) {
        failures.push(`theia-frontend-config.json unreadable: ${err.message}`);
    }
    count += 1;
    try {
        const branding = JSON.parse(readFileSync(join(treeRoot, 'theia-branding.json'), 'utf8'));
        if (branding.legalNotices?.[0] !== fxConfig.legal.trademark_notice) {
            failures.push(`theia-branding.json legalNotices[0] is ${JSON.stringify(branding.legalNotices?.[0])}, want the fixture own-notice ${JSON.stringify(fxConfig.legal.trademark_notice)}`);
        }
        count += 1;
        if (branding.markSvg !== stagedSvgLine) {
            failures.push('theia-branding.json markSvg is not the staged artwork line -- the runtime channel did not flow from the external dir');
        }
    } catch (err) {
        failures.push(`theia-branding.json unreadable: ${err.message}`);
    }
    count += 1;
    try {
        const pinsLine = readFileSync(join(treeRoot, 'upstream-pins.env'), 'utf8').split('\n').find((l) => l.startsWith('FIREFOX_ESR_TAG='));
        if (pinsLine !== `FIREFOX_ESR_TAG=${fxConfig.upstreams.firefox_esr_tag}`) {
            failures.push(`upstream-pins.env tag line is ${JSON.stringify(pinsLine)}, want the fixture pin ${JSON.stringify(fxConfig.upstreams.firefox_esr_tag)}`);
        }
    } catch (err) {
        failures.push(`upstream-pins.env unreadable: ${err.message}`);
    }
    return { failures, count, ok: failures.length === 0 };
}

/**
 * The platform-absence sweep. `swept` values (required slots) must not occur
 * except on E1/E2-exempt lines; every other platform value present must be
 * echo-covered (or be the fixture's own stated value). Line matching reuses
 * the boundary rule from scan-brand-residue -- no local copy.
 */
function checkPlatformAbsence(treeTexts, defaultTreeTexts, swept, otherLeaves, echoed, fxConfig) {
    const failures = [];
    let count = 0;
    const exemptLine = (rel, line) => {
        if ((defaultTreeTexts.get(rel) ?? '').split('\n').includes(line)) return 'E1-invariant';
        if (FIXED_PATTERNS.some((re) => re.test(line))) return 'E2-fixed';
        return null;
    };
    for (const value of swept) {
        for (const [rel, text] of treeTexts) {
            for (const index of findMatches(text, value, CASE_FORM)) {
                count += 1;
                const line = text.slice(0, index).split('\n').pop() + text.slice(index).split('\n')[0];
                const lineNo = text.slice(0, index).split('\n').length;
                if (exemptLine(rel, line) === null) {
                    failures.push(`generated/${rel}:${lineNo} carries platform value ${JSON.stringify(value)}: ${JSON.stringify(line.slice(0, 120))}`);
                }
            }
        }
    }
    for (const { path, value } of otherLeaves) {
        if (readPath(fxConfig, path) === value) continue; // the fixture's own stated value, not an inherit
        const covered = [...echoed].some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`) || p.startsWith(`${path}.`) || p.startsWith(`${path}[`));
        for (const [rel, text] of treeTexts) {
            for (const index of findMatches(text, value, CASE_FORM)) {
                count += 1;
                const line = text.slice(0, index).split('\n').pop() + text.slice(index).split('\n')[0];
                const lineNo = text.slice(0, index).split('\n').length;
                if (exemptLine(rel, line) === null && !covered) {
                    failures.push(`generated/${rel}:${lineNo} carries un-echoed platform value ${JSON.stringify(value)} (path ${path}): ${JSON.stringify(line.slice(0, 120))}`);
                }
            }
        }
    }
    return { failures, count, ok: failures.length === 0 };
}

// --- the extension-fragment check (09-04, BLD-02 generate-level cells) ------
//
// Every [[extensions]] entry the staged manifest declares must reach
// generated/theia-plugins.json under its kind's pinned URL shape. The shapes
// below are stated INDEPENDENTLY of scripts/generate.mjs's resolvers (not
// imported from them): deriving the expectation through the emitter would
// compare the emitter against itself and a resolver regression would pass.
// A resolver shape change must update both this oracle and the generator's
// self-test -- that duplication is the gate, exactly like the pin gate's
// float guards. Entries of an unknown source are the generator validator's
// failure, not this sweep's: they are skipped here so each failure has one
// owner.

function expectedExtensionUrl(entry) {
    if (entry === null || typeof entry !== 'object') return null;
    if (entry.source === 'openvsx' && typeof entry.id === 'string' && typeof entry.version === 'string') {
        const dot = entry.id.indexOf('.');
        if (dot <= 0) return null;
        return `https://open-vsx.org/api/${entry.id.slice(0, dot)}/${entry.id.slice(dot + 1)}/${entry.version}/file/${entry.id}-${entry.version}.vsix`;
    }
    if (entry.source === 'url' && typeof entry.url === 'string') return entry.url;
    if (entry.source === 'npm' && typeof entry.id === 'string' && typeof entry.version === 'string') {
        return `https://registry.npmjs.org/${entry.id}/-/${entry.id}-${entry.version}.tgz`;
    }
    if (entry.source === 'local-path' && typeof entry.path === 'string') return `${entry.path}.tgz`;
    return null;
}

/**
 * The emitted download map agrees with the staged manifest's entries, in
 * both directions: every known-kind entry present with its exact pinned URL
 * (a direct-URL entry carrying the downloader placeholder reaches it
 * byte-verbatim), and no fragment id the manifest does not declare. Returns
 * { failures, count } -- count is zero when the manifest declares no
 * known-kind entries, so brand-only fixtures stay exactly as assertive as
 * before.
 */
function checkExtensionFragment(treeRoot, fxConfig) {
    const failures = [];
    let count = 0;
    const entries = Array.isArray(fxConfig.extensions) ? fxConfig.extensions : [];
    const known = entries.filter((e) => expectedExtensionUrl(e) !== null);
    if (known.length === 0) return { failures, count, ok: true };
    let fragment = null;
    try {
        fragment = JSON.parse(readFileSync(join(treeRoot, 'theia-plugins.json'), 'utf8'));
    } catch (err) {
        failures.push(`theia-plugins.json carries no readable download map for ${known.length} declared [[extensions]] entr${known.length === 1 ? 'y' : 'ies'} (${known.map((e) => JSON.stringify(e.id)).join(', ')}): ${err.message}`);
        return { failures, count: count + 1, ok: false };
    }
    if (fragment === null || typeof fragment !== 'object' || Array.isArray(fragment)) {
        failures.push('theia-plugins.json is not a JSON object, so the declared entries cannot be compared against it');
        return { failures, count: count + 1, ok: false };
    }
    for (const entry of known) {
        const want = expectedExtensionUrl(entry);
        count += 1;
        if (!Object.hasOwn(fragment, entry.id)) {
            failures.push(`theia-plugins.json is missing the [[extensions]] entry with id ${JSON.stringify(entry.id)} -- stale output. Next step: run node scripts/generate.mjs with the staged config, then re-run this check.`);
        } else if (fragment[entry.id] !== want) {
            failures.push(`theia-plugins.json carries ${JSON.stringify(fragment[entry.id])} for the entry with id ${JSON.stringify(entry.id)} but the entry resolves to ${JSON.stringify(want)} -- the resolver drifted. Next step: compare against scripts/generate.mjs's resolver for that source kind.`);
        }
    }
    count += 1;
    for (const id of Object.keys(fragment)) {
        if (!known.some((e) => e.id === id)) {
            failures.push(`theia-plugins.json carries an entry with id ${JSON.stringify(id)} that the staged manifest no longer declares -- stale output left behind by a removed entry.`);
        }
    }
    return { failures, count, ok: failures.length === 0 };
}

function driveFixture(sourceDir, { expectFail } = {}) {
    const failures = [];
    let assertions = 0;
    const note = (ok, detail) => {
        assertions += 1;
        if (!ok) failures.push(detail);
    };

    let sourceStat = null;
    try {
        sourceStat = statSync(sourceDir);
    } catch {
        sourceStat = null;
    }
    if (sourceStat === null || !sourceStat.isDirectory()) {
        return { ok: false, failures: [`no such fixture source dir: ${sourceDir} -- pass --source <committed-fixture-dir> naming the folder holding configuration.toml`], assertions: 1 };
    }
    let manifestText = null;
    try {
        manifestText = readFileSync(join(sourceDir, 'configuration.toml'), 'utf8');
    } catch {
        manifestText = null;
    }
    note(manifestText !== null, `fixture source ${sourceDir} holds no readable configuration.toml -- it names the folder holding the downstream configuration.toml`);
    if (manifestText === null) return { ok: false, failures, assertions };

    const stage = mkdtempSync(join(tmpdir(), 'pb-downstream-fixture-'));
    try {
        cpSync(sourceDir, stage, { recursive: true });
        const stagedManifest = join(stage, 'configuration.toml');
        let stagedSvgLine = null;
        try {
            const svgText = readFileSync(join(stage, 'brand', 'mark.svg'), 'utf8');
            stagedSvgLine = svgText.split('\n').find((l) => l.startsWith('<svg'))?.trim() ?? null;
        } catch {
            stagedSvgLine = null;
        }

        const out = join(stage, 'out');
        const run = runGenerate(stage, out);
        const echoed = parseEchoedDefaults(run.stderr);

        if (expectFail !== undefined) {
            note(run.status !== 0, `expected-fail fixture exited 0, want non-zero carrying ${JSON.stringify(expectFail)}`);
            if (run.status !== 0) {
                note(run.stderr.includes(expectFail), `stderr does not carry ${JSON.stringify(expectFail)}; it was:\n${run.stderr.split('\n').slice(0, 12).join('\n')}`);
                note(/then run:/i.test(run.stderr), 'failure does not end with the re-run next step (plain-words copy shape)');
                note(!/^\s+at /m.test(run.stderr) && !run.stderr.includes('Traceback'), 'failure carries a stack trace (plain-words copy shape forbids it)');
                note(!existsSync(out), 'the out dir was created during a failing run -- a failed run must write nothing');
            }
            return { ok: failures.length === 0, failures, assertions };
        }

        note(run.status === 0, `fixture generate exited ${run.status}, want 0; stderr:\n${run.stderr.split('\n').slice(0, 15).join('\n')}`);
        if (run.status !== 0) {
            return { ok: false, failures, assertions };
        }

        const { failures: fxFailures, config: fxConfig } = resolveConfig(PLATFORM_MANIFEST, stagedManifest);
        note(fxFailures.length === 0, `staged manifest does not resolve: ${fxFailures.join('; ')}`);
        if (fxFailures.length > 0 || fxConfig === undefined) {
            return { ok: false, failures, assertions };
        }
        const { failures: defFailures, config: defConfig } = resolveConfig(PLATFORM_MANIFEST, undefined);
        note(defFailures.length === 0, `platform manifest does not resolve, so no expectation can be derived: ${defFailures.join('; ')}`);
        if (defFailures.length > 0 || defConfig === undefined) {
            return { ok: false, failures, assertions };
        }

        note(stagedSvgLine !== null, 'staged brand/mark.svg carries no single-line <svg> element for the runtime channel');
        const surfaces = checkEmittedSurfaces(out, fxConfig, stagedSvgLine);
        assertions += surfaces.count;
        failures.push(...surfaces.failures);

        const extFragment = checkExtensionFragment(out, fxConfig);
        assertions += extFragment.count;
        failures.push(...extFragment.failures);

        const devFull = `${defConfig.identity.display_name}${(defConfig.variants || []).find((v) => v.id === 'dev')?.name_suffix ?? ''}`;
        const releaseFull = `${defConfig.identity.display_name}${(defConfig.variants || []).find((v) => v.id === 'release')?.name_suffix ?? ''}`;
        const swept = [...new Set([devFull, releaseFull, defConfig.product.vendor_display, defConfig.product.vendor_machine, defConfig.legal.trademark_notice])];
        const sweptSet = new Set(swept);
        const otherLeaves = collectStringLeaves(defConfig, '', []).filter(({ value }) => !sweptSet.has(value));
        const defaultRoot = defaultTree();
        if (defaultRoot === null) {
            failures.push(defaultTreeFailure);
            return { ok: false, failures, assertions };
        }
        const absence = checkPlatformAbsence(snapshotText(out), snapshotText(defaultRoot), swept, otherLeaves, echoed, fxConfig);
        assertions += absence.count;
        failures.push(...absence.failures);
        return { ok: failures.length === 0, failures, assertions };
    } finally {
        rmSync(stage, { recursive: true, force: true });
    }
}

// --- fixture discovery ----------------------------------------------------------

function discoverFixtures(root) {
    let entries = [];
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch {
        return null;
    }
    return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name)).filter((d) => {
        try {
            return statSync(join(d, 'configuration.toml')).isFile();
        } catch {
            return false;
        }
    }).sort();
}

// --- --self-test ------------------------------------------------------------------
//
// Drives scratch fixtures (never the committed ones) through the harness's own
// assertion functions: green control first, then a platform-valued tree going
// red naming file and value, an ftl/properties drift going red, a missing-
// artwork stage going red in pass mode and green in expect-fail mode, a wrong
// expect-fail substring going red, the extension-fragment oracle going green
// per kind (npm, local-path, openvsx, direct URL with the downloader
// placeholder verbatim) plus drifted/missing/stale ids each going red naming
// the id, a brand-only manifest adding no fragment assertions, the three
// non-vacuity cases each failing distinctly, and the two PLAT-04 isolation
// plants: a generate without a private out dir is refused, and --out leaves a
// copied tree's generated/ absent.

const SELFTEST_MANIFEST = [
    '[product]',
    'revision = 1',
    'vendor_machine = "Selftestworks"',
    'vendor_display = "Selftest Works"',
    '',
    '[identity]',
    'display_name = "Selftest Browser"',
    'app_basename = "selftest-browser"',
    'binary_name = "selftest"',
    'remoting_name = "selftest"',
    'distribution_id = "org.selftest"',
    '',
    '[legal]',
    'license = "MIT"',
    'copyright_holder = "Selftest Works"',
    'trademark_notice = "Selftest Browser is a trademark of Selftest Works."',
    '',
    '[installer]',
    'support_url = "https://selftest.example.org"',
    '',
    '[upstreams]',
    'firefox_esr_tag = "SELFTEST_9_9_9esr_RELEASE"',
    'theia_release = "1.74.1"',
    '',
    '[urls]',
    'update = "https://updates.example.org/update.xml"',
    'release_notes = "https://selftest.example.org/releases"',
    'homepage = "https://selftest.example.org"',
    '',
].join('\n');

const SELFTEST_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="#123456" fill-rule="evenodd" d="M64 12L116 64L64 116L12 64Z M64 40L88 64L64 88L40 64Z"/></svg>\n';

function writeScratchFixture(dir, { manifest = SELFTEST_MANIFEST, svg = SELFTEST_SVG } = {}) {
    writeFileSync(join(dir, 'configuration.toml'), manifest);
    if (svg !== null) {
        const brandDir = join(dir, 'brand');
        try {
            statSync(brandDir);
        } catch {
            mkdirSync(brandDir, { recursive: true });
        }
        writeFileSync(join(brandDir, 'mark.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`);
    }
}

function runSelfTest() {
    const results = [];
    const check = (id, cond, detail) => {
        results.push({ id, pass: !!cond, detail });
        console.log(`${NAME}: --self-test -- ${cond ? 'ok' : 'FAIL'} ${id}${cond ? '' : ` -- ${detail}`}`);
    };

    const scratchRoot = mkdtempSync(join(tmpdir(), 'pb-downstream-selftest-'));
    try {
        // S1: green control -- a scratch valid fixture passes the whole drive.
        const controlDir = join(scratchRoot, 'control');
        mkdirSync(controlDir, { recursive: true });
        writeScratchFixture(controlDir);
        const control = driveFixture(controlDir);
        check('green-control', control.ok && control.assertions > 0, `want pass with assertions, got ok=${control.ok} assertions=${control.assertions}: ${control.failures.slice(0, 4).join(' | ')}`);

        // S2: a platform-valued tree goes red naming file and value.
        const { config: defConfig } = resolveConfig(PLATFORM_MANIFEST, undefined);
        const platformTree = join(scratchRoot, 'platform-tree');
        cpSync(defaultTree(), platformTree, { recursive: true });
        const devFull = `${defConfig.identity.display_name}${(defConfig.variants || []).find((v) => v.id === 'dev')?.name_suffix ?? ''}`;
        const swept = [...new Set([devFull, defConfig.product.vendor_display, defConfig.product.vendor_machine, defConfig.legal.trademark_notice])];
        const absence = checkPlatformAbsence(snapshotText(platformTree), new Map(), swept, [], new Set(), defConfig);
        check('platform-value-swap-red', !absence.ok && absence.failures.some((f) => f.includes('configure.sh') && f.includes(devFull)), `want a configure.sh failure naming the value, got: ${absence.failures.slice(0, 3).join(' | ')}`);

        // S3: an ftl/properties drift goes red.
        const driftTree = join(scratchRoot, 'drift-tree');
        cpSync(defaultTree(), driftTree, { recursive: true });
        const propsPath = join(driftTree, 'branding', 'dev', 'locales', 'en-US', 'brand.properties');
        writeFileSync(propsPath, readFileSync(propsPath, 'utf8').replace(/^brandFullName=.*$/m, 'brandFullName=Drift Value'));
        const drift = checkEmittedSurfaces(driftTree, defConfig, readFileSync(join(REPO_ROOT, 'brand', 'mark.svg'), 'utf8').split('\n').find((l) => l.startsWith('<svg')).trim());
        check('ftl-properties-drift-red', !drift.ok && drift.failures.some((f) => f.includes('brand.properties')), `want a brand.properties drift failure, got: ${drift.failures.slice(0, 3).join(' | ')}`);

        // S4: a missing-artwork stage goes red in pass mode, green in expect-fail mode.
        const noArtDir = join(scratchRoot, 'no-art');
        mkdirSync(noArtDir, { recursive: true });
        writeScratchFixture(noArtDir, { svg: null });
        const noArtPass = driveFixture(noArtDir);
        check('missing-artwork-red', !noArtPass.ok && noArtPass.failures.join('\n').includes('brand/mark.svg'), `want a brand/mark.svg failure, got: ${noArtPass.failures.slice(0, 3).join(' | ')}`);
        const noArtFail = driveFixture(noArtDir, { expectFail: 'brand/mark.svg' });
        check('missing-artwork-expect-fail-green', noArtFail.ok, `want expected-failure pass, got: ${noArtFail.failures.slice(0, 3).join(' | ')}`);

        // S5: a wrong expect-fail substring goes red.
        const wrongSub = driveFixture(noArtDir, { expectFail: 'no-such-setting-xyz' });
        check('wrong-substring-red', !wrongSub.ok && wrongSub.failures.join('\n').includes('no-such-setting-xyz'), `want a missing-substring failure, got: ${wrongSub.failures.slice(0, 3).join(' | ')}`);

        // S6: non-vacuity -- each degenerate input fails with its own message.
        const missing = driveFixture(join(scratchRoot, 'does-not-exist'));
        check('missing-source-red', !missing.ok && missing.failures.join('\n').includes('no such fixture source dir'), `want the missing-source message, got: ${missing.failures.join(' | ')}`);
        const emptyRoot = join(scratchRoot, 'empty-root');
        mkdirSync(emptyRoot, { recursive: true });
        check('empty-fixture-set-red', (discoverFixtures(emptyRoot) ?? []).length === 0, 'empty scratch root must discover zero fixtures');
        const zeroFail = assertNonZeroAssertions(0);
        const fiveFail = assertNonZeroAssertions(5);
        check('zero-assertions-red', zeroFail !== null && zeroFail.includes('zero assertions') && fiveFail === null, `want the zero-assertion guard to fire on 0 and stay quiet on 5, got: ${JSON.stringify(zeroFail)} / ${JSON.stringify(fiveFail)}`);

        // S7: the extension-fragment oracle agrees per kind on a matching tree.
        const extTree = join(scratchRoot, 'ext-tree');
        mkdirSync(extTree, { recursive: true });
        const extEntries = [
            { id: 'acme.npmpack', source: 'npm', version: '2.4.1' },
            { id: 'acme.localtool', source: 'local-path', path: 'extensions/acme-local' },
            { id: 'acme.theme', source: 'openvsx', version: '1.0.0' },
            { id: 'acme.targeted', source: 'url', url: 'https://example.org/acme-target-${targetPlatform}-1.0.0.vsix' },
        ];
        const extMap = {};
        for (const e of extEntries) extMap[e.id] = expectedExtensionUrl(e);
        writeFileSync(join(extTree, 'theia-plugins.json'), `${JSON.stringify(extMap, null, 2)}\n`);
        const extGreen = checkExtensionFragment(extTree, { extensions: extEntries });
        check('extension-fragment-green', extGreen.ok && extGreen.count === extEntries.length + 1, `want pass with ${extEntries.length + 1} assertions, got ok=${extGreen.ok} assertions=${extGreen.count}: ${extGreen.failures.slice(0, 3).join(' | ')}`);

        // S8: a drifted URL, a missing id, and a stale id each go red naming the id.
        const driftMap = { ...extMap, 'acme.npmpack': 'https://registry.npmjs.org/acme.npmpack/-/acme.npmpack-9.9.9.tgz' };
        writeFileSync(join(extTree, 'theia-plugins.json'), `${JSON.stringify(driftMap, null, 2)}\n`);
        const extDrift = checkExtensionFragment(extTree, { extensions: extEntries });
        check('extension-fragment-drift-red', !extDrift.ok && extDrift.failures.some((f) => f.includes('acme.npmpack')), `want a drift failure naming acme.npmpack, got: ${extDrift.failures.slice(0, 3).join(' | ')}`);
        const missingMap = { ...extMap };
        delete missingMap['acme.localtool'];
        writeFileSync(join(extTree, 'theia-plugins.json'), `${JSON.stringify(missingMap, null, 2)}\n`);
        const extMissing = checkExtensionFragment(extTree, { extensions: extEntries });
        check('extension-fragment-missing-red', !extMissing.ok && extMissing.failures.some((f) => f.includes('acme.localtool') && f.includes('missing')), `want a missing-id failure naming acme.localtool, got: ${extMissing.failures.slice(0, 3).join(' | ')}`);
        const staleMap = { ...extMap, 'acme.gone': 'https://example.org/acme-gone-1.0.0.vsix' };
        writeFileSync(join(extTree, 'theia-plugins.json'), `${JSON.stringify(staleMap, null, 2)}\n`);
        const extStale = checkExtensionFragment(extTree, { extensions: extEntries });
        check('extension-fragment-stale-red', !extStale.ok && extStale.failures.some((f) => f.includes('acme.gone')), `want a stale-id failure naming acme.gone, got: ${extStale.failures.slice(0, 3).join(' | ')}`);

        // S9: a brand-only manifest adds no fragment assertions (still non-vacuous overall).
        const brandOnly = checkExtensionFragment(extTree, {});
        check('extension-fragment-brand-only-quiet', brandOnly.ok && brandOnly.count === 0, `want pass with zero added assertions, got ok=${brandOnly.ok} assertions=${brandOnly.count}`);

        // S10 (PLAT-04 cause B): a generate with no private out dir is refused.
        let refusal = null;
        try {
            runGenerate(null);
        } catch (err) {
            refusal = err.message;
        }
        check('shared-tree-refused', refusal !== null && refusal.includes('shared generated/ tree'), `want runGenerate without an out dir to throw naming the shared generated/ tree, got: ${JSON.stringify(refusal)}`);

        // S11 (PLAT-04 cause B): a copied tree run with --out leaves its own
        // generated/ absent; the same copy run without --out creates it
        // (the positive control, so an absence is not a broken copy).
        const copy = join(scratchRoot, 'copy');
        for (const rel of ['scripts/generate.mjs', 'scripts/lib', 'configuration.toml', 'brand']) {
            cpSync(join(REPO_ROOT, rel), join(copy, rel), { recursive: true });
        }
        const copyEnv = { ...process.env };
        delete copyEnv.PB_CONFIG_DIR;
        const runCopy = (extra) => {
            try {
                execFileSync(process.execPath, [join(copy, 'scripts', 'generate.mjs'), ...extra], { cwd: copy, env: copyEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
                return 0;
            } catch (err) {
                return err.status ?? 1;
            }
        };
        const isolatedOut = join(scratchRoot, 'o');
        const withOut = runCopy(['--out', isolatedOut]);
        const isolated = withOut === 0 && !existsSync(join(copy, 'generated')) && existsSync(isolatedOut) && readdirSync(isolatedOut).length > 0;
        const withoutOut = runCopy([]);
        const created = withoutOut === 0 && existsSync(join(copy, 'generated'));
        check('out-dir-isolation', isolated && created, `want --out to leave the copy's generated/ absent and a bare run to create it, got --out exit ${withOut} isolated=${isolated}, bare exit ${withoutOut} created=${created}`);
    } finally {
        rmSync(scratchRoot, { recursive: true, force: true });
    }

    const failed = results.filter((r) => !r.pass);
    if (failed.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed.length} case(s) red`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- ${results.length} planted cases all behaved as pinned`);
}

// --- CLI --------------------------------------------------------------------------

function printUsageAndExit() {
    console.error('Usage: node scripts/verify-downstream-fixture.mjs --source <fixture-dir> [--expect-fail <substring>]');
    console.error('       node scripts/verify-downstream-fixture.mjs --all --fixtures-root <dir>');
    console.error('       node scripts/verify-downstream-fixture.mjs --self-test');
    process.exit(1);
}

/**
 * Per-fixture expected-failure marker for --all over mixed sets (07-03's
 * adversarial fixtures): a fixture dir holding an expect-fail.txt file runs
 * in expect-fail mode with its trimmed content as the substring, unless the
 * CLI --expect-fail overrides. Absent file -> expected-pass.
 */
function readExpectFailFile(fixtureDir) {
    try {
        const text = readFileSync(join(fixtureDir, 'expect-fail.txt'), 'utf8').trim();
        return text === '' ? undefined : text;
    } catch {
        return undefined;
    }
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
    runSelfTest();
} else if (args.includes('--all')) {
    const rootFlag = args.indexOf('--fixtures-root');
    if (rootFlag === -1 || args[rootFlag + 1] === undefined || args[rootFlag + 1].startsWith('--')) printUsageAndExit();
    const root = resolve(process.cwd(), args[rootFlag + 1]);
    const fixtures = discoverFixtures(root);
    if (fixtures === null) {
        console.error(`${NAME}: FAIL -- no such fixtures root: ${root}`);
        process.exit(1);
    }
    if (fixtures.length === 0) {
        console.error(`${NAME}: FAIL -- empty fixture set under ${root} -- a drive over zero fixtures proves nothing`);
        process.exit(1);
    }
    let failed = 0;
    let totalAssertions = 0;
    for (const fixture of fixtures) {
        const expectFlag = args.indexOf('--expect-fail');
        const expectFail = expectFlag !== -1 ? args[expectFlag + 1] : readExpectFailFile(fixture);
        const result = driveFixture(fixture, expectFail !== undefined ? { expectFail } : {});
        totalAssertions += result.assertions;
        if (result.ok) {
            console.log(`${NAME}: PASS -- ${fixture} (${result.assertions} assertions)`);
        } else {
            failed += 1;
            console.error(`${NAME}: FAIL -- ${fixture} (${result.assertions} assertions):\n  - ${result.failures.join('\n  - ')}`);
        }
    }
    if (totalAssertions === 0) {
        console.error(`${NAME}: FAIL -- ${assertNonZeroAssertions(0)}`);
        process.exit(1);
    }
    if (failed > 0) {
        console.error(`${NAME}: FAIL -- ${failed}/${fixtures.length} fixture(s) red`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${fixtures.length} fixture(s), ${totalAssertions} assertions`);
} else if (args.includes('--source')) {
    const flag = args.indexOf('--source');
    const source = args[flag + 1];
    if (source === undefined || source.startsWith('--')) printUsageAndExit();
    const failFlag = args.indexOf('--expect-fail');
    const expectFail = failFlag !== -1 ? args[failFlag + 1] : undefined;
    if (failFlag !== -1 && (expectFail === undefined || expectFail.startsWith('--'))) printUsageAndExit();
    const result = driveFixture(resolve(process.cwd(), source), expectFail !== undefined ? { expectFail } : {});
    const zeroFail = assertNonZeroAssertions(result.assertions);
    if (zeroFail !== null) {
        console.error(`${NAME}: FAIL -- ${zeroFail}`);
        process.exit(1);
    }
    if (!result.ok) {
        console.error(`${NAME}: FAIL -- ${source} (${result.assertions} assertions):\n  - ${result.failures.join('\n  - ')}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${source} (${result.assertions} assertions)`);
} else {
    printUsageAndExit();
}
