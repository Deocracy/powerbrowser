#!/usr/bin/env node
// Re-date still-open .planning/WINDOWS.md entries (Phase 59 D-09): each named entry keeps its id,
// its status "open" and its GATE_KNOWN_OPEN_EXCLUSIONS row; only its reason gains the prefix
// "Re-dated to <date> (Phase 59 D-09)". Reads and writes through gsd-core's broken-windows parser
// so gsd-tools keeps parsing the file afterwards.
//
//   node scripts/redate-windows.mjs --date YYYY-MM-DD|'next version' [--file <...>/.planning/WINDOWS.md] [--dry-run] <id> [<id>...]
//   node scripts/redate-windows.mjs --self-test
//
// The parser is gsd-core's own and is not in this tree, so it is loaded on first use, never at import (audit
// harness-driver-06, 59-CR-03): without it the tool FAILs and the self-test SKIPs (exit 77, SKIP-PROTOCOL.md), each
// naming the path. The registry row is full tier, not --quick: the commit gate and CI never run code from the
// developer's home directory. The self-test's ledger is synthetic (59-WR-04), so it does not depend on how many
// entries .planning/WINDOWS.md still has open.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const require = createRequire(import.meta.url);
const BW_PATH = process.env.GSD_BROKEN_WINDOWS
  ?? path.join(os.homedir(), '.claude', 'gsd-core', 'bin', 'lib', 'broken-windows.cjs');
let bwModule = null;
/** gsd-core's broken-windows module; throws naming BW_PATH when it is absent. */
function loadBw() {
  if (bwModule) return bwModule;
  try {
    bwModule = require(BW_PATH);
  } catch (e) {
    throw Object.assign(new Error(`gsd-core's broken-windows parser could not be loaded from ${BW_PATH} (${e.code ?? e.message}). Next step: install gsd-core, or set GSD_BROKEN_WINDOWS to its broken-windows.cjs`), { parserMissing: true });
  }
  return bwModule;
}

const DEFAULT_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.planning', 'WINDOWS.md');
// D-46 (2026-11-15): the owner date may also be the literal "next version".
const DATE_RE = /^(?:\d{4}-\d{2}-\d{2}|next version)$/;
const PREFIX_RE = /^Re-dated to (?:\d{4}-\d{2}-\d{2}|next version) \(Phase 59 D-09\)(?:; )?/;

function redateReason(oldReason, date) {
  // A second re-date replaces the earlier prefix instead of stacking one on top of it.
  const rest = String(oldReason ?? '').replace(PREFIX_RE, '');
  return `Re-dated to ${date} (Phase 59 D-09)` + (rest ? `; ${rest}` : '');
}

// Returns the planned changes; writes only when dryRun is false. Throws on any refused id before
// anything is written.
export function redate({ file, date, ids, dryRun, now = new Date().toISOString() }) {
  const bw = loadBw();
  if (!DATE_RE.test(date)) throw new Error(`--date must be YYYY-MM-DD or "next version", got ${JSON.stringify(date)}`);
  if (ids.length === 0) throw new Error('at least one WINDOWS.md id is required');
  const planningDir = path.dirname(file);
  if (path.basename(planningDir) !== '.planning') throw new Error(`--file must be <project>/.planning/WINDOWS.md, got ${file}`);
  const cwd = path.dirname(planningDir);

  const run = () => {
    const raw = fs.readFileSync(file, 'utf8');
    const doc = bw.parseLedger(raw);
    const before = { open: doc.open_count, waived: doc.waived_count, fixed: doc.fixed_count, total: doc.total_count };
    const changes = [];
    for (const id of ids) {
      const entry = doc.entries.find((e) => e.id === id);
      if (!entry) throw new Error(`id ${id}: no such WINDOWS.md entry`);
      if (entry.status !== 'open') throw new Error(`id ${id}: status is "${entry.status}", only an open entry can be re-dated`);
      const next = redateReason(entry.reason, date);
      changes.push({ id, from: entry.reason, to: next });
      entry.reason = next;
    }
    if (dryRun) return changes;
    doc.last_updated = now;
    const out = bw.renderLedger(doc);
    const after = bw.parseLedger(out);
    const same = after.open_count === before.open && after.waived_count === before.waived
      && after.fixed_count === before.fixed && after.total_count === before.total
      && ids.every((id) => after.entries.find((e) => e.id === id)?.status === 'open');
    if (!same) throw new Error('post-write check failed: a status or a count moved; nothing written');
    const tmp = `${file}.${process.pid}.redate.tmp`;
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, file);
    return changes;
  };
  return dryRun ? run() : bw.withLedgerLock(cwd, run);
}

