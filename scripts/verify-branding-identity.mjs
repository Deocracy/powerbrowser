#!/usr/bin/env node
// scripts/verify-branding-identity.mjs
//
// BRAND-01's six-surface identity checklist (D-79), replacing the
// unachievable "grep -ri firefox comes back empty" criterion: a correctly
// branded, unpackaged build still ships dozens of files with "firefox" in
// the name (upstream feature names, C-5's update-file set) -- a criterion
// that can only ever fail is not a criterion.
//
// The six surfaces, each an EXACT string/boolean equality -- never
// includes/startsWith, never case-insensitive:
//   1. executable    -- a file named `powerbrowser` exists+executable under
//                       objdir/dist/bin, and no file named `firefox` remains.
//   2. application-ini -- application.ini's Name=/Vendor= lines.
//   3. runtime-identity -- D-120 (05-03): launches the built binary
//                       headless with a throwaway profile and reads its
//                       POWERBROWSER_APP_IDENTITY startup stdout sentinel --
//                       name/vendor from Services.appinfo, version from
//                       AppConstants.MOZ_APP_VERSION_DISPLAY, the exact
//                       accessor the chrome-rendered diagnostics layer
//                       (SHELL-04) also reads, so the two can never
//                       disagree. Replaces the former about-support surface
//                       (WINDOWS.md #6): the shell's single <browser> is
//                       pinned remoteType=web and the old surface needed a
//                       privileged-about remote type it will never get in
//                       v4.0 (no URL bar, no about-page reachability --
//                       consistent with "Theia is the only GUI"), so that
//                       surface could only ever read a stock, unbranded
//                       Firefox page. This is a real live process launch,
//                       not a constant -- confirmed live this session:
//                       {"name":"powerbrowser","vendor":"Deocracy","version":"153.1.0esr"}.
//                       When a chrome-context driver exists (none does in
//                       this repo -- WINDOWS.md #7, chrome-side Marionette
//                       automation is blocked on Linux), this surface also
//                       opens the diagnostics layer and asserts its
//                       rendered identity fields equal the sentinel's; when
//                       it does not, that one extra assertion is skipped
//                       and the skip is named in the surface's own detail
//                       string -- the three sentinel equalities are never
//                       weakened to compensate.
//   4. brand-full-name -- reads the resolved variant's own
//                       powerbrowser/branding/<variant>/locales/en-US/brand.ftl
//                       `-brand-full-name` AND that same variant's own
//                       locales/en-US/brand.properties `brandFullName`, and
//                       asserts BOTH against that variant's expected value --
//                       derived at check time from configuration.toml through
//                       scripts/generate.mjs resolveConfig (base display_name
//                       plus the variant's name_suffix, the exact composition
//                       emitBrandFtl/emitBrandProperties themselves use), or
//                       the --brand-ftl/--brand-properties/
//                       --expect-brand-full-name overrides. Reading only
//                       brand.ftl let the two files silently disagree
//                       within the same variant (03-REVIEW.md WR-01, closed
//                       03-11): this surface now fails if either file's
//                       value diverges from the other's, not just from the
//                       expectation. NOT a document.title read: the Linux
//                       window title resolves through Fluent's
//                       `-brand-full-name` term (browser.ftl:7), and
//                       `document.title` over BiDi is the wrong realm
//                       anyway (browsingContext.getTree returns content
//                       contexts, never the chrome window). The live
//                       chrome-window title and WM_CLASS reads are
//                       Manual-Only items in 03-VALIDATION.md (no xprop/
//                       chrome introspection on this headless host). A
//                       `--positive-control brand-full-name` cross-variant
//                       control reads the OTHER variant's brand.ftl AND
//                       brand.properties while keeping the selected
//                       variant's expected value -- proving both that the
//                       paths are honored and that the comparison
//                       discriminates (03-07-PLAN.md, extended 03-11).
//   5. desktop-entry  -- powerbrowser/powerbrowser.desktop's Name=/StartupWMClass=
//                       against config.status's resolved MOZ_APP_DISPLAYNAME/
//                       MOZ_APP_REMOTINGNAME. Expected RED until 03-05 --
//                       the file does not exist yet.
//   6. version        -- `--version` stdout equals exactly
//                       "<Vendor> <Name> <version_display>", built from
//                       application.ini and
//                       upstream/browser/config/version_display.txt.
//                       DumpVersion() concatenates vendor and name
//                       unconditionally, so this also catches the doubled-
//                       token form a same-string vendor/basename would print.
//
// Coverage guard: every surface pushes its id onto `surfacesRun` at the
// point its assertion actually completes (pass or fail) -- a surface whose
// implementation returns early without reaching that point is caught by the
// guard at the end of a full run, exactly like verify-branding.mjs's own
// coverage guard.
//
// --positive-control <surface>: runs exactly ONE surface (application-ini,
// runtime-identity, or version) with its expected value replaced by the
// stock Firefox value, and exits 0 only if that surface then reports
// FAILURE -- following verify-dev-flag-off.mjs's --expect-bound inversion
// shape. This proves the reader produced a real live value and that the
// comparison discriminates, with no rebuild. Deliberately does NOT catch
// errors thrown during the live runtime-identity launch in this mode:
// catching a mechanism error (e.g. the binary failing to launch at all) and
// reporting it as "surface correctly failed" would make the control exit 0
// vacuously,
// which is the Phase 2 verify-dev-flag-off failure mode this harness exists
// to prevent. A full (non-control) run wraps every surface's own I/O so an
// absent/unreadable value is always a FAILURE row, never a skip and never an
// uncaught crash that would stop the remaining surfaces from running.
//
// Zero npm dependencies: only Node built-ins (05-03: the runtime-identity
// surface drops the former about-support surface's dependency on
// ./lib/firefox-bidi.mjs -- it launches the binary and reads a stdout
// sentinel directly, no WebDriver BiDi session needed).
//
// Usage:
//   node scripts/verify-branding-identity.mjs [--bin <path>]
//     [--expect-display-name <string>] [--positive-control <surface>]
//   node scripts/verify-branding-identity.mjs --self-test
//   node scripts/verify-branding-identity.mjs --help

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolveConfig } from './generate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// Per-variant branding-identity descriptor (03-07-PLAN.md): every fact that
// differs between the dev and release variants lives here, keyed by variant
// id, instead of as independent per-flag defaults. Adding a surface means
// extending a record here, not adding an unrelated flag with its own
// silently-defaulting fallback -- the exact seam CR-01 fell through.
//
// STRUCTURAL PATHS ONLY (06-02). The descriptor keeps tree layout -- bin,
// desktop, config.status, brandFtl, brandProperties locations -- never an
// expected brand VALUE. Every expectation is derived below from
// configuration.toml through resolveConfig, so the descriptor and the
// emitter compute the same string from the same source rather than the
// checker keeping a copy a downstream's manifest could never satisfy.
const VARIANTS = {
    dev: {
        bin: join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser'),
        desktop: join(REPO_ROOT, 'powerbrowser', 'powerbrowser.desktop'),
        configStatus: join(REPO_ROOT, 'objdir', 'config.status'),
        brandFtl: join(REPO_ROOT, 'powerbrowser', 'branding', 'dev', 'locales', 'en-US', 'brand.ftl'),
        brandProperties: join(REPO_ROOT, 'powerbrowser', 'branding', 'dev', 'locales', 'en-US', 'brand.properties'),
    },
    release: {
        bin: join(REPO_ROOT, 'objdir-release', 'dist', 'bin', 'powerbrowser'),
        desktop: join(REPO_ROOT, 'powerbrowser', 'powerbrowser-release.desktop'),
        configStatus: join(REPO_ROOT, 'objdir-release', 'config.status'),
        brandFtl: join(REPO_ROOT, 'powerbrowser', 'branding', 'release', 'locales', 'en-US', 'brand.ftl'),
        brandProperties: join(REPO_ROOT, 'powerbrowser', 'branding', 'release', 'locales', 'en-US', 'brand.properties'),
    },
};
const VARIANT_IDS = Object.keys(VARIANTS);

