#!/usr/bin/env node
// scripts/verify-platform-driver.mjs
//
// The driver's own verdict logic, proven by running it (audit harness-driver-08). scripts/verify-platform.sh is
// staged into a temp tree and run in fixture mode (PB_VERIFY_FIXTURE_REGISTRY, see its header) over planted rows:
// a row that passes, one that exits 77 with a SKIP line, one that prints a SKIP last line and exits 0 (a script not
// yet converted, audit harness-driver-01), a partial SKIP note followed by a PASS, a bare exit 77, a FAIL, and
// --gate rows against a fixture ledger: an excused SKIP, an unexcused SKIP, a FAIL the exclusion describes, a
// different FAIL in an excluded row, a second FAIL beside the described one, and an exclusion whose entry is fixed.
// Rows that leave a daemon-shaped process in their group or in a session of their own, or another survivor
// (harness-driver-04, -07), and rows that probe the live lock: free in a quick-tier row, held in a full-tier one,
// waited for when another run holds it, not waited for when the driver's own caller holds it (harness-live-tabs-14).
//
// Each case reads the driver's own summary and verdict lines. Then each plant edits one decision out of a copy of
// the driver (the SKIP last-line rule, exit 77, the gate's SKIP pass, the pattern check, mode "only", the ledger
// check, the leak leg's status and token and sweep, the gate's survivor rule, the lock and its caller check) and
// the case that decision serves must go red. The expectation is the driver's output on the fixture, never a list
// copied from the registry. Runs share nothing, so up to PARALLEL run at once.
//
//   node scripts/verify-platform-driver.mjs --self-test

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NAME = 'verify-platform-driver';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = join(REPO_ROOT, 'scripts', 'verify-platform.sh');
// Every process a daemon-shaped fixture row starts carries this argument (plus a per-run suffix, VPD_MARKER), so
// the self-test can tell whether one is still running and stop it at the end whatever happened.
const MARKER = `vpd-fixture-${process.pid}-${Date.now()}`;
// Driver runs at once: they share nothing (each has its own registry, marker and lock).
const PARALLEL = 6;

const ROWS = {
    pass: `console.log('fx: PASS -- planted control');`,
    skip77: `console.log('fx-skip77: SKIP -- planted input absent'); process.exit(77);`,
    legacy: `console.log('fx-legacy: some clause ran'); console.log('fx-legacy: SKIP -- legacy planted input absent');`,
    partial: `console.log('fx-partial: SKIP -- one planted clause'); console.log('fx-partial: PASS -- the other clauses ran');`,
    bare77: `process.exit(77);`,
    fail: `console.error('fx-fail: FAIL -- planted red'); process.exit(1);`,
    covered: `console.error('fx-covered: FAIL -- planted input absent: fixture-objdir missing'); process.exit(1);`,
    other: `console.error('fx-other: FAIL -- a different planted red'); process.exit(1);`,
    two: `console.error('fx-two: FAIL -- 2 problem(s)'); console.error('fx-two: FAIL -- planted input absent'); console.error('fx-two: FAIL -- a second planted red'); process.exit(1);`,
    closed: `console.error('fx-closed: FAIL -- planted input absent'); process.exit(1);`,
    excusedSkip: `console.log('fx-excused-skip: SKIP -- planted excused precondition'); process.exit(77);`,
    // Review point 1: a last line with no trailing newline, both ways.
    legacyNoNl: `process.stdout.write('fx-legacy-nonl: ran\\nfx-legacy-nonl: SKIP -- planted input absent');`,
    passNoNl: `process.stdout.write('fx-pass-nonl: SKIP -- a planted note\\nfx-pass-nonl: PASS -- the clauses ran');`,
    // Review point 2: a tally line whose items do not carry the word FAIL, with a second, undescribed item; and the
    // same tally whose only other item is guidance.
    items: `console.error('fx-items: FAIL -- 2 failure(s):'); console.error('  planted input absent'); console.error('  a second planted item'); process.exit(1);`,
    itemsOk: `console.error('fx-items-ok: FAIL -- 1 failure(s):'); console.error('  planted input absent'); console.error('  Next step: provide the planted input'); process.exit(1);`,
    // A self-test row (mode any): a planted fault's own red output is not judged, but a control the self-test
    // reports as failed is.
    anyOk: `console.log('  search: FAIL -- a planted fault going red as designed'); console.error('fx-any-ok --self-test: FAIL -- planted input absent'); process.exit(1);`,
    anyTwo: `console.log('  search: FAIL -- a planted fault going red as designed'); console.error('fx-any-two --self-test: FAIL -- planted input absent'); console.error('fx-any-two --self-test: control other FAIL -- an undescribed control red'); process.exit(1);`,
    // A row that sleeps, for the killed-driver and interrupt runs.
    sleepRow: `console.log('fx-sleep: started'); setTimeout(() => console.log('fx: PASS -- slept'), 4000);`,
    // The live lock (harness-live-tabs-14): free during a quick-tier row, held (and PB_LIVE_LOCK_HELD=1) during a
    // full-tier one. flock -n on the fixture lock is the probe.
    lockFree: `import { spawnSync } from 'node:child_process'; const r = spawnSync('flock', ['-n', process.env.PB_VERIFY_FIXTURE_LOCK, 'true']); if (r.status === 0) console.log('fx: PASS -- lock free'); else { console.error('fx-lock-free: FAIL -- the live lock is held during a quick-tier row'); process.exit(1); }`,
    lockHeld: `import { spawnSync } from 'node:child_process'; import { readFileSync } from 'node:fs'; const r = spawnSync('flock', ['-n', process.env.PB_VERIFY_FIXTURE_LOCK, 'true']); const h = /^(\\d+):(\\d+)$/.exec(process.env.PB_LIVE_LOCK_HOLDER ?? ''); let ticks = null; try { const s = readFileSync('/proc/' + h[1] + '/stat', 'utf8'); ticks = s.slice(s.lastIndexOf(')') + 2).split(' ')[19]; } catch {} if (r.status === 1 && process.env.PB_LIVE_LOCK_HELD === '1' && h && ticks === h[2]) console.log('fx: PASS -- lock held'); else { console.error(\`fx-lock-held: FAIL -- flock -n exit \${r.status}, PB_LIVE_LOCK_HELD=\${process.env.PB_LIVE_LOCK_HELD}, PB_LIVE_LOCK_HOLDER=\${process.env.PB_LIVE_LOCK_HOLDER}: a full-tier row ran outside the live lock, or without a holder that names a live process\`); process.exit(1); }`,
};

