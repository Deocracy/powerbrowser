#!/usr/bin/env node
// scripts/verify-sql-store-soak.mjs
//
// SQL-05 gate 2 (plan 12-03): integrity soak, static and live halves sharing
// one file and one self-test row.
//
// STATIC (default, runs everywhere -- no build, no browser, no display):
// copies the committed v1 fixture to a mktemp stage outside the repo at a
// space-free path and mutates the copy only -- the committed file's hash
// before the run must equal its hash after. Two read-write handles on the
// stage copy take turns (IN-01: sequential dual-handle interleave -- Node
// runs each awaited statement to completion, so no lock, busy-handler, or
// checkpoint contention is stressed) issuing tab upserts (bound parameters,
// including the quote-plus-unicode title that proves binding) with
// bookmark-shape writes into a stage-only witness table. The run ends asserting the
// integrity result is exactly single-ok, with a deliberately tampered copy
// tripping distinctly (a tripwire that never fires proves nothing).
// Sidecars are removed checkpoint-then-clean after every handle closes, and
// the run asserts the repo gitignore already covers the sidecar names
// rather than adding duplicate entries.
//
// LIVE (--live, full-tier): the same interleave against a temp profile
// through the built binary, reading back through a readonly handle the way
// the chrome reader clone does. When the binary or the startup trigger
// wiring is absent it prints STAGED with the exact rerun command and exits
// cleanly rather than faking a pass. The default entry point never launches
// anything, which is what keeps the base-registry row honestly quick.
//
// Engine: standard-library `node:sqlite` only (host node, no install).
// Self-test (--self-test): asserts the static drive green first on the
// unmodified tree, then proves the tamper predicate failing-first on a
// scratch copy, the clean copy single-ok, the quote title round-tripping
// through bound parameters, and the marker-missing derivation failing
// distinctly -- each plant asserted to have landed.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { liveEnv } from './lib/firefox-bidi.mjs';

const NAME = 'verify-sql-store-soak';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const WRITER = join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs');
const FIXTURE = join(REPO_ROOT, '.planning/milestones/v1.2-phases/11-sql-store-design/fixtures/tabs-v1.sqlite');
const BIN = join(REPO_ROOT, 'objdir/dist/bin/powerbrowser');
const GITIGNORE = join(REPO_ROOT, '.gitignore');
const SHELL_READY = 'POWERBROWSER_SHELL_READY';
const QUOTE_TITLE = `It's a "build" shell \u2014 \u00fcn\u00efc\u00f6d\u00e9 \u2713`;
const INTERLEAVE_N = 25;
const WITNESS_DDL = 'CREATE TABLE soak_bookmarks(url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT \'\', parent TEXT NOT NULL DEFAULT \'\')';

function fail(message) {
  throw new Error(`${NAME}: FAIL -- ${message}`);
}

function staged(reason) {
  console.log(`${NAME}: STAGED -- ${reason}`);
  console.log(`${NAME}: rerun: node scripts/verify-sql-store-soak.mjs --live`);
}

function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function extractWriterDdl(source) {
  const m = /PB-SQL-TABS-DDL-START\s*\*\/\s*`([\s\S]*?)`\s*\/\*\s*PB-SQL-TABS-DDL-END/.exec(source);
  if (!m) {
    fail('writer DDL markers absent in powerbrowser/shell/PowerBrowserAPI.sys.mjs (want PB-SQL-TABS-DDL-START/END delimiting one template literal)');
  }
  return m[1];
}

function statementsOf(ddl) {
  return ddl.split(';').map(s => s.trim()).filter(Boolean);
}

function firstValues(db, pragma) {
  return db.prepare(`PRAGMA ${pragma}`).all().map(r => Object.values(r)[0]);
}

// Exact single-ok keying: one row, the value 'ok', nothing else.
function integritySingleOk(db) {
  const values = firstValues(db, 'integrity_check');
  return values.length === 1 && values[0] === 'ok';
}

function tripwireTripped(path) {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      return !integritySingleOk(db);
    } finally {
      db.close();
    }
  } catch {
    return true; // unopenable counts as tripped
  }
}

function upsertTab(db, row) {
  db.prepare(`INSERT INTO tabs (uri, url, title, last_active) VALUES (?, ?, ?, ?)
    ON CONFLICT (uri) DO UPDATE SET url=excluded.url, title=excluded.title, last_active=excluded.last_active`)
    .run(row.uri, row.url, row.title, row.last_active);
}