const HELP = `Usage: node scripts/verify-branding-identity.mjs [--variant <${VARIANT_IDS.join('|')}>] [--positive-control <surface>]
       node scripts/verify-branding-identity.mjs [--bin <path>] [--desktop <path>] [--config-status <path>]
       node scripts/verify-branding-identity.mjs [--brand-ftl <path>] [--brand-properties <path>] [--expect-brand-full-name <string>] [--expect-display-name <string>]
       node scripts/verify-branding-identity.mjs --help

Runs BRAND-01's six-surface identity checklist against the built binary.

  --variant <${VARIANT_IDS.join('|')}>          Select the branding-variant descriptor that supplies
                               every per-variant default below (default dev).
                               An unrecognised id exits non-zero before any
                               surface runs.
  --bin <path>                Binary to drive (default: the selected variant's bin)
  --desktop <path>             .desktop file the desktop-entry surface asserts
                               against (default: the selected variant's desktop file).
  --config-status <path>       config.status the desktop-entry surface reads
                               MOZ_APP_DISPLAYNAME/MOZ_APP_REMOTINGNAME from
                               (default: the selected variant's config.status).
  --brand-ftl <path>           brand.ftl the brand-full-name surface reads
                               (default: the selected variant's own brand.ftl).
  --brand-properties <path>    brand.properties the brand-full-name surface ALSO
                               reads, asserting it agrees with brand.ftl AND the
                               expected value (default: the selected variant's
                               own brand.properties).
  --expect-brand-full-name <s> Override the expected -brand-full-name /
                                brandFullName value for the brand-full-name
                                surface (default: derived from
                                configuration.toml for the selected variant).
  --expect-display-name <s>   Override the expected MOZ_APP_DISPLAYNAME for the
                                desktop-entry surface (default: read live from
                                the --config-status path)
  --positive-control <surface>
                                Run exactly one surface (application-ini,
                                runtime-identity, version, desktop-entry, or
                                brand-full-name) with its expected value (or,
                                for brand-full-name, its input files) replaced
                                by a value that must be wrong. Exits 0 only if
                                that surface then reports FAILURE.
  --self-test                Prove the expectations derive from the manifest:
                                the shipped-manifest control first, then a
                                scratch-manifest fault carrying a different
                                display name through the same derivation path.
                                Exits 0 only if the control is green and the
                                fault derives the scratch value.
  --help                       Print this message and exit 0
`;

