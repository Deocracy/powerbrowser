#!/usr/bin/env node
// scripts/verify-manifest-literals.mjs
//
// VER-01, static layer (06-01): the configured display strings must not be
// hardcoded outside the manifest-owned surfaces. The residue scan covers the
// originating product's pre-rename tokens and check-patch-surface covers
// patches/; nothing covered this project's own display values leaking into
// hand-written files. This check closes that gap without duplicating either
// one: it never names the originating product's tokens and never reads
// patches/.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time -- from
// configuration.toml through scripts/generate.mjs's own resolver -- never
// kept here:
//
//  1. The literal set is derived per run: one MULTI-WORD full display
//     string per [[variants]] entry (identity.display_name plus that
//     variant's name_suffix), product.vendor_display, and
//     legal.trademark_notice -- each only when it carries whitespace (see
//     deriveLiterals). Single-token values are not boundary-distinguishable
//     from identifier text: since NAME-01 the release display form IS the
//     identifier prefix, so scanning for it would flag every
//     `PowerBrowserAPI`, every prose mention, and every doc title in the
//     tree. The dev composition (base plus suffix) stays fully covered,
//     and the hand-written display files stay pinned exactly -- value by
//     value, both variants -- by scripts/verify-branding-preflight.mjs
//     sections 2-4, which compare each term rather than scanning for it.
//     Fixed internal identifiers (app_basename, binary_name, remoting_name,
//     vendor_machine) are deliberately NOT in the set: they are
//     platform-fixed, occur legitimately everywhere, and are out of scope.
//  2. The scope is derived per run: `git ls-files` minus the committed
//     exclusion tables below. A new tracked file is scanned with no edit.
//  3. Outside the exclusions, any boundary-matched literal occurrence is a
//     failure naming file, line, and value. Matching reuses the boundary
//     rule exported by scripts/scan-brand-residue.mjs (findMatches, which
//     applies isBoundaryMatch per occurrence); a second local copy of that
//     rule would be a defect, so there is none here.
//  4. The committed allowlist names the legitimate carriers. Each entry is
//     keyed by derivation SLOT (a manifest path or variant role), never by
//     literal value, so this file keeps no display string: the value an
//     entry covers is resolved from the manifest at check time. An entry is
//     stale -- and fails naming the entry -- when its slot no longer
//     derives a value (removed literal), its file carries no occurrence of
//     that value (rewritten clean), or its file left the scope (deleted).
//  5. Non-vacuity, each with its own message: an empty derived literal
//     set, an empty scope, and an empty allowlist table each fail rather
//     than pass.
//
// THE EXCLUSION TABLES. Every entry carries a one-line reason; startup
// asserts that and refuses to run without it. A file that only exists as
// derived output, a foreign tree, the value source, or history is excluded
// by path; the single legal-notice line is excluded by line anchor.
//
// Untracked files are invisible to this check: the scope comes from `git
// ls-files`, so stage before trusting a green run -- the same trap the
// residue scan documents.
//
// Honestly --quick: it reads text files off disk only. No build, no
// browser, no display, no network.
//
// Threat T-06-01 (manifest values as opaque strings): derived values flow
// only through the indexOf-based findMatches imported above. This file
// builds no RegExp from a manifest value and interpolates no value into
// shell -- there is nothing to escape because there is no interpolation
// sink. Values reach messages through JSON.stringify only.
//
// Usage:
//   node scripts/verify-manifest-literals.mjs
//   node scripts/verify-manifest-literals.mjs --self-test
//
// The self-test runs hermetic mkdtemp fixtures through the checker's own
// checkTree function (never the real tree): the unplanted control goes
// green first, then a planted display literal goes red naming file and
// value, an identifier-form control stays green proving the boundary rule,
// and one stale allowlist entry of each kind (slot gone from the derived
// set, file rewritten clean, file deleted) goes red naming the entry.
// A single-word display name derives no release literal at all (the
// single-token rule), proved by derivation assertion plus an
// identifier-led control that stays green with no allowlist entry.
// Every verdict below is a count or set comparison with the compared
// values named; nothing asserts on the absence of a log line.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { findMatches } from './scan-brand-residue.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-manifest-literals';
const MANIFEST_REL = 'configuration.toml';

