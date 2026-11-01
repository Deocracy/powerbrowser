#!/usr/bin/env node
// scripts/verify-trademark-surface.mjs
//
// Trademark-surface gate (06-03): the mechanical half of the brand review.
// The human ritual lives in brand/HUMAN-REVIEW.md; this script proves the
// four mechanical assertions around it. Every expectation is DERIVED at
// check time -- from `git ls-files`, from configuration.toml through
// scripts/generate.mjs's own resolver, and from the review record itself --
// never kept here:
//
//  1. Trademark-asset walk: the set of tracked files matching trademark
//     asset shapes (upstream logo basenames, compiled asset catalogs,
//     installer logo payloads, tracked icon files outside the generator's
//     gitignored output) must equal the empty set. A hit fails naming the
//     path and the shape. The derived icon rasters under the tracked
//     branding directories are display PNGs, not logo payloads, and match
//     no shape below.
//  2. Display-field scan: the emitted branding surfaces (per-variant
//     brand.ftl and brand.properties, the generated theia fragments, the
//     Name lines of the desktop entries) must carry no Firefox or Mozilla
//     token by boundary match. Matching reuses findMatches from
//     scripts/scan-brand-residue.mjs; there is no second local copy of
//     that rule. Three anchored line exclusions with reasons cover the
//     required MPL license header and the single ratified frozen compat
//     term plus its rationale comment -- everything else with a token is
//     a failure naming file and line. Desktop entries are scanned on
//     Name lines only: their MimeType lines legitimately name a plugin
//     MIME type and are out of scope.
//  3. Legal-keys presence: license, copyright_holder, and trademark_notice
//     in configuration.toml must each be non-empty. Read through
//     resolveConfig, so a manifest that cannot even resolve fails here
//     naming the key rather than passing vacuously.
//  4. Review agreement: the brand/ directory listing at check time must
//     equal the signed list parsed from brand/HUMAN-REVIEW.md as set
//     equality, so a newly added brand/ file fails naming it until the
//     ritual is re-recorded -- and a removed one fails too, since a
//     record that reviews a file no longer on disk proves nothing. The
//     record lists itself (verdict RECORD) so the set can close: a record
//     that did not list itself could never agree with its own directory.
//
// Untracked files are invisible to the asset walk: the scope comes from
// `git ls-files`, so stage before trusting a green run -- the same trap
// the residue scan documents. The brand/ listing, in contrast, is read
// from the directory itself, so an uncommitted addition still fails the
// review agreement.
//
// The generated (emitted) surfaces are gitignored and therefore absent on
// every fresh clone: a missing emitted surface skips with a note, while a
// missing TRACKED comparand is a defect and fails. The byte-identity gate
// proves emitted equals tracked, so the tracked surface carries the
// assertion where the emitted one is absent.
//
// Honestly --quick: reads text files off disk only. No build, no browser,
// no display, no network.
//
// Threat T-06-03 (brand/ review provenance): the named reviewer plus date
// live in brand/HUMAN-REVIEW.md; this script's review-agreement section is
// the enforcement that fails on any unlisted brand/ file.
//
// Usage:
//   node scripts/verify-trademark-surface.mjs
//   node scripts/verify-trademark-surface.mjs --self-test
//
// The self-test runs hermetic mkdtemp fixtures through the checker's own
// checkTree function (never the real tree): the unplanted control goes
// green first, then four planted faults -- an asset basename, a
// display-field token, an emptied legal key, an unlisted brand file --
// each go red naming the drift. Every verdict below is a count or set
// comparison with the compared values named; nothing asserts on the
// absence of a log line.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, MOZILLA_NON_ASSOCIATION_TAIL } from './generate.mjs';
import { findMatches } from './scan-brand-residue.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-trademark-surface';
const MANIFEST_REL = 'configuration.toml';
const REVIEW_REL = 'brand/HUMAN-REVIEW.md';
const BRAND_DIR_REL = 'brand';

// ---------------------------------------------------------------------------
// Trademark-asset shapes. Each entry carries a one-line reason; the startup
// assertion below fails the run when any entry lacks one. Shapes match the
// upstream logo payloads this tree must never carry -- never the derived
// icon rasters (defaultNN.png) the tracked branding directories hold.
// ---------------------------------------------------------------------------

