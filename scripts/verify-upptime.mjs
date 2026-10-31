#!/usr/bin/env node
// scripts/verify-upptime.mjs
//
// The upptime-config row (Phase 53, MON-02). Quick mode derives the expected Upptime target
// set from configuration.toml at check time and compares it with the tracked declaration by
// set equality. It also proves the sweep-report contract (workflow enabled-state and last-run
// age) on fixtures, and checks that the product repository carries no schedule key (D-77).
// Live mode (full tier) reads the status repository's workflows through gh api.
//
// Rules (each failure names the file or the target or workflow, and ends with a next step):
//  dropped      a target derived from configuration.toml is not declared.
//  added        a declared target configuration.toml does not derive.
//  pointer      a declared target names a source key other than the one it derives from.
//  no-schedule  no product-repository workflow carries a schedule key.
//  disabled     a status workflow is not active.
//  stale        a status workflow's last run is older than the sweep cadence allows.
//
// The events target waits for [telemetry] endpoint in configuration.toml. Quick mode prints
// that as a named deferral, never a silent pass. Live mode with an undeclared status slug is a
// FAIL, never a SKIP.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const toml = req(join(REPO_ROOT, 'scripts', 'lib', 'toml.cjs'));
const NAME = 'upptime-config';
const SELF_REL = 'scripts/verify-upptime.mjs';
const MANIFEST_REL = 'configuration.toml';
const TARGETS_REL = '.github/upptime-targets.json';
const WF_DIR = '.github/workflows';
const SOURCES = { updates: 'urls.update', website: 'urls.homepage', events: 'telemetry.endpoint' };
const MAX_AGE_HOURS = 36; // a daily sweep that has not run inside 36 hours has stopped

const args = process.argv.slice(2);
let live = false;
let slugArg;
for (const a of args) {
    if (a === '--self-test') continue;
    if (a === '--live') { live = true; continue; }
    if (a.startsWith('--slug=')) { slugArg = a.slice('--slug='.length); continue; }
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    console.error(`  Next step: run: node ${SELF_REL}, node ${SELF_REL} --self-test, or node ${SELF_REL} --live --slug=owner/repo.`);
    process.exit(2);
}

const originOf = u => new URL(u).origin;

// Expected targets, derived from the manifest. Keys are target ids; values are the origin the target watches.
export function derive(manifest) {
    const urls = manifest.urls ?? {};
    const out = new Map();
    if (urls.update) out.set('updates', `${originOf(urls.update)}/`);
    if (urls.homepage) out.set('website', `${originOf(urls.homepage)}/`);
    if (manifest.telemetry?.endpoint) out.set('events', `${originOf(manifest.telemetry.endpoint)}/events`);
    return out;
}

// Returns failures for the declared target set against the manifest, plus named deferrals.
export function compareTargets(manifest, declaredDoc) {
    const failures = [];
    const deferred = [];
    const expected = derive(manifest);
    const declared = Array.isArray(declaredDoc.targets) ? declaredDoc.targets : [];
    if (declaredDoc.derivation_source !== MANIFEST_REL) {
        failures.push({ file: TARGETS_REL, rule: 'pointer', msg: `derivation_source is '${declaredDoc.derivation_source}', not ${MANIFEST_REL}. Next step: point it at ${MANIFEST_REL}.` });
    }
    for (const t of declared) {
        if (!expected.has(t.id)) {
            failures.push({ file: TARGETS_REL, rule: 'added', msg: `declares target '${t.id}', which ${MANIFEST_REL} does not derive. Next step: remove it, or add the source key it reads from.` });
        } else if (t.source !== SOURCES[t.id]) {
            failures.push({ file: TARGETS_REL, rule: 'pointer', msg: `target '${t.id}' names source '${t.source}', not ${SOURCES[t.id]}. Next step: point it at ${SOURCES[t.id]}.` });
        }
    }
    for (const id of expected.keys()) {
        if (!declared.some(t => t.id === id)) {
            failures.push({ file: TARGETS_REL, rule: 'dropped', msg: `does not declare target '${id}', which ${MANIFEST_REL} derives from ${SOURCES[id]}. Next step: restore it to the targets list.` });
        }
    }
    for (const id of Object.keys(SOURCES)) {
        if (!expected.has(id)) deferred.push(`target '${id}' waits for ${SOURCES[id]} in ${MANIFEST_REL}`);
    }
    return { failures, deferred, expected };
}