// Boundary form for display strings: title-case values match between
// non-token characters, with a lowercase-or-digit join on the right refused
// (so a trailing plural is not a match) and any letter-or-digit join on the
// left refused. Passed through to the reused matcher; never reimplemented.
const CASE_FORM = 'title';

// ---------------------------------------------------------------------------
// Committed exclusion map. Each entry carries a one-line reason; the startup
// assertion below fails the run when any entry lacks one.
// ---------------------------------------------------------------------------

const EXCLUDED_PREFIXES = [
  { prefix: 'generated/', reason: 'emitted output, never hand-edited; covered by generate-check and byte-identity instead' },
  { prefix: 'upstream/', reason: 'foreign Gecko checkout; brand probes there belong to the rebase gate, not the tracked tree' },
  { prefix: 'objdir', reason: 'build trees (dev and release objdirs); derived artifacts, never sources' },
  { prefix: '.planning/', reason: 'historical phase record; renaming there would rewrite history rather than fix a leak' },
];

const EXCLUDED_FILES = [
  { path: 'configuration.toml', reason: 'the value source itself; literals here are the derivation input, not a leak' },
  { path: 'inventory/brand-tokens.json', reason: 'the one file allowed to name the originating product; its target strings carry the display form' },
  { path: 'docs/REBRANDING.md', reason: 'the documenting surface; it must show the values to explain them' },
  { path: 'LICENSING.md', reason: 'derived output of scripts/generate-licensing.mjs from configuration.toml and upstream sources; pinned by the licensing row' },
  { path: 'THIRD-PARTY-NOTICES.txt', reason: 'derived output of scripts/generate-licensing.mjs from configuration.toml and upstream sources; pinned by the licensing row' },
];

const EXCLUDED_LINES = [
  { file: 'LICENSE', contains: 'Required Notice:', reason: 'the copyright-holder notice names the holder and product once; owned by legal, not the build' },
];

// ---------------------------------------------------------------------------
// Committed allowlist: derivation slot plus file plus one-line reason. The
// slot names a manifest source (variant role or dotted key); the literal it
// covers is resolved from the manifest at check time, so no display string
// is kept in this table. A file carrying two slots needs both rows.
// ---------------------------------------------------------------------------