// Rows that leave a process behind: in the row's own group, in a session of its own (found only by the row token),
// and a plain survivor. The daemon-shaped ones end in the entry the leak leg derives from this tree.
function daemonRows(entry) {
    const leave = (argv, opts) => `import { spawn } from 'node:child_process'; spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', process.env.VPD_MARKER, ...${JSON.stringify(argv)}], ${opts}).unref(); console.log('fx: PASS -- left a process behind');`;
    return {
        leakGroup: leave([`/fx${entry}`], "{ stdio: 'ignore' }"),
        leakDetached: leave([`/fx${entry}`], "{ stdio: 'ignore', detached: true }"),
        survivor: leave(['fx-survivor'], "{ stdio: 'ignore' }"),
        // Review point 4: a detached process carrying the row token, then the row sleeps until interrupted.
        detachThenSleep: `import { spawn } from 'node:child_process'; spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)', process.env.VPD_MARKER, 'fx-detached'], { stdio: 'ignore', detached: true }).unref(); setInterval(() => {}, 1e9);`,
    };
}

/** Pids of every process still running with `marker` as an argument, or (prefix true) an argument starting with it. */
function strays(marker, prefix = false) {
    const out = [];
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
        try {
            const argv = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0');
            if (argv.some((a) => (prefix ? a.includes(marker) : a === marker))) out.push(Number(name));
        } catch { /* exited */ }
    }
    return out;
}

const LEDGER = '# fixture ledger\n\n````json\n' + JSON.stringify([{ id: 1, status: 'open' }, { id: 2, status: 'fixed' }], null, 2) + '\n````\n';
const EXCLUSIONS = [
    'fx-covered|1|FAIL|only|planted input absent|fixture entry 1',
    'fx-other|1|FAIL|only|planted input absent|fixture entry 1',
    'fx-two|1|FAIL|only|planted input absent|fixture entry 1',
    'fx-closed|2|FAIL|only|planted input absent|fixture entry 2 (fixed)',
    'fx-excused-skip|1|SKIP|any|SKIP -- planted excused precondition|fixture entry 1',
    'fx-items|1|FAIL|only|planted input absent|fixture entry 1',
    'fx-items-ok|1|FAIL|only|planted input absent|fixture entry 1',
    'fx-any-ok|1|FAIL|any|planted input absent|fixture entry 1',
    'fx-any-two|1|FAIL|any|planted input absent|fixture entry 1',
].join('\n') + '\n';

