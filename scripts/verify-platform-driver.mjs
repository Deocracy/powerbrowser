#!/usr/bin/env node
// scripts/verify-platform-driver.mjs
//
// The driver's own verdict logic, proven by running it (audit harness-driver-08). scripts/verify-platform.sh is
// staged into a temp tree and run in fixture mode (PB_VERIFY_FIXTURE_REGISTRY, see its header) over planted rows:
// a row that passes, one that exits 77 with a SKIP line, one that prints a SKIP last line and exits 0 (a script not
// yet converted, audit harness-driver-01), a partial SKIP note followed by a PASS, a bare exit 77, a FAIL, and
// --gate rows against a fixture ledger: an excused SKIP, an unexcused SKIP, a FAIL the exclusion describes, a
// different FAIL in an excluded row, a second FAIL beside the described one, and an exclusion whose entry is fixed.
//
// Each case reads the driver's own summary and verdict lines. Then each plant edits one decision out of a copy of
// the driver (the SKIP last-line rule, exit 77, the gate's SKIP pass, the pattern check, mode "only", the ledger
// check) and the case that decision serves must go red. The expectation is the driver's output on the fixture,
// never a list copied from the registry.
//
//   node scripts/verify-platform-driver.mjs --self-test

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NAME = 'verify-platform-driver';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = join(REPO_ROOT, 'scripts', 'verify-platform.sh');
// Every process a daemon-shaped fixture row starts carries this argument, so the self-test can tell whether one
// is still running (and stop it at the end whatever happened).
const MARKER = `vpd-fixture-${process.pid}-${Date.now()}`;

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
};

// Rows that leave a process behind: in the row's own group, in a session of its own (found only by the row token),
// and a plain survivor. The daemon-shaped ones end in the entry the leak leg derives from this tree.
function daemonRows(entry) {
    const leave = (argv, opts) => `import { spawn } from 'node:child_process'; spawn(process.execPath, ${JSON.stringify(['-e', 'setInterval(() => {}, 1e9)', MARKER, ...argv])}, ${opts}).unref(); console.log('fx: PASS -- left a process behind');`;
    return {
        leakGroup: leave([`/fx${entry}`], "{ stdio: 'ignore' }"),
        leakDetached: leave([`/fx${entry}`], "{ stdio: 'ignore', detached: true }"),
        survivor: leave(['fx-survivor'], "{ stdio: 'ignore' }"),
    };
}