const ALLOWLIST = [
  { slot: 'product.vendor_display', file: 'README.md', reason: 'readme footer attributing the project to the foundation' },
  { slot: 'variant-display:dev', file: 'docs/BUILD.md', reason: 'build-guide prose quoting the dev display composition' },
  { slot: 'variant-display:dev', file: 'powerbrowser/branding/dev/configure.sh', reason: 'hand-written dev display name; byte-identity comparand owned by the manifest' },
  { slot: 'variant-display:dev', file: 'powerbrowser/branding/dev/locales/en-US/brand.ftl', reason: 'hand-written dev full-name term; byte-identity comparand owned by the manifest' },
  { slot: 'product.vendor_display', file: 'powerbrowser/branding/dev/locales/en-US/brand.ftl', reason: 'hand-written vendor short-name term owned by the manifest' },
  { slot: 'variant-display:dev', file: 'powerbrowser/branding/dev/locales/en-US/brand.properties', reason: 'hand-written dev full-name key; byte-identity comparand owned by the manifest' },
  { slot: 'variant-display:dev', file: 'powerbrowser/powerbrowser.desktop', reason: 'hand-written dev desktop entry name owned by the manifest' },
  { slot: 'product.vendor_display', file: 'scripts/check-patch-surface.sh', reason: 'comment on longest-first ordering against the vendor prefix' },
  { slot: 'variant-display:dev', file: 'scripts/generate.mjs', reason: 'generator self-test fixture carrying the derived dev form' },
  { slot: 'variant-display:dev', file: 'scripts/rename-brand.mjs', reason: 'rename header documenting the token-boundary trap with the dev composition' },
  { slot: 'variant-display:dev', file: 'scripts/verify-branding-preflight.mjs', reason: 'preflight comments and plants quoting the dev derivation chain' },
  { slot: 'variant-display:dev', file: 'scripts/verify-manifest-literals.mjs', reason: 'contract comment quoting the dev composition the single-token rule exists to protect' },
  { slot: 'variant-display:dev', file: 'scripts/verify-platform.sh', reason: 'registry self-test fixtures writing dev brandFullName values' },
  { slot: 'variant-display:dev', file: 'theia/applications/browser/package.json', reason: 'mozilla non-association sentence carrying the dev composition; copy-over target owned by the manifest' },
  { slot: 'product.vendor_display', file: 'theia/applications/browser/package.json', reason: 'own-trademark notice naming the holder; fallback owned by the generator derivation' },
  { slot: 'legal.trademark_notice', file: 'theia/applications/browser/package.json', reason: 'own-trademark notice fallback owned by the generator derivation' },
  { slot: 'variant-display:dev', file: 'theia/extensions/branding/src/browser/powerbrowser-about-dialog.tsx', reason: 'mozilla non-association fallback sentence carrying the dev composition' },
  { slot: 'product.vendor_display', file: 'theia/extensions/branding/src/browser/powerbrowser-about-dialog.tsx', reason: 'own-trademark notice naming the holder; fallback owned by the generator derivation' },
  { slot: 'legal.trademark_notice', file: 'theia/extensions/branding/src/browser/powerbrowser-about-dialog.tsx', reason: 'own-trademark notice fallback owned by the generator derivation' },
  { slot: 'product.vendor_display', file: 'theia/extensions/branding/src/browser/powerbrowser-welcome-widget.tsx', reason: 'comment recording why the inherited org URL was replaced' },
  { slot: 'product.vendor_display', file: 'powerbrowser/branding/release/locales/en-US/brand.ftl', reason: 'hand-written vendor short-name term owned by the manifest' },
  { slot: 'product.vendor_display', file: 'website-staging/index.html', reason: 'public home page footer: the non-association sentence, verbatim copy the manifest owns' },
  { slot: 'product.vendor_display', file: 'website-staging/download.html', reason: 'public download page footer: the non-association sentence, verbatim copy the manifest owns' },
  { slot: 'product.vendor_display', file: 'website-staging/privacy.html', reason: 'public privacy page footer: the non-association sentence, verbatim copy the manifest owns' },
  { slot: 'product.vendor_display', file: 'website-staging/legal.html', reason: 'public legal page: the copyright holder line and the non-association footer, verbatim copy the manifest owns' },
  { slot: 'legal.trademark_notice', file: 'website-staging/legal.html', reason: 'public legal page trademark line, verbatim copy of the manifest legal value' },
  { slot: 'product.vendor_display', file: 'ledger/history/log.jsonl', reason: 'append-only delivery-kit ledger log; record-fail stores failing check output verbatim, and branding checks print the configured values' },
];

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
  if (a !== '--self-test') {
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    process.exit(2);
  }
}

function assertExclusionReasons() {
  const missing = [];
  for (const e of EXCLUDED_PREFIXES) if (!e.reason) missing.push(`prefix ${JSON.stringify(e.prefix)}`);
  for (const e of EXCLUDED_FILES) if (!e.reason) missing.push(`file ${JSON.stringify(e.path)}`);
  for (const e of EXCLUDED_LINES) if (!e.reason) missing.push(`line rule ${JSON.stringify(e.file)}`);
  if (missing.length > 0) {
    return [`the exclusion map carries ${missing.length} entr(ies) with no one-line reason (${missing.join(', ')}) -- an unexplained exclusion is a hole. Next step: give each entry its reason in scripts/verify-manifest-literals.mjs, then re-run this check.`];
  }
  return [];
}

