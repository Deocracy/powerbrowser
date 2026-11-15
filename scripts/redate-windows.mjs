#!/usr/bin/env node
// Re-date still-open .planning/WINDOWS.md entries (Phase 59 D-09): each named entry keeps its id,
// its status "open" and its GATE_KNOWN_OPEN_EXCLUSIONS row; only its reason gains the prefix
// "Re-dated to <date> (Phase 59 D-09)". Reads and writes through gsd-core's broken-windows parser
// so gsd-tools keeps parsing the file afterwards.
//
//   node scripts/redate-windows.mjs --date YYYY-MM-DD|'next version' [--file <...>/.planning/WINDOWS.md] [--dry-run] <id> [<id>...]
//   node scripts/redate-windows.mjs --self-test
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BW_PATH = process.env.GSD_BROKEN_WINDOWS
  ?? path.join(os.homedir(), '.claude', 'gsd-core', 'bin', 'lib', 'broken-windows.cjs');
const bw = require(BW_PATH);

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

function selfTest() {
  const fails = [];
  const check = (name, ok, detail = '') => {
    if (!ok) fails.push(`${name}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redate-windows-selftest-'));
  const file = path.join(dir, '.planning', 'WINDOWS.md');
  fs.mkdirSync(path.dirname(file));
  fs.copyFileSync(DEFAULT_FILE, file);
  try {
    const fixture = bw.parseLedger(fs.readFileSync(file, 'utf8'));
    const open = fixture.entries.filter((e) => e.status === 'open').map((e) => e.id);
    const notOpen = fixture.entries.find((e) => e.status !== 'open')?.id;
    check('fixture has two open entries and one non-open entry', open.length >= 2 && notOpen !== undefined);
    const [a, b] = open;
    const original = fs.readFileSync(file, 'utf8');
    const date = '2099-01-01';

    const dry = redate({ file, date, ids: [a], dryRun: true });
    check('dry run changes nothing on disk', fs.readFileSync(file, 'utf8') === original);
    check('dry run reports the planned reason', dry.length === 1 && dry[0].to.startsWith(`Re-dated to ${date} (Phase 59 D-09)`));

    let threw = false;
    try { redate({ file, date, ids: [a, notOpen], dryRun: false }); } catch { threw = true; }
    check('a non-open id is refused and nothing is written', threw && fs.readFileSync(file, 'utf8') === original);
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
    check('the real WINDOWS.md was not touched', !fs.readFileSync(DEFAULT_FILE, 'utf8').includes('Re-dated to 2099-01-01'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (fails.length) { console.error(`redate-windows --self-test: FAIL -- ${fails.join('; ')}`); process.exit(1); }
  console.log('redate-windows --self-test: PASS');
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
  if (opts.selfTest) return selfTest();
  if (!opts.date) { console.error('redate-windows: --date YYYY-MM-DD or --date "next version" is required'); process.exit(2); }
  try {
    printChanges(redate(opts), opts.dryRun);
  } catch (e) {
    console.error(`redate-windows: FAIL -- ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main(process.argv.slice(2));
