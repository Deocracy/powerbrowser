#!/usr/bin/env node
// scripts/verify-watchdog.mjs
//
// The MON-01 gate (Phase 48, plan 48-04, NAME watchdog). The watchdog source docs/watchdog.yml is applied by
// the owner to powerbrowser-updates at plan 48-05 and never to the product repository (D-77). This gate proves
// the decision and the source's shape in the tree, offline:
//
//  1. The decision. decideWatchdog over an in-memory run table: a run started 25 hours ago opens no issue; a run
//     started 27 hours ago opens exactly one issue, with the run link and the timestamps; no run at all opens one
//     issue naming the missing run; an open issue with the same title suppresses a second one.
//  2. The source text, parsed with the repo's js-yaml (theia/): exactly the schedule and workflow_dispatch
//     triggers (no workflow_run, so no unguarded wake), one schedule entry with cron 17 6 * * *, one job on
//     ubuntu-latest, read-only permissions except issues write, no secret reference, no App token, the runs
//     API read with per_page=1, the 26-hour threshold (-ge 93600), the fixed title, SHA-pinned uses:, and no
//     github.event text in any run.
//  3. The product repository. No file under .github/workflows carries a schedule key.
//
// Usage:
//   node scripts/verify-watchdog.mjs             the gate: prints "watchdog: PASS" when every check holds
//   node scripts/verify-watchdog.mjs --self-test the control first (the real tree and fixtures), then the planted
//                                                faults; each plant must go red naming its drift
// Any other argument: FAIL, exit 2.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
export const CRON = '17 6 * * *';
export const RUNS_PATH = 'actions/workflows/release-train.yml/runs?per_page=1';
const HOUR_MS = 3600000;
const ALLOWED_TRIGGERS = Object.freeze(['schedule', 'workflow_dispatch']);
const SHA_USE = /@[0-9a-f]{40}$/;

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}

/**
 * The watchdog decision. latestStartedAtMs: the started_at of the newest release-train run in epoch ms, or null
 * when no run is recorded. openTitles: the titles of the open issues in this repository. Pure.
 * windowHours defaults to the 26-hour window; the self-test plants a different one.
 */
export function decideWatchdog({ latestStartedAtMs, nowMs, openTitles = [], windowHours = WINDOW_HOURS }) {
    if (openTitles.includes(`release-train has not run in ${windowHours} h`)) {
        return { open: false, reason: `an open issue titled "${TITLE}" already exists, so no second one is opened` };
    }
    if (typeof latestStartedAtMs !== 'number' || !Number.isFinite(latestStartedAtMs)) {
        return { open: true, reason: 'no release-train run is recorded in the product repository' };
    }
    const ageHours = (nowMs - latestStartedAtMs) / HOUR_MS;
    if (ageHours >= windowHours) {
        return { open: true, reason: `the last release-train run started ${ageHours.toFixed(1)} h ago, at or past ${windowHours} h` };
    }
    return { open: false, reason: `the last release-train run started ${ageHours.toFixed(1)} h ago, within ${windowHours} h` };
}

/** The issue body: the run link and both timestamps; a missing run is named as missing. Pure. */
export function renderIssueBody(run, nowIso) {
    if (run === null) {
        return [TITLE, '', 'No release-train run is recorded in the product repository, so the train has never run or its history is gone.', '', `Checked at: ${nowIso}`, ''].join('\n');
    }
    return [TITLE, '', `Latest release-train run: ${run.html_url}`, `Run started at: ${run.run_started_at}`, `Checked at: ${nowIso}`, ''].join('\n');
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
            if (scope !== 'contents' && scope !== 'issues') failures.push(`scope ${scope} is ${level}; the watchdog holds contents read and issues write in its own repository only. Next step: drop it.`);
            if (scope === 'issues' && level !== 'write' && level !== 'read') failures.push(`issues is ${level}. Next step: issues write is the only write.`);
        }
    }
    if (/secrets\./.test(text)) failures.push(`a secret is referenced (secrets.): the watchdog reads with GITHUB_TOKEN only. Next step: remove the secret reference.`);
    if (/create-github-app-token/.test(text)) failures.push('an App token step is present: the watchdog reads with GITHUB_TOKEN only. Next step: remove it.');
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(text)) failures.push('a credential-shaped value is assigned in the watchdog source. Next step: remove the literal.');
    if (!text.includes(RUNS_PATH)) failures.push(`the runs API read ${RUNS_PATH} is not present. Next step: read the product repository's newest release-train run.`);
    if (!text.includes(`-ge ${WINDOW_HOURS * 3600}`)) failures.push(`the ${WINDOW_HOURS}-hour threshold (-ge ${WINDOW_HOURS * 3600}) is not in the decision. Next step: set the window to ${WINDOW_HOURS} hours.`);
    if (!text.includes(TITLE)) failures.push(`the issue title "${TITLE}" is not present. Next step: restore the fixed title.`);
    for (const job of jobs) {
        for (const step of job.steps ?? []) {
            if (typeof step.uses === 'string' && !SHA_USE.test(step.uses)) failures.push(`uses ${step.uses} is not pinned to a 40-hex SHA. Next step: pin it.`);
            if (typeof step.run === 'string' && step.run.includes('github.event')) failures.push('a run: step reads github.event text. Next step: pass the value through env, or do not read it.');
        }
    }
    return failures;
}