function isExcludedFile(file) {
  if (EXCLUDED_FILES.some((e) => e.path === file)) return true;
  return EXCLUDED_PREFIXES.some((e) => file === e.prefix || file.startsWith(e.prefix));
}

function isExcludedLine(file, lineText) {
  return EXCLUDED_LINES.some((e) => e.file === file && lineText.includes(e.contains));
}

/**
 * The derived literal set: one full display string per variant (base name
 * plus that variant's suffix), the vendor display string, and the trademark
 * notice. Empty or non-string values are dropped so the non-vacuity guard
 * below sees a missing derivation rather than an empty match-everything.
 *
 * SINGLE-TOKEN VALUES ARE NEVER DERIVED, whichever slot states them. The
 * boundary rule this check reuses (findMatches) refuses a lowercase-or-digit
 * join on the right but allows an uppercase one, and refuses nothing on
 * prose boundaries -- so a one-word value matches every identifier it
 * prefixes (`PowerBrowserAPI`) and every prose mention (`Customizing
 * PowerBrowser`). Scanning for such a value would either flag the whole
 * tree or, once allowlisted file by file, guard nothing: any genuine leak
 * in an allowlisted file would be invisible. Multi-word values do not have
 * this problem -- no identifier spells `PowerBrowser Dev` -- so they carry
 * the gate. (Since NAME-01 the release display form is the single word
 * `PowerBrowser`: its occurrences are pinned exactly, term by term, by
 * verify-branding-preflight.mjs sections 2-4 instead.)
 */
export function deriveLiterals(config) {
  const out = [];
  const keep = (value) => typeof value === 'string' && value !== '' && /\s/.test(value);
  const base = config?.identity?.display_name;
  for (const variant of config?.variants ?? []) {
    const value = `${base ?? ''}${variant?.name_suffix ?? ''}`;
    if (typeof base === 'string' && base !== '' && typeof variant?.name_suffix === 'string' && keep(value)) {
      out.push({ slot: `variant-display:${variant.id}`, value });
    }
  }
  if (keep(config?.product?.vendor_display)) {
    out.push({ slot: 'product.vendor_display', value: config.product.vendor_display });
  }
  if (keep(config?.legal?.trademark_notice)) {
    out.push({ slot: 'legal.trademark_notice', value: config.legal.trademark_notice });
  }
  return out;
}

/**
 * The three non-vacuity guards as a pure function of what was derived, so
 * the self-test can plant each empty and require its own distinct message.
 */
export function vacuityFailures(literals, scoped, allowlist) {
  const failures = [];
  if (literals.length === 0) {
    failures.push(
      `derived zero display literals from ${MANIFEST_REL} -- an empty literal set matches nothing and would pass any tree. Next step: check that identity.display_name, variants[].name_suffix, product.vendor_display and legal.trademark_notice resolve, then re-run this check.`,
    );
  }
  if (scoped.length === 0) {
    failures.push(
      'the scoped file set is empty (every tracked file excluded) -- an empty scope scans nothing and would pass any tree. Next step: check the exclusion tables in scripts/verify-manifest-literals.mjs for an over-broad prefix, then re-run this check.',
    );
  }
  if (allowlist.length === 0) {
    failures.push(
      'the committed allowlist table is empty -- with no legitimate carrier named, a clean result would prove the scan ran over nothing it could ever flag. Next step: record the legitimate carriers as {slot, file} rows in scripts/verify-manifest-literals.mjs, then re-run this check.',
    );
  }
  return failures;
}

/**
 * THE gate over an explicit file set, so the self-test can drive fixtures
 * without touching the real tree. `files` are repo- or fixture-relative
 * paths read under `root`; `manifestRel` likewise. Returns failures plus
 * the counts the PASS line reports.
 */