// Sweep-report contract: workflow enabled-state and last-run age, from the gh api field names.
export function sweepVerdict(workflow, lastRunAt, nowMs = Date.now()) {
    const msgs = [];
    const name = workflow.name ?? workflow.path ?? 'unnamed workflow';
    if (workflow.state !== 'active') {
        msgs.push(`workflow '${name}' is ${workflow.state}, not active, so its status checks do not run. Next step: enable the workflow in the status repository.`);
    }
    if (!lastRunAt) {
        msgs.push(`workflow '${name}' has no run on record. Next step: dispatch it once and re-check.`);
    } else {
        const hours = (nowMs - Date.parse(lastRunAt)) / 3600000;
        if (hours > MAX_AGE_HOURS) {
            msgs.push(`workflow '${name}' last ran ${Math.round(hours)} hours ago, beyond ${MAX_AGE_HOURS} hours. Next step: read the last run's log and the schedule.`);
        }
    }
    return msgs;
}

// Product-repository rule: no workflow carries a schedule key (D-77).
export function scheduleFailures(files) {
    const out = [];
    for (const [rel, text] of Object.entries(files)) {
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (line.startsWith('#')) continue;
            if (/^(schedule\s*:|-?\s*schedule\s*$)/.test(line) || /^on:\s*\[?.*\bschedule\b/.test(line)) {
                out.push({ file: rel, rule: 'no-schedule', msg: 'carries a schedule key. Next step: remove it; the release train is the caller that runs work on a cadence (D-77).' });
                break;
            }
        }
    }
    return out;
}

function workflowFiles(root) {
    if (!existsSync(join(root, WF_DIR))) return {};
    const out = {};
    for (const f of readdirSync(join(root, WF_DIR)).filter(f => /\.ya?ml$/.test(f)).sort()) {
        out[`${WF_DIR}/${f}`] = readFileSync(join(root, WF_DIR, f), 'utf8');
    }
    return out;
}

function quick(root) {
    const manifest = toml.parse(readFileSync(join(root, MANIFEST_REL), 'utf8'));
    const declaredDoc = JSON.parse(readFileSync(join(root, TARGETS_REL), 'utf8'));
    const { failures, deferred } = compareTargets(manifest, declaredDoc);
    failures.push(...scheduleFailures(workflowFiles(root)));
    return { failures, deferred };
}

function sortFailures(f) {
    return f.sort((a, b) => `${a.file}|${a.rule}|${a.msg}`.localeCompare(`${b.file}|${b.rule}|${b.msg}`));
}