// The runs. Each names its mode and its rows (tier|label|row key).
const RUNS = {
    quick: { args: ['--quick'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-skip77', 'skip77'], ['quick', 'fx-legacy', 'legacy'], ['quick', 'fx-partial', 'partial'], ['quick', 'fx-bare77', 'bare77'], ['quick', 'fx-fail', 'fail'], ['full', 'fx-full-only', 'pass']] },
    quickSkip: { args: ['--quick'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-skip77', 'skip77']] },
    gate: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-skip77', 'skip77'], ['quick', 'fx-excused-skip', 'excusedSkip'], ['full', 'fx-covered', 'covered'], ['full', 'fx-other', 'other'], ['full', 'fx-two', 'two'], ['full', 'fx-closed', 'closed']] },
    gateExcused: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-excused-skip', 'excusedSkip'], ['full', 'fx-covered', 'covered']] },
    gateLegacy: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-legacy', 'legacy']] },
    gateGreen: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['full', 'fx-full-only', 'pass']] },
    leaks: { args: [], rows: [['full', 'fx-leak-group', 'leakGroup'], ['full', 'fx-leak-detached', 'leakDetached'], ['full', 'fx-survivor', 'survivor']] },
    gateSurvivor: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['quick', 'fx-survivor', 'survivor']] },
    lock: { args: [], rows: [['quick', 'fx-lock-free', 'lockFree'], ['full', 'fx-lock-held', 'lockHeld']] },
    lockWait: { args: [], hold: 1.5, rows: [['full', 'fx-lock-held', 'lockHeld']] },
    lockAncestor: { args: [], wrap: true, rows: [['full', 'fx-lock-held', 'lockHeld']] },
    // The live-lock contract (SKIP-PROTOCOL.md, "The live lock"): another process holds the lock throughout.
    lockForged: { args: [], hold: 6, env: { PB_LIVE_LOCK_HELD: '1' }, rows: [['full', 'fx-lock-held', 'lockHeld']] },
    lockWrongTicks: { args: [], hold: 6, holderEnv: 'wrong-ticks', rows: [['full', 'fx-lock-held', 'lockHeld']] },
    lockNamed: { args: [], hold: 6, holderEnv: 'right', rows: [['full', 'fx-lock-held', 'lockHeld']] },
    lockAncestorForged: { args: [], wrap: true, env: { PB_LIVE_LOCK_HELD: '1' }, rows: [['full', 'fx-lock-held', 'lockHeld']] },
    quickExtra: { args: ['--quick'], rows: [['quick', 'fx-legacy-nonl', 'legacyNoNl'], ['quick', 'fx-pass-nonl', 'passNoNl'], ['quick', 'fx-fn', 'FN:check_fixture_function_skip']] },
    gateModes: { args: ['--gate'], rows: [['quick', 'fx-items', 'items'], ['quick', 'fx-items-ok', 'itemsOk'], ['quick', 'fx-any-ok', 'anyOk'], ['quick', 'fx-any-two', 'anyTwo']] },
    gateNoSummary: { args: ['--gate'], rows: [['quick', 'fx-pass', 'pass'], ['bogus', 'fx-bogus', 'pass']] },
    lockBound: { args: [], hold: 6, env: { PB_LIVE_LOCK_WAIT_S: '1' }, rows: [['full', 'fx-lock-held', 'lockHeld']] },
    lockKilled: { args: [], killDriver: true, rows: [['full', 'fx-sleep', 'sleepRow']] },
    interrupt: { args: [], interrupt: true, rows: [['full', 'fx-detach-sleep', 'detachThenSleep']] },
    strayTracked: { args: ['--quick'], where: 'tracked', rows: [['quick', 'fx-pass', 'pass']] },
    strayElsewhere: { args: ['--quick'], where: 'elsewhere', rows: [['quick', 'fx-pass', 'pass']] },
};

const has = (r, s) => r.text.includes(s);
const want = (ok, why) => (ok ? null : why);