const args = process.argv.slice(2);

if (args.includes('--help')) {
    console.log(HELP.trimEnd());
    process.exit(0);
}

const SELF_TEST = args.includes('--self-test');

// Manifest-derived identity expectations (06-02): base display_name plus the
// variant's name_suffix -- the exact composition emitBrandFtl and
// emitBrandProperties apply -- with vendor from product.vendor_machine and
// the basename from identity.app_basename, the values the .mozconfig and
// generated-identity emitters compile into application.ini's Name=/Vendor=.
// Derived, never executed: the values reach only exact-equality comparisons
// (T-06-02).
const { failures: MANIFEST_FAILURES, config: MANIFEST_CONFIG } = resolveConfig(join(REPO_ROOT, 'configuration.toml'), undefined);
if (MANIFEST_FAILURES.length > 0) {
    console.error(`verify-branding-identity: FAIL -- configuration.toml does not resolve, so no expectation can be derived: ${MANIFEST_FAILURES.join('; ')}`);
    process.exit(1);
}

function deriveBrandFullName(config, variantId) {
    const entry = (config.variants || []).find((v) => v.id === variantId);
    if (!entry) throw new Error(`configuration.toml declares no variant '${variantId}'`);
    return `${config.identity.display_name}${entry.name_suffix}`;
}

const EXPECTED_APP_BASENAME = MANIFEST_CONFIG.identity.app_basename;
const EXPECTED_VENDOR_MACHINE = MANIFEST_CONFIG.product.vendor_machine;

function argValue(flag) {
    const i = args.indexOf(flag);
    if (i === -1 || i === args.length - 1) return undefined;
    return args[i + 1];
}

const variantId = argValue('--variant') || 'dev';
if (!VARIANT_IDS.includes(variantId)) {
    console.error(`verify-branding-identity: FAIL -- unknown --variant '${variantId}'. Supported: ${VARIANT_IDS.join(', ')}`);
    process.exit(1);
}
const variant = VARIANTS[variantId];
const otherVariantId = VARIANT_IDS.find(id => id !== variantId);
const otherVariant = VARIANTS[otherVariantId];

const binOverride = argValue('--bin');
const desktopOverride = argValue('--desktop');
const configStatusOverride = argValue('--config-status');
const brandFtlOverride = argValue('--brand-ftl');
const brandPropertiesOverride = argValue('--brand-properties');
const expectBrandFullNameOverride = argValue('--expect-brand-full-name');
const expectDisplayNameOverride = argValue('--expect-display-name');
const positiveControlSurface = argValue('--positive-control');