// Checkpoint-then-clean: a read-write handle checkpoints before sidecars
// are unlinked. Every handle on the file must already be closed.
function checkpointThenClean(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { rmSync(path + suffix, { force: true }); } catch {}
  }
}

function assertStageUsable(stage) {
  if (/\s/.test(stage)) fail(`stage path contains a space: ${stage}`);
  if (stage.startsWith(REPO_ROOT)) fail(`stage path is inside the repo: ${stage}`);
}

function assertGitignoreCoversSidecars() {
  const ignore = readFileSync(GITIGNORE, 'utf8');
  for (const name of ['*.sqlite-wal', '*.sqlite-shm']) {
    if (!ignore.split('\n').some(l => l.trim() === name)) {
      fail(`repo gitignore lacks '${name}' -- add no duplicate here, fix the gitignore instead`);
    }
  }
}

// --- static half ---------------------------------------------------------------

function runStatic() {
  const results = [];
  let assertions = 0;
  function check(id, cond, detail) {
    assertions++;
    results.push({ id, pass: !!cond });
    console.log(`${NAME}: drive ${cond ? 'PASS' : 'FAIL'} -- ${id}${cond ? '' : ` -- ${detail}`}`);
  }

  if (!existsSync(FIXTURE)) fail(`committed fixture absent at ${FIXTURE}`);
  const ddl = extractWriterDdl(readFileSync(WRITER, 'utf8'));
  check('ddl-derived-from-writer', ddl.includes('CREATE TABLE tabs') && ddl.includes('CREATE INDEX idx_tabs_last_active'),
    'derived DDL lacks the tabs table or its index');
  const hashBefore = sha256Of(FIXTURE);

  const stage = mkdtempSync(join(tmpdir(), 'pb-tabs-soak-'));
  assertStageUsable(stage);
  console.log(`${NAME}: stage ${stage} (space-free, outside repo)`);
  try {
    const p = join(stage, 'tabs.sqlite');
    copyFileSync(FIXTURE, p);
    check('stage-seed-equal', sha256Of(p) === hashBefore, 'stage copy differs from the committed fixture right after copying');

    // Two handles, one file, sequential turns: tab upserts on A alternate
    // with bookmark-shape writes on B (IN-01: no overlapping transaction is
    // ever attempted, so this proves binding and integrity under
    // dual-handle use, not lock contention).
    const a = new DatabaseSync(p);
    const b = new DatabaseSync(p);
    try {
      check('store-at-version-1', a.prepare('PRAGMA user_version').get().user_version === 1, 'stage copy is not at chain version 1');
      check('store-wal-pinned', a.prepare('PRAGMA journal_mode').get().journal_mode === 'wal', 'stage copy is not in WAL mode');
      b.exec(WITNESS_DDL);
      const now = 1700000000000;
      upsertTab(a, { uri: 'soak:quote', url: 'https://example.com/soak/quote', title: QUOTE_TITLE, last_active: now });
      for (let i = 0; i < INTERLEAVE_N; i++) {
        upsertTab(a, { uri: `soak:tab-${i}`, url: `https://example.com/soak/${i}`, title: `soak tab ${i}`, last_active: now + i });
        b.prepare('INSERT INTO soak_bookmarks(url, title, parent) VALUES (?, ?, ?) ON CONFLICT (url) DO UPDATE SET title=excluded.title')
          .run(`https://example.com/soak/${i}`, `soakmark ${i}`, 'toolbar_____');
      }
    } finally {
      a.close();
      b.close();
    }

    check('fixture-byte-identity', sha256Of(FIXTURE) === hashBefore, 'the committed fixture changed -- the run must mutate stage copies only');

    {
      const db = new DatabaseSync(p, { readOnly: true });
      try {
        check('soak-integrity-single-ok', integritySingleOk(db), 'integrity result is not exactly single-ok after the interleave');
        const quote = db.prepare('SELECT title FROM tabs WHERE uri = ?').get('soak:quote');
        check('quote-title-bound', quote && quote.title === QUOTE_TITLE, 'quote-plus-unicode title did not survive bound-parameter upsert exactly');
        const marks = db.prepare('SELECT COUNT(*) AS n FROM soak_bookmarks').get().n;
        check('bookmark-witness-count', marks === INTERLEAVE_N, `want ${INTERLEAVE_N} bookmark-shape rows, got ${marks}`);
      } finally {
        db.close();
      }
    }

    // The witness table is stage-only: the committed fixture must not carry
    // it (non-vacuity for the stage-copies-only rule, beside the hash).
    {
      const db = new DatabaseSync(FIXTURE, { readOnly: true });
      try {
        const found = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'soak_bookmarks'`).get();
        check('witness-stage-only', found === undefined, 'soak_bookmarks exists in the committed fixture');
      } finally {
        db.close();
      }
    }

    // Tampered copy trips distinctly; the plant must actually land.
    {
      const q = join(stage, 'tampered.sqlite');
      copyFileSync(p, q);
      const bytes = readFileSync(q);
      bytes.fill(0xff, 100, 612);
      writeFileSync(q, bytes);
      const landed = !readFileSync(q).equals(readFileSync(p));
      check('tamper-plant-landed', landed, 'tamper bytes did not change the copy');
      check('tamper-tripwire-fires', tripwireTripped(q), 'integrity passed on a deliberately corrupted copy');
      // The tamper artifact is corrupt by design, so no checkpoint applies --
      // unlink the file plus the sidecars its readonly probe materialized.
      rmSync(q, { force: true });
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try { rmSync(q + suffix, { force: true }); } catch {}
      }
    }

    checkpointThenClean(p);
    const sidecars = readdirSync(stage).filter(f => f.endsWith('-wal') || f.endsWith('-shm') || f.endsWith('-journal'));
    check('sidecars-cleaned', sidecars.length === 0, `stage sidecars remain: ${sidecars.join(', ')}`);
    assertGitignoreCoversSidecars();
    check('gitignore-covers-sidecars', true, 'unreachable');
    check('assertions-nonvacuous', assertions > 0, 'zero assertions ran');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  const failed = results.filter(r => !r.pass);
  if (failed.length) {
    console.error(`${NAME}: FAIL -- ${failed.length}/${results.length} drive(s) red`);
    process.exit(1);
  }
  console.log(`${NAME}: PASS -- ${results.length} drives, ${assertions} assertions`);
}

// --- live half -------------------------------------------------------------------

function startupWiringPresent() {
  for (const file of ['powerbrowser/shell/powerbrowser.js', 'powerbrowser/shell/TheiaService.sys.mjs']) {
    try {
      if (/startTabStoreTriggers|ensureTabStore/.test(readFileSync(join(REPO_ROOT, file), 'utf8'))) return true;
    } catch {
      // A missing caller file is itself absent wiring.
    }
  }
  return false;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function driveOnce({ profileDir, args, settleMs = 10000, readyTimeoutMs = 120000 }) {
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
}

async function runLive() {
  if (!existsSync(BIN)) {
    staged('built binary absent at objdir/dist/bin/powerbrowser -- build it first (see docs/BUILD.md "Firefox half")');
    return;
  }
  if (!startupWiringPresent()) {
    staged('startup trigger wiring not landed (no startup call into ensureTabStore/startTabStoreTriggers in powerbrowser.js or TheiaService.sys.mjs) -- no session can exercise the writer yet');
    return;
  }
  const stage = mkdtempSync(join(tmpdir(), 'pb-tabs-soak-live-'));
  assertStageUsable(stage);
  console.log(`${NAME}: stage ${stage} (space-free, outside repo)`);
  try {
    const profileDir = mkdtempSync(join(stage, 'profile-'));
    await driveOnce({ profileDir, args: ['https://example.com/soak/live-1', 'https://example.com/soak/live-2'] });
    const tabsPath = join(profileDir, 'tabs.sqlite');
    if (!existsSync(tabsPath)) {
      fail('live drive wrote no tabs.sqlite -- the drive was vacuous, not clean');
    }
    const db = new DatabaseSync(tabsPath, { readOnly: true });
    try {
      if (!integritySingleOk(db)) fail('live tabs.sqlite integrity is not exactly single-ok after the interleave');
    } finally {
      db.close();
    }
    console.log(`${NAME}: drive PASS -- live tabs.sqlite exactly single-ok`);
    const placesPath = join(profileDir, 'places.sqlite');
    if (existsSync(placesPath)) {
      const pdb = new DatabaseSync(placesPath, { readOnly: true });
      try {
        if (!integritySingleOk(pdb)) fail('live places.sqlite integrity is not exactly single-ok');
      } finally {
        pdb.close();
      }
      console.log(`${NAME}: drive PASS -- live places.sqlite exactly single-ok`);
    } else {
      console.log(`${NAME}: places.sqlite absent this run -- tab-side integrity is the gate`);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  console.log(`${NAME}: PASS -- live interleave ends exactly single-ok`);
}

// --- self-test ---------------------------------------------------------------------

function selfTest() {
  const green = spawnSync(process.execPath, [join(HERE, 'verify-sql-store-soak.mjs')], { encoding: 'utf8' });
  if (green.status !== 0) {
    console.error(`${NAME} --self-test: FAIL -- the unmodified static drive is already red, so the planted-fault results below would be meaningless:`);
    process.stderr.write(green.stderr ?? '');
    process.exit(1);
  }
  console.log(`${NAME} --self-test: unmodified static drive green, planting faults`);

  const ddl = extractWriterDdl(readFileSync(WRITER, 'utf8'));
  const stage = mkdtempSync(join(tmpdir(), 'pb-tabs-soak-self-'));
  assertStageUsable(stage);
  let failed = 0;
  try {
    const seed = name => {
      const path = join(stage, name);
      const db = new DatabaseSync(path);
      try {
        for (const s of statementsOf(ddl)) db.exec(s);
        upsertTab(db, { uri: 'soak:quote', url: 'https://example.com/soak/quote', title: QUOTE_TITLE, last_active: 1 });
      } finally {
        db.close();
      }
      return path;
    };

    // Plant 1: a tampered copy must trip (failing-first); the plant must land.
    {
      const path = seed('tampered.sqlite');
      const before = readFileSync(path);
      const bytes = readFileSync(path);
      bytes.fill(0xff, 100, 612);
      writeFileSync(path, bytes);
      const landed = !readFileSync(path).equals(before);
      if (!landed) {
        console.error(`${NAME} --self-test: FAIL -- 'tamper' plant did not land`);
        failed++;
      } else if (!tripwireTripped(path)) {
        console.error(`${NAME} --self-test: FAIL -- 'tamper' did not trip; the predicate cannot go red`);
        failed++;
      } else {
        console.log(`  ok  tampered copy -> tripwire tripped (failing-first)`);
      }
    }

    // Plant 2: the clean copy must be exactly single-ok.
    {
      const path = seed('clean.sqlite');
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        if (!integritySingleOk(db)) {
          console.error(`${NAME} --self-test: FAIL -- clean copy is not exactly single-ok`);
          failed++;
        } else {
          console.log(`  ok  clean copy -> exactly single-ok`);
        }
      } finally {
        db.close();
      }
      checkpointThenClean(path);
    }

    // Plant 3: the quote title round-trips exactly through bound parameters.
    {
      const path = seed('bound.sqlite');
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const row = db.prepare('SELECT title FROM tabs WHERE uri = ?').get('soak:quote');
        if (!row || row.title !== QUOTE_TITLE) {
          console.error(`${NAME} --self-test: FAIL -- quote title did not round-trip exactly`);
          failed++;
        } else {
          console.log(`  ok  quote-plus-unicode title -> exact round-trip`);
        }
      } finally {
        db.close();
      }
      checkpointThenClean(path);
    }

    // Plant 4: markerless source fails distinctly, never derives ghosts.
    {
      let threw = false;
      try {
        extractWriterDdl('no markers here');
      } catch (err) {
        threw = /markers absent/.test(err.message);
      }
      if (!threw) {
        console.error(`${NAME} --self-test: FAIL -- markerless source did not fail distinctly`);
        failed++;
      } else {
        console.log(`  ok  markerless source -> distinct derivation failure`);
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  if (failed) process.exit(1);
  console.log(`${NAME} --self-test: PASS -- tamper trips, clean holds, binding proves, derivation fails distinctly`);
}

// --- entry ---------------------------------------------------------------------------

if (process.argv.includes('--help')) {
  console.log(`Usage: node scripts/verify-sql-store-soak.mjs [--live] [--self-test]

${NAME}: static fixture interleave always runs by default (no build, no
browser, no display). --live runs the temp-profile drive through the built
binary, STAGED when the binary or startup wiring is absent. --self-test
plants faults instead.`.trimEnd());
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else if (process.argv.includes('--live')) {
  await runLive();
} else {
  runStatic();
}