const ASSET_SHAPES = [
  {
    id: 'moz-logo-basename',
    test: (rel) => /^moz(illa)?([._-].*)?\.png$/i.test(basename(rel)),
    reason: 'upstream logo basenames arrive as bare moz*.png payloads, never as the derived defaultNN.png rasters',
  },
  {
    id: 'compiled-catalog',
    test: (rel) => /\.car$/i.test(basename(rel)),
    reason: 'compiled asset catalogs are the macOS logo container; this tree carries no .car file',
  },
  {
    id: 'installer-payload',
    test: (rel) => /(^|\/)(msix|appx)[^/]*\//i.test(rel) && /\.(png|ico|icns|jpg|jpeg|bmp)$/i.test(rel),
    reason: 'installer logo payloads live under msix/appx asset directories as image files',
  },
  {
    id: 'tracked-icon',
    test: (rel) => /\.(icns|ico)$/i.test(basename(rel)),
    reason: 'icon binaries are generator output and therefore gitignored; any tracked one is a foreign payload',
  },
];

// ---------------------------------------------------------------------------
// Display-field tokens and anchored line exclusions. Tokens are matched
// case-sensitively through the reused boundary rule (title and lower are
// two different tokens, never one case-insensitive search). Each exclusion
// carries a one-line reason; the startup assertion fails without it.
// ---------------------------------------------------------------------------

const DISPLAY_TOKENS = [
  { token: 'Firefox', caseForm: 'title' },
  { token: 'Mozilla', caseForm: 'title' },
  { token: 'firefox', caseForm: 'lower' },
  { token: 'mozilla', caseForm: 'lower' },
];

const DISPLAY_LINE_EXCLUSIONS = [
  {
    id: 'mpl-header',
    test: (line) => line.includes('Mozilla Public') || line.includes('mozilla.org/MPL'),
    reason: 'the required MPL license header names the license steward; it is license text, not a display field',
  },
  {
    id: 'frozen-product-term',
    test: (line) => /^-brand-product-name\s*=\s*Firefox\s*$/.test(line),
    reason: 'the single ratified frozen compat term: compatibility strings interpolate this one term unchanged',
  },
  {
    id: 'frozen-term-rationale',
    test: (line) => line.includes('D-78'),
    reason: 'the comment recording why the frozen term stays; it cites the decision, not a display value',
  },
  {
    id: 'mandated-legal-notice',
    test: (line) => line.includes(MOZILLA_NON_ASSOCIATION_TAIL),
    reason: 'the About-dialog legal-notice channel must name the upstream project in words per the 06-03 primary-source basis (an equally prominent non-association statement); excluded only by the emitter-fixed full tail imported from the generator, so a bare token on any other line still goes red',
  },
];

// Generated theia fragments: the generator's documented fragment names.
// Checked when present on disk, skipped with a note when absent (fresh
// clones carry no generated/ tree at all).
const THEIA_FRAGMENTS = ['generated/theia-branding.json', 'generated/theia-frontend-config.json'];

function assertTableReasons() {
  const missing = [];
  for (const e of ASSET_SHAPES) if (!e.reason) missing.push(`asset shape ${JSON.stringify(e.id)}`);
  for (const e of DISPLAY_LINE_EXCLUSIONS) if (!e.reason) missing.push(`line exclusion ${JSON.stringify(e.id)}`);
  if (missing.length > 0) {
    return [`the exclusion tables carry ${missing.length} entr(ies) with no one-line reason (${missing.join(', ')}) -- an unexplained exclusion is a hole. Next step: give each entry its reason in scripts/verify-trademark-surface.mjs, then re-run this check.`];
  }
  return [];
}

function isExcludedDisplayLine(lineText) {
  return DISPLAY_LINE_EXCLUSIONS.some((e) => e.test(lineText));
}

/**
 * Tracked display surfaces that must exist: per-variant brand.ftl and
 * brand.properties under the manifest's own branding_dir values, plus the
 * desktop entries found in the tracked tree at check time (never a
 * hand-kept list). Emitted (generated/) twins are returned separately and
 * checked only when present on disk.
 */