export function checkTree({ root, files, manifestRel, allowlist }) {
  const failures = [];

  const reasonFailures = root === REPO_ROOT ? assertExclusionReasons() : [];
  failures.push(...reasonFailures);

  const { failures: resolveFailures, config } = resolveConfig(join(root, manifestRel), undefined);
  if (resolveFailures.length > 0) {
    for (const f of resolveFailures) failures.push(`${manifestRel} is red, so the literal scan proves nothing: ${f}`);
    return { failures, scanned: 0, occurrences: 0, allowlistSize: allowlist.length };
  }

  const literals = deriveLiterals(config);
  const valueOf = new Map(literals.map((l) => [l.slot, l.value]));

  const scoped = files.filter((f) => !isExcludedFile(f));
  failures.push(...vacuityFailures(literals, scoped, allowlist));

  const scopedSet = new Set(scoped);
  const textOf = new Map();
  const occurrences = [];
  for (const file of scoped) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (err) {
      failures.push(`${file} could not be read (${err.code ?? err.message}) -- an unreadable file is not a clean file. Next step: restore it from version control, then re-run this check.`);
      continue;
    }
    textOf.set(file, text);
    const lines = text.split('\n');
    const seen = new Set();
    lines.forEach((lineText, index) => {
      if (isExcludedLine(file, lineText)) return;
      for (const { slot, value } of literals) {
        if (findMatches(lineText, value, CASE_FORM).length === 0) continue;
        const key = `${index + 1}::${slot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        occurrences.push({ file, line: index + 1, lineText, slot, value });
      }
    });
  }

  const covers = (entry, lineText) => {
    const value = valueOf.get(entry.slot);
    if (value === undefined) return false;
    return findMatches(lineText, value, CASE_FORM).length > 0;
  };

  for (const o of occurrences) {
    const covered = allowlist.some((e) => e.file === o.file && covers(e, o.lineText));
    if (!covered) {
      failures.push(
        `${o.file}:${o.line}: carries the configured ${o.slot} value ${JSON.stringify(o.value)} outside the manifest-owned surfaces. Next step: derive it from ${MANIFEST_REL} at build time instead, or record the carrier as a {slot, file} row with a one-line reason in scripts/verify-manifest-literals.mjs, then re-run this check.`,
      );
    }
  }

  allowlist.forEach((entry) => {
    const tag = `allowlist entry ${JSON.stringify(entry.slot)} -> ${JSON.stringify(entry.file)}`;
    if (!valueOf.has(entry.slot)) {
      failures.push(
        `${tag} is stale: the manifest no longer derives that slot, so the entry guards nothing. Next step: remove the row from scripts/verify-manifest-literals.mjs, then re-run this check.`,
      );
      return;
    }
    if (!scopedSet.has(entry.file)) {
      failures.push(
        `${tag} is stale: the file left the scanned scope (deleted, moved, or newly excluded), so the entry guards nothing. Next step: remove the row from scripts/verify-manifest-literals.mjs, then re-run this check.`,
      );
      return;
    }
    const text = textOf.get(entry.file);
    if (text === undefined) return;
    const value = valueOf.get(entry.slot);
    const fresh = text.split('\n').some((lineText) => !isExcludedLine(entry.file, lineText) && findMatches(lineText, value, CASE_FORM).length > 0);
    if (!fresh) {
      failures.push(
        `${tag} is stale: the file no longer carries that slot's value, so the entry guards nothing. Next step: remove the row from scripts/verify-manifest-literals.mjs, then re-run this check.`,
      );
    }
  });

  return { failures, scanned: scoped.length, occurrences: occurrences.length, allowlistSize: allowlist.length };
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function main() {
  const { failures, scanned, occurrences, allowlistSize } = checkTree({
    root: REPO_ROOT,
    files: listTrackedFiles(),
    manifestRel: MANIFEST_REL,
    allowlist: ALLOWLIST,
  });
  if (failures.length > 0) {
    console.error(`${NAME}: FAIL -- ${failures.length} problem(s) across ${scanned} scanned file(s)`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${NAME}: PASS -- ${scanned} file(s) scanned, ${occurrences} occurrence(s) all allowlisted, ${allowlistSize} allowlist entrie(s) all fresh`);
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

function fixtureRoot(extraFiles) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-literals-selftest-'));
  writeFileSync(join(dir, MANIFEST_REL), FIXTURE_MANIFEST, 'utf8');
  for (const [rel, content] of Object.entries(extraFiles)) {
    writeFileSync(join(dir, rel), content, 'utf8');
  }
  return dir;
}

function selfTest() {
  let failed = 0;
  const dirs = [];
  const complain = (name, why) => {
    console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
    failed += 1;
  };
  const track = (dir) => { dirs.push(dir); return dir; };

  // Green control first: one allowlisted carrier, nothing else. A red
  // control would make every plant below prove nothing.
  {
    const dir = track(fixtureRoot({ 'app.txt': 'title Acme Browser Dev\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'app.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:dev', file: 'app.txt' }],
    });
    if (failures.length > 0) {
      complain('unmutated control', `is already red, so the plants below would mean nothing: ${failures.join(' | ')}`);
    } else {
      console.log('  ok  unmutated control -> allowlisted carrier green');
    }
  }

  // Plant 1: a display literal in a non-allowlisted file goes red naming
  // the file and the value -- proves the check reads the manifest set.
  {
    const dir = track(fixtureRoot({ 'app.txt': 'title Acme Browser Dev\n', 'leak.txt': 'window Acme Browser Dev\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'app.txt', 'leak.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:dev', file: 'app.txt' }],
    });
    const hit = failures.find((f) => f.includes('leak.txt') && f.includes('Acme Browser Dev'));
    if (!hit) {
      complain('planted display literal', `did not go red naming file and value; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  planted display literal -> red, naming leak.txt and the value');
    }
  }

  // Plant 2 (boundary control): identifier-form text stays green with no
  // allowlist entry at all -- proves the reused boundary rule, since a raw
  // substring scan would flag both lines.
  {
    const dir = track(fixtureRoot({ 'edge.txt': 'XAcme Browser\nAcme Browsers\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'edge.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [],
    });
    const leakish = failures.filter((f) => f.includes('edge.txt'));
    if (leakish.length > 0) {
      complain('boundary control', `identifier-form text was flagged: ${leakish.join(' | ')}`);
    } else {
      console.log('  ok  boundary control -> leading-letter and trailing-plural forms stay green');
    }
    if (!failures.some((f) => f.includes('allowlist table is empty'))) {
      complain('boundary control', `the empty-allowlist non-vacuity guard did not fire alongside; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  empty allowlist table -> red with its own message');
    }
  }

  // Plant 3a: an entry whose slot the manifest no longer derives goes red
  // naming the entry (removed literal / renamed variant).
  {
    const dir = track(fixtureRoot({ 'app.txt': 'title Acme Browser Dev\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'app.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:staging', file: 'app.txt' }],
    });
    if (!failures.some((f) => f.includes('variant-display:staging') && f.includes('app.txt') && f.includes('stale'))) {
      complain('stale slot entry', `did not go red naming the entry; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  stale slot entry -> red, naming variant-display:staging -> app.txt');
    }
  }

  // Plant 3b: an entry whose file was rewritten clean goes red naming the
  // entry.
  {
    const dir = track(fixtureRoot({ 'clean.txt': 'nothing brand-like here\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'clean.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:dev', file: 'clean.txt' }],
    });
    if (!failures.some((f) => f.includes('variant-display:dev') && f.includes('clean.txt') && f.includes('stale'))) {
      complain('rewritten-clean entry', `did not go red naming the entry; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  rewritten-clean entry -> red, naming variant-display:dev -> clean.txt');
    }
  }

  // Plant 3c: an entry whose file left the scope goes red naming the entry
  // (deleted file).
  {
    const dir = track(fixtureRoot({ 'app.txt': 'title Acme Browser Dev\n' }));
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'app.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [
        { slot: 'variant-display:dev', file: 'app.txt' },
        { slot: 'variant-display:release', file: 'gone.txt' },
      ],
    });
    if (!failures.some((f) => f.includes('gone.txt') && f.includes('stale'))) {
      complain('deleted-file entry', `did not go red naming the entry; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  deleted-file entry -> red, naming variant-display:release -> gone.txt');
    }
  }

  // Plant 4: an empty scope goes red with its own message, distinct from
  // the empty-allowlist one above.
  {
    const dir = track(fixtureRoot({}));
    const { failures } = checkTree({
      root: dir,
      files: [],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:dev', file: 'app.txt' }],
    });
    if (!failures.some((f) => f.includes('scoped file set is empty'))) {
      complain('empty scope', `did not go red with its own message; got: ${failures.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  empty scope -> red with its own message');
    }
  }

  // Plant 5: an empty derived literal set goes red with its own message,
  // distinct from the empty-scope and empty-allowlist ones planted above.
  // Driven through the guard the gate itself calls: no valid manifest
  // produces an empty set (required keys), so the empty input is the plant.
  {
    const guard = vacuityFailures([], ['f.txt'], [{ slot: 'variant-display:dev', file: 'f.txt' }]);
    if (guard.length !== 1 || !guard[0].includes('derived zero display literals')) {
      complain('empty literal set', `did not go red with its own message; got: ${guard.join(' | ') || '(no failures at all)'}`);
    } else {
      console.log('  ok  empty literal set -> red with its own message');
    }
  }

  // Plant 6: a single-word display name derives no release literal, and
  // identifier-led text stays green with no allowlist entry -- the
  // single-token rule. A one-word value is not boundary-distinguishable
  // from the identifiers it prefixes, so deriving it would flag the whole
  // tree (or, once allowlisted file by file, guard nothing); the dev
  // composition here stays multi-word and keeps its coverage, proved by
  // plant 1's shape above.
  {
    const derived = deriveLiterals({
      identity: { display_name: 'Acme' },
      variants: [{ id: 'dev', name_suffix: ' Dev' }, { id: 'release', name_suffix: '' }],
      product: { vendor_display: 'Acme Works' },
      legal: { trademark_notice: 'Acme notice words here.' },
    });
    const slots = derived.map((l) => l.slot).sort();
    const want = ['legal.trademark_notice', 'product.vendor_display', 'variant-display:dev'].sort();
    if (JSON.stringify(slots) !== JSON.stringify(want)) {
      complain('single-token skip', `derived [${slots.join(', ')}], want [${want.join(', ')}]`);
    } else {
      console.log('  ok  single-token display name -> release literal skipped, dev/vendor/notice kept');
    }
  }
  {
    const singleManifest = FIXTURE_MANIFEST.replace('display_name = "Acme Browser"', 'display_name = "Acme"');
    const dir = track(mkdtempSync(join(tmpdir(), 'manifest-literals-selftest-')));
    writeFileSync(join(dir, MANIFEST_REL), singleManifest, 'utf8');
    writeFileSync(join(dir, 'app.txt'), 'title Acme Dev\n', 'utf8');
    writeFileSync(join(dir, 'id.txt'), 'AcmeWidget renders Acme\n', 'utf8');
    const { failures } = checkTree({
      root: dir,
      files: [MANIFEST_REL, 'app.txt', 'id.txt'],
      manifestRel: MANIFEST_REL,
      allowlist: [{ slot: 'variant-display:dev', file: 'app.txt' }],
    });
    const flagged = failures.filter((f) => f.includes('id.txt'));
    if (flagged.length > 0) {
      complain('single-token identifier control', `identifier-led text was flagged: ${flagged.join(' | ')}`);
    } else if (failures.length > 0) {
      complain('single-token identifier control', `unexpected failures: ${failures.join(' | ')}`);
    } else {
      console.log('  ok  single-token display -> identifier-led text stays green with no entry');
    }
  }

  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

  if (failed > 0) return 1;
  console.log(`${NAME}: --self-test PASS -- 9 planted faults all behaved as pinned`);
  return 0;
}

if (SELF_TEST) {
  process.exit(selfTest());
} else if (args.length === 0) {
  main();
}