function printChanges(changes, dryRun) {
  for (const c of changes) {
    console.log(`${dryRun ? '[dry-run] ' : ''}id ${c.id}: status open (unchanged)`);
    console.log(`  reason: ${JSON.stringify(c.from)}`);
    console.log(`     ->   ${JSON.stringify(c.to)}`);
  }
  const n = `${changes.length} entr${changes.length === 1 ? 'y' : 'ies'}`;
  console.log(dryRun ? `redate-windows: dry run, ${n} would change, nothing written` : `redate-windows: ${n} re-dated`);
}

/**
 * A ledger of fixed shape built with gsd-core's own constructors: two open entries, one fixed and one waived. The
 * self-test runs on it, so its plants and controls do not move as the project closes real entries (59-WR-04).
 */
function syntheticLedger(bw) {
  const now = '2026-01-01T00:00:00.000Z';
  let ledger = bw.emptyLedger(now);
  const ids = [];
  for (const description of ['open entry one', 'open entry two', 'entry to be fixed', 'entry to be waived']) {
    const r = bw.appendWindow(ledger, { kind: 'stub', phase: '59', file: 'scripts/redate-windows.mjs', line: 1, description }, { now });
    ledger = r.ledger;
    ids.push(r.entry.id);
  }
  ledger = bw.markFixed(ledger, ids[2], { now });
  ledger = bw.markWaived(ledger, ids[3], 'synthetic waiver', { now });
  return { text: bw.renderLedger(ledger), open: [ids[0], ids[1]], fixed: ids[2], waived: ids[3] };
}

