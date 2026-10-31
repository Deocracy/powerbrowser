#!/usr/bin/env node
// scripts/verify-watchdog.mjs
//
// The MON-01 gate (Phase 48, plan 48-04, NAME watchdog). The watchdog source docs/watchdog.yml is applied by
// the owner to powerbrowser-updates at plan 48-05 and never to the product repository (D-77). This gate proves
// the watchdog's decision and its source's shape in the tree, offline:
//
//  1. The decision, on the workflow's own shell. The `run:` bodies of the latest, decide and open steps are
//     extracted from the YAML and run under bash with a stub gh on PATH, the step env resolved from the YAML's
//     own env mapping. A run started 25 hours ago opens nothing; 27 hours opens exactly one issue carrying the
//     run link and both timestamps and the fixed label; no run at all opens one issue naming the missing run;
//     an open issue of the watchdog's own (bot author, fixed label, same title) suppresses a second; a stranger's
//     same-title issue does not, because the dedupe query is by author and label (the stub records the argv and
//     the gate asserts it). There is no JavaScript twin of the decision: what is tested is what runs.
//  2. The source text, parsed with the repo's js-yaml (theia/): exactly the schedule and workflow_dispatch
//     triggers (no workflow_run, so no unguarded wake), one schedule entry with cron 17 6 * * *, one job on
//     ubuntu-latest, issues write as the only grant, no secret reference, no App token, the 26-hour threshold
//     (-ge 93600), the fixed title and label, SHA-pinned uses:, and no github.event text in any run.
//  3. The product repository. No workflow under .github/workflows has a schedule trigger (parsed, so
//     `on: [push, schedule]` and `on: schedule` count).
//
// Usage:
//   node scripts/verify-watchdog.mjs             the gate: prints "watchdog: PASS" when every check holds
//   node scripts/verify-watchdog.mjs --self-test the control first (the real tree), then the planted faults;
//                                                each plant must go red naming its drift
// Any other argument: FAIL, exit 2.

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'watchdog';
const SELF_REL = 'scripts/verify-watchdog.mjs';
const WATCHDOG_REL = 'docs/watchdog.yml';
const WF_DIR = join(REPO_ROOT, '.github', 'workflows');
export const WINDOW_HOURS = 26;
export const TITLE = `release-train has not run in ${WINDOW_HOURS} h`;
export const LABEL = 'release-train-watchdog';
export const AUTHOR = 'app/github-actions';
export const CRON = '17 6 * * *';
export const RUNS_PATH = 'actions/workflows/release-train.yml/runs?per_page=1';
const OWNER = 'DeBIOS-Foundation';
const HOUR_S = 3600;
const ALLOWED_TRIGGERS = Object.freeze(['schedule', 'workflow_dispatch']);
const SHA_USE = /@[0-9a-f]{40}$/;

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}

