#!/usr/bin/env node
// scripts/verify-workflows.mjs
//
// The workflows row (Phase 41, GH-12 and GH-08's admission half). The
// server-side Actions policy binds only at run time; this row checks the same
// trust boundary at commit time, offline, over every .github/workflows/*.yml
// and *.yaml (found with readdir, so an unstaged workflow is checked too).
//
// Instrument: js-yaml from theia/ through createRequire. YAML 1.2's core
// schema keeps `on` a string key, and a duplicate key throws, so a second
// `on:` cannot hide a schedule; a throw is a FAIL naming the file. A missing
// js-yaml is a broken-instrument FAIL, and zero workflow files is a FAIL: an
// agreement over nothing is vacuous.
//
// Rules:
//  uses-pinned    Every non-local `uses:` (step and job level) is
//                 owner/repo[/path]@<40 lowercase hex>. docker:// is red.
//  uses-admitted  actions/* and github/* are admitted through
//                 .github/settings/actions-selected.json github_owned_allowed;
//                 any other owner/repo needs a patterns_allowed entry
//                 owner/repo@*.
//  admission-used The owner/repo set in patterns_allowed equals the set of
//                 non-GitHub-owned owner/repo actually used, so an admission
//                 nobody uses is red too.
//  no-schedule    No workflow has a schedule event (`on` as a string, an
//                 array or a map normalises to one event set).
//  runner         runs-on (a string, an array or {group, labels}) is literal,
//                 and is either exactly one GitHub-hosted label
//                 ((ubuntu|windows|macos)-*) or a label set holding legion.
//                 Anything else is red, a bare self-hosted included: legion
//                 carries the default self-hosted, linux and x64 labels.
//                 Jobs with a job-level uses: have no runs-on and are exempt.
//  legion         A legion job is release.yml with a job id build-* or
//                 matrix-*, with no environment key, no `secrets.` in the
//                 job or the workflow-level env, and no `secrets: inherit`.
//  claude-code-action  A step using anthropics/claude-code-action@ needs a
//                 hosted job, no actions/create-github-app-token@ step in the
//                 same job, and effective contents other than write.
//  issues-write   Effective issues: write only on release-train.yml job
//                 report and on any job in triage.yml.
//  workflow-run-guard  Every job of a workflow_run-triggered workflow has an
//                 `if` containing github.event.workflow_run.head_repository
//                 .full_name == github.repository (whitespace collapsed,
//                 ${{ }} stripped).
//  workflow-run-chain  A workflow named in any on.workflow_run.workflows list
//                 (matched by name:) is not itself workflow_run-triggered.
//  write-trio     contents, id-token and attestations all at write only on
//                 release.yml job sign-publish.
//  no-pr-trigger  release.yml and release-train.yml have no pull_request or
//                 pull_request_target event.
//  no-cache       release.yml has no actions/cache step and no step with a
//                 `cache` input.
//  event-text     No step run: or with.prompt: string holds a ${{ }}
//                 expression reading github.event.(issue|comment|
//                 pull_request|head_commit|review), nested fields and
//                 review_comment included.
//  dry-run-gate   In release-train.yml only (Phase 43, TRAIN-08), every step that
//                 commits, pushes, opens, comments, edits, dispatches or mints an
//                 App token carries inputs.dry-run in its if:. A dry run then
//                 prints the write instead of making it. Read steps are exempt.
//
// Effective permissions: job permissions, else workflow permissions, else the
// repository default (default_workflow_permissions in
// .github/settings/workflow-permissions.json). write-all maps every scope to
// write, read-all every scope to read, and {} means none.
//
// Failures print sorted by file, then job, then rule, so two runs over one
// tree print identical output. This script and its --self-test only read the
// tree; every plant is applied in memory through runChecks' overrides.

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'workflows';
const SELF_REL = 'scripts/verify-workflows.mjs';
const WF_DIR = '.github/workflows';
const SELECTED_REL = '.github/settings/actions-selected.json';
const PERMS_REL = '.github/settings/workflow-permissions.json';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rules discriminate.`);
        process.exit(2);
    }
}

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}

const RULES = ['uses-pinned', 'uses-admitted', 'admission-used', 'no-schedule', 'runner', 'legion', 'claude-code-action', 'issues-write', 'workflow-run-guard', 'workflow-run-chain', 'write-trio', 'no-pr-trigger', 'no-cache', 'event-text', 'dry-run-gate'];
const SCOPES = ['actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token', 'issues', 'models', 'packages', 'pages', 'pull-requests', 'repository-projects', 'security-events', 'statuses'];
const HOSTED = /^(ubuntu|windows|macos)-[\w.-]+$/;
const GUARD = 'github.event.workflow_run.head_repository.full_name == github.repository';
const EVENT_TEXT = /\$\{\{[^}]*\bgithub\.event\.(issue|comment|pull_request|head_commit|review)/;
const TRIO = ['contents', 'id-token', 'attestations'];
const PIN = /^([^/@]+)\/([^@/]+)(\/[^@]*)?@([0-9a-f]{40})$/;
const PATTERN = /^([^/@]+\/[^/@]+)@\*$/;
const WF_LEVEL = '(workflow)';
const DRY_RUN_FILE = 'release-train.yml';
const DRY_RUN_GATE = 'inputs.dry-run';
// A run: body that commits, pushes, opens, comments, edits, dispatches or closes on GitHub.
const WRITE_RUN = /gh api -X (POST|PATCH|PUT|DELETE)|gh pr (create|merge|comment|edit)|gh issue (create|comment|edit|close|lock|reopen)|gh workflow run|git push|dispatches/;
const APP_TOKEN = 'actions/create-github-app-token@';

function events(wf) {
    const on = wf.on;
    if (typeof on === 'string') return new Set([on]);
    if (Array.isArray(on)) return new Set(on.map(String));
    if (on !== null && typeof on === 'object') return new Set(Object.keys(on));
    return new Set();
}

// null when the job has no runs-on; dynamic when any part is an expression.
function labels(job) {
    const r = job['runs-on'];
    if (r === undefined) return null;
    if (JSON.stringify(r).includes('${{')) return { dynamic: true, labels: [] };
    if (Array.isArray(r)) return { labels: r.map(String) };
    if (r !== null && typeof r === 'object') return { labels: r.labels === undefined ? [] : [].concat(r.labels).map(String) };
    return { labels: [String(r)] };
}

function permMap(p) {
    if (p === undefined) return null;
    if (p === 'write-all') return Object.fromEntries(SCOPES.map(s => [s, 'write']));
    if (p === 'read-all') return Object.fromEntries(SCOPES.map(s => [s, 'read']));
    return p !== null && typeof p === 'object' ? { ...p } : {};
}

function effective(job, wf, def) {
    return permMap(job.permissions) ?? permMap(wf.permissions) ?? permMap(def === 'write' ? 'write-all' : 'read-all');
}

function readJson(root, rel) {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function readWorkflows(root) {
    const out = {};
    for (const f of readdirSync(join(root, WF_DIR)).filter(f => /\.ya?ml$/.test(f)).sort()) {
        out[f] = readFileSync(join(root, WF_DIR, f), 'utf8');
    }
    return out;
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (file, job, rule, msg) => failures.push({ file, job, rule, msg });
    let usesCount = 0;

    let files = overrides.files;
    if (files === undefined) {
        try {
            files = readWorkflows(root);
        } catch (e) {
            fail(`${WF_DIR}/`, WF_LEVEL, 'discovery', `could not be read (${e.message}). Next step: run this check inside the repository.`);
            return { failures, count: 0, usesCount };
        }
    }
    let selected = overrides.selected;
    if (selected === undefined) {
        try {
            selected = readJson(root, SELECTED_REL);
        } catch (e) {
            fail(SELECTED_REL, WF_LEVEL, 'uses-admitted', `could not be read or parsed (${e.message}), so no action is admitted. Next step: restore the file.`);
            selected = { github_owned_allowed: false, patterns_allowed: [] };
        }
    }

    let def = overrides.defaultPermissions;
    if (def === undefined) {
        try {
            def = readJson(root, PERMS_REL).default_workflow_permissions;
        } catch (e) {
            fail(PERMS_REL, WF_LEVEL, 'issues-write', `could not be read or parsed (${e.message}), so the repository default token scope is unknown. Next step: restore the file.`);
            def = 'write';
        }
    }

    const names = Object.keys(files).sort();
    if (names.length === 0) {
        fail(`${WF_DIR}/`, WF_LEVEL, 'discovery', `no workflow files found under ${WF_DIR}/; an agreement over nothing is vacuous. Next step: check the instrument (${SELF_REL}) and that the directory holds the workflows.`);
        return { failures, count: 0, usesCount };
    }

    // Admission table.
    const githubOwned = selected.github_owned_allowed === true;
    const admitted = new Set();
    for (const p of selected.patterns_allowed ?? []) {
        const m = typeof p === 'string' ? p.match(PATTERN) : null;
        if (m) admitted.add(m[1]);
        else fail(SELECTED_REL, WF_LEVEL, 'uses-admitted', `patterns_allowed entry ${JSON.stringify(p)} is not of the form owner/repo@*. Next step: admit actions by owner/repo@*; sha_pinning_required already forces SHAs.`);
    }
    const used = new Set();

    const docs = {};
    for (const file of names) {
        const rel = `${WF_DIR}/${file}`;
        let wf;
        try {
            wf = yaml.load(files[file]);
        } catch (e) {
            fail(rel, WF_LEVEL, 'parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file; a duplicate key such as a second on: is refused on purpose.`);
            continue;
        }
        if (wf === null || typeof wf !== 'object' || wf.jobs === null || typeof wf.jobs !== 'object') {
            fail(rel, WF_LEVEL, 'parse', `carries no jobs map. Next step: fix the file.`);
            continue;
        }
        docs[file] = wf;
    }

    for (const file of Object.keys(docs)) {
        const rel = `${WF_DIR}/${file}`;
        const wf = docs[file];
        for (const [jobId, job] of Object.entries(wf.jobs)) {
            const refs = [];
            if (job && job.uses !== undefined) refs.push(['job-level uses', job.uses]);
            (job?.steps ?? []).forEach((s, i) => { if (s && s.uses !== undefined) refs.push([`step ${i}`, s.uses]); });
            for (const [where, value] of refs) {
                const v = String(value);
                if (v.startsWith('./')) continue;
                usesCount += 1;
                if (v.startsWith('docker://')) {
                    fail(rel, jobId, 'uses-pinned', `${where} uses '${v}'; docker:// images are not admitted. Next step: use a SHA-pinned action instead.`);
                    continue;
                }
                const m = v.match(PIN);
                if (!m) {
                    fail(rel, jobId, 'uses-pinned', `${where} uses '${v}'. Next step: pin it to a full 40-character commit SHA.`);
                    continue;
                }
                const owner = m[1];
                const repo = `${m[1]}/${m[2]}`;
                if (githubOwned && (owner === 'actions' || owner === 'github')) continue;
                used.add(repo);
                if (!admitted.has(repo)) {
                    fail(rel, jobId, 'uses-admitted', `${where} uses '${v}', and ${SELECTED_REL} admits no '${repo}@*'. Next step: add '${repo}@*' to patterns_allowed and re-apply, or drop the action.`);
                }
            }
        }
    }
    // GH-12 trust rules.
    const sources = new Set();
    for (const file of Object.keys(docs)) {
        const rel = `${WF_DIR}/${file}`;
        const wf = docs[file];
        const ev = events(wf);
        if (ev.has('schedule')) fail(rel, WF_LEVEL, 'no-schedule', `has a schedule event; a scheduled run nobody watches is the failure GH-12 forbids. Next step: drop the schedule key; the release train is the caller that runs work on a cadence.`);
        if (file === 'release.yml' || file === 'release-train.yml') {
            for (const t of ['pull_request', 'pull_request_target']) {
                if (ev.has(t)) fail(rel, WF_LEVEL, 'no-pr-trigger', `is triggered by ${t}; a release path must never run on a pull request. Next step: remove the ${t} trigger.`);
            }
        }
        const runOn = wf.on?.workflow_run?.workflows;
        if (runOn !== undefined) [].concat(runOn).forEach(n => sources.add(String(n)));
        const wfRun = ev.has('workflow_run');

        for (const [jobId, job] of Object.entries(wf.jobs)) {
            if (job === null || typeof job !== 'object') {
                fail(rel, jobId, 'runner', `is not a job map. Next step: fix the file.`);
                continue;
            }
            const steps = Array.isArray(job.steps) ? job.steps.filter(s => s !== null && typeof s === 'object') : [];
            const eff = effective(job, wf, def);
            const stepUses = steps.map(s => (typeof s.uses === 'string' ? s.uses : ''));

            // runner and legion
            let hosted = false;
            if (job.uses === undefined) {
                const l = labels(job);
                const shown = JSON.stringify(job['runs-on']);
                if (l === null) {
                    fail(rel, jobId, 'runner', `has no runs-on. Next step: give it one GitHub-hosted label such as ubuntu-latest.`);
                } else if (l.dynamic) {
                    fail(rel, jobId, 'runner', `runs-on ${shown}: runs-on must be literal so its runner is decidable. Next step: write the label out.`);
                } else if (l.labels.includes('legion')) {
                    if (!(file === 'release.yml' && /^(build|matrix)-/.test(jobId))) {
                        fail(rel, jobId, 'legion', `runs on legion (runs-on ${shown}), which is admitted only on release.yml jobs named build-* or matrix-*. Next step: run it on a GitHub-hosted label.`);
                    }
                    if (Object.hasOwn(job, 'environment')) fail(rel, jobId, 'legion', `runs on legion and has environment ${JSON.stringify(job.environment)}; a legion job may hold no environment and so no environment secret. Next step: move the environment to a hosted job.`);
                    if (JSON.stringify(job).includes('secrets.') || JSON.stringify(wf.env ?? {}).includes('secrets.')) fail(rel, jobId, 'legion', `runs on legion and reaches a secrets. reference (in the job or the workflow env). Next step: move the secret to a hosted job.`);
                    if (job.secrets === 'inherit') fail(rel, jobId, 'legion', `runs on legion with secrets: inherit. Next step: remove it.`);
                } else if (l.labels.length === 1 && HOSTED.test(l.labels[0])) {
                    hosted = true;
                } else {
                    fail(rel, jobId, 'runner', `runs-on ${shown} is neither one GitHub-hosted label nor a legion label set; a self-hosted job without legion still reaches legion, which carries the default self-hosted, linux and x64 labels. Next step: use one GitHub-hosted label such as ubuntu-latest.`);
                }
            }

            // claude-code-action
            if (stepUses.some(u => u.startsWith('anthropics/claude-code-action@'))) {
                if (!hosted) fail(rel, jobId, 'claude-code-action', `uses claude-code-action on a job that is not GitHub-hosted. Next step: run it on ubuntu-latest.`);
                if (stepUses.some(u => u.startsWith('actions/create-github-app-token@'))) fail(rel, jobId, 'claude-code-action', `uses claude-code-action beside an actions/create-github-app-token step, so the model could act with an App token. Next step: split the App-token step into another job.`);
                if (eff.contents === 'write') fail(rel, jobId, 'claude-code-action', `uses claude-code-action with effective contents write. Next step: give the job contents read.`);
            }

            // permissions
            if (eff.issues === 'write' && !((file === 'release-train.yml' && jobId === 'report') || file === 'triage.yml')) {
                fail(rel, jobId, 'issues-write', `has effective issues write, admitted only on release-train.yml job report and in triage.yml. Next step: drop issues write from the job or workflow permissions.`);
            }
            if (TRIO.every(s => eff[s] === 'write') && !(file === 'release.yml' && jobId === 'sign-publish')) {
                fail(rel, jobId, 'write-trio', `holds contents, id-token and attestations write together, admitted only on release.yml job sign-publish. Next step: narrow the job permissions.`);
            }

            // workflow_run guard
            if (wfRun) {
                const cond = String(job.if ?? '').replace(/\$\{\{|\}\}/g, ' ').replace(/\s+/g, ' ').trim();
                if (!cond.includes(GUARD)) fail(rel, jobId, 'workflow-run-guard', `runs on workflow_run without the guard '${GUARD}' in its if:, so a fork's run can trigger it. Next step: add the guard to the job's if:.`);
            }

            // no cache in the release path
            if (file === 'release.yml') {
                steps.forEach((s, i) => {
                    if (stepUses[i].startsWith('actions/cache')) fail(rel, jobId, 'no-cache', `step ${i} uses ${stepUses[i]}; a cache restored into release bytes can be poisoned. Next step: remove the actions/cache step.`);
                    if (s.with !== null && typeof s.with === 'object' && Object.hasOwn(s.with, 'cache')) fail(rel, jobId, 'no-cache', `step ${i} (${stepUses[i] || 'run'}) sets a cache input; a cache restored into release bytes can be poisoned. Next step: remove the cache input.`);
                });
            }

            // dry-run gate: every write step in release-train.yml names the gate in its if:.
            if (file === DRY_RUN_FILE) {
                steps.forEach((s, i) => {
                    const writes = (typeof s.run === 'string' && WRITE_RUN.test(s.run)) || stepUses[i].startsWith(APP_TOKEN);
                    if (!writes) return;
                    const cond = s.if === undefined ? '' : String(s.if);
                    if (!cond.includes(DRY_RUN_GATE)) fail(rel, jobId, 'dry-run-gate', `step ${i} (${stepUses[i] || 'run'}) writes to GitHub or the repository with no ${DRY_RUN_GATE} gate in its if:. Next step: add if: \${{ !${DRY_RUN_GATE} }} and print the write as a dry-run line instead.`);
                });
            }

            // event text in run: and prompt:
            steps.forEach((s, i) => {
                for (const [field, v] of [['run', s.run], ['with.prompt', s.with?.prompt]]) {
                    const m = typeof v === 'string' ? v.match(EVENT_TEXT) : null;
                    if (m) fail(rel, jobId, 'event-text', `step ${i} ${field} reads untrusted github.event.${m[1]} text inside \${{ }}. Next step: pass it through env: and quote the variable, or do not read it.`);
                }
            });
        }
    }
    for (const file of Object.keys(docs)) {
        const wf = docs[file];
        const rel = `${WF_DIR}/${file}`;
        const name = typeof wf.name === 'string' ? wf.name : rel;
        if (sources.has(name) && events(wf).has('workflow_run')) {
            fail(rel, WF_LEVEL, 'workflow-run-chain', `'${name}' is a workflow_run source and is itself workflow_run-triggered, so a fork can chain through it. Next step: trigger it some other way.`);
        }
    }

    for (const repo of [...admitted].sort()) {
        if (!used.has(repo)) fail(SELECTED_REL, WF_LEVEL, 'admission-used', `patterns_allowed admits '${repo}@*', which no workflow uses. Next step: remove it from ${SELECTED_REL} and re-apply.`);
    }

    const key = f => [f.file, f.job, f.rule, f.msg];
    failures.sort((a, b) => {
        const ka = key(a), kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        return 0;
    });
    return { failures, count: names.length, usesCount };
}