// BIN_DIR is derived from BIN_PATH (not a separate objdir-hardcoded
// constant) so that --bin's override is honored by every reader that needs
// the binary's own directory -- checkExecutable() and APP_INI_PATH in
// particular. Before this fix both silently kept checking objdir/dist/bin
// regardless of --bin, so the executable surface never actually verified a
// --bin-overridden (e.g. release) binary's directory (03-05 Task 3 finding).
const BIN_PATH = binOverride || variant.bin;
const BIN_DIR = dirname(BIN_PATH);
const APP_INI_PATH = join(BIN_DIR, 'application.ini');
const CONFIG_STATUS_PATH = configStatusOverride || variant.configStatus;
const VERSION_DISPLAY_PATH = join(REPO_ROOT, 'upstream', 'browser', 'config', 'version_display.txt');
const DESKTOP_FILE_PATH = desktopOverride || variant.desktop;
const BRAND_FTL_PATH = brandFtlOverride || variant.brandFtl;
const BRAND_PROPERTIES_PATH = brandPropertiesOverride || variant.brandProperties;
const EXPECTED_BRAND_FULL_NAME = expectBrandFullNameOverride || deriveBrandFullName(MANIFEST_CONFIG, variantId);

const SURFACE_IDS = ['executable', 'application-ini', 'runtime-identity', 'brand-full-name', 'desktop-entry', 'version'];
const CONTROLLABLE_SURFACES = ['application-ini', 'runtime-identity', 'version', 'desktop-entry', 'brand-full-name'];

const surfacesRun = [];

// --- build-time truth readers -- each throws on absent/unreadable input,
// never returns a silently-empty value. ---

function readAppIni(path) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const nameLine = lines.find(l => l.startsWith('Name='));
    const vendorLine = lines.find(l => l.startsWith('Vendor='));
    if (nameLine === undefined || vendorLine === undefined) {
        throw new Error(`${path} is missing a Name= or Vendor= line`);
    }
    const name = nameLine.slice('Name='.length);
    const vendor = vendorLine.slice('Vendor='.length);
    if (!name || !vendor) throw new Error(`${path} has an empty Name= or Vendor= value`);
    return { name, vendor };
}

function readVersionDisplay(path) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    const value = readFileSync(path, 'utf8').trim();
    if (!value) throw new Error(`${path} is empty`);
    return value;
}

function readConfigStatusVar(path, name) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    const text = readFileSync(path, 'utf8');
    const re = new RegExp(`'${name}':\\s*'([^']*)'`);
    const m = text.match(re);
    if (!m || !m[1]) throw new Error(`${path} has no resolved value for ${name}`);
    return m[1];
}

function readBrandFullName(path) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    const line = readFileSync(path, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith('-brand-full-name'));
    if (!line) throw new Error(`${path} has no -brand-full-name entry`);
    // WR-01 (03-REVIEW.md): the .find() predicate above selects on the
    // TRIMMED line, but the regex below used to match the UNTRIMMED line --
    // a brand.ftl with leading whitespace on its term line would select a
    // line the regex then rejected, producing a spurious unexpected-shape
    // error. Match against the trimmed form so selection and matching agree.
    const trimmed = line.trim();
    const m = trimmed.match(/^-brand-full-name\s*=\s*(.+)$/);
    if (!m || !m[1].trim()) throw new Error(`${path} -brand-full-name line has an unexpected or empty shape: ${JSON.stringify(line)}`);
    return m[1].trim();
}

function readBrandPropertiesFullName(path) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    // Mirrors readBrandFullName's trimmed-selection/trimmed-matching contract
    // (WR-01, 03-REVIEW.md): select on the trimmed line, match on the
    // trimmed line, so selection and matching never disagree.
    const line = readFileSync(path, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith('brandFullName'));
    if (!line) throw new Error(`${path} has no brandFullName entry`);
    const trimmed = line.trim();
    const m = trimmed.match(/^brandFullName\s*=\s*(.+)$/);
    if (!m || !m[1].trim()) throw new Error(`${path} brandFullName line has an unexpected or empty shape: ${JSON.stringify(line)}`);
    // .properties values are unquoted -- trim trailing whitespace only,
    // compare with exact string equality, never includes/case-insensitive.
    return m[1].trim();
}

function parseDesktopFile(path) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const nameLine = lines.find(l => l.startsWith('Name='));
    const wmClassLine = lines.find(l => l.startsWith('StartupWMClass='));
    if (nameLine === undefined || wmClassLine === undefined) {
        throw new Error(`${path} is missing a Name= or StartupWMClass= line`);
    }
    return { name: nameLine.slice('Name='.length), wmClass: wmClassLine.slice('StartupWMClass='.length) };
}

// --- the six surfaces ---