// name -> [run, test(result) -> null | why]
const CASES = {
    'exit 0 is PASS': ['quick', (r) => want(has(r, '  fx-pass: PASS\n'), 'no "fx-pass: PASS" summary line')],
    'exit 77 with a SKIP line is SKIP, with its reason listed': ['quick', (r) => want(has(r, '  fx-skip77: SKIP\n') && has(r, 'fx-skip77 -- planted input absent'), 'fx-skip77 is not a SKIP naming its reason')],
    'exit 0 with a SKIP last line is SKIP, not PASS': ['quick', (r) => want(has(r, '  fx-legacy: SKIP\n') && has(r, 'convert the script to exit 77'), `fx-legacy is ${/ {2}fx-legacy: (\w+)/.exec(r.text)?.[1] ?? 'absent'}, want SKIP`)],
    'a SKIP note followed by a PASS line stays PASS': ['quick', (r) => want(has(r, '  fx-partial: PASS\n'), 'fx-partial is not PASS')],
    'exit 77 with no SKIP line is FAIL': ['quick', (r) => want(has(r, '  fx-bare77: FAIL\n') && has(r, 'without printing'), 'fx-bare77 is not a FAIL naming the missing SKIP line')],
    'exit 1 is FAIL and the run exits 1': ['quick', (r) => want(has(r, '  fx-fail: FAIL\n') && r.status === 1, `fx-fail FAIL with exit 1 not seen (exit ${r.status})`)],
    '--quick runs no full-tier row': ['quick', (r) => want(!has(r, 'fx-full-only'), 'fx-full-only ran under --quick')],
    'a SKIP alone leaves --quick at exit 0 and says SKIPPED': ['quickSkip', (r) => want(r.status === 0 && has(r, 'FIXTURE PASS -- every check that ran passed; 1 SKIPPED'), `exit ${r.status}, verdict line not the SKIPPED pass`)],
    '--gate fails an unexcused SKIP': ['gate', (r) => want(has(r, 'FAIL (unexcused SKIP): fx-skip77'), 'fx-skip77 was not failed as an unexcused SKIP')],
    '--gate excuses a SKIP its open entry describes': ['gate', (r) => want(has(r, 'EXCLUDED (known-open): fx-excused-skip -- SKIP -- WINDOWS.md ledger entry 1'), 'fx-excused-skip was not excused')],
    '--gate excuses the FAIL its open entry describes': ['gate', (r) => want(has(r, 'EXCLUDED (known-open): fx-covered -- FAIL -- WINDOWS.md ledger entry 1'), 'fx-covered was not excused')],
    '--gate keeps a different FAIL in an excluded row red': ['gate', (r) => want(has(r, 'FAIL (exclusion does not apply): fx-other') && has(r, 'no output line contains: planted input absent'), 'fx-other was excused for a failure its entry does not describe')],
    '--gate keeps a second FAIL beside the described one red (mode only)': ['gate', (r) => want(has(r, 'FAIL (exclusion does not apply): fx-two') && has(r, 'a failure the exclusion does not describe: fx-two: FAIL -- a second planted red'), 'fx-two was excused with an undescribed second FAIL')],
    '--gate fails a row whose entry is no longer open': ['gate', (r) => want(has(r, 'FAIL (exclusion does not apply): fx-closed') && has(r, "ledger entry 2 is no longer 'open'"), 'fx-closed was excused by a fixed entry')],
    '--gate exits 1 on any of those': ['gate', (r) => want(r.status === 1 && has(r, 'FIXTURE --gate FAIL'), `exit ${r.status}`)],
    '--gate with only excused rows is PASS-WITH-EXCLUSIONS': ['gateExcused', (r) => want(r.status === 0 && has(r, 'FIXTURE --gate PASS-WITH-EXCLUSIONS') && has(r, '2 named known-open exclusion(s)'), `exit ${r.status}, verdict not PASS-WITH-EXCLUSIONS with 2`)],
    '--gate fails a row that prints a SKIP last line and exits 0': ['gateLegacy', (r) => want(r.status === 1 && has(r, 'FAIL (unexcused SKIP): fx-legacy'), `exit ${r.status}; the legacy SKIP row passed the gate`)],
    '--gate with every row green is PASS and runs the full tier': ['gateGreen', (r) => want(r.status === 0 && has(r, 'FIXTURE --gate PASS -- commit') && has(r, '  fx-full-only: PASS\n'), `exit ${r.status}`)],
    'a row that leaves a daemon in its group is FAIL': ['leaks', (r) => want(has(r, '  fx-leak-group: FAIL\n') && has(r, 'fx-leak-group left '), 'fx-leak-group is not a FAIL naming the process it left')],
    'a row that leaves a daemon in a session of its own is FAIL (found by the row token)': ['leaks', (r) => want(has(r, '  fx-leak-detached: FAIL\n') && has(r, 'found by its row token'), 'fx-leak-detached is not a FAIL found by the row token')],
    'a row that leaves another process keeps its verdict and the process is named': ['leaks', (r) => want(has(r, '  fx-survivor: PASS\n') && has(r, 'NOTE -- fx-survivor left pid'), 'fx-survivor is not PASS with a NOTE naming the survivor')],
    'nothing a row left is still running after the run': ['leaks', (r) => { const left = strays(r.marker); return want(left.length === 0, `pid(s) ${left.join(', ')} still running`); }],
    '--gate fails a row that leaves a process behind': ['gateSurvivor', (r) => want(has(r, '  fx-survivor: FAIL\n') && has(r, 'under --gate a row must clean up'), 'fx-survivor was not failed under --gate')],
    'a quick-tier row runs with the live lock free': ['lock', (r) => want(has(r, '  fx-lock-free: PASS\n'), 'fx-lock-free did not pass')],
    'a full-tier row runs under the live lock': ['lock', (r) => want(has(r, '  fx-lock-held: PASS\n') && has(r, 'live lock') && has(r, 'taken for the full-tier rows'), 'fx-lock-held did not run under the lock')],
    'the lock is released when the run ends': ['lock', (r) => want(r.lockFreeAfter, 'the fixture lock is still held after the run')],
    'a run waits for another holder of the live lock': ['lockWait', (r) => want(has(r, 'waiting for the live lock') && has(r, '  fx-lock-held: PASS\n'), `exit ${r.status}; no wait message, or the row did not pass after the wait`)],
    'a SKIP last line with no trailing newline is SKIP': ['quickExtra', (r) => want(has(r, '  fx-legacy-nonl: SKIP\n'), `fx-legacy-nonl is ${/ {2}fx-legacy-nonl: (\w+)/.exec(r.text)?.[1] ?? 'absent'}, want SKIP`)],
    'a PASS last line with no trailing newline after a SKIP note is PASS': ['quickExtra', (r) => want(has(r, '  fx-pass-nonl: PASS\n'), `fx-pass-nonl is ${/ {2}fx-pass-nonl: (\w+)/.exec(r.text)?.[1] ?? 'absent'}, want PASS`)],
    'a function row returning 77 is SKIP': ['quickExtra', (r) => want(has(r, '  fx-fn: SKIP\n') && has(r, 'fx-fn -- function row returned 77'), 'fx-fn is not a SKIP')],
    '--gate keeps an undescribed item under a tally line red (mode only)': ['gateModes', (r) => want(has(r, 'FAIL (exclusion does not apply): fx-items') && has(r, 'does not describe:   a second planted item'), 'fx-items was excused with an undescribed item line')],
    '--gate excuses a tally whose items are described or guidance (mode only)': ['gateModes', (r) => want(has(r, 'EXCLUDED (known-open): fx-items-ok'), 'fx-items-ok was not excused')],
    '--gate excuses a self-test row whose own red is described (mode any)': ['gateModes', (r) => want(has(r, 'EXCLUDED (known-open): fx-any-ok'), 'fx-any-ok was not excused')],
    '--gate keeps a self-test row\'s second, undescribed control red (mode any)': ['gateModes', (r) => want(has(r, 'FAIL (exclusion does not apply): fx-any-two') && has(r, 'control other FAIL'), 'fx-any-two was excused with an undescribed control red')],
    '--gate fails a run that ends with no summary': ['gateNoSummary', (r) => want(r.status === 1 && has(r, 'FAIL (no summary)'), `exit ${r.status}; a run with no summary passed the gate`)],
    'a lock wait is bounded and names the holder': ['lockBound', (r) => want(has(r, 'is still held after 1 s by: pid ') && has(r, '  fx-lock-held: FAIL\n'), 'the driver did not stop waiting after PB_LIVE_LOCK_WAIT_S naming the holder pid')],
    'a driver killed by SIGKILL releases the live lock': ['lockKilled', (r) => want(r.lockFreeAfterKill === true, r.lockFreeAfterKill === null ? 'the lock was never taken, so the kill proves nothing' : 'the live lock was still held 5 s after the driver was killed')],
    'an interrupted run stops what its row left in a session of its own': ['interrupt', (r) => { const left = strays(r.marker); return want(r.interrupted && left.length === 0, r.interrupted ? `pid(s) ${left.join(', ')} still running after the interrupt` : 'the row never started its detached process'); }],
    'the tracked driver refuses a stray fixture variable': ['strayTracked', (r) => want(r.status === 1 && has(r, "is not the driver self-test's staged copy") && !has(r, 'fx-pass'), `exit ${r.status}; the tracked driver ran the fixture registry`)],
    'a driver copy outside the staged path refuses it too': ['strayElsewhere', (r) => want(r.status === 1 && has(r, "is not the driver self-test's staged copy") && !has(r, 'fx-pass'), `exit ${r.status}; a copy outside the staged path ran the fixture registry`)],
    'a forged PB_LIVE_LOCK_HELD=1 while another process holds the lock is a FAIL': ['lockForged', (r) => want(has(r, 'A variable cannot stand in for the lock') && has(r, '  fx-lock-held: FAIL\n') && !has(r, 'fx: PASS -- lock held') && !has(r, 'fx-lock-held: FAIL -- flock -n exit'), 'the driver went on (its row ran) under a forged PB_LIVE_LOCK_HELD=1')],
    'a PB_LIVE_LOCK_HOLDER naming the holder with wrong start ticks is a FAIL': ['lockWrongTicks', (r) => want(has(r, 'A variable cannot stand in for the lock') && has(r, '  fx-lock-held: FAIL\n') && !has(r, 'fx: PASS -- lock held') && !has(r, 'fx-lock-held: FAIL -- flock -n exit'), 'the driver went on (its row ran) under a holder variable with the wrong start ticks')],
    'a PB_LIVE_LOCK_HOLDER naming the holder with its start ticks goes on': ['lockNamed', (r) => want(has(r, 'confirmed in /proc/locks') && has(r, '  fx-lock-held: PASS\n'), 'the driver did not go on under the real holder')],
    'an ancestor holder goes on, even beside a forged PB_LIVE_LOCK_HELD=1': ['lockAncestorForged', (r) => want(r.status === 0 && has(r, 'held by a caller of this run') && has(r, '  fx-lock-held: PASS\n'), `exit ${r.status}${r.timedOut ? ' (timed out)' : ''}; an ancestor flock did not let the driver go on`)],
    'the waiting message names the holder and suggests no variable': ['lockWait', (r) => want(has(r, 'waiting for the live lock') && /held by: pid \d+ /.test(r.text) && !/set PB_LIVE_LOCK/.test(r.text), 'the wait message does not name the holder pid, or still suggests setting a variable')],
    'a run under flock <lock> by its caller does not wait for itself': ['lockAncestor', (r) => want(r.status === 0 && has(r, 'held by a caller of this run'), `exit ${r.status}${r.timedOut ? ' (timed out: the run waited for its own caller)' : ''}`)],
};