/** The product repository carries no schedule key. dir: a .github/workflows directory. Pure over the files. */
export function checkProductSchedules(dir) {
    const failures = [];
    for (const file of readdirSync(dir)) {
        if (!/\.ya?ml$/.test(file)) continue;
        const text = readFileSync(join(dir, file), 'utf8');
        if (/^\s*schedule\s*:/m.test(text)) failures.push(`${file} carries a schedule key: the product repository never schedules (D-77). Next step: remove it; the clock is the Worker.`);
    }
    return failures;
}

function controlFixtures() {
    const now = Date.UTC(2026, 10, 1, 6, 17, 0);
    const run = (hours) => ({ html_url: 'https://github.com/DeBIOS-Foundation/powerbrowser/actions/runs/42', run_started_at: new Date(now - hours * HOUR_MS).toISOString() });
    return { now, run };
}

/** The decision controls (green when the decision is right). Returns the failures. */
function decisionControls() {
    const { now, run } = controlFixtures();
    const failures = [];
    const silent25 = decideWatchdog({ latestStartedAtMs: now - 25 * HOUR_MS, nowMs: now });
    if (silent25.open) failures.push(`a 25-hour silence opened an issue: ${silent25.reason}`);
    const silent27 = decideWatchdog({ latestStartedAtMs: now - 27 * HOUR_MS, nowMs: now });
    if (!silent27.open) failures.push(`a 27-hour silence opened no issue: ${silent27.reason}`);
    const body27 = renderIssueBody(run(27), new Date(now).toISOString());
    if (!body27.includes(run(27).html_url) || !body27.includes(run(27).run_started_at)) failures.push('the 27-hour issue body lacks the run link or the start timestamp');
    const missing = decideWatchdog({ latestStartedAtMs: null, nowMs: now });
    if (!missing.open || !missing.reason.includes('no release-train run is recorded')) failures.push(`a missing run did not open one issue naming it: ${missing.reason}`);
    if (!renderIssueBody(null, new Date(now).toISOString()).includes('No release-train run is recorded')) failures.push('the missing-run issue body does not name the missing run');
    const deduped = decideWatchdog({ latestStartedAtMs: now - 27 * HOUR_MS, nowMs: now, openTitles: [TITLE] });
    if (deduped.open) failures.push('a second issue with the open title would be opened');
    return failures;
}

function realText() {
    return readFileSync(join(REPO_ROOT, WATCHDOG_REL), 'utf8');
}

function gate() {
    const failures = [...decisionControls(), ...checkWatchdogText(realText()), ...checkProductSchedules(WF_DIR)];
    if (failures.length > 0) {
        failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the 25-hour silence opens no issue, the 27-hour silence opens one with the run link, a missing run opens one naming it, the source is schedule-only with one 06:17 UTC cron, GITHUB_TOKEN read only, and the product repository carries no schedule key`);
    return 0;
}

function selfTest() {
    const controlFailures = [...decisionControls(), ...checkWatchdogText(realText()), ...checkProductSchedules(WF_DIR)];
    if (controlFailures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmutated control is already red, so the planted results would mean nothing:`);
        controlFailures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  control: the real source, the decision fixtures and the product repository -> green');
    const { now, run } = controlFixtures();
    const text = realText();
    const runStep = '    steps:\n';
    const plants = [
        { name: 'an unguarded workflow_run wake', run: () => checkWatchdogText(text.replace('on:\n  schedule:', 'on:\n  workflow_run:\n    workflows: [Verify static layers]\n  schedule:')), expect: 'trigger workflow_run is not allowed' },
        { name: 'an event-text read in a run step', run: () => checkWatchdogText(text.replace(runStep, `${runStep}      - name: planted\n        run: echo "\${{ github.event.issue.title }}"\n`)), expect: 'github.event' },
        { name: 'a secret reference', run: () => checkWatchdogText(text.replace('GH_TOKEN: ${{ github.token }}', 'GH_TOKEN: ${{ secrets.WATCHDOG_TOKEN }}')), expect: 'secrets.' },
        { name: 'a drifted cron', run: () => checkWatchdogText(text.replace("cron: '17 6 * * *'", "cron: '17 7 * * *'")), expect: 'is not 17 6 * * *' },
        { name: 'a 25-hour threshold in the decision', run: () => checkWatchdogText(text.replace('-ge 93600', '-ge 90000')), expect: 'the 26-hour threshold' },
        { name: 'a product-repository schedule key', run: () => {
            const dir = mkdtempSync(join(tmpdir(), 'watchdog-wf-'));
            try {
                writeFileSync(join(dir, 'verify.yml'), 'on:\n  schedule:\n    - cron: "0 0 * * *"\n');
                return checkProductSchedules(dir);
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }, expect: 'carries a schedule key' },
        { name: 'a 25-hour silence that opens an issue', run: () => {
            const d = decideWatchdog({ latestStartedAtMs: now - 25 * HOUR_MS, nowMs: now, windowHours: 25 });
            return d.open ? [`a 25-hour silence opens an issue under a 25-hour window: ${d.reason}`] : [];
        }, expect: 'a 25-hour silence opens an issue' },
    ];
    let failed = 0;
    for (const p of plants) {
        const failures = p.run();
        if (failures.some(f => f.includes(p.expect))) console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`); failed += 1; }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not go red naming their drift`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their drift, with the control green first (25-hour silence, 27-hour issue with the link, and missing-run cases proven)`);
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
