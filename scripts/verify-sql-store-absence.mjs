#!/usr/bin/env node
// scripts/verify-sql-store-absence.mjs
//
// SQL-04 gate 4 scaffolding (plan 12-02; promoted to a registry row in
// plan 12-03): private tabs are absent from the store, proven by an
// instrument that exercises the real emitter -- never a fixture the test
// itself constructed.
//
// Two halves sharing one file:
//
// STATIC (runs everywhere, no build, no display): derives the DDL column
// set from the writer-source markers at check time and compares as set
// equality against exactly the four v1 columns, so an addition and a
// removal each go red naming the column; and derives that the
// private-window check call precedes the upsert statement inside the same
// writer method by line order, failing distinctly when either side is
// unlocatable.
//
// LIVE (needs the built binary plus startup trigger wiring): drives real
// private-window tab events through the real writer path against a temp
// profile outside the repo and asserts zero private rows, then drives the
// identical events through a public window asserting rows exist -- the
// positive control proving the emitter ran, without which a zero-row
// result would be vacuous. Harness choice, recorded here per the plan:
// headless-first through the same spawn flags as scripts/lib/firefox-bidi
// (this tree's harness always launches --headless; a URL on the command
// line opens a stock window alongside the shell, which is exactly the
// event source the drive needs), falling back to the Xvfb harness pattern
// when headless cannot produce private-window tab events. When the binary
// or a launch capability is unavailable, the live half prints STAGED with
// the exact rerun command and exits cleanly rather than faking a pass;
// absent startup wiring is a failure (NG-020), never STAGED.
//
// Engine: standard-library `node:sqlite` only for row reads (host node,
// no install). Every mutation lands on copies under a mktemp stage
// outside the repo at a space-free path; the committed tree is untouched.
//
// Self-test (`--self-test`): asserts the unmodified tree green first,
// then plants a private-marker column and a removed column, each going
// red naming the drift, plus a filter-after-upsert reorder going red on
// the ordering half. Each plant is asserted to have landed before its
// result is trusted.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startupWiringPresent } from './lib/startup-wiring.mjs';
import { liveEnv } from './lib/firefox-bidi.mjs';

const NAME = 'verify-sql-store-absence';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const WRITER = join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs');
const BIN = join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser');
const EXPECTED_COLUMNS = ['uri', 'url', 'title', 'last_active'];
const PRIVATE_PROBE_URL = 'about:blank#absence-private';
const PUBLIC_PROBE_URL = 'about:blank#absence-public';
const SHELL_READY = 'POWERBROWSER_SHELL_READY';

function fail(message) {
  throw new Error(`${NAME}: FAIL -- ${message}`);
}

function staged(reason) {
  console.log(`${NAME}: STAGED -- ${reason}`);
  console.log(`${NAME}: rerun: node scripts/verify-sql-store-absence.mjs`);
}

// --- static derivation (from the tree, never a copy) -------------------------

function extractWriterDdl(source) {
  const m = /PB-SQL-TABS-DDL-START\s*\*\/\s*`([\s\S]*?)`\s*\/\*\s*PB-SQL-TABS-DDL-END/.exec(source);
  if (!m) {
    fail('writer DDL markers absent in powerbrowser/shell/PowerBrowserAPI.sys.mjs (want PB-SQL-TABS-DDL-START/END delimiting one template literal)');
  }
  return m[1];
}

// Column names of the CREATE TABLE statement: split the parenthesised
// body on top-level commas (CHECK constraints nest parens), take the
// first token of each element, skip table-level constraint clauses.
function deriveColumnSet(ddl) {
  const table = ddl.split(';').map(s => s.trim()).find(s => /^create table\b/i.test(s));
  if (!table) {
    fail('derived DDL carries no CREATE TABLE statement');
  }
  const body = table.slice(table.indexOf('(') + 1, table.lastIndexOf(')'));
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  const names = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(trimmed)) continue;
    const name = trimmed.split(/\s+/)[0].replace(/^["'`\[]|["'`\]]$/g, '');
    if (name) names.push(name);
  }
  if (names.length === 0) {
    fail('derived ZERO columns from the writer DDL -- the parse found nothing, so this comparison proves nothing');
  }
  return names;
}