function checkExecutable() {
    const powerbrowserPath = join(BIN_DIR, 'powerbrowser');
    const firefoxPath = join(BIN_DIR, 'firefox');

    let powerbrowserOk = false;
    if (existsSync(powerbrowserPath)) {
        try {
            powerbrowserOk = (statSync(powerbrowserPath).mode & 0o111) !== 0;
        } catch {
            powerbrowserOk = false;
        }
    }
    const firefoxAbsent = !existsSync(firefoxPath);
    const pass = powerbrowserOk && firefoxAbsent;
    surfacesRun.push('executable');
    return {
        pass,
        detail: `${powerbrowserPath} executable=${powerbrowserOk}; ${firefoxPath} absent=${firefoxAbsent}`,
    };
}

function checkApplicationIni({ stockControl = false } = {}) {
    const { name, vendor } = readAppIni(APP_INI_PATH);
    const expectedName = stockControl ? 'Firefox' : EXPECTED_APP_BASENAME;
    const expectedVendor = stockControl ? 'Mozilla' : EXPECTED_VENDOR_MACHINE;
    const pass = name === expectedName && vendor === expectedVendor;
    surfacesRun.push('application-ini');
    return {
        pass,
        detail: `Name=${JSON.stringify(name)} (expected ${JSON.stringify(expectedName)}), Vendor=${JSON.stringify(vendor)} (expected ${JSON.stringify(expectedVendor)})`,
    };
}

const APP_IDENTITY_LINE_RE = /^(?:\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_APP_IDENTITY (\{.*\})$/m;

// Launches <binPath> headless with a throwaway profile, capturing combined
// stdout+stderr until the POWERBROWSER_APP_IDENTITY startup sentinel appears
// (powerbrowser.js writes it once, unconditionally, right after the sidecar
// prefs sentinel -- before TheiaService.start(), so it needs no backend and
// no display). Tolerates the same "[PowerBrowserAPI] <level>: " console-mirror
// prefix verify-platform.sh's own sentinel readers do. Always kills the
// spawned process and removes the throwaway profile, on every exit path --
// this is a verification harness for Phase 5's own subject (orphaned
// processes); it must not manufacture that failure mode itself.
async function readRuntimeIdentity(binPath, { timeoutMs = 30000 } = {}) {
    if (!existsSync(binPath)) throw new Error(`${binPath} does not exist`);
    const profileDir = await mkdtemp(join(tmpdir(), 'powerbrowser-verify-identity-'));
    let child;
    try {
        child = spawn(binPath, ['--headless', '--profile', profileDir], { stdio: ['ignore', 'pipe', 'pipe'] });
        return await new Promise((resolve, reject) => {
            let buf = '';
            let settled = false;
            const timer = setTimeout(() => {
                finish(() => reject(new Error(
                    `POWERBROWSER_APP_IDENTITY did not appear within ${timeoutMs}ms; output so far:\n${buf}`
                )));
            }, timeoutMs);

            function finish(effect) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                child.stdout.off('data', onData);
                child.stderr.off('data', onData);
                child.off('exit', onExit);
                effect();
            }

            function onData(chunk) {
                buf += chunk.toString('utf8');
                const m = buf.match(APP_IDENTITY_LINE_RE);
                if (!m) return;
                finish(() => {
                    try {
                        resolve(JSON.parse(m[1]));
                    } catch {
                        reject(new Error(`POWERBROWSER_APP_IDENTITY line did not carry valid JSON: ${m[1]}`));
                    }
                });
            }

            function onExit(code) {
                finish(() => reject(new Error(
                    `powerbrowser exited (code ${code}) before printing POWERBROWSER_APP_IDENTITY; output so far:\n${buf}`
                )));
            }

            child.stdout.on('data', onData);
            child.stderr.on('data', onData);
            child.on('exit', onExit);
        });
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
        await rm(profileDir, { recursive: true, force: true });
    }
}