/** Pids of every process still running with MARKER in its arguments. */
function strays() {
    const out = [];
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        try { if (readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').includes(MARKER)) out.push(Number(name)); } catch { /* exited */ }
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
    'nothing a row left is still running after the run': ['leaks', () => { const left = strays(); return want(left.length === 0, `pid(s) ${left.join(', ')} still running`); }],
    '--gate fails a row that leaves a process behind': ['gateSurvivor', (r) => want(has(r, '  fx-survivor: FAIL\n') && has(r, 'under --gate a row must clean up'), 'fx-survivor was not failed under --gate')],
};

// Each plant removes one decision; the named case must go red on the planted driver.
const PLANTS = [
    { name: 'the SKIP last-line rule removed', from: 'if [[ "$last" =~ $SKIP_LINE_RE ]]; then', to: 'if false; then', kase: 'exit 0 with a SKIP last line is SKIP, not PASS' },
    { name: 'exit 77 read as an ordinary status', from: 'elif [ "$rc" -eq "$SKIP_EXIT" ]; then', to: 'elif false; then', kase: 'exit 77 with a SKIP line is SKIP, with its reason listed' },
    { name: 'the gate reading no SKIP rows', from: 'mapfile -t skipped_labels < <(extract_skipped_labels "$log")', to: 'skipped_labels=()', kase: '--gate fails a row that prints a SKIP last line and exits 0' },
    { name: 'the exclusion pattern check removed', from: 'if ! miss="$(row_output "$log" "$label" | exclusion_covers "$excl_mode" "$excl_patterns")"; then', to: 'if false; then', kase: '--gate keeps a different FAIL in an excluded row red' },
    { name: 'mode only ignoring a second FAIL', from: 'if [ "$mode" = "only" ] && [ "$covered" -eq 0 ]', to: 'if false && [ "$covered" -eq 0 ]', kase: '--gate keeps a second FAIL beside the described one red (mode only)' },
    { name: 'the ledger status check removed', from: 'if ! ledger_entry_is_open "$excl_ledger_id"; then', to: 'if false; then', kase: '--gate fails a row whose entry is no longer open' },
    { name: 'the leak leg neutralised by || true', from: '--label "$label" --sweep || leg_rc=$?', to: '--label "$label" --sweep || true', kase: 'a row that leaves a daemon in its group is FAIL' },
    { name: 'the leak leg run only on a live process group', from: 'if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null || row_token_alive "$CURRENT_ROW_TOKEN"; then', to: 'if kill -0 -- "-$CURRENT_CHECK_PID" 2>/dev/null; then', kase: 'a row that leaves a daemon in a session of its own is FAIL (found by the row token)' },
    { name: 'the leak leg run without --sweep', from: '--label "$label" --sweep || leg_rc=$?', to: '--label "$label" || leg_rc=$?', kase: 'nothing a row left is still running after the run' },
    { name: 'a survivor not red under --gate', from: 'elif [ "$survivors" -eq 1 ] && [ "$GATE" -eq 1 ]; then', to: 'elif false; then', kase: '--gate fails a row that leaves a process behind' },
];

function stage(driverText, root) {
    const dir = mkdtempSync(join(root, 'tree-'));
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

function runDriver(tree, fx, runName) {
    const run = RUNS[runName];
    const registry = join(fx, `registry-${runName}.txt`);
    writeFileSync(registry, run.rows.map(([tier, label, key]) => `${tier}|${label}|node ${join(fx, `${key}.mjs`)}`).join('\n') + '\n');
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('PB_VERIFY_') || k === 'PB_LIVE_LOCK_HELD') delete env[k];
    Object.assign(env, {
        PB_VERIFY_FIXTURE_REGISTRY: registry,
        PB_VERIFY_FIXTURE_EXCLUSIONS: join(fx, 'exclusions.txt'),
        PB_VERIFY_FIXTURE_WINDOWS: join(fx, 'WINDOWS.md'),
        PB_VERIFY_FIXTURE_LOCK: join(fx, 'pb-live.lock'),
    });
    const r = spawnSync('bash', [tree.driver, ...run.args], { env, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}${r.error ? `\nspawn error: ${r.error.message}` : ''}` };
}

function judge(tree, fx, caseNames) {
    const results = {};
    const out = {};
    for (const name of caseNames) {
        const [runName, test] = CASES[name];
        results[runName] ??= runDriver(tree, fx, runName);
        out[name] = test(results[runName]);
    }
    return out;
}

async function selfTest() {
    const root = mkdtempSync(join(tmpdir(), 'verify-platform-driver-'));
    let misses = 0;
    try {
        const text = readFileSync(DRIVER, 'utf8');
        const fx = await fixtures(root, text);
        const control = judge(stage(text, root), fx, Object.keys(CASES));
        for (const [name, why] of Object.entries(control)) {
            if (why) misses++;
            console.log(`  ${why ? 'MISS' : 'ok '} control ${name}${why ? ` -> ${why}` : ''}`);
        }
        for (const plant of PLANTS) {
            const hits = text.split(plant.from).length - 1;
            if (hits !== 1) {
                misses++;
                console.log(`  MISS plant ${plant.name} -> the driver text it edits occurs ${hits} time(s), want 1 (the driver moved; update this plant)`);
                continue;
            }
            const why = judge(stage(text.replace(plant.from, plant.to), root), fx, [plant.kase])[plant.kase];
            if (!why) misses++;
            console.log(`  ${why ? 'ok ' : 'MISS'} plant ${plant.name} -> ${why ? `red: ${why}` : `"${plant.kase}" stayed green`}`);
        }
    } finally {
        for (const pid of strays()) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
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