// Each plant removes one decision; the named case must go red on the planted driver.
const PLANTS = [
    { name: 'the SKIP last-line rule removed', from: 'if [[ "$last" =~ $SKIP_LINE_RE ]]; then', to: 'if false; then', kase: 'exit 0 with a SKIP last line is SKIP, not PASS' },
    { name: 'exit 77 read as an ordinary status', from: 'elif [ "$rc" -eq "$SKIP_EXIT" ]; then', to: 'elif false; then', kase: 'exit 77 with a SKIP line is SKIP, with its reason listed' },
    { name: 'the gate reading no SKIP rows', from: 'mapfile -t skipped_labels < <(extract_skipped_labels "$log")', to: 'skipped_labels=()', kase: '--gate fails a row that prints a SKIP last line and exits 0' },
    { name: 'the exclusion pattern check removed', from: 'if ! miss="$(row_output "$log" "$label" | exclusion_covers "$excl_mode" "$excl_patterns")"; then', to: 'if false; then', kase: '--gate keeps a different FAIL in an excluded row red' },
    { name: 'mode only ignoring a second FAIL', from: 'if [ "$mode" = "only" ]; then judged=1', to: 'if false; then judged=1', kase: '--gate keeps a second FAIL beside the described one red (mode only)' },
    { name: 'mode only ignoring item lines under a tally', from: '[ "$mode" = "only" ] && ! [[ "$line" =~ ^[[:space:]]+(-[[:space:]]+)?Next\\ step: ]] && judged=1', to: 'true', kase: '--gate keeps an undescribed item under a tally line red (mode only)' },
    { name: 'mode any judging no line', from: 'elif [ "$mode" = "any" ] && [[ "$line" == *self-test* ]]; then judged=1', to: 'elif false; then judged=1', kase: '--gate keeps a self-test row\'s second, undescribed control red (mode any)' },
    { name: 'the row reader dropping an unterminated last line', from: 'while IFS= read -r line || [ -n "$line" ]; do\n    [[ "$line" =~ [^[:space:]] ]] && last="$line"', to: 'while IFS= read -r line; do\n    [[ "$line" =~ [^[:space:]] ]] && last="$line"', kase: 'a SKIP last line with no trailing newline is SKIP' },
    { name: 'a function row\'s 77 read as FAIL', from: 'elif [ "$fn_rc" -eq "$SKIP_EXIT" ]; then ROW_VERDICT=SKIP', to: 'elif false; then ROW_VERDICT=SKIP', kase: 'a function row returning 77 is SKIP' },
    { name: 'the gate\'s no-summary guard removed', from: 'if [ "$rc" -ne 0 ] && [ "${#failed_labels[@]}" -eq 0 ]; then', to: 'if false; then', kase: '--gate fails a run that ends with no summary' },
    { name: 'an unbounded lock wait', from: 'local limit=$(( ${PB_LIVE_LOCK_WAIT_S:-21600} * 10 ))', to: 'local limit=999999999', kase: 'a lock wait is bounded and names the holder' },
    { name: 'a lock holder that outlives the driver', from: 'do sleep 1; done', to: 'do sleep 1; done; sleep 30', kase: 'a driver killed by SIGKILL releases the live lock' },
    { name: 'no token sweep in cleanup()', from: '--session "$interrupted_pid" --token', to: '--session 0 --token', kase: 'an interrupted run stops what its row left in a session of its own' },
    { name: 'fixture mode honoured outside the staged path', from: '    "${TMPDIR:-/tmp}"/verify-platform-driver-*/tree-*) ;;', to: '    *) ;;', kase: 'a driver copy outside the staged path refuses it too' },
    { name: 'the ledger status check removed', from: 'if ! ledger_entry_is_open "$excl_ledger_id"; then', to: 'if false; then', kase: '--gate fails a row whose entry is no longer open' },
    { name: 'the leak leg neutralised by || true', from: '--label "$label" --sweep || leg_rc=$?', to: '--label "$label" --sweep || true', kase: 'a row that leaves a daemon in its group is FAIL' },
    { name: 'the leak leg run only on a live process group', from: 'if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null || row_token_alive "$CURRENT_ROW_TOKEN"; then', to: 'if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null; then', kase: 'a row that leaves a daemon in a session of its own is FAIL (found by the row token)' },
    { name: 'the leak leg run without --sweep', from: '--label "$label" --sweep || leg_rc=$?', to: '--label "$label" || leg_rc=$?', kase: 'nothing a row left is still running after the run' },
    { name: 'a survivor not red under --gate', from: 'elif [ "$survivors" -eq 1 ] && [ "$GATE" -eq 1 ]; then', to: 'elif false; then', kase: '--gate fails a row that leaves a process behind' },
    { name: 'the live lock not taken', from: 'if [ -n "${FULL_TIER[$label]:-}" ] && ! acquire_live_lock; then', to: 'if false; then', kase: 'a full-tier row runs under the live lock' },
    { name: 'the named holder\'s start ticks not compared', from: '[ "$(start_ticks_of "$pid")" = "$ticks" ] || return 1', to: 'true', kase: 'a PB_LIVE_LOCK_HOLDER naming the holder with wrong start ticks is a FAIL' },
    { name: 'an inherited PB_LIVE_LOCK_HELD trusted', from: '    return 1 # forged-lock-variable', to: '    LIVE_LOCK_STATE=1; return 0 # forged-lock-variable', kase: 'a forged PB_LIVE_LOCK_HELD=1 while another process holds the lock is a FAIL' },
    { name: 'no check for a caller holding the lock', from: '  if lock_held_by_ancestor "$lock"; then', to: '  if false; then', kase: 'a run under flock <lock> by its caller does not wait for itself' },
];