function diffByName(actual, expected) {
  const a = new Set(actual);
  const e = new Set(expected);
  return {
    surplus: [...a].filter(n => !e.has(n)),
    missing: [...e].filter(n => !a.has(n)),
  };
}

function checkColumns(source) {
  const failures = [];
  const actual = deriveColumnSet(extractWriterDdl(source));
  const { surplus, missing } = diffByName(actual, EXPECTED_COLUMNS);
  if (surplus.length) failures.push(`store columns NOT in the v1 contract: ${surplus.join(', ')}`);
  if (missing.length) failures.push(`v1 contract columns GONE from the store: ${missing.join(', ')}`);
  return failures;
}

// The exclusion rule is positional: the private-window check must run
// BEFORE the upsert inside writeTabRow, never after it and never in
// another method. Both sides are located by their code anchors at check
// time; a missing anchor fails distinctly rather than comparing ghosts.
function checkFilterOrdering(source) {
  const start = source.indexOf('async writeTabRow(');
  if (start === -1) fail('writer method writeTabRow unlocatable (want `async writeTabRow(`)');
  const end = source.indexOf('async removeTabRow(', start);
  const body = end === -1 ? source.slice(start) : source.slice(start, end);
  const filter = body.indexOf('isWindowPrivate');
  if (filter === -1) {
    return ['private-window check call unlocatable inside writeTabRow (want isWindowPrivate before the upsert)'];
  }
  const upsert = body.indexOf('INSERT INTO tabs');
  if (upsert === -1) {
    return ['upsert statement unlocatable inside writeTabRow (want INSERT INTO tabs after the private-window check)'];
  }
  if (filter > upsert) {
    return ['private-window check runs AFTER the upsert inside writeTabRow -- a private tab reaches SQL before it is filtered'];
  }
  return [];
}

// CR-01 follow-up (12-CODE-REVIEW.md): the writeTabRow ordering half above
// cannot see the sweep or the quarantine rebuild -- both route through
// parseSessionStoreTabRows, which iterates getBrowserState() windows that
// include private ones. This half pins the parser's own isPrivate skip at
// check time, failing distinctly when either side is unlocatable.
function checkParseFiltersPrivate(source) {
  const start = source.indexOf('parseSessionStoreTabRows()');
  if (start === -1) fail('parser parseSessionStoreTabRows unlocatable (want `parseSessionStoreTabRows()`)');
  const end = source.indexOf('async quarantineAndRebuildTabStore(', start);
  const body = end === -1 ? source.slice(start) : source.slice(start, end);
  const skip = body.indexOf('isPrivate');
  if (skip === -1) {
    return ['sessionstore parser carries no isPrivate skip -- private-window tabs flow into the sweep and the quarantine rebuild'];
  }
  const loop = body.indexOf('state.windows');
  if (loop === -1 || skip < loop) {
    return ['sessionstore parser isPrivate skip unlocatable inside the windows loop -- the private-window filter drifted'];
  }
  return [];
}

function readWriterSource() {
  return readFileSync(WRITER, 'utf8');
}