function selfTest() {
  let bw;
  try { bw = loadBw(); } catch (e) {
    if (!e.parserMissing) throw e;
    console.log(skipLine('redate-windows --self-test', e.message));
    return SKIP_EXIT;
  }
  const fails = [];
  const check = (name, ok, detail = '') => {
    if (!ok) fails.push(`${name}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
  };
  const realBefore = fs.existsSync(DEFAULT_FILE) ? fs.readFileSync(DEFAULT_FILE, 'utf8') : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redate-windows-selftest-'));
  const file = path.join(dir, '.planning', 'WINDOWS.md');
  fs.mkdirSync(path.dirname(file));
  const synthetic = syntheticLedger(bw);
  fs.writeFileSync(file, synthetic.text);
  try {
    const fixture = bw.parseLedger(fs.readFileSync(file, 'utf8'));
    const open = fixture.entries.filter((e) => e.status === 'open').map((e) => e.id);
    const notOpen = synthetic.fixed;
    check('synthetic fixture has two open, one fixed and one waived entry', open.length === 2 && fixture.fixed_count === 1 && fixture.waived_count === 1);
    const [a, b] = open;
    const original = fs.readFileSync(file, 'utf8');
    const date = '2099-01-01';

    const dry = redate({ file, date, ids: [a], dryRun: true });
    check('dry run changes nothing on disk', fs.readFileSync(file, 'utf8') === original);
    check('dry run reports the planned reason', dry.length === 1 && dry[0].to.startsWith(`Re-dated to ${date} (Phase 59 D-09)`));

    let threw = false;
    try { redate({ file, date, ids: [a, notOpen], dryRun: false }); } catch { threw = true; }
    check('a fixed id is refused and nothing is written', threw && fs.readFileSync(file, 'utf8') === original);
    threw = false;
    try { redate({ file, date, ids: [a, synthetic.waived], dryRun: false }); } catch { threw = true; }
    check('a waived id is refused and nothing is written', threw && fs.readFileSync(file, 'utf8') === original);
    threw = false;
    try { redate({ file, date, ids: [a, 10 ** 6], dryRun: false }); } catch { threw = true; }
    check('an unknown id is refused and nothing is written', threw && fs.readFileSync(file, 'utf8') === original);
    threw = false;
    try { redate({ file, date: '01/01/2099', ids: [a], dryRun: true }); } catch { threw = true; }
    check('a malformed date is refused', threw);

    redate({ file, date, ids: [a, b], dryRun: false, now: '2099-01-01T00:00:00.000Z' });
    const after = bw.parseLedger(fs.readFileSync(file, 'utf8'));
    check('file still parses with the gsd-core parser', true);
    check('counts unchanged', after.open_count === fixture.open_count && after.fixed_count === fixture.fixed_count
      && after.waived_count === fixture.waived_count && after.total_count === fixture.total_count,
      `${fixture.open_count}/${fixture.fixed_count}/${fixture.waived_count}/${fixture.total_count} -> `
      + `${after.open_count}/${after.fixed_count}/${after.waived_count}/${after.total_count}`);
    for (const id of [a, b]) {
      const was = fixture.entries.find((e) => e.id === id);
      const is = after.entries.find((e) => e.id === id);
      check(`id ${id} re-dated, still open, only reason changed`,
        is.status === 'open' && is.reason === redateReason(was.reason, date)
        && JSON.stringify({ ...was, reason: '' }) === JSON.stringify({ ...is, reason: '' }));
    }
    const untouched = fixture.entries.filter((e) => e.id !== a && e.id !== b);
    check('every other entry is identical', untouched.every((was) =>
      JSON.stringify(was) === JSON.stringify(after.entries.find((e) => e.id === was.id))), `${untouched.length} entries compared`);
    check('last_updated moved', after.last_updated === '2099-01-01T00:00:00.000Z');

    redate({ file, date: '2100-02-02', ids: [a], dryRun: false });
    const again = bw.parseLedger(fs.readFileSync(file, 'utf8')).entries.find((e) => e.id === a);
    check('a second re-date replaces the prefix instead of stacking',
      again.reason.startsWith('Re-dated to 2100-02-02 (Phase 59 D-09)') && !again.reason.includes('2099-01-01'));
    redate({ file, date: 'next version', ids: [a], dryRun: false });
    redate({ file, date: 'next version', ids: [a], dryRun: false });
    const nv = bw.parseLedger(fs.readFileSync(file, 'utf8')).entries.find((e) => e.id === a);
    check('"next version" is accepted and replaces a dated prefix, also on a repeat',
      nv.reason === redateReason(fixture.entries.find((e) => e.id === a).reason, 'next version') && !nv.reason.includes('2100-02-02'));
    check('the real WINDOWS.md was not touched', (fs.existsSync(DEFAULT_FILE) ? fs.readFileSync(DEFAULT_FILE, 'utf8') : null) === realBefore);
    // Plant: the parser absent (harness-driver-06). The self-test must SKIP by exit 77 naming the path, the tool
    // must FAIL naming it, and neither may throw at import.
    const missing = path.join(dir, 'no-gsd-core', 'broken-windows.cjs');
    const self = new URL(import.meta.url).pathname;
    const env = { ...process.env, GSD_BROKEN_WINDOWS: missing };
    const st = spawnSync(process.execPath, [self, '--self-test'], { env, encoding: 'utf8' });
    check('a missing parser makes the self-test a named SKIP (exit 77)', st.status === SKIP_EXIT && st.stdout.includes(`SKIP -- gsd-core's broken-windows parser could not be loaded from ${missing}`),
      `exit ${st.status}: ${(st.stdout + st.stderr).trim().split('\n').pop()}`);
    const tool = spawnSync(process.execPath, [self, '--date', date, '--dry-run', '--file', file, String(a)], { env, encoding: 'utf8' });
    check('a missing parser makes the tool FAIL naming it', tool.status === 1 && tool.stderr.includes(`redate-windows: FAIL -- gsd-core's broken-windows parser could not be loaded from ${missing}`),
      `exit ${tool.status}: ${(tool.stdout + tool.stderr).trim().split('\n').pop()}`);
  } catch (e) {
    check(`no step threw (${e.message})`, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (fails.length) { console.error(`redate-windows --self-test: FAIL -- ${fails.join('; ')}`); return 1; }
  console.log('redate-windows --self-test: PASS');
  return 0;
}

function main(argv) {
  const opts = { file: DEFAULT_FILE, date: null, dryRun: false, selfTest: false, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') opts.selfTest = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--date') opts.date = argv[++i];
    else if (a === '--file') opts.file = path.resolve(argv[++i]);
    else if (/^\d+$/.test(a)) opts.ids.push(Number(a));
    else { console.error(`redate-windows: unknown argument ${a}`); process.exit(2); }
  }
  if (opts.selfTest) process.exit(selfTest());
  if (!opts.date) { console.error('redate-windows: --date YYYY-MM-DD or --date "next version" is required'); process.exit(2); }
  try {
    printChanges(redate(opts), opts.dryRun);
  } catch (e) {
    console.error(`redate-windows: FAIL -- ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main(process.argv.slice(2));