function stage(driverText, root, prefix = 'tree-') {
    const dir = mkdtempSync(join(root, prefix));
    mkdirSync(join(dir, 'scripts'));
    const driver = join(dir, 'scripts', 'verify-platform.sh');
    writeFileSync(driver, driverText);
    chmodSync(driver, 0o755);
    // Every other scripts/ entry is a link, so the helpers the driver runs after a row (the leak leg) are the real
    // ones; node resolves the link, so they read the real tree.
    for (const name of readdirSync(join(REPO_ROOT, 'scripts'))) {
        if (name !== 'verify-platform.sh') symlinkSync(join(REPO_ROOT, 'scripts', name), join(dir, 'scripts', name));
    }
    return { dir, driver };
}

async function fixtures(root, driverText) {
    const fx = join(root, 'fx');
    mkdirSync(fx);
    // The leak leg the driver runs, named by the driver itself; its entry is derived from this tree.
    const leg = /\$REPO_ROOT\/scripts\/(verify-[a-z]+-leak\.mjs)"/.exec(driverText)?.[1];
    if (!leg) throw new Error('the driver names no leak leg script');
    const { legEntry } = await import(pathToFileURL(join(REPO_ROOT, 'scripts', leg)).href);
    const entry = legEntry();
    if (!entry) throw new Error(`${leg} derives no entry from this tree`);
    for (const [key, body] of Object.entries({ ...ROWS, ...daemonRows(entry) })) writeFileSync(join(fx, `${key}.mjs`), body + '\n');
    writeFileSync(join(fx, 'WINDOWS.md'), LEDGER);
    writeFileSync(join(fx, 'exclusions.txt'), EXCLUSIONS);
    return fx;
}