function runStatic() {
  const failures = [...checkColumns(readWriterSource()), ...checkFilterOrdering(readWriterSource()), ...checkParseFiltersPrivate(readWriterSource())];
  if (failures.length) {
    console.error(`${NAME}: FAIL -- private-exclusion static half is red:`);
    failures.forEach(f => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(`${NAME}: PASS -- v1 column set holds and the private-window check precedes the upsert`);
}

// --- self-test -----------------------------------------------------------------

function selfTest() {
  const clean = readWriterSource();
  const baseline = [...checkColumns(clean), ...checkFilterOrdering(clean)];
  if (baseline.length !== 0) {
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
    baseline.forEach(f => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(`${NAME} --self-test: unmodified tree green, planting faults`);

  const cleanDdl = extractWriterDdl(clean);
  let failed = 0;

  // Plant 1: a private-marker column must go red naming the column.
  {
    const plantedLine = '  is_private INTEGER NOT NULL DEFAULT 0,';
    const mutated = clean.replace(cleanDdl, cleanDdl.replace(/(title[^\n]*\n)/, `$1${plantedLine}\n`));
    const landed = mutated !== clean && deriveColumnSet(extractWriterDdl(mutated)).includes('is_private');
    if (!landed) {
      console.error(`${NAME} --self-test: FAIL -- 'private-marker column' plant did not land; the DDL anchor drifted`);
      failed++;
    } else {
      const failures = checkColumns(mutated);
      if (!failures.some(f => f.includes('is_private'))) {
        console.error(`${NAME} --self-test: FAIL -- 'private-marker column' did not go red naming 'is_private'; got: ${failures.join(' | ') || '(no failures at all)'}`);
        failed++;
      } else {
        console.log(`  ok  private-marker column -> red, naming 'is_private'`);
      }
    }
  }

  // Plant 2: a removed column must go red naming the column.
  {
    const titleLine = cleanDdl.split('\n').find(l => /^\s*title\b/.test(l));
    const mutated = titleLine ? clean.replace(titleLine + '\n', '') : clean;
    const landed = mutated !== clean && !deriveColumnSet(extractWriterDdl(mutated)).includes('title');
    if (!landed) {
      console.error(`${NAME} --self-test: FAIL -- 'removed column' plant did not land; the DDL anchor drifted`);
      failed++;
    } else {
      const failures = checkColumns(mutated);
      if (!failures.some(f => f.includes('title'))) {
        console.error(`${NAME} --self-test: FAIL -- 'removed column' did not go red naming 'title'; got: ${failures.join(' | ') || '(no failures at all)'}`);
        failed++;
      } else {
        console.log(`  ok  removed column -> red, naming 'title'`);
      }
    }
  }

  // Plant 3: a filter-after-upsert reorder must go red on the ordering half.
  {
    const lines = clean.split('\n');
    const filterIdx = lines.findIndex(l => l.includes('isWindowPrivate(chromeWin)'));
    const upsertIdx = lines.findIndex(l => l.includes('INSERT INTO tabs (uri'));
    const landed = filterIdx !== -1 && upsertIdx !== -1 && filterIdx < upsertIdx;
    if (!landed) {
      console.error(`${NAME} --self-test: FAIL -- 'filter reorder' plant anchors unlocatable; the writer method drifted`);
      failed++;
    } else {
      const swapped = [...lines];
      [swapped[filterIdx], swapped[upsertIdx]] = [swapped[upsertIdx], swapped[filterIdx]];
      const mutated = swapped.join('\n');
      const relanded = mutated.indexOf('isWindowPrivate') > mutated.indexOf('INSERT INTO tabs');
      const failures = checkFilterOrdering(mutated);
      if (!relanded || !failures.some(f => f.includes('AFTER the upsert'))) {
        console.error(`${NAME} --self-test: FAIL -- 'filter reorder' did not go red on ordering; got: ${failures.join(' | ') || '(no failures at all)'}`);
        failed++;
      } else {
        console.log(`  ok  filter after upsert -> red, naming the ordering fault`);
      }
    }
  }

  if (failed) process.exit(1);
  console.log(`${NAME} --self-test: PASS -- static planted faults all went red`);
  predicateSelfTest();
}

// Failing-first proof for the live-drive predicates, run as the tail of
// --self-test: the SAME absenceHolds/positiveControlHolds functions the
// live drive calls must fail on a seeded leak and pass on the matching
// control rows, all on temp DBs outside the repo. If either predicate
// could not fail, the live drive it guards would be vacuous.
function predicateSelfTest() {
  const ddl = extractWriterDdl(cleanWriterSource());
  const stage = mkdtempSync(join(tmpdir(), 'pb-tabs-absence-pred-'));
  if (/\s/.test(stage)) fail(`stage path contains a space: ${stage}`);
  if (stage.startsWith(REPO_ROOT)) fail(`stage path is inside the repo: ${stage}`);
  try {
    const seed = (name, rows) => {
      const path = join(stage, name);
      const db = new DatabaseSync(path);
      try {
        for (const s of ddl.split(';').map(s => s.trim()).filter(Boolean)) db.exec(s);
        for (const r of rows) {
          db.prepare('INSERT INTO tabs (uri, url, title, last_active) VALUES (?, ?, ?, ?)')
            .run(r.uri, r.url, r.title, r.last_active);
        }
      } finally {
        db.close();
      }
      return path;
    };
    const readAll = path => {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        return db.prepare('SELECT uri, url, title, last_active FROM tabs ORDER BY uri').all();
      } finally {
        db.close();
      }
    };

    // Absence predicate: fails on a seeded leak (failing-first), holds empty.
    const leakPath = seed('leak.sqlite', [
      { uri: 'webview:about:blank#absence-private', url: PRIVATE_PROBE_URL, title: '', last_active: 1 },
    ]);
    const leakRows = readAll(leakPath);
    if (leakRows.length !== 1 || absenceHolds(leakRows)) {
      console.error(`${NAME} --self-test: FAIL -- absence predicate did not fail on a seeded private row; the leak plant did not land or the predicate cannot go red`);
      process.exit(1);
    }
    console.log(`  ok  seeded private row -> absence predicate red (failing-first)`);
    const emptyPath = seed('empty.sqlite', []);
    if (!absenceHolds(readAll(emptyPath))) {
      console.error(`${NAME} --self-test: FAIL -- absence predicate failed on an empty store`);
      process.exit(1);
    }
    console.log(`  ok  empty store -> absence predicate green`);

    // Positive-control predicate: holds on the public probe row (the
    // emitter-ran proof), fails without it.
    const publicPath = seed('public.sqlite', [
      { uri: 'webview:' + PUBLIC_PROBE_URL, url: PUBLIC_PROBE_URL, title: '', last_active: 2 },
    ]);
    if (!positiveControlHolds(readAll(publicPath), PUBLIC_PROBE_URL)) {
      console.error(`${NAME} --self-test: FAIL -- positive-control predicate failed on its own probe row`);
      process.exit(1);
    }
    console.log(`  ok  public probe row -> positive control green (emitter-ran proof)`);
    if (positiveControlHolds(readAll(emptyPath), PUBLIC_PROBE_URL)) {
      console.error(`${NAME} --self-test: FAIL -- positive-control predicate passed on an empty store; the control is vacuous`);
      process.exit(1);
    }
    console.log(`  ok  empty store -> positive control red (not vacuous)`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  console.log(`${NAME} --self-test: PASS -- both live-drive predicates discriminate`);
}

function cleanWriterSource() {
  return readWriterSource();
}

// --- live drive ------------------------------------------------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The two live-drive predicates, factored so the self-test below proves
// each one discriminates before any browser ever launches: a predicate
// that cannot fail is a control that proves nothing.
function absenceHolds(rows) {
  return rows.length === 0;
}

function positiveControlHolds(rows, probeUrl) {
  return rows.some(r => r.url === probeUrl);
}

function readStoreRows(profileDir) {
  const path = join(profileDir, 'tabs.sqlite');
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('SELECT uri, url, title, last_active FROM tabs ORDER BY uri').all();
  } finally {
    db.close();
  }
}

// One headed-capable launch against a caller-owned temp profile: spawn the
// binary with the same headless flags as scripts/lib/firefox-bidi.mjs,
// wait for the shell-ready sentinel, settle past the sweep, then SIGTERM
// and read the rows the session wrote.
//
// Settle is 60s, not 10s (12-CODE-REVIEW.md CR-04): the sweep rides
// sessionstore-state-write-complete, and a live drive measured the first
// sweep landing between 40-55s after launch in headless -- a 10s settle
// reads before any sweep fired, passing the private half vacuously and
// failing the public positive control. Rows are read only after SIGTERM:
// mid-session readonly opens contend with the writer's WAL lock and throw
// SQLITE_BUSY intermittently, while post-shutdown reads are deterministic.
async function driveOnce({ profileDir, args, settleMs = 60000, readyTimeoutMs = 120000 }) {
  const child = spawn(BIN, ['--headless', '--profile', profileDir, ...args], { env: liveEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  if (child.stdout) child.stdout.on('data', c => { output += c.toString(); });
  if (child.stderr) child.stderr.on('data', c => { output += c.toString(); });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const deadline = Date.now() + readyTimeoutMs;
    while (!output.includes(SHELL_READY) && Date.now() < deadline) {
      await sleep(500);
    }
    if (!output.includes(SHELL_READY)) {
      throw new Error(`shell-ready sentinel never appeared within ${readyTimeoutMs}ms`);
    }
    await sleep(settleMs);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(5000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); })]);
    }
  }
  return readStoreRows(profileDir);
}