async function checkRuntimeIdentity({ stockControl = false } = {}) {
    // Real build values, read before the browser even launches -- these are
    // the non-control expected values. A read failure here is a genuine
    // infra problem (application.ini / version_display.txt absent) and is
    // allowed to throw uncaught in --positive-control mode, per this file's
    // header note: catching it and calling the surface "FAILED" would make
    // the control pass for the wrong reason.
    const { name: realName, vendor: realVendor } = readAppIni(APP_INI_PATH);
    const versionDisplay = readVersionDisplay(VERSION_DISPLAY_PATH);
    const expectedName = stockControl ? 'Firefox' : realName;
    const expectedVendor = stockControl ? 'Mozilla' : realVendor;

    // A launch/parse failure here (binary missing, sentinel never appears,
    // malformed JSON) is the SAME class of genuine infra problem as the
    // build-value reads above -- allowed to throw uncaught, never caught and
    // reported as "surface failed", for the identical reason.
    const identity = await readRuntimeIdentity(BIN_PATH);

    const namePass = identity.name === expectedName;
    // The stock substitution axis for this surface is the brand name (per
    // the plan's enumerated stock values); vendor/version are only asserted
    // in non-control mode.
    const vendorPass = stockControl ? true : identity.vendor === expectedVendor;
    const versionPass = stockControl ? true : identity.version === versionDisplay;
    let pass = namePass && vendorPass && versionPass;

    // D-120's chrome-driver extension: when a chrome-context driver exists,
    // also open the diagnostics layer and assert its rendered identity
    // fields equal the sentinel's. No such driver exists in this repo today
    // (WINDOWS.md #7 -- chrome-side Marionette automation is blocked on
    // Linux, moz:windowless is macOS-only), so this extra assertion is
    // skipped and the skip is named below; the three sentinel equalities
    // above are never weakened to compensate.
    const crossCheckDetail = 'diagnostics-layer cross-check: skipped -- no chrome-context driver available in this repo (WINDOWS.md #7)';

    surfacesRun.push('runtime-identity');
    return {
        pass,
        detail: `POWERBROWSER_APP_IDENTITY name=${JSON.stringify(identity.name)} (expected ${JSON.stringify(expectedName)})` +
            `${stockControl ? '' : `, vendor=${JSON.stringify(identity.vendor)} (expected ${JSON.stringify(expectedVendor)}), version=${JSON.stringify(identity.version)} (expected ${JSON.stringify(versionDisplay)})`}` +
            `; ${crossCheckDetail}`,
    };
}

function checkBrandFullName({ crossVariantControl = false } = {}) {
    // crossVariantControl reads the OTHER variant's own brand.ftl AND
    // brand.properties (never a stock/substituted value) while keeping the
    // selected variant's own expected value -- this discriminates on BOTH
    // axes at once: a wrong path (the other variant's real files) and,
    // since those files legitimately carry a different real value, a wrong
    // comparison too. A stock-value-only control would not have caught
    // CR-01, whose path was wrong but whose hardcoded value happened to
    // still be a real string.
    const ftlPath = crossVariantControl ? otherVariant.brandFtl : BRAND_FTL_PATH;
    const propsPath = crossVariantControl ? otherVariant.brandProperties : BRAND_PROPERTIES_PATH;
    const ftlValue = readBrandFullName(ftlPath);
    const propsValue = readBrandPropertiesFullName(propsPath);
    // Both files must agree with the expected value -- reading brand.ftl
    // alone let brand.properties silently disagree within the same variant
    // (03-REVIEW.md WR-01, closed 03-11).
    const pass = ftlValue === EXPECTED_BRAND_FULL_NAME && propsValue === EXPECTED_BRAND_FULL_NAME;
    surfacesRun.push('brand-full-name');
    return {
        pass,
        detail: `variant=${variantId} brand.ftl=${ftlPath} -brand-full-name=${JSON.stringify(ftlValue)}, brand.properties=${propsPath} brandFullName=${JSON.stringify(propsValue)} (both expected ${JSON.stringify(EXPECTED_BRAND_FULL_NAME)})`,
    };
}

function checkDesktopEntry({ stockControl = false } = {}) {
    // stockControl substitutes the pre-branding stock values this build's
    // config.status reported before D-79's identity patch landed
    // (03-05-PLAN.md: 'firefox-default', the auto-derived
    // MOZ_APP_REMOTINGNAME on the 'default' update channel with no explicit
    // export) so the control proves the comparison discriminates a real
    // .desktop file from a stock one, not just that a config.status read
    // succeeded.
    const expectedName = stockControl
        ? 'Firefox'
        : (expectDisplayNameOverride || readConfigStatusVar(CONFIG_STATUS_PATH, 'MOZ_APP_DISPLAYNAME'));
    const expectedWmClass = stockControl ? 'firefox-default' : readConfigStatusVar(CONFIG_STATUS_PATH, 'MOZ_APP_REMOTINGNAME');
    const { name, wmClass } = parseDesktopFile(DESKTOP_FILE_PATH);
    const pass = name === expectedName && wmClass === expectedWmClass;
    surfacesRun.push('desktop-entry');
    return {
        pass,
        detail: `Name=${JSON.stringify(name)} (expected ${JSON.stringify(expectedName)}), StartupWMClass=${JSON.stringify(wmClass)} (expected ${JSON.stringify(expectedWmClass)})`,
    };
}