let runSeq = 0;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const flockFree = (lock) => spawnSync('flock', ['-n', lock, 'true']).status === 0;

/** One driver run in fixture mode; resolves { status, timedOut, text, marker, lockFreeAfter }. */
async function runDriver(trees, fx, runName) {
    const run = RUNS[runName];
    const tree = run.where === 'tracked' ? { driver: DRIVER } : run.where === 'elsewhere' ? trees.elsewhere() : trees.staged();
    const id = `${runName}-${++runSeq}`;
    const registry = join(fx, `registry-${id}.txt`);
    const lock = join(fx, `lock-${id}`);
    const marker = `${MARKER}-${id}`;
    writeFileSync(registry, run.rows.map(([tier, label, key]) => `${tier}|${label}|${key.startsWith('FN:') ? key.slice(3) : `node ${join(fx, `${key}.mjs`)}`}`).join('\n') + '\n');
    writeFileSync(lock, '');
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('PB_VERIFY_') || k.startsWith('PB_LIVE_LOCK_')) delete env[k];
    Object.assign(env, {
        PB_VERIFY_FIXTURE_REGISTRY: registry,
        PB_VERIFY_FIXTURE_EXCLUSIONS: join(fx, 'exclusions.txt'),
        PB_VERIFY_FIXTURE_WINDOWS: join(fx, 'WINDOWS.md'),
        PB_VERIFY_FIXTURE_LOCK: lock,
        VPD_MARKER: marker,
        ...(run.env ?? {}),
    });
    let holder = null;
    if (run.hold) {
        // Another live run: it holds the lock for run.hold seconds, taken before the driver starts.
        holder = spawn('flock', [lock, 'sleep', String(run.hold)], { stdio: 'ignore' });
        for (let i = 0; i < 100 && flockFree(lock); i++) await settle(20);
        if (run.holderEnv) {
            // flock itself holds the lock (/proc/locks names its pid); 'wrong-ticks' names that pid with other ticks.
            const stat = readFileSync(`/proc/${holder.pid}/stat`, 'utf8');
            const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
            env.PB_LIVE_LOCK_HELD = '1';
            env.PB_LIVE_LOCK_HOLDER = `${holder.pid}:${run.holderEnv === 'right' ? ticks : ticks + 1}`;
        }
    }
    const [bin, argv] = run.wrap ? ['flock', [lock, 'bash', tree.driver, ...run.args]] : ['bash', [tree.driver, ...run.args]];
    // A process group of its own, so a timed-out run (the driver waiting on a lock its own caller holds: flock hands
    // the locked descriptor to its command) is killed whole. 'exit', not 'close': a stuck grandchild may hold a pipe.
    const c = spawn(bin, argv, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }, run.wrap ? 8000 : 180000);
    const exited = new Promise((r) => c.once('exit', (code) => r(code)));
    let lockFreeAfterKill = null;
    let interrupted = false;
    if (run.killDriver) {
        // Review point 3: once the driver holds the lock, SIGKILL the driver alone (no cleanup() runs, its row lives
        // on); the lock must come free within 5 s.
        for (let i = 0; i < 300 && flockFree(lock); i++) await settle(30);
        if (!flockFree(lock)) {
            process.kill(c.pid, 'SIGKILL');
            lockFreeAfterKill = false;
            for (let i = 0; i < 50 && !lockFreeAfterKill; i++) { await settle(100); lockFreeAfterKill = flockFree(lock); }
        }
    }
    if (run.interrupt) {
        // Review point 4: once the row's detached process runs, SIGTERM the driver (its trap runs cleanup()).
        for (let i = 0; i < 300 && !strays(marker).length; i++) await settle(30);
        interrupted = strays(marker).length > 0;
        process.kill(c.pid, 'SIGTERM');
    }
    const status = await exited;
    clearTimeout(timer);
    if (run.interrupt) await settle(300);
    await settle(50);
    c.stdout.destroy();
    c.stderr.destroy();
    if (holder) holder.kill('SIGKILL');
    return { status, timedOut, text: `${out}\n${err}`, marker, lockFreeAfter: !timedOut && flockFree(lock), lockFreeAfterKill, interrupted };
}