/** The source text checks. Returns the failures, each naming its drift. Pure over the text. */
export function checkWatchdogText(text) {
    const failures = [];
    let doc;
    try {
        doc = yaml.load(text);
    } catch (e) {
        return [`${WATCHDOG_REL} does not parse as YAML 1.2 (${e.message}). Next step: fix the file.`];
    }
    if (doc === null || typeof doc !== 'object') return [`${WATCHDOG_REL} is not a workflow mapping. Next step: restore the file.`];
    const triggers = Object.keys(doc.on ?? {});
    for (const t of triggers) {
        if (!ALLOWED_TRIGGERS.includes(t)) failures.push(`trigger ${t} is not allowed in the watchdog (only ${ALLOWED_TRIGGERS.join(' and ')}). Next step: remove it; a workflow_run wake needs its own same-repository guard and is not part of MON-01.`);
    }
    const schedule = doc.on?.schedule;
    if (!Array.isArray(schedule) || schedule.length !== 1) {
        failures.push(`the watchdog schedule has ${Array.isArray(schedule) ? schedule.length : 0} entries, not one. Next step: keep exactly one daily cron.`);
    } else if (schedule[0]?.cron !== CRON) {
        failures.push(`schedule cron ${JSON.stringify(schedule[0]?.cron)} is not ${CRON}. Next step: set the daily cron.`);
    }
    const jobs = Object.values(doc.jobs ?? {});
    const jobIds = Object.keys(doc.jobs ?? {});
    if (jobIds.length !== 1) failures.push(`the watchdog has ${jobIds.length} jobs, not one. Next step: keep one job, check-train.`);
    for (const job of jobs) {
        if (job['runs-on'] !== 'ubuntu-latest') failures.push(`runs-on ${JSON.stringify(job['runs-on'])} is not ubuntu-latest. Next step: use the hosted runner.`);
        const perms = job.permissions ?? {};
        if (typeof perms !== 'object') {
            failures.push(`job permissions ${JSON.stringify(perms)} are not a read-only map. Next step: declare each scope.`);
            continue;
        }
        for (const [scope, level] of Object.entries(perms)) {
            if (scope === 'contents' && level !== 'read') failures.push(`contents is ${level}, not read. Next step: the watchdog reads only.`);
            if (scope !== 'contents' && scope !== 'issues') failures.push(`scope ${scope} is ${level}; the watchdog holds issues write in its own repository only. Next step: drop it.`);
            if (scope === 'issues' && level !== 'write' && level !== 'read') failures.push(`issues is ${level}. Next step: issues write is the only write.`);
        }
    }
    if (/secrets\./.test(text)) failures.push(`a secret is referenced (secrets.): the watchdog reads with GITHUB_TOKEN only. Next step: remove the secret reference.`);
    if (/create-github-app-token/.test(text)) failures.push('an App token step is present: the watchdog reads with GITHUB_TOKEN only. Next step: remove it.');
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(text)) failures.push('a credential-shaped value is assigned in the watchdog source. Next step: remove the literal.');
    if (!text.includes(RUNS_PATH)) failures.push(`the runs API read ${RUNS_PATH} is not present. Next step: read the product repository's newest release-train run.`);
    if (!text.includes(`-ge ${WINDOW_HOURS * 3600}`)) failures.push(`the ${WINDOW_HOURS}-hour threshold (-ge ${WINDOW_HOURS * 3600}) is not in the decision. Next step: set the window to ${WINDOW_HOURS} hours.`);
    if (!text.includes(TITLE)) failures.push(`the issue title "${TITLE}" is not present. Next step: restore the fixed title.`);
    if (!text.includes(LABEL)) failures.push(`the fixed label ${LABEL} is not present. Next step: restore it; the dedupe filters on it.`);
    for (const job of jobs) {
        for (const step of job.steps ?? []) {
            if (typeof step.uses === 'string' && !SHA_USE.test(step.uses)) failures.push(`uses ${step.uses} is not pinned to a 40-hex SHA. Next step: pin it.`);
            if (typeof step.run === 'string' && step.run.includes('github.event')) failures.push('a run: step reads github.event text. Next step: pass the value through env, or do not read it.');
        }
    }
    return failures;
}

/** True when a workflow's `on:` has a schedule trigger, in string, list or mapping form. */
function hasScheduleTrigger(on) {
    if (typeof on === 'string') return on === 'schedule';
    if (Array.isArray(on)) return on.includes('schedule');
    return on !== null && typeof on === 'object' && 'schedule' in on;
}

/** The product repository carries no schedule trigger. dir: a .github/workflows directory. Pure over the files. */
export function checkProductSchedules(dir) {
    const failures = [];
    for (const file of readdirSync(dir)) {
        if (!/\.ya?ml$/.test(file)) continue;
        let doc;
        try {
            doc = yaml.load(readFileSync(join(dir, file), 'utf8'));
        } catch (e) {
            failures.push(`${file} does not parse as YAML (${e.message}), so its triggers cannot be checked. Next step: fix the file.`);
            continue;
        }
        if (hasScheduleTrigger(doc?.on)) failures.push(`${file} carries a schedule key: the product repository never schedules (D-77). Next step: remove it; the clock is the Worker.`);
    }
    return failures;
}