function deriveDisplaySurfaces(config, trackedFiles) {
  const required = [];
  for (const variant of config?.variants ?? []) {
    const dir = variant?.branding_dir;
    if (typeof dir !== 'string' || dir === '') continue;
    required.push(`${dir}/locales/en-US/brand.ftl`);
    required.push(`${dir}/locales/en-US/brand.properties`);
  }
  const desktops = trackedFiles.filter((f) => f.startsWith('powerbrowser/') && f.endsWith('.desktop'));
  return { required, desktops };
}

/**
 * The reviewed list parsed from the review record: first-column `brand/…`
 * entries of the per-file table. Returns { reviewed, failures } so a
 * record with no parseable table is a named failure, never a vacuous pass.
 */
function parseReviewedList(reviewText) {
  const reviewed = [];
  for (const line of reviewText.split('\n')) {
    const m = /^\|\s*`?(brand\/\S+?)`?\s*\|/.exec(line);
    if (m) reviewed.push(m[1]);
  }
  if (reviewed.length === 0) {
    return {
      reviewed,
      failures: [
        `${REVIEW_REL} carries no parseable reviewed-files table (no first-column brand/… row) -- an empty reviewed set would agree with nothing and prove nothing. Next step: record every file under brand/ as a table row in ${REVIEW_REL}, then re-run this check.`,
      ],
    };
  }
  return { reviewed, failures: [] };
}

/**
 * THE gate over an explicit file set, so the self-test can drive fixtures
 * without touching the real tree. `files` are repo- or fixture-relative
 * tracked paths; brand/ is listed from disk under `root`. Returns failures
 * plus the counts the PASS line reports.
 */
