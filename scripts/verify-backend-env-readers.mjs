#!/usr/bin/env node
// scripts/verify-backend-env-readers.mjs
//
// G-14.1.1-24 gate (plan 14.1.1-04): which backend files may touch the live
// process environment, and none of them may read a product-prefixed key off it.
//
// theia/extensions/token-gate/src/node/powerbrowser-env.ts sweeps every
// product-prefixed key out of `process.env` at MODULE LOAD and re-exports the
// captured values. That scrub closes two hazards -- inheritance into every
// child the backend spawns (terminal, task, debug adapter, plugin host), and
// exposure through /proc/<pid>/environ, which `delete process.env.X` does not
// rewrite. It also means the environment is EMPTY by the time any other
// backend module runs: a module that reads it directly finds nothing and fails
// SILENTLY. That is GUI-DEFECTS item 9, and until this gate existed the only
// thing standing against a repeat was a comment in tab-query-service.ts. A
// comment is not a check.
//
// Two assertions, both derived from the tree at check time (CLAUDE.md
// `## Verification` rule 2 -- red on an addition AND on a removal):
//
//   A. ALLOWLIST SET EQUALITY. The set of scanned files that touch the live
//      process environment at all equals EXPECTED_ENV_TOUCHERS below -- the
//      ONE hand-kept list in this file, each entry carrying its reason. A
//      surplus file is an ungated new reader; a missing entry is a stale
//      allowlist row (the file was deleted, renamed, or stopped touching the
//      environment) and is just as red.
//
//   B. NO DIRECT PREFIXED READ. The set of scanned files that read a
//      product-prefixed key straight off the live environment -- in the dotted
//      form or the form that indexes it with a string literal starting with
//      that prefix -- must be EMPTY. This is the exact item-9 shape.
//
// The prefix itself is DERIVED from powerbrowser-env.ts's own capture loop
// rather than spelled here, so the rebrand that changes it cannot leave this
// gate silently matching a dead prefix; a prefix that cannot be derived is a
// broken instrument, not a clean tree.
//
// ANTI-VACUITY. Assertion B is a NEGATED derivation, so it means nothing over
// a walk that found nothing. The gate reports its scanned-file count and fails
// distinctly at zero, and fails distinctly on an empty allowlist. A clean
// result from an empty set proves nothing.
//
// Scope: tracked `*.ts` under theia/extensions/<extension>/src/node/**, walked
// from `git ls-files` so only first-party sources are scanned, with
// node_modules/ and lib/ path segments excluded. Comment lines (first
// non-whitespace `//` or `*`) are skipped the way the internals-boundary scan
// skips them, so the four files that discuss `process.env` in prose do not
// enter either set.
//
// Deliberately OUT of scope, stated here rather than silently unhandled:
//   - frontend sources (theia/extensions/*/src/browser/**) -- the browser
//     realm has no process environment to read;
//   - the Theia application shells (theia/browser-app, theia/electron-app)
//     and their src-gen output -- generated composition, not first-party
//     backend logic;
//   - `.js` build output under lib/ -- excluded by path segment; the TypeScript
//     source is the thing under review.
//
// This file is exempt from its own scan by basename -- it must spell the
// shapes it matches, the same reason the internals-boundary guard exempts its
// boundary file. (It is also outside the scanned tree; the exemption is belt
// and braces against a future scope widening.)
//
// Honestly --quick: it reads text files only. No build, no browser, no
// display, no network.
//
// Self-test (--self-test): asserts the unmodified tree green first, then
// plants five faults, each asserted to have LANDED and each required to go red
// NAMING the drift: (a) a dotted direct prefixed read; (b) a
// string-literal-indexed direct prefixed read; (c) an off-allowlist file
// touching the environment through a key loop; (d) an allowlist entry pointed
// at a path that does not exist; (e) an empty file list.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const NAME = 'verify-backend-env-readers';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SELF_BASENAME = 'verify-backend-env-readers.mjs';

const SCOPE_RE = /^theia\/extensions\/[^/]+\/src\/node\//;
const SCOPED_EXT = '.ts';
const EXCLUDED_SEGMENTS = ['node_modules', 'lib'];