const fmt = f => `${f.file} job ${f.job} [${f.rule}]: ${f.msg}`;

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, count, usesCount } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) across the workflow trust boundary.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${count} workflow(s), ${usesCount} uses: line(s) pinned and admitted, rules enforced: ${RULES.join(', ')}`);
    return 0;
}

function selfTest() {
    const files = readWorkflows(REPO_ROOT);
    const selected = readJson(REPO_ROOT, SELECTED_REL);
    const baseline = runChecks(REPO_ROOT, { files, selected });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    const V = 'verify.yml';
    const CHECKOUT = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
    const NIX = 'cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24';
    for (const needle of [CHECKOUT, NIX]) {
        if (!files[V]?.includes(needle)) {
            console.error(`${NAME}: --self-test FAIL -- ${WF_DIR}/${V} no longer carries '${needle}', so the plants below have nothing to mutate. Next step: update the anchors in ${SELF_REL}.`);
            return 1;
        }
    }
    const H40 = 'abcdef0123456789abcdef0123456789abcdef01';
    const rel = f => `${WF_DIR}/${f}`;
    // The good release.yml: build-linux on legion with contents read and no
    // environment, sign-publish hosted with environment release and the trio.
    const R = 'release.yml';
    const GOOD_RELEASE = [
        'name: Release',
        'on:',
        '  push:',
        '    tags: ["v*"]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  build-linux:',
        '    runs-on: [self-hosted, legion]',
        '    permissions:',
        '      contents: read',
        '    steps:',
        `      - uses: actions/checkout@${H40}`,
        '        with:',
        '          persist-credentials: false',
        '      - run: echo build',
        '  sign-publish:',
        '    needs: build-linux',
        '    runs-on: ubuntu-latest',
        '    environment: release',
        '    permissions:',
        '      contents: write',
        '      id-token: write',
        '      attestations: write',
        '    steps:',
        '      - run: echo publish',
        '',
    ].join('\n');
    const base = { ...files, [R]: GOOD_RELEASE };
    const BUILD = '  build-linux:\n    runs-on: [self-hosted, legion]\n';
    const job = (id, lines) => `  ${id}:\n${lines.map(l => `    ${l}`).join('\n')}\n`;
    const with_ = (extra) => ({ files: { ...base, ...extra } });
    const edit = (file, from, to) => {
        if (!base[file].includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${file}`);
        return with_({ [file]: base[file].replace(from, to) });
    };
    const append = (file, text) => with_({ [file]: base[file] + text });
    // release-train.yml as a parsed document, mutated, and dumped back to text: a plant is a
    // structural edit, never a text patch that could silently miss its anchor.
    const withRt = (mutate) => {
        const doc = yaml.load(files[DRY_RUN_FILE]);
        mutate(doc);
        return { files: { ...files, [DRY_RUN_FILE]: yaml.dump(doc) }, selected };
    };
    const wfRun = (name, source, guarded) => [
        `name: ${name}`,
        'on:',
        '  workflow_run:',
        `    workflows: [${source}]`,
        '    types: [completed]',
        'permissions: {}',
        'jobs:',
        '  report:',
        '    runs-on: ubuntu-latest',
        ...(guarded ? [`    if: \${{ ${GUARD} }}`] : []),
        '    steps:',
        '      - run: echo done',
        '',
    ].join('\n');
    const assist = (perm, extraSteps = [], prompt = 'Review the change') => [
        'name: Assist',
        'on: workflow_dispatch',
        'permissions:',
        `  contents: ${perm}`,
        'jobs:',
        '  assist:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        ...extraSteps,
        `      - uses: anthropics/claude-code-action@${H40}`,
        '        with:',
        `          prompt: "${prompt}"`,
        '',
    ].join('\n');
    const plain = (perms) => ['name: Plain', 'on: workflow_dispatch', ...(perms ? [`permissions: ${perms}`] : []), 'jobs:', '  plain:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo plain', ''].join('\n');
    const issuesJob = (name, jobId) => [`name: ${name}`, 'on: workflow_dispatch', 'jobs:', `  ${jobId}:`, '    runs-on: ubuntu-latest', '    permissions:', '      issues: write', '    steps:', '      - run: echo report', ''].join('\n');
    const withClaude = { ...selected, patterns_allowed: [...selected.patterns_allowed, 'anthropics/claude-code-action@*'] };
    const V_PERMS = '    permissions:\n      contents: read\n';
    const V_CHECK = 'run: nix develop .#theia --command node scripts/generate.mjs --check';

    // [name, overrides, file, job, rule, value]
    const plants = [
        // GH-08: pinning, admission and set equality
        ['actions/checkout@v4', edit(V, CHECKOUT, 'actions/checkout@v4'), rel(V), 'verify', 'uses-pinned', 'actions/checkout@v4'],
        ['a 7-character SHA', edit(V, CHECKOUT, 'actions/checkout@11d5960'), rel(V), 'verify', 'uses-pinned', 'actions/checkout@11d5960'],
        ['a 39-character SHA', edit(V, CHECKOUT, CHECKOUT.slice(0, -1)), rel(V), 'verify', 'uses-pinned', CHECKOUT.slice(0, -1)],
        ['a 40-character uppercase SHA', edit(V, CHECKOUT, CHECKOUT.toUpperCase().replace('ACTIONS/CHECKOUT', 'actions/checkout')), rel(V), 'verify', 'uses-pinned', '11D5960A'],
        ['docker://alpine:3', edit(V, CHECKOUT, 'docker://alpine:3'), rel(V), 'verify', 'uses-pinned', 'docker://alpine:3'],
        ['unadmitted foo/bar@<sha>', edit(V, NIX, `foo/bar@${H40}`), rel(V), 'verify', 'uses-admitted', 'foo/bar'],
        ['unused admission unused/action@*', { selected: { ...selected, patterns_allowed: [...selected.patterns_allowed, 'unused/action@*'] } }, SELECTED_REL, WF_LEVEL, 'admission-used', 'unused/action'],
        ['patterns_allowed empty', { selected: { ...selected, patterns_allowed: [] } }, rel(V), 'verify', 'uses-admitted', 'cachix/install-nix-action'],
        ['a duplicate on: key', edit(V, '\njobs:', '\non:\n  schedule:\n    - cron: "0 0 * * *"\n\njobs:'), rel(V), WF_LEVEL, 'parse', 'duplicated mapping key'],
        ['zero workflow files', { files: {} }, `${WF_DIR}/`, WF_LEVEL, 'discovery', 'no workflow files'],
        // GH-12
        ['schedule in verify.yml (on: map)', edit(V, 'on:\n  push:\n', 'on:\n  schedule:\n    - cron: "0 3 * * *"\n  push:\n'), rel(V), WF_LEVEL, 'no-schedule', 'schedule'],
        ['schedule as on: string', with_({ 'cron.yml': plain(null).replace('on: workflow_dispatch', 'on: schedule') }), rel('cron.yml'), WF_LEVEL, 'no-schedule', 'schedule'],
        ['schedule in an on: array', with_({ 'cron.yml': plain(null).replace('on: workflow_dispatch', 'on: [push, schedule]') }), rel('cron.yml'), WF_LEVEL, 'no-schedule', 'schedule'],
        ['legion in release.yml job publish', append(R, job('publish', ['runs-on: [self-hosted, legion]', 'steps:', '  - run: echo x'])), rel(R), 'publish', 'legion', 'build-* or matrix-*'],
        ['legion in verify.yml', edit(V, 'runs-on: ubuntu-latest', 'runs-on: [self-hosted, legion]'), rel(V), 'verify', 'legion', 'build-* or matrix-*'],
        ['legion build-x outside release.yml', with_({ 'other.yml': plain(null).replace('  plain:\n    runs-on: ubuntu-latest', '  build-x:\n    runs-on: [self-hosted, legion]') }), rel('other.yml'), 'build-x', 'legion', 'build-* or matrix-*'],
        ['legion job rebuild-x in release.yml', append(R, job('rebuild-x', ['runs-on: [self-hosted, legion]', 'steps:', '  - run: echo x'])), rel(R), 'rebuild-x', 'legion', 'build-* or matrix-*'],
        ['runs-on: self-hosted (bare)', edit(V, 'runs-on: ubuntu-latest', 'runs-on: self-hosted'), rel(V), 'verify', 'runner', '"self-hosted"'],
        ['runs-on: ${{ matrix.os }}', edit(V, 'runs-on: ubuntu-latest', 'runs-on: ${{ matrix.os }}'), rel(V), 'verify', 'runner', 'must be literal'],
        ['secrets.X in build-linux', edit(R, BUILD, `${BUILD}    env:\n      TOKEN: \${{ secrets.X }}\n`), rel(R), 'build-linux', 'legion', 'secrets.'],
        ['environment: in build-linux', edit(R, BUILD, `${BUILD}    environment: release\n`), rel(R), 'build-linux', 'legion', 'environment'],
        ['secrets: inherit in a legion job', edit(R, BUILD, `${BUILD}    secrets: inherit\n`), rel(R), 'build-linux', 'legion', 'secrets: inherit'],
        ['unguarded workflow_run', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', false) }), rel('after.yml'), 'report', 'workflow-run-guard', 'head_repository'],
        ['chained workflow_run source', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true), 'chained.yml': wfRun('Chained', 'After verify', true) }), rel('after.yml'), WF_LEVEL, 'workflow-run-chain', 'After verify'],
        ['github.event.issue.title in run:', edit(V, V_CHECK, 'run: echo "${{ github.event.issue.title }}"'), rel(V), 'verify', 'event-text', 'github.event.issue'],
        ['github.event.review_comment.body in run:', edit(V, V_CHECK, 'run: echo "${{ github.event.review_comment.body }}"'), rel(V), 'verify', 'event-text', 'github.event.review'],
        ['github.event.pull_request.body in with.prompt', { files: { ...base, 'assist.yml': assist('read', [], 'Review ${{ github.event.pull_request.body }}') }, selected: withClaude }, rel('assist.yml'), 'assist', 'event-text', 'with.prompt'],
        ['issues write in verify.yml', edit(V, V_PERMS, `${V_PERMS}      issues: write\n`), rel(V), 'verify', 'issues-write', 'issues write'],
        ['issues write through permissions: write-all', edit(V, V_PERMS, '    permissions: write-all\n'), rel(V), 'verify', 'issues-write', 'issues write'],
        ['issues write through the repository default write', { files: { ...base, 'plain.yml': plain(null) }, defaultPermissions: 'write' }, rel('plain.yml'), 'plain', 'issues-write', 'issues write'],
        ['write trio in job publish (not sign-publish)', append(R, job('publish', ['runs-on: ubuntu-latest', 'permissions:', '  contents: write', '  id-token: write', '  attestations: write', 'steps:', '  - run: echo x'])), rel(R), 'publish', 'write-trio', 'sign-publish'],
        ['pull_request on release.yml', edit(R, 'on:\n  push:', 'on:\n  pull_request:\n  push:'), rel(R), WF_LEVEL, 'no-pr-trigger', 'pull_request'],
        ['pull_request_target on release-train.yml', with_({ 'release-train.yml': plain(null).replace('on: workflow_dispatch', 'on: [workflow_dispatch, pull_request_target]') }), rel('release-train.yml'), WF_LEVEL, 'no-pr-trigger', 'pull_request_target'],
        ['actions/cache in release.yml', edit(R, '      - run: echo build\n', `      - uses: actions/cache@${H40}\n      - run: echo build\n`), rel(R), 'build-linux', 'no-cache', 'actions/cache'],
        ['setup-node with cache: in release.yml', edit(R, '      - run: echo build\n', `      - uses: actions/setup-node@${H40}\n        with:\n          cache: yarn\n      - run: echo build\n`), rel(R), 'build-linux', 'no-cache', 'cache input'],
        ['claude-code-action beside an App-token step', { files: { ...base, 'assist.yml': assist('read', [`      - uses: actions/create-github-app-token@${H40}`]) }, selected: withClaude }, rel('assist.yml'), 'assist', 'claude-code-action', 'create-github-app-token'],
        ['claude-code-action on legion', edit(R, '      - run: echo build\n', `      - uses: anthropics/claude-code-action@${H40}\n      - run: echo build\n`), rel(R), 'build-linux', 'claude-code-action', 'not GitHub-hosted'],
        ['claude-code-action with contents write', { files: { ...base, 'assist.yml': assist('write') }, selected: withClaude }, rel('assist.yml'), 'assist', 'claude-code-action', 'contents write'],
        // TRAIN-08 and the release-train trust shape, planted on the real release-train.yml
        ['ungated git push in bump-pr', withRt(d => d.jobs['bump-pr'].steps.push({ run: 'git push origin HEAD:refs/heads/x' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', `no ${DRY_RUN_GATE} gate`],
        ['ungated gh issue comment in report', withRt(d => d.jobs.report.steps.push({ run: 'gh issue comment 1 --body x' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', `no ${DRY_RUN_GATE} gate`],
        ['ungated App-token mint in bump-pr', withRt(d => d.jobs['bump-pr'].steps.push({ uses: `${APP_TOKEN}${H40}` })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', `no ${DRY_RUN_GATE} gate`],
        ['schedule key on release-train.yml', withRt(d => { d.on.schedule = [{ cron: '0 3 * * *' }]; }), rel(DRY_RUN_FILE), WF_LEVEL, 'no-schedule', 'schedule'],
        ['pull_request trigger on release-train.yml', withRt(d => { d.on.pull_request = null; }), rel(DRY_RUN_FILE), WF_LEVEL, 'no-pr-trigger', 'pull_request'],
        ['unguarded workflow_run job in release-train.yml', withRt(d => { d.on.workflow_run = { workflows: ['Verify static layers'], types: ['completed'] }; d.jobs.derive.if = 'true'; }), rel(DRY_RUN_FILE), 'derive', 'workflow-run-guard', 'head_repository'],
        ['legion runs-on on release-train.yml job detect', withRt(d => { d.jobs.detect['runs-on'] = ['self-hosted', 'legion']; }), rel(DRY_RUN_FILE), 'detect', 'legion', 'build-* or matrix-*'],
    ];

    // Green controls: the good release.yml (every plant's base), the two
    // admitted issues-write jobs, a guarded workflow_run, a hosted read-only
    // claude-code-action, and read-all over a write repository default.
    const controls = [
        ['good release.yml: build-linux on legion, sign-publish with the write trio', { files: base }],
        ['issues write on release-train.yml job report', with_({ 'release-train.yml': issuesJob('Release train', 'report') })],
        ['issues write on triage.yml', with_({ 'triage.yml': issuesJob('Triage', 'label') })],
        ['guarded workflow_run', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true) })],
        ['claude-code-action hosted with contents read', { files: { ...base, 'assist.yml': assist('read') }, selected: withClaude }],
        ['permissions: read-all over a write repository default', { files: { ...base, 'plain.yml': plain('read-all') }, defaultPermissions: 'write' }],
        ['release-train.yml with its write steps gated by inputs.dry-run', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ !${DRY_RUN_GATE} }}`, run: 'git push origin HEAD:refs/heads/x' }))],
        ['the unmodified release-train.yml under the new rule', { files }],
    ];

    let failed = 0;
    for (const [name, overrides, file, job, rule, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { files, selected, ...overrides });
        if (failures.some(f => f.file === file && f.job === job && f.rule === rule && f.msg.includes(value))) {
            console.log(`  ok  ${name} -> red, naming ${file} job ${job} [${rule}] '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${file} job ${job} [${rule}] '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    for (const [name, overrides] of controls) {
        const { failures } = runChecks(REPO_ROOT, { files, selected, ...overrides });
        if (failures.length === 0) {
            console.log(`  ok  control: ${name} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the control '${name}' went red: ${failures.map(fmt).join(' | ')}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the file and job, and ${controls.length} controls stayed green`);
    return 0;
}

process.exit(main());