// ---------------------------------------------------------------------------------------------
// The decision, run as the workflow runs it.
// ---------------------------------------------------------------------------------------------

const STUB_GH = `#!/usr/bin/env bash
# Stub gh for the watchdog gate: records argv, answers only what the watchdog asks.
printf '%s\\n' "$*" >> "$STUB_LOG"
case "$1" in
  api) if [ -n "\${STUB_RUN:-}" ]; then printf '%s' "$STUB_RUN"; fi ;;
  issue) if [ "$2" = "list" ]; then printf '%s' "\${STUB_COUNT:-0}"; fi ;;
esac
exit 0
`;

/** Resolve one ${{ }} value from the YAML's own env mapping against the outputs so far. */
function resolveExpression(value, ctx) {
    if (typeof value !== 'string') return String(value);
    return value.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
        let m;
        if ((m = /^steps\.([\w-]+)\.outputs\.([\w-]+)$/.exec(expr))) return ctx.outputs[m[1]]?.[m[2]] ?? '';
        if (expr === 'github.token') return 'stub-token';
        if (expr === 'github.repository_owner') return OWNER;
        if ((m = /^vars\.(\w+) \|\| '([^']*)'$/.exec(expr))) return m[2];
        throw new Error(`broken instrument: the gate cannot resolve \${{ ${expr} }}; teach resolveExpression about it`);
    });
}

function evalCondition(cond, ctx) {
    if (cond === undefined) return true;
    const m = /^\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+) == '(\w+)'\s*\}\}$/.exec(String(cond));
    if (!m) throw new Error(`broken instrument: the gate cannot evaluate the step condition ${JSON.stringify(cond)}`);
    return (ctx.outputs[m[1]]?.[m[2]] ?? '') === m[3];
}

/**
 * Run the watchdog's steps under bash against a scenario and return what they did. scenario: { runHoursAgo: number
 * | null (no run), openOwn: the count of the watchdog's own open issues the stub reports, authorUnset: bool }.
 */