export function checkTree({ root, files, manifestRel, reviewRel, brandDirRel }) {
  const failures = [];
  const skipped = [];

  if (root === REPO_ROOT) failures.push(...assertTableReasons());

  if (files.length === 0) {
    failures.push('the tracked file set is empty -- an empty scope scans nothing and would pass any tree. Next step: run from the repo root so `git ls-files` reports the tree, then re-run this check.');
  }

  // Section 1: trademark-asset walk over the tracked set.
  for (const file of files) {
    for (const shape of ASSET_SHAPES) {
      if (shape.test(file)) {
        failures.push(`${file} matches trademark-asset shape '${shape.id}' (${shape.reason}). Next step: remove the foreign payload, then re-run this check.`);
      }
    }
  }

  // Manifest resolution feeds sections 2 (variant surfaces) and 3 (legal).
  const { failures: resolveFailures, config } = resolveConfig(join(root, manifestRel), undefined);
  if (resolveFailures.length > 0) {
    for (const f of resolveFailures) failures.push(`${manifestRel} is red, so the trademark gate proves nothing: ${f}`);
  } else {
    // Section 3: legal-keys presence, each non-empty.
    for (const key of ['license', 'copyright_holder', 'trademark_notice']) {
      const value = config?.legal?.[key];
      if (typeof value !== 'string' || value.trim() === '') {
        failures.push(`legal.${key} in ${manifestRel} is empty -- a downstream shipping without it inherits this project's legal identity by default. Next step: give legal.${key} a value in ${manifestRel}, then re-run this check.`);
      }
    }

    // Section 2: display-field scan over the derived surfaces.
    const { required, desktops } = deriveDisplaySurfaces(config, files);
    if (required.length === 0) {
      failures.push(`derived zero display surfaces from ${manifestRel} -- an empty surface set scans nothing and would pass any tree. Next step: check that [[variants]] entries carry branding_dir, then re-run this check.`);
    }
    const scanFile = (rel, lineScope) => {
      let text;
      try {
        text = readFileSync(join(root, rel), 'utf8');
      } catch (err) {
        failures.push(`${rel} could not be read (${err.code ?? err.message}) -- an unreadable surface is not a clean surface. Next step: restore it from version control, then re-run this check.`);
        return;
      }
      text.split('\n').forEach((lineText, index) => {
        if (lineScope === 'name-lines' && !/^Name[^=]*=/.test(lineText)) return;
        if (isExcludedDisplayLine(lineText)) return;
        for (const { token, caseForm } of DISPLAY_TOKENS) {
          if (findMatches(lineText, token, caseForm).length > 0) {
            failures.push(`${rel}:${index + 1}: display surface carries the token ${JSON.stringify(token)} outside the anchored exclusions. Next step: derive the display value from ${manifestRel} instead, or record the line as an anchored exclusion with a one-line reason in scripts/verify-trademark-surface.mjs, then re-run this check.`);
            return;
          }
        }
      });
    };
    for (const rel of required) {
      if (!existsSync(join(root, rel))) {
        failures.push(`${rel} is a manifest-derived display surface but is missing on disk -- a missing surface is not a clean surface. Next step: restore it, then re-run this check.`);
        continue;
      }
      scanFile(rel, 'all-lines');
    }
    // Emitted twins: checked when the generate step has run, skipped (named)
    // when the tree was never generated -- a tree that never generated
    // cannot disagree with itself, and the tracked comparand above already
    // carries the assertion.
    for (const variant of config?.variants ?? []) {
      if (typeof variant?.id !== 'string' || variant.id === '') continue;
      for (const base of ['locales/en-US/brand.ftl', 'locales/en-US/brand.properties']) {
        const rel = `generated/branding/${variant.id}/${base}`;
        if (existsSync(join(root, rel))) scanFile(rel, 'all-lines');
        else skipped.push(rel);
      }
    }
    for (const rel of THEIA_FRAGMENTS) {
      if (existsSync(join(root, rel))) scanFile(rel, 'all-lines');
      else skipped.push(rel);
    }
    for (const rel of desktops) scanFile(rel, 'name-lines');
  }

  // Section 4: review agreement -- brand/ on disk versus the record, as
  // set equality in both directions.
  let brandOnDisk = null;
  try {
    brandOnDisk = readdirSync(join(root, brandDirRel))
      .filter((name) => {
        try {
          return statSync(join(root, brandDirRel, name)).isFile();
        } catch {
          return false;
        }
      })
      .map((name) => `${brandDirRel}/${name}`)
      .sort();
  } catch (err) {
    failures.push(`${brandDirRel}/ could not be listed (${err.code ?? err.message}) -- an unreadable brand directory proves nothing. Next step: restore it, then re-run this check.`);
  }
  let reviewText = null;
  try {
    reviewText = readFileSync(join(root, reviewRel), 'utf8');
  } catch (err) {
    failures.push(`${reviewRel} could not be read (${err.code ?? err.message}) -- without the review record the brand/ provenance proves nothing. Next step: restore it, then re-run this check.`);
  }
  if (brandOnDisk !== null && reviewText !== null) {
    const { reviewed, failures: parseFailures } = parseReviewedList(reviewText);
    failures.push(...parseFailures);
    const reviewedSet = new Set(reviewed);
    for (const onDisk of brandOnDisk) {
      if (!reviewedSet.has(onDisk)) {
        failures.push(`${onDisk} is in ${brandDirRel}/ but not in the reviewed list in ${reviewRel} -- an unreviewed brand file ships in every downstream. Next step: perform the human review ritual for it and re-record ${reviewRel}, then re-run this check.`);
      }
    }
    const onDiskSet = new Set(brandOnDisk);
    for (const signed of reviewed) {
      if (!onDiskSet.has(signed)) {
        failures.push(`${signed} is in the reviewed list in ${reviewRel} but not in ${brandDirRel}/ -- a record reviewing a file no longer on disk proves nothing. Next step: re-record ${reviewRel} against the current listing, then re-run this check.`);
      }
    }
  }

  const surfaceCount =
    config && resolveFailures.length === 0
      ? deriveDisplaySurfaces(config, files).required.length +
        deriveDisplaySurfaces(config, files).desktops.length
      : 0;
  return { failures, scanned: files.length, surfaces: surfaceCount, skipped };
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function main() {
  const { failures, scanned, surfaces, skipped } = checkTree({
    root: REPO_ROOT,
    files: listTrackedFiles(),
    manifestRel: MANIFEST_REL,
    reviewRel: REVIEW_REL,
    brandDirRel: BRAND_DIR_REL,
  });
  if (failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${failures.length} problem(s) across ${scanned} tracked file(s)`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  const skipNote = skipped.length > 0 ? `, ${skipped.length} emitted surface(s) skipped (never generated: ${skipped.join(', ')})` : '';
  console.log(`${NAME}: PASS -- ${scanned} tracked file(s) carry no trademark asset, ${surfaces} display surface(s) clean, legal keys present, brand/ reviewed list agrees${skipNote}`);
}

// ---------------------------------------------------------------------------
// Self-test: hermetic fixtures through checkTree, green control first.
// ---------------------------------------------------------------------------

const FIXTURE_MANIFEST = [
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
  'theia_release = "9.9.9"',
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
].join('\n');

const FIXTURE_FTL = [
  '# This Source Code Form is subject to the terms of the Mozilla Public',
  '# License, v. 2.0. If a copy of the MPL was not distributed with this',
  '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
  '# Kept at the frozen compat term per D-78 for compatibility strings.',
  // The frozen term below is spelled without inner spaces deliberately:
  // the residue inventory counts the spaced frozen-term literal, and this
  // fixture must not perturb that count. The \s* in the frozen-term anchor
  // still matches this form, so the exclusion path stays exercised.
  '-brand-shorter-name = Acme Browser',
  '-brand-full-name = Acme Browser Dev',
  '-brand-product-name=Firefox',
  '-vendor-short-name = Acme Works',
  '',
].join('\n');

const FIXTURE_PROPERTIES = [
  '# This Source Code Form is subject to the terms of the Mozilla Public',
  '# License, v. 2.0. If a copy of the MPL was not distributed with this',
  '# file, You can obtain one at http://mozilla.org/MPL/2.0/.',
  'brandFullName=Acme Browser Dev',
  '',
].join('\n');

const FIXTURE_DESKTOP = [
  '[Desktop Entry]',
  'Name=Acme Browser Dev',
  'Exec=acme-browser %u',
  'MimeType=text/html;application/vnd.mozilla.xul+xml;',
  '',
].join('\n');

const FIXTURE_REVIEW = [
  '# Fixture review record',
  '',
  '| File | Reviewer | Date | Verdict |',
  '| ---- | -------- | ---- | ------- |',
  '| `brand/mark.svg` | Fixture Reviewer | 2026-09-04 | CONFIRMED |',
  '| `brand/HUMAN-REVIEW.md` | Fixture Reviewer | 2026-09-04 | RECORD |',
  '',
].join('\n');

const FIXTURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n';

// An emitted branding fragment carrying the legal-notice channel (06-04).
// The Mozilla sentence is composed from the generator's own tail const --
// derived, never restated -- so the exclusion and the emitter cannot drift
// into disagreeing about the mandated shape. Fixture values stay in the
// Acme namespace like every other fixture in this file.
const FIXTURE_BRANDING_FRAGMENT = [
  '{',
  '  "welcomeText": null,',
  '  "aboutText": null,',
  '  "repoUrl": "https://example.org/support",',
  '  "markSvg": "<svg></svg>",',
  '  "legalNotices": [',
  '    "Acme Browser is a trademark of Acme Works.",',
  `    "Acme Browser Dev ${MOZILLA_NON_ASSOCIATION_TAIL}",`,
  '    "This product (example.org) includes Eclipse Theia, a trademark of Eclipse Foundation AISBL."',
  '  ]',
  '}',
  '',
].join('\n');

function controlFiles() {
  return {
    [MANIFEST_REL]: FIXTURE_MANIFEST,
    'brand/mark.svg': FIXTURE_SVG,
    [REVIEW_REL]: FIXTURE_REVIEW,
    'powerbrowser/branding/dev/locales/en-US/brand.ftl': FIXTURE_FTL,
    'powerbrowser/branding/dev/locales/en-US/brand.properties': FIXTURE_PROPERTIES,
    'powerbrowser/branding/release/locales/en-US/brand.ftl': FIXTURE_FTL.replace('Acme Browser Dev', 'Acme Browser'),
    'powerbrowser/branding/release/locales/en-US/brand.properties': FIXTURE_PROPERTIES.replace('Acme Browser Dev', 'Acme Browser'),
    'powerbrowser/powerbrowser.desktop': FIXTURE_DESKTOP,
  };
}

function fixtureRoot(extraFiles) {
  const dir = mkdtempSync(join(tmpdir(), 'trademark-surface-selftest-'));
  const all = { ...controlFiles(), ...extraFiles };
  for (const [rel, content] of Object.entries(all)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return { dir, files: Object.keys(all) };
}

function selfTest() {
  let failed = 0;
  const dirs = [];
  const complain = (name, why) => {
    console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
    failed += 1;
  };

  // Green control first: exclusions exercised (MPL header, frozen term and
  // its rationale, MimeType scope) with nothing planted. A red control
  // would make every plant below prove nothing.
  {
    const { dir, files } = fixtureRoot({});
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    if (failures.length > 0) {
      complain('unmutated control', `is already red, so the plants below would mean nothing: ${failures.join(' | ')}`);
    } else {
      console.log('  ok  unmutated control -> exclusions hold, everything green');
    }
  }

  // Plant 1: a trademark-asset basename goes red naming the path and shape.
  {
    const { dir, files } = fixtureRoot({ 'thirdparty/moz.png': 'binary-bytes\n' });
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    const hit = failures.find((f) => f.includes('thirdparty/moz.png') && f.includes('moz-logo-basename'));
    if (!hit) {
      complain('planted asset basename', `did not go red naming path and shape; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  planted asset basename -> red, naming thirdparty/moz.png and the shape');
    }
  }

  // Plant 2: a display-field token goes red naming the file and line.
  {
    const drifted = `${FIXTURE_FTL}-brand-extra = Visit Firefox today\n`;
    const { dir, files } = fixtureRoot({ 'powerbrowser/branding/dev/locales/en-US/brand.ftl': drifted });
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    const hit = failures.find((f) => f.includes('powerbrowser/branding/dev/locales/en-US/brand.ftl') && f.includes('"Firefox"'));
    if (!hit) {
      complain('planted display-field token', `did not go red naming file and token; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  planted display-field token -> red, naming the ftl file and the token');
    }
  }

  // Plant 3: an emptied legal key goes red naming the key.
  {
    const driftedManifest = FIXTURE_MANIFEST.replace('license = "MIT"', 'license = ""');
    const { dir, files } = fixtureRoot({ [MANIFEST_REL]: driftedManifest });
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    if (!failures.some((f) => f.includes('legal.license'))) {
      complain('emptied legal key', `did not go red naming the key; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  emptied legal key -> red, naming legal.license');
    }
  }

  // Plant 4: an unlisted brand file goes red naming it.
  {
    const { dir, files } = fixtureRoot({ 'brand/extra.svg': FIXTURE_SVG });
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    const hit = failures.find((f) => f.includes('brand/extra.svg'));
    if (!hit) {
      complain('unlisted brand file', `did not go red naming the file; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  unlisted brand file -> red, naming brand/extra.svg');
    }
  }

  // Plant 5 (06-04): the mandated legal-notice sentence in an emitted
  // fragment stays green through the anchored exclusion, while a bare
  // token on a non-notice line still goes red -- proving the exclusion is
  // the sentence shape, not the token.
  {
    const { dir, files } = fixtureRoot({ 'generated/theia-branding.json': FIXTURE_BRANDING_FRAGMENT });
    dirs.push(dir);
    const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
    if (failures.length > 0) {
      complain('mandated legal-notice sentence', `was not excluded; got: ${failures.join(' | ')}`);
    } else {
      console.log('  ok  mandated legal-notice sentence -> excluded, fragment green');
    }
  }
  {
    const drifted = FIXTURE_BRANDING_FRAGMENT.replace(
      `Acme Browser Dev ${MOZILLA_NON_ASSOCIATION_TAIL}`,
      'Acme Browser Dev ships with Mozilla technology.',
    );
    if (drifted === FIXTURE_BRANDING_FRAGMENT) {
      complain('bare token outside the notice', 'planted no fault at all: the drift did not land');
    } else {
      const { dir, files } = fixtureRoot({ 'generated/theia-branding.json': drifted });
      dirs.push(dir);
      const { failures } = checkTree({ root: dir, files, manifestRel: MANIFEST_REL, reviewRel: REVIEW_REL, brandDirRel: BRAND_DIR_REL });
      const hit = failures.find((f) => f.includes('generated/theia-branding.json') && f.includes('"Mozilla"'));
      if (!hit) {
        complain('bare token outside the notice', `did not go red naming file and token; got: ${failures.join(' | ') || '(no failures at all)'}`);
      } else {
        console.log('  ok  bare token outside the notice -> red, naming the fragment file and the token');
      }
    }
  }

  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

  if (failed > 0) return 1;
  console.log(`${NAME}: --self-test PASS -- 5 planted faults all behaved as pinned`);
  return 0;
}

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
  if (a !== '--self-test') {
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    process.exit(2);
  }
}

if (SELF_TEST) {
  process.exit(selfTest());
} else {
  main();
}