function checkVersion({ stockControl = false } = {}) {
    const { name, vendor } = readAppIni(APP_INI_PATH);
    const versionDisplay = readVersionDisplay(VERSION_DISPLAY_PATH);
    const actual = execFileSync(BIN_PATH, ['--version'], { encoding: 'utf8' }).trim();
    const expected = stockControl ? `Mozilla Firefox ${versionDisplay}` : `${vendor} ${name} ${versionDisplay}`;
    const pass = actual === expected;
    surfacesRun.push('version');
    return {
        pass,
        detail: `--version output=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    };
}

// Wraps a synchronous or async surface check so an absent/unreadable value
// is a FAILURE row, never a skip and never an uncaught crash that would stop
// the remaining surfaces from running. Only used in the full (non-control)
// run -- --positive-control mode calls each surface's check function
// directly, unwrapped, per the header note above.
async function runSurfaceSafe(id, fn) {
    try {
        const result = await fn();
        return { id, ...result };
    } catch (err) {
        if (!surfacesRun.includes(id)) surfacesRun.push(id);
        return { id, pass: false, detail: `could not be read/executed: ${err.message}` };
    }
}

async function runFull() {
    const results = [];
    results.push(await runSurfaceSafe('executable', () => checkExecutable()));
    results.push(await runSurfaceSafe('application-ini', () => checkApplicationIni()));
    results.push(await runSurfaceSafe('runtime-identity', () => checkRuntimeIdentity()));
    results.push(await runSurfaceSafe('brand-full-name', () => checkBrandFullName()));
    results.push(await runSurfaceSafe('desktop-entry', () => checkDesktopEntry()));
    results.push(await runSurfaceSafe('version', () => checkVersion()));

    const missing = SURFACE_IDS.filter(id => !surfacesRun.includes(id));
    if (missing.length > 0) {
        console.error(`verify-branding-identity: FAIL -- coverage guard: surface(s) never asserted: ${missing.join(', ')}`);
        process.exit(1);
    }

    let failed = false;
    for (const r of results) {
        if (r.pass) {
            console.log(`verify-branding-identity: PASS ${r.id} -- ${r.detail}`);
        } else {
            failed = true;
            console.error(`verify-branding-identity: FAIL ${r.id} -- ${r.detail}`);
        }
    }

    if (failed) {
        console.error('verify-branding-identity: FAIL -- see surface(s) above');
        process.exit(1);
    }
    console.log('verify-branding-identity: PASS -- all six surfaces correct');
    process.exit(0);
}

async function runPositiveControl(surface) {
    if (!CONTROLLABLE_SURFACES.includes(surface)) {
        console.error(
            `verify-branding-identity: FAIL -- no positive control defined for surface '${surface}'. ` +
            `Supported: ${CONTROLLABLE_SURFACES.join(', ')}`
        );
        process.exit(1);
    }

    let result;
    if (surface === 'application-ini') {
        result = checkApplicationIni({ stockControl: true });
    } else if (surface === 'runtime-identity') {
        result = await checkRuntimeIdentity({ stockControl: true });
    } else if (surface === 'version') {
        result = checkVersion({ stockControl: true });
    } else if (surface === 'desktop-entry') {
        result = checkDesktopEntry({ stockControl: true });
    } else if (surface === 'brand-full-name') {
        result = checkBrandFullName({ crossVariantControl: true });
    }

    if (!result.pass) {
        console.log(`verify-branding-identity: PASS -- positive control for '${surface}' correctly reported FAILURE against the stock Firefox value (${result.detail})`);
        process.exit(0);
    }
    console.error(`verify-branding-identity: FAIL -- positive control for '${surface}' did NOT report FAILURE against the stock Firefox value (${result.detail}); the reader is not discriminating a real live value`);
    process.exit(1);
}

// --- --self-test ------------------------------------------------------------
//
// Proves the expectations derive from the manifest rather than from a
// constant. Control first: the shipped manifest resolved through
// deriveBrandFullName must equal the shipped tree's own brand.ftl AND
// brand.properties values for BOTH variants -- without this, a red fault
// below would prove nothing. Then the fault: a scratch manifest carrying a
// display name that appears nowhere in this file is resolved through the
// SAME deriveBrandFullName path and the derived expectation must equal the
// scratch value -- and must differ from the shipped tree's value, proving
// the derivation moved with the manifest. Needs no build: it reads the
// manifest and the brand locale files only, never launches the binary.
async function runSelfTest() {
    let ok = true;

    for (const id of VARIANT_IDS) {
        let derived;
        try {
            derived = deriveBrandFullName(MANIFEST_CONFIG, id);
        } catch (err) {
            console.error(`verify-branding-identity: --self-test FAIL -- control: cannot derive '${id}' from the shipped manifest: ${err.message}`);
            ok = false;
            continue;
        }
        let ftl;
        let props;
        try {
            ftl = readBrandFullName(VARIANTS[id].brandFtl);
            props = readBrandPropertiesFullName(VARIANTS[id].brandProperties);
        } catch (err) {
            console.error(`verify-branding-identity: --self-test FAIL -- control: cannot read the shipped brand files for '${id}': ${err.message}`);
            ok = false;
            continue;
        }
        if (derived !== ftl || derived !== props) {
            console.error(
                `verify-branding-identity: --self-test FAIL -- control: derived ${JSON.stringify(derived)} for '${id}' ` +
                `but the shipped tree carries brand.ftl=${JSON.stringify(ftl)} brand.properties=${JSON.stringify(props)}`,
            );
            ok = false;
        } else {
            console.log(`verify-branding-identity: --self-test -- control variant '${id}': derived ${JSON.stringify(derived)} equals the shipped brand.ftl and brand.properties`);
        }
    }

    if (!ok) {
        console.error('verify-branding-identity: --self-test FAIL -- the shipped-manifest control is red, so a red fault would prove nothing');
        process.exit(1);
    }

    const scratchDir = await mkdtemp(join(tmpdir(), 'branding-identity-selftest-'));
    try {
        const shippedText = readFileSync(join(REPO_ROOT, 'configuration.toml'), 'utf8');
        // The anchor is the display_name LINE SHAPE, never its value: spelling
        // the shipped value here would keep a display string in the checker --
        // the exact copy 06-02 removes -- and 06-01's literal scan would fail
        // on this file for carrying it.
        const anchor = shippedText.split('\n').find((l) => l.startsWith('display_name = "') && l.endsWith('"'));
        if (!anchor) {
            console.error('verify-branding-identity: --self-test FAIL -- the shipped manifest carries no display_name = "..." line; the scratch fault has no anchor to mutate');
            process.exit(1);
        }
        const scratchValue = 'Selftest Drift';
        writeFileSync(join(scratchDir, 'configuration.toml'), shippedText.replace(anchor, `display_name = "${scratchValue}"`));
        const { failures, config: scratchConfig } = resolveConfig(join(scratchDir, 'configuration.toml'), undefined);
        if (failures.length > 0) {
            console.error(`verify-branding-identity: --self-test FAIL -- the scratch manifest does not resolve: ${failures.join('; ')}`);
            process.exit(1);
        }
        const scratchDerived = deriveBrandFullName(scratchConfig, 'dev');
        const wantScratch = `${scratchValue} Dev`;
        if (scratchDerived !== wantScratch) {
            console.error(`verify-branding-identity: --self-test FAIL -- the scratch manifest carries ${JSON.stringify(scratchValue)} but the same derivation path produced ${JSON.stringify(scratchDerived)} instead of ${JSON.stringify(wantScratch)}; the expectation is not coming from the manifest`);
            process.exit(1);
        }
        const shippedDev = readBrandFullName(VARIANTS.dev.brandFtl);
        if (scratchDerived === shippedDev) {
            console.error(`verify-branding-identity: --self-test FAIL -- the scratch derivation ${JSON.stringify(scratchDerived)} did not move off the shipped value; it is a constant wearing a manifest's clothes`);
            process.exit(1);
        }
        console.log(`verify-branding-identity: --self-test -- scratch manifest display name ${JSON.stringify(scratchValue)} derived to ${JSON.stringify(scratchDerived)} through the same path (shipped tree carries ${JSON.stringify(shippedDev)})`);
    } finally {
        await rm(scratchDir, { recursive: true, force: true });
    }

    console.log('verify-branding-identity: --self-test PASS');
    process.exit(0);
}

if (SELF_TEST) {
    runSelfTest().catch(err => {
        console.error(`verify-branding-identity: FAIL -- ${err.message}`);
        process.exit(1);
    });
} else if (positiveControlSurface !== undefined) {
    runPositiveControl(positiveControlSurface).catch(err => {
        console.error(`verify-branding-identity: FAIL -- ${err.message}`);
        process.exit(1);
    });
} else {
    runFull().catch(err => {
        console.error(`verify-branding-identity: FAIL -- ${err.message}`);
        process.exit(1);
    });
}