export function runWatchdog(text, scenario) {
    const doc = yaml.load(text);
    const job = Object.values(doc.jobs)[0];
    const dir = mkdtempSync(join(tmpdir(), 'watchdog-run-'));
    try {
        const bin = join(dir, 'bin');
        const log = join(dir, 'gh.log');
        const out = join(dir, 'github-output');
        mkdirSync(bin);
        writeFileSync(log, '');
        writeFileSync(join(bin, 'gh'), STUB_GH);
        chmodSync(join(bin, 'gh'), 0o755);
        const nowS = Math.floor(Date.now() / 1000);
        const run = scenario.runHoursAgo === null ? '' : JSON.stringify({
            run_started_at: new Date((nowS - scenario.runHoursAgo * HOUR_S) * 1000).toISOString().replace('.000', ''),
            html_url: 'https://github.com/DeBIOS-Foundation/powerbrowser/actions/runs/42',
        });
        const ctx = { outputs: {} };
        const calls = [];
        for (const step of job.steps) {
            if (typeof step.run !== 'string') continue;
            if (!evalCondition(step.if, ctx)) continue;
            const env = {
                PATH: `${bin}:${process.env.PATH}`,
                HOME: dir,
                RUNNER_TEMP: dir,
                GITHUB_OUTPUT: out,
                GITHUB_REPOSITORY: `${OWNER}/powerbrowser-updates`,
                STUB_LOG: log,
                STUB_RUN: run,
                STUB_COUNT: String(scenario.openOwn ?? 0),
            };
            for (const [key, value] of Object.entries(step.env ?? {})) env[key] = resolveExpression(value, ctx);
            if (scenario.authorUnset && 'WATCHDOG_AUTHOR' in env) env.WATCHDOG_AUTHOR = '';
            writeFileSync(out, '');
            // stdin is /dev/null, not the default socket pair: bash reads the system bashrc when stdin is a socket (rshd
            // detection), and on NixOS that resets PATH, so the stub gh would be skipped.
            const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], { env, encoding: 'utf8', cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
            const outputs = {};
            for (const line of readFileSync(out, 'utf8').split('\n')) {
                const i = line.indexOf('=');
                if (i > 0) outputs[line.slice(0, i)] = line.slice(i + 1);
            }
            if (step.id) ctx.outputs[step.id] = outputs;
            calls.push({ name: step.name, status: r.status, stderr: r.stderr });
        }
        const argv = readFileSync(log, 'utf8').split('\n').filter(l => l !== '');
        const bodyPath = join(dir, 'watchdog-body.md');
        return {
            calls,
            argv,
            body: existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : null,
            created: argv.filter(l => l.startsWith('issue create')),
            labelCreated: argv.filter(l => l.startsWith('label create')),
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const unclean = r => r.calls.filter(c => c.status !== 0).map(c => `${c.name}: ${c.stderr.trim()}`).join(' | ');

/** The decision scenarios over the workflow's own shell. Returns the failures. */
export function decisionFailures(text) {
    const failures = [];
    try {
        let r = runWatchdog(text, { runHoursAgo: 25 });
        if (unclean(r)) failures.push(`the 25-hour scenario did not run clean: ${unclean(r)}`);
        if (r.created.length > 0) failures.push(`a 25-hour silence opened an issue (${r.created.length} gh issue create call(s)). Next step: the window is 26 hours.`);
        const latest = r.argv.find(l => l.startsWith('api '));
        const want = `api repos/${OWNER}/powerbrowser/${RUNS_PATH} `;
        if (latest === undefined || !latest.startsWith(want)) failures.push(`the runs read was ${JSON.stringify(latest)}, not ${want.trim()}: the watchdog must read the product repository's newest release-train run. Next step: restore the runs path.`);

        r = runWatchdog(text, { runHoursAgo: 27 });
        if (unclean(r)) failures.push(`the 27-hour scenario did not run clean: ${unclean(r)}`);
        if (r.created.length !== 1) failures.push(`a 27-hour silence opened ${r.created.length} issue(s), not one. Next step: open exactly one issue when the last run started 26 hours ago or more.`);
        else {
            const c = r.created[0];
            if (!c.includes(`--title ${TITLE}`) || !c.includes(`--label ${LABEL}`)) failures.push(`the opened issue was not created with the fixed title and label: ${c}. Next step: restore --title and --label.`);
            const body = r.body ?? '';
            if (!body.includes('actions/runs/42') || !body.includes('Run started at:') || !body.includes('Checked at:')) failures.push('the 27-hour issue body lacks the run link or the timestamps. Next step: restore the body.');
            if (r.labelCreated.length !== 1) failures.push('the fixed label is not created before the issue, so issue creation fails in a repository without it. Next step: gh label create --force before gh issue create.');
        }
        const list = r.argv.find(l => l.startsWith('issue list'));
        if (list === undefined) failures.push('the dedupe never listed the open issues. Next step: restore the dedupe query.');
        else {
            if (!list.includes(`--author ${AUTHOR}`)) failures.push(`the dedupe query counts issues by any author (${list}): a stranger could open the title and silence the watchdog. Next step: filter --author ${AUTHOR}.`);
            if (!list.includes(`--label ${LABEL}`)) failures.push(`the dedupe query does not filter on the fixed label ${LABEL} (${list}). Next step: filter --label.`);
            if (!list.includes('--state open')) failures.push(`the dedupe query does not filter on open issues (${list}). Next step: filter --state open.`);
        }

        r = runWatchdog(text, { runHoursAgo: null });
        if (r.created.length !== 1) failures.push(`a missing run opened ${r.created.length} issue(s), not one. Next step: a repository with no release-train run is silent too.`);
        else if (!(r.body ?? '').includes('No release-train run is recorded')) failures.push('the missing-run issue body does not name the missing run. Next step: restore the missing-run body.');

        r = runWatchdog(text, { runHoursAgo: 27, openOwn: 1 });
        if (r.created.length > 0) failures.push('an open issue of the watchdog\'s own (deduped) still opened a second one. Next step: count the open issue and open nothing.');

        r = runWatchdog(text, { runHoursAgo: 27, openOwn: 1, authorUnset: true });
        if (r.created.length !== 1) failures.push(`with WATCHDOG_AUTHOR unset the watchdog opened ${r.created.length} issue(s), not one: an unset author must skip the dedupe and alert, never stay silent. Next step: guard the dedupe on a non-empty author.`);
    } catch (e) {
        failures.push(`the decision scenarios did not run (${e.message}). Next step: fix the watchdog's run bodies or the gate's step resolver.`);
    }
    return failures;
}

function realText() {
    return readFileSync(join(REPO_ROOT, WATCHDOG_REL), 'utf8');
}

function allFailures(text) {
    return [...decisionFailures(text), ...checkWatchdogText(text), ...checkProductSchedules(WF_DIR)];
}

function gate() {
    const failures = allFailures(realText());
    if (failures.length > 0) {
        failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the workflow's own shell, run under a stub gh, opens nothing at 25 hours, one issue with the run link at 27 hours, one naming the missing run, and none when its own issue is open (author and label query); the source is schedule-only with one 06:17 UTC cron, GITHUB_TOKEN, issues write only, and the product repository carries no schedule trigger`);
    return 0;
}

function selfTest() {
    const text = realText();
    const controlFailures = allFailures(text);
    if (controlFailures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmutated control is already red, so the planted results would mean nothing:`);
        controlFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  control: the real source under a stub gh, the source checks and the product repository -> green');
    const runStep = '    steps:\n';
    // Each plant changes one rule of the real source. The decision plants are caught by the shell run, the source
    // plants by the text checks; every plant calls the real function under test.
    const edit = (find, replace) => {
        if (text.split(find).length !== 2) throw new Error(`broken instrument: plant anchor ${JSON.stringify(find)} is not unique in ${WATCHDOG_REL}`);
        return text.replace(find, replace);
    };
    const scheduleDir = (name, content) => {
        const dir = mkdtempSync(join(tmpdir(), 'watchdog-wf-'));
        try {
            writeFileSync(join(dir, name), content);
            return checkProductSchedules(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };
    const plants = [
        { name: 'an unguarded workflow_run wake', run: () => checkWatchdogText(edit('on:\n  schedule:', 'on:\n  workflow_run:\n    workflows: [Verify static layers]\n  schedule:')), expect: 'trigger workflow_run is not allowed' },
        { name: 'an event-text read in a run step', run: () => checkWatchdogText(edit(runStep, `${runStep}      - name: planted\n        run: echo "\${{ github.event.issue.title }}"\n`)), expect: 'github.event' },
        { name: 'a secret reference', run: () => checkWatchdogText(edit('GH_TOKEN: ${{ github.token }}\n          OWNER:', 'GH_TOKEN: ${{ secrets.WATCHDOG_TOKEN }}\n          OWNER:')), expect: 'secrets.' },
        { name: 'a drifted cron', run: () => checkWatchdogText(edit("cron: '17 6 * * *'", "cron: '17 7 * * *'")), expect: 'is not 17 6 * * *' },
        { name: 'a 25-hour threshold in the decision', run: () => checkWatchdogText(edit('-ge 93600', '-ge 90000')), expect: 'the 26-hour threshold' },
        { name: 'a contents write scope', run: () => checkWatchdogText(edit('    permissions:\n      issues: write\n', '    permissions:\n      contents: write\n      issues: write\n')), expect: 'contents is write' },
        { name: 'the fixed label dropped from the source', run: () => checkWatchdogText(text.split(LABEL).join('some-label')), expect: 'the fixed label' },
        { name: 'a product-repository schedule key', run: () => scheduleDir('verify.yml', 'on:\n  schedule:\n    - cron: "0 0 * * *"\n'), expect: 'carries a schedule key' },
        { name: 'a product-repository schedule inside an on: list', run: () => scheduleDir('verify.yml', 'on: [push, schedule]\njobs: {}\n'), expect: 'carries a schedule key' },
        { name: 'a product-repository schedule as the only on: string', run: () => scheduleDir('verify.yml', 'on: schedule\njobs: {}\n'), expect: 'carries a schedule key' },
        { name: 'the dedupe gate inverted (-gt 0 becomes -lt 0)', run: () => decisionFailures(edit('if [ "$OPEN_COUNT" -gt 0 ]', 'if [ "$OPEN_COUNT" -lt 0 ]')), expect: 'still opened a second one' },
        { name: 'the dedupe removed', run: () => decisionFailures(edit('if [ "$OPEN_COUNT" -gt 0 ]; then OPEN=false; fi', ':')), expect: 'still opened a second one' },
        { name: 'the dedupe counting issues by any author', run: () => decisionFailures(edit(' --author "$WATCHDOG_AUTHOR"', '')), expect: 'counts issues by any author' },
        { name: 'the dedupe not filtering on the fixed label', run: () => decisionFailures(edit(' --label "$WATCHDOG_LABEL" --search', ' --search')), expect: 'does not filter on the fixed label' },
        { name: 'the dedupe not filtering on open issues', run: () => decisionFailures(edit('--state open --author', '--author')), expect: 'does not filter on open issues' },
        { name: 'an unset author leaving the watchdog silent', run: () => decisionFailures(edit('if [ -n "$WATCHDOG_AUTHOR" ]; then', 'if true; then')), expect: 'unset author must skip the dedupe' },
        { name: 'the missing-run branch removed', run: () => decisionFailures(edit('[ -z "$AGE_S" ] || ', '')), expect: 'a missing run opened' },
        { name: 'the open decision turned off (OPEN=true becomes OPEN=false)', run: () => decisionFailures(edit('then OPEN=true; fi', 'then OPEN=false; fi')), expect: 'a 27-hour silence opened' },
        { name: 'the age subtraction reversed', run: () => decisionFailures(edit('$(( ($(date -u +%s) - $(date -u -d "$STARTED" +%s)) ))', '$(( ($(date -u -d "$STARTED" +%s) - $(date -u +%s)) ))')), expect: 'a 27-hour silence opened' },
        { name: 'the open gate inverted', run: () => decisionFailures(edit("steps.decide.outputs.open == 'true'", "steps.decide.outputs.open == 'false'")), expect: 'a 25-hour silence opened an issue' },
        { name: 'the runs path pointing at the wrong repository', run: () => decisionFailures(edit('powerbrowser/actions/workflows', 'powerbrowser-updates/actions/workflows')), expect: 'the runs read was' },
        { name: 'the opened issue without its label', run: () => decisionFailures(edit(' --label "$WATCHDOG_LABEL" --body-file', ' --body-file')), expect: 'not created with the fixed title and label' },
        { name: 'the fixed label never created', run: () => decisionFailures(edit('gh label create', ': gh label create')), expect: 'label is not created' },
    ];
    let failed = 0;
    for (const p of plants) {
        let failures;
        try {
            failures = p.run();
        } catch (e) {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' broke the instrument: ${e.message}`);
            failed += 1;
            continue;
        }
        if (failures.some(f => f.includes(p.expect))) console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`); failed += 1; }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not go red naming their drift`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their drift, with the control green first (the decision runs on the workflow's own shell under a stub gh)`);
    return 0;
}

const args = process.argv.slice(2);
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
    if (args.length === 0) process.exit(gate());
    if (args.length === 1 && args[0] === '--self-test') process.exit(selfTest());
    console.error(`${NAME}: FAIL -- unknown argument '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rules discriminate.`);
    process.exit(2);
}