// The module whose capture loop defines the product prefix. The prefix is read
// out of it at check time; this path is the derivation's source, not a value.
const PREFIX_SOURCE = 'theia/extensions/token-gate/src/node/powerbrowser-env.ts';
const PREFIX_DECL = /startsWith\(\s*['"]([A-Z0-9]+_)['"]\s*\)/;

// The ONE hand-kept list in this file. Every entry carries the reason it is
// allowed to touch the live process environment at all.
const EXPECTED_ENV_TOUCHERS = new Map([
  [
    'theia/extensions/token-gate/src/node/powerbrowser-env.ts',
    'the capture-and-delete loop at module load -- the sole sanctioned reader; it sweeps every prefixed key out of the live environment and re-exports the captured values',
  ],
  [
    'theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts',
    'copies the environment minus every GIT_* name for the pb-orca-git git child (T-65-05); reads no prefixed key',
  ],
]);

// Any member or index access on the Node process environment object.
const ENV_TOUCH = [/\bprocess\s*\.\s*env\b/, /\bprocess\s*\[\s*(['"`])env\1\s*\]/];

// A read of a prefixed key straight off the live environment, in the dotted
// form and in the string-literal-indexed form. Built from the DERIVED prefix.
function prefixedReadShapes(prefix) {
  const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`\\bprocess\\s*\\.\\s*env\\s*\\.\\s*${p}`),
    new RegExp(`\\bprocess\\s*\\.\\s*env\\s*\\[\\s*(['"\`])${p}`),
  ];
}

function isCommentLine(line) {
  const trimmed = line.replace(/^\s+/, '');
  return trimmed.startsWith('//') || trimmed.startsWith('*');
}

function readSource(path) {
  const abs = path.startsWith('/') ? path : join(REPO_ROOT, path);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function inScope(rel) {
  if (!SCOPE_RE.test(rel)) return false;
  if (!rel.endsWith(SCOPED_EXT)) return false;
  if (rel.split('/').some(seg => EXCLUDED_SEGMENTS.includes(seg))) return false;
  if (rel.split('/').pop() === SELF_BASENAME) return false;
  return true;
}

function collectTrackedFiles() {
  const r = spawnSync('git', ['-C', REPO_ROOT, 'ls-files', '-z'], { encoding: 'buffer' });
  if (r.status !== 0) return null;
  return r.stdout.toString('utf8').split('\0').filter(Boolean).filter(inScope);
}

function derivePrefix() {
  const src = readSource(PREFIX_SOURCE);
  if (src === null) return null;
  const m = src.split('\n').filter(l => !isCommentLine(l)).join('\n').match(PREFIX_DECL);
  return m ? m[1] : null;
}

function scan(files, prefix) {
  const shapes = prefixedReadShapes(prefix);
  const touchers = new Set();
  const prefixedReaders = [];
  const unreadable = [];
  for (const f of files) {
    if (f.split('/').pop() === SELF_BASENAME) continue;
    const src = readSource(f);
    if (src === null) {
      unreadable.push(f);
      continue;
    }
    let lineNo = 0;
    for (const line of src.split('\n')) {
      lineNo++;
      if (isCommentLine(line)) continue;
      if (ENV_TOUCH.some(re => re.test(line))) touchers.add(f);
      if (shapes.some(re => re.test(line))) prefixedReaders.push({ file: f, line: lineNo, text: line.trim() });
    }
  }
  return { touchers, prefixedReaders, unreadable };
}

function runScan(files, allowlist, prefix) {
  if (files === null) return { ok: false, reason: 'git-failed' };
  if (files.length === 0) {
    return { ok: false, reason: 'empty-files', detail: 'the scanned file set is empty' };
  }
  if (allowlist.size === 0) {
    return { ok: false, reason: 'empty-allowlist', detail: 'EXPECTED_ENV_TOUCHERS is empty' };
  }
  if (!prefix) {
    return { ok: false, reason: 'no-prefix', detail: PREFIX_SOURCE };
  }

  const { touchers, prefixedReaders, unreadable } = scan(files, prefix);
  if (unreadable.length) {
    return { ok: false, reason: 'unreadable', detail: unreadable.join(', ') };
  }

  const surplus = [...touchers].filter(f => !allowlist.has(f)).sort();
  const stale = [...allowlist.keys()].filter(f => !touchers.has(f)).sort();

  return {
    ok: surplus.length === 0 && stale.length === 0 && prefixedReaders.length === 0,
    reason: '',
    scanned: files.length,
    prefix,
    touchers: [...touchers].sort(),
    surplus,
    stale,
    prefixedReaders,
  };
}

function reportFailure(result, allowlist) {
  switch (result.reason) {
    case 'git-failed':
      console.error(`${NAME}: FAIL -- broken instrument: git ls-files failed, so the scanned set could not be derived`);
      return;
    case 'empty-files':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. Assertion B is a negated derivation; a clean result over an empty walk proves nothing.`);
      return;
    case 'empty-allowlist':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. A set-equality comparison against an empty allowlist is not an assertion.`);
      return;
    case 'no-prefix':
      console.error(`${NAME}: FAIL -- broken instrument: could not derive the product environment prefix from ${result.detail}; the shapes below would match nothing`);
      return;
    case 'unreadable':
      console.error(`${NAME}: FAIL -- broken instrument: unreadable scan file(s): ${result.detail}`);
      return;
    default:
      break;
  }
  console.error(`${NAME}: FAIL -- ${result.scanned} backend files scanned, prefix '${result.prefix}'`);
  for (const f of result.surplus) {
    console.error(`  UNGATED ENV TOUCHER: ${f} reads the live process environment but is not on EXPECTED_ENV_TOUCHERS. The prefixed keys are scrubbed at module load, so a direct read finds nothing and fails silently; read POWERBROWSER_ENV instead, or add this file to the allowlist with its reason.`);
  }
  for (const f of result.stale) {
    console.error(`  STALE ALLOWLIST ENTRY: ${f} is on EXPECTED_ENV_TOUCHERS but no longer touches the live process environment (moved, renamed, deleted, or rewritten). Remove the entry -- ${allowlist.get(f)}`);
  }
  for (const r of result.prefixedReaders) {
    console.error(`  DIRECT PREFIXED READ: ${r.file}:${r.line}: ${r.text}`);
    console.error('    -- this is GUI-DEFECTS item 9: the key was swept out of the live environment at module load, so this reads undefined and fails silently.');
  }
}

function main() {
  const files = collectTrackedFiles();
  const prefix = derivePrefix();
  const result = runScan(files, EXPECTED_ENV_TOUCHERS, prefix);
  if (!result.ok) {
    reportFailure(result, EXPECTED_ENV_TOUCHERS);
    process.exit(1);
  }
  console.log(
    `${NAME}: PASS -- ${result.scanned} backend files scanned, prefix '${result.prefix}'; ` +
    `env touchers {${result.touchers.join(', ')}} equal the ${EXPECTED_ENV_TOUCHERS.size}-entry allowlist; zero direct prefixed reads`
  );
}

function selfTest() {
  const realFiles = collectTrackedFiles();
  const prefix = derivePrefix();
  const baseline = runScan(realFiles, EXPECTED_ENV_TOUCHERS, prefix);
  if (!baseline.ok) {
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
    reportFailure(baseline, EXPECTED_ENV_TOUCHERS);
    process.exit(1);
  }
  console.log(`${NAME} --self-test: unmodified tree green over ${baseline.scanned} backend files (prefix '${prefix}'); planting faults`);

  const stage = mkdtempSync(join(tmpdir(), 'pb-backend-env-readers-'));
  if (/\s/.test(stage)) throw new Error(`${NAME}: FAIL -- stage path contains a space: ${stage}`);
  let failed = 0;

  const plantFile = (name, body, marker) => {
    const path = join(stage, name);
    writeFileSync(path, body);
    return { path, landed: readFileSync(path, 'utf8').includes(marker) };
  };

  try {
    // Plant (a): the dotted direct prefixed read.
    {
      const marker = `process.env.${prefix}TOKEN`;
      const { path, landed } = plantFile('dotted-read.ts', `export const t = ${marker};\n`, marker);
      if (!landed) {
        console.error(`${NAME} --self-test: FAIL -- 'dotted read' plant did not land`);
        failed++;
      } else {
        const r = runScan([...realFiles, path], EXPECTED_ENV_TOUCHERS, prefix);
        if (r.ok || !r.prefixedReaders?.some(x => x.file === path)) {
          console.error(`${NAME} --self-test: FAIL -- the dotted direct read did not go red naming 'dotted-read.ts'; got: ${JSON.stringify({ reason: r.reason, prefixedReaders: r.prefixedReaders })}`);
          failed++;
        } else {
          console.log(`  ok  dotted ${marker} read -> red under assertion B, naming 'dotted-read.ts'`);
        }
      }
    }

    // Plant (b): the string-literal-indexed direct prefixed read.
    {
      const marker = `process.env['${prefix}SUPERVISED']`;
      const { path, landed } = plantFile('indexed-read.ts', `export const s = ${marker};\n`, marker);
      if (!landed) {
        console.error(`${NAME} --self-test: FAIL -- 'indexed read' plant did not land`);
        failed++;
      } else {
        const r = runScan([...realFiles, path], EXPECTED_ENV_TOUCHERS, prefix);
        if (r.ok || !r.prefixedReaders?.some(x => x.file === path)) {
          console.error(`${NAME} --self-test: FAIL -- the string-literal-indexed read did not go red naming 'indexed-read.ts'; got: ${JSON.stringify({ reason: r.reason, prefixedReaders: r.prefixedReaders })}`);
          failed++;
        } else {
          console.log(`  ok  indexed ${marker} read -> red under assertion B, naming 'indexed-read.ts'`);
        }
      }
    }

    // Plant (c): an off-allowlist file touching the environment through a key
    // loop -- the shape assertion B alone cannot see.
    {
      const marker = 'Object.keys(process.env)';
      const { path, landed } = plantFile(
        'key-loop.ts',
        `export function build(): string[] {\n    return ${marker}.filter(k => process.env[k] !== undefined);\n}\n`,
        marker
      );
      if (!landed) {
        console.error(`${NAME} --self-test: FAIL -- 'key loop' plant did not land`);
        failed++;
      } else {
        const r = runScan([...realFiles, path], EXPECTED_ENV_TOUCHERS, prefix);
        if (r.ok || !r.surplus?.includes(path)) {
          console.error(`${NAME} --self-test: FAIL -- an off-allowlist key-loop toucher did not go red naming 'key-loop.ts'; got: ${JSON.stringify({ reason: r.reason, surplus: r.surplus })}`);
          failed++;
        } else if (r.prefixedReaders.length !== 0) {
          console.error(`${NAME} --self-test: FAIL -- the key-loop plant must trip assertion A only; assertion B also fired: ${JSON.stringify(r.prefixedReaders)}`);
          failed++;
        } else {
          console.log(`  ok  off-allowlist key-loop toucher -> red under assertion A, naming 'key-loop.ts'`);
        }
      }
    }

    // Plant (d): an allowlist entry pointed at a path that does not exist.
    {
      const bogus = 'theia/extensions/does-not-exist/src/node/ghost-env.ts';
      const tampered = new Map([...EXPECTED_ENV_TOUCHERS, [bogus, 'planted stale entry']]);
      const r = runScan(realFiles, tampered, prefix);
      if (r.ok || !r.stale?.includes(bogus)) {
        console.error(`${NAME} --self-test: FAIL -- a stale allowlist entry did not go red naming it; got: ${JSON.stringify({ reason: r.reason, stale: r.stale })}`);
        failed++;
      } else {
        console.log(`  ok  allowlist entry for a nonexistent path -> red, naming it STALE ALLOWLIST ENTRY`);
      }
    }

    // Plant (e): an empty file list is a broken instrument, never clean.
    {
      const r = runScan([], EXPECTED_ENV_TOUCHERS, prefix);
      if (r.ok || r.reason !== 'empty-files') {
        console.error(`${NAME} --self-test: FAIL -- an empty file list did not fail distinctly as a broken instrument; got reason='${r.reason}'`);
        failed++;
      } else {
        console.log(`  ok  empty file list -> distinct broken-instrument failure, not clean`);
      }
    }

    // Control on the derivation itself: an underivable prefix is red, not a
    // silently-matching-nothing pass.
    {
      const r = runScan(realFiles, EXPECTED_ENV_TOUCHERS, null);
      if (r.ok || r.reason !== 'no-prefix') {
        console.error(`${NAME} --self-test: FAIL -- an underivable prefix did not fail distinctly; got reason='${r.reason}'`);
        failed++;
      } else {
        console.log(`  ok  underivable product prefix -> distinct broken-instrument failure`);
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  if (failed) process.exit(1);
  console.log(`${NAME} --self-test: PASS -- every planted fault landed and went red naming its drift; both anti-vacuity guards failed distinctly`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main();
}