function quickMain() {
    const { failures, deferred } = quick(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in the Upptime target set or the product workflows.`);
        sortFailures(failures).forEach(f => console.error(`  ${f.file} [${f.rule}]: ${f.msg}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the declared Upptime targets equal the set ${TARGETS_REL} derives from ${MANIFEST_REL} (${[...derive(toml.parse(readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8'))).keys()].join(', ')}), no product workflow carries a schedule key, and the sweep-report contract holds on fixtures. Named deferral: ${deferred.join('; ')}`);
    return 0;
}

async function liveMain() {
    const slug = slugArg ?? process.env.UPPTIME_STATUS_REPO ?? '';
    if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) {
        console.error(`${NAME}: FAIL -- the Upptime status repository is not declared (got '${slug}'). The owner records owner/repo at the 53-04 checkpoint. Next step: re-run with --slug=owner/repo or UPPTIME_STATUS_REPO=owner/repo.`);
        return 1;
    }
    let workflows;
    try {
        workflows = JSON.parse(execFileSync('gh', ['api', `repos/${slug}/actions/workflows`], { encoding: 'utf8' })).workflows;
    } catch (e) {
        console.error(`${NAME}: FAIL -- the workflows of ${slug} could not be read with gh (${e.message.split('\n')[0]}). Next step: run gh auth login and confirm the repository exists.`);
        return 1;
    }
    const failures = [];
    for (const wf of workflows) {
        let lastRunAt;
        try {
            const runs = JSON.parse(execFileSync('gh', ['api', `repos/${slug}/actions/workflows/${wf.id}/runs?per_page=1`], { encoding: 'utf8' })).workflow_runs;
            lastRunAt = runs[0]?.created_at;
        } catch (e) {
            failures.push(`workflow '${wf.name}' runs could not be read (${e.message.split('\n')[0]}). Next step: check gh access to ${slug}.`);
            continue;
        }
        failures.push(...sweepVerdict(wf, lastRunAt));
    }
    if (workflows.length === 0) failures.push(`${slug} has no workflows. Next step: add the Upptime monitor workflow from the template.`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.join(' | ')}`);
        return 1;
    }
    console.log(`${NAME}: PASS -- ${workflows.length} workflow(s) in ${slug} are active and ran within ${MAX_AGE_HOURS} hours`);
    return 0;
}

function selfTest(root) {
    const manifest = toml.parse(readFileSync(join(root, MANIFEST_REL), 'utf8'));
    const declaredDoc = JSON.parse(readFileSync(join(root, TARGETS_REL), 'utf8'));
    const baseline = sortFailures(quick(root).failures);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f.file} [${f.rule}]: ${f.msg}`));
        return 1;
    }
    console.log('  ok  baseline -> green (declared targets equal the derivation; no schedule key)');
    const now = Date.parse('2026-10-31T12:00:00Z');
    const active = { name: 'Status sweep', state: 'active' };
    if (sweepVerdict(active, '2026-10-31T10:00:00Z', now).length === 0) {
        console.log('  ok  fresh active sweep -> green');
    } else {
        console.error(`${NAME}: --self-test FAIL -- a fresh active sweep went red`);
        return 1;
    }

    const plants = [
        ['dropped website target', compareTargets(manifest, { ...declaredDoc, targets: declaredDoc.targets.filter(t => t.id !== 'website') }).failures, 'dropped', "'website'"],
        ['added search target', compareTargets(manifest, { ...declaredDoc, targets: [...declaredDoc.targets, { id: 'search', source: 'urls.search' }] }).failures, 'added', "'search'"],
        ['events endpoint declared in the manifest but not in the targets', compareTargets({ ...manifest, telemetry: { endpoint: 'https://telemetry.example.org/v1/events' } }, declaredDoc).failures, 'dropped', "'events'"],
        ['disabled status workflow', sweepVerdict({ name: 'Status sweep', state: 'disabled_manually' }, '2026-10-31T10:00:00Z', now), 'disabled', "'Status sweep'"],
        ['stale last-run age', sweepVerdict(active, '2026-10-20T10:00:00Z', now), 'stale', 'hours ago'],
        ['schedule key added to a product workflow', scheduleFailures({ '.github/workflows/x.yml': 'on:\n  schedule:\n    - cron: "0 3 * * *"\n' }), 'no-schedule', '.github/workflows/x.yml'],
    ];
    let failed = 0;
    for (const [name, result, rule, fragment] of plants) {
        // Every result is normalised to text; a finding must name the fragment (target, workflow or file).
        const texts = result.map(f => (typeof f === 'string' ? f : `${f.file} [${f.rule}]: ${f.msg}`));
        const named = texts.some(t => t.includes(fragment));
        const ruled = result.every(f => typeof f === 'string') || result.some(f => f.rule === rule);
        if (named && ruled) {
            console.log(`  ok  ${name} -> red, naming ${fragment}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${fragment} [${rule}]; got: ${texts.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the target or the workflow, and the green control stayed green`);
    return 0;
}

if (args.includes('--self-test')) {
    process.exit(selfTest(REPO_ROOT));
} else if (live) {
    process.exit(await liveMain());
} else {
    process.exit(quickMain());
}