async function runLive() {
  if (!existsSync(BIN)) {
    staged('built binary absent at objdir/dist/bin/powerbrowser -- build it first (see docs/BUILD.md "Firefox half")');
    return;
  }
  if (!startupWiringPresent()) {
    fail('startup trigger wiring absent: no PowerBrowserAPI.ensureTabStore( or PowerBrowserAPI.startTabStoreTriggers( call in powerbrowser.js or TheiaService.sys.mjs, so no session can exercise the emitter (NG-020: absent wiring is a failure, not a staged pass)');
  }
  const stage = mkdtempSync(join(tmpdir(), 'pb-tabs-absence-'));
  if (/\s/.test(stage)) fail(`stage path contains a space: ${stage}`);
  if (stage.startsWith(REPO_ROOT)) fail(`stage path is inside the repo: ${stage}`);
  console.log(`${NAME}: stage ${stage} (space-free, outside repo)`);
  try {
    const privateProfile = mkdtempSync(join(stage, 'private-'));
    const privateRows = await driveOnce({ profileDir: privateProfile, args: ['--private-window', PRIVATE_PROBE_URL] });
    if (!absenceHolds(privateRows)) {
      fail(`private window left ${privateRows.length} row(s): ${privateRows.map(r => r.uri).join(', ')}`);
    }
    console.log(`${NAME}: drive PASS -- private window left zero rows`);

    const publicProfile = mkdtempSync(join(stage, 'public-'));
    const publicRows = await driveOnce({ profileDir: publicProfile, args: [PUBLIC_PROBE_URL] });
    if (!positiveControlHolds(publicRows, PUBLIC_PROBE_URL)) {
      fail(`positive control failed -- public window left no row for ${PUBLIC_PROBE_URL}, so the zero above proves nothing`);
    }
    console.log(`${NAME}: drive PASS -- public-window positive control produced its row (emitter ran)`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  console.log(`${NAME}: PASS -- private absence holds under an emitter-exercising drive`);
}

// --- entry -------------------------------------------------------------------------

if (process.argv.includes('--help')) {
  console.log(`Usage: node scripts/verify-sql-store-absence.mjs [--self-test]

${NAME}: static v1-column plus filter-ordering checks always run; the live
private-window drive runs when the binary and startup wiring allow, else
prints STAGED with its rerun command. --self-test plants faults instead.`.trimEnd());
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  try {
    runStatic();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  await runLive();
}