/** Runs fn over items, at most PARALLEL at once; resolves the results in order. */
async function pool(items, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
    return out;
}

/** caseNames -> { name: why | null } for driver text `text`, each run the cases need made once. */
async function judge(text, root, fx, caseNames) {
    const lazy = (prefix) => { let t; return () => (t ??= stage(text, root, prefix)); };
    const trees = { staged: lazy('tree-'), elsewhere: lazy('elsewhere-') };
    const runNames = [...new Set(caseNames.map((n) => CASES[n][0]))];
    const results = Object.fromEntries((await pool(runNames, (rn) => runDriver(trees, fx, rn))).map((r, i) => [runNames[i], r]));
    return Object.fromEntries(caseNames.map((n) => [n, CASES[n][1](results[CASES[n][0]])]));
}

async function selfTest() {
    const root = mkdtempSync(join(tmpdir(), 'verify-platform-driver-'));
    let misses = 0;
    try {
        const text = readFileSync(DRIVER, 'utf8');
        const fx = await fixtures(root, text);
        const control = await judge(text, root, fx, Object.keys(CASES));
        for (const [name, why] of Object.entries(control)) {
            if (why) misses++;
            console.log(`  ${why ? 'MISS' : 'ok '} control ${name}${why ? ` -> ${why}` : ''}`);
        }
        const planted = await pool(PLANTS, async (plant) => {
            const hits = text.split(plant.from).length - 1;
            if (hits !== 1) return { plant, moved: hits };
            return { plant, why: (await judge(text.replace(plant.from, plant.to), root, fx, [plant.kase]))[plant.kase] };
        });
        for (const { plant, moved, why } of planted) {
            if (moved !== undefined) {
                misses++;
                console.log(`  MISS plant ${plant.name} -> the driver text it edits occurs ${moved} time(s), want 1 (the driver moved; update this plant)`);
                continue;
            }
            if (!why) misses++;
            console.log(`  ${why ? 'ok ' : 'MISS'} plant ${plant.name} -> ${why ? `red: ${why}` : `"${plant.kase}" stayed green`}`);
        }
    } finally {
        // Whatever a planted fault left running: the fixture daemons, and any driver or lock holder of the temp tree.
        for (const pid of [...strays(MARKER, true), ...strays(root, true)]) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
        rmSync(root, { recursive: true, force: true });
    }
    if (misses) {
        console.error(`${NAME} --self-test: FAIL -- ${misses} case(s) missed`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- ${Object.keys(CASES).length} driver cases green on the fixture, and ${PLANTS.length} planted driver faults each turned its case red`);
    return 0;
}

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--self-test') {
    console.error(`${NAME}: FAIL -- usage: node scripts/verify-platform-driver.mjs --self-test`);
    process.exit(2);
}
process.exit(await selfTest());
