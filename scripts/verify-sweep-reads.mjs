#!/usr/bin/env node
// scripts/verify-sweep-reads.mjs
//
// The live reads that feed the maintenance sweep's Phase 51 rows (TRAIN-11; plan 51-04 review CR-01, WR-04,
// WR-06, IN-01 to IN-03). The rows are pure and self-tested, but the shell that builds their facts is where the
// rule "a failed read is no-data, never green and never red" can break, and a self-test that hands fixtures
// straight to deriveMaintenance never runs it. This row does not copy that shell into JavaScript. It reads the
// repo-facts, security-reads and codeberg steps of the maintenance-probe job in release-train.yml with js-yaml and
// executes that exact bash text (as the Actions runner does: bash -e), with a stub gh and a stub curl on PATH that
// answer from fixtures. For each scenario it asserts the exact set of job outputs the step writes:
//
//  - a zero-length list from a successful read is a real 0 (and an empty list of PRs);
//  - real counts and the Dependabot PR facts, across two pages, with human PRs left out;
//  - empty output with exit 0, a 403 JSON error body with exit 1, a 5xx page with exit 1, a gh failure that still
//    prints a valid empty list, an error object with exit 0, a page of non-objects and a PR without a date each write
//    NOTHING for that read (the facts then carry null, which the rows render as no-data);
//  - one failing read does not erase the others;
//  - the default branch is read (a rename moves the activity and Codeberg requests with it), the last push is the
//    newest push-type activity, and a failed or empty read writes no push time;
//  - an unset Codeberg mirror writes nothing, a declared one always writes the pair with a null for a side that
//    could not be read (so it renders red, not silence).
//
// It also checks, from the workflow text: the facts step declares repoControls null only with the named deferral
// marker (WR-04), and every probe job output is written by the step it names and every PROBE_* output the render
// reads exists (WR-06).
//
// --self-test plants one fault per rule in the step text (the exit status ignored, the shape check removed, the
// branch hard-coded to main, an unset mirror reported as declared, a renamed output) and requires each to go red
// naming it. Honestly --quick: bash, jq and node on PATH; mkdtemp; no network, no gh, no build.
//
// Usage:
//   node scripts/verify-sweep-reads.mjs
//   node scripts/verify-sweep-reads.mjs --self-test

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const NAME = 'verify-sweep-reads';
const SELF_REL = 'scripts/verify-sweep-reads.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_REL = '.github/workflows/release-train.yml';
const PROBE = 'maintenance-probe';
const RENDER = 'maintenance';
const REPO = 'owner-fixture/repo-fixture';
const DEFER_MARKER = 'deferred: repo-controls-live-read';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
if (args.length > 0 && !SELF_TEST) {
    console.error(`${NAME}: FAIL -- unknown argument '${args[0]}'. Next step: run with no argument, or with --self-test.`);
    process.exit(2);
}

// The stub gh: `gh api <endpoint> [--paginate] [--slurp] [--jq <expr>]`. A fixture is { match, code, out }; the first
// whose match equals the endpoint (or is a prefix of it when it ends in *) answers. Like gh, the --jq expression is
// applied only when the call succeeds. An endpoint no fixture covers is a failed call with no output, and is logged.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const a = process.argv.slice(2);
if (a[0] !== 'api') { console.error('fake gh: unexpected call ' + JSON.stringify(a)); process.exit(1); }
const j = a.indexOf('--jq');
const expr = j >= 0 ? a[j + 1] : null;
const rest = a.slice(1).filter((x, i) => !(j >= 0 && (i + 1 === j || i + 1 === j + 1)));
const endpoint = rest.find(x => !x.startsWith('--'));
fs.appendFileSync(process.env.FAKE_GH_LOG, endpoint + ' ' + rest.filter(x => x.startsWith('--')).join(' ') + '\\n');
const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'));
const hit = fx.find(f => (f.match.endsWith('*') ? endpoint.startsWith(f.match.slice(0, -1)) : endpoint === f.match));
if (hit === undefined) { console.error('fake gh: no fixture for ' + endpoint); process.exit(1); }
if (hit.code !== 0) { process.stdout.write(hit.out); process.exit(hit.code); }
if (expr === null) { process.stdout.write(hit.out); process.exit(0); }
const r = spawnSync('jq', ['-r', expr], { input: hit.out, encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
process.stdout.write(r.stdout);
`;

const FAKE_CURL = `#!/bin/sh
for last; do :; done
printf '%s\\n' "$last" >> "$FAKE_CURL_LOG"
printf '%s' "\${FAKE_CURL_OUT:-}"
exit "\${FAKE_CURL_CODE:-0}"
`;

const act = (type, timestamp) => ({ activity_type: type, timestamp, ref: 'refs/heads/trunk' });
const dep = (n, createdAt, labels = []) => ({ number: n, user: { login: 'dependabot[bot]' }, created_at: createdAt, labels: labels.map(name => ({ name })) });
const human = (n) => ({ number: n, user: { login: 'someone' }, created_at: '2026-10-01T00:00:00Z', labels: [] });
const ERR403 = '{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest","status":"403"}';
const ok = (match, body) => ({ match, code: 0, out: typeof body === 'string' ? body : JSON.stringify(body) });
const fail = (match, code, out = '') => ({ match, code, out });

const EP = {
    prs: `repos/${REPO}/pulls?state=open&per_page=100`,
    dep: `repos/${REPO}/dependabot/alerts?state=open&per_page=100`,
    cql: `repos/${REPO}/code-scanning/alerts?state=open&per_page=100`,
    repo: `repos/${REPO}`,
    act: (b) => `repos/${REPO}/activity?ref=refs/heads/${b}&*`,
    ref: (b) => `repos/${REPO}/git/ref/heads/${b}`,
};

function makeCtx() {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-reads-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), FAKE_GH);
    writeFileSync(join(bin, 'curl'), FAKE_CURL);
    chmodSync(join(bin, 'gh'), 0o755);
    chmodSync(join(bin, 'curl'), 0o755);
    return { dir, bin };
}

/** Run one shipped step's bash text as the Actions runner does (bash -e). Returns { code, text, outputs, ghLog, curlLog }. */
function runStep(ctx, step, fixtures, env = {}, curl = {}) {
    for (const f of ['output', 'gh.log', 'curl.log']) writeFileSync(join(ctx.dir, f), '');
    writeFileSync(join(ctx.dir, 'fixture.json'), JSON.stringify(fixtures));
    const r = spawnSync('bash', ['--noprofile', '--norc', '-e', '-c', String(step.run)], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
            PATH: `${ctx.bin}:${process.env.PATH}`, HOME: ctx.dir, RUNNER_TEMP: ctx.dir, GITHUB_OUTPUT: join(ctx.dir, 'output'),
            GH_TOKEN: 'fixture-token', REPO, FAKE_GH_FIXTURE: join(ctx.dir, 'fixture.json'), FAKE_GH_LOG: join(ctx.dir, 'gh.log'),
            FAKE_CURL_LOG: join(ctx.dir, 'curl.log'), FAKE_CURL_OUT: curl.out ?? '', FAKE_CURL_CODE: String(curl.code ?? 0), ...env,
        },
    });
    const outputs = Object.fromEntries(readFileSync(join(ctx.dir, 'output'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    return { code: r.status, text: `${r.stdout}${r.stderr}`.trim(), outputs, ghLog: readFileSync(join(ctx.dir, 'gh.log'), 'utf8'), curlLog: readFileSync(join(ctx.dir, 'curl.log'), 'utf8') };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function stepsOfProbe(text) {
    const wf = loadYaml().load(text);
    const steps = stepsOf(wf?.jobs?.[PROBE]);
    return { wf, byId: Object.fromEntries(steps.filter(s => typeof s.id === 'string').map(s => [s.id, s])) };
}

/** The scenarios over a workflow text. Returns failure strings; empty means every property holds. */
function scenarios(ctx, text) {
    const failures = [];
    const { wf, byId } = stepsOfProbe(text);
    for (const id of ['repo-facts', 'security-reads', 'codeberg']) {
        if (byId[id] === undefined) return [`${WORKFLOW_REL} job ${PROBE} has no step with id ${id}. Next step: restore it.`];
    }
    // want: the exact outputs the step must write (a missing key must be absent, not just empty).
    const check = (name, step, fixtures, want, env = {}, curl = {}) => {
        const r = runStep(ctx, byId[step], fixtures, env, curl);
        if (r.code !== 0) { failures.push(`${name}: step ${step} exited ${r.code}, so a failed read ended the step (${r.text.slice(0, 200)})`); return r; }
        const got = r.outputs;
        const same_ = Object.keys(want).length === Object.keys(got).length && Object.entries(want).every(([k, v]) => (typeof v === 'function' ? v(got[k]) : got[k] === v));
        if (!same_) failures.push(`${name}: step ${step} wrote ${JSON.stringify(got)}, expected ${JSON.stringify(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, typeof v === 'function' ? '(checked)' : v])))}`);
        return r;
    };

    // security-reads
    const NONE = {};
    const allOk = [ok(EP.prs, [[]]), ok(EP.dep, [[]]), ok(EP.cql, [[]])];
    check('a zero-length list on every endpoint is a real 0', 'security-reads', allOk, { 'dependabot-prs': '[]', 'dependabot-alerts': '0', 'codeql-alerts': '0' });
    const created = ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'];
    check('real counts and Dependabot PR facts across two pages', 'security-reads', [
        ok(EP.prs, [[dep(1, created[0], ['security', 'dependencies']), human(2)], [dep(3, created[1])]]),
        ok(EP.dep, [[{ number: 1 }, { number: 2 }], [{ number: 3 }]]),
        ok(EP.cql, [[{ number: 1 }]]),
    ], {
        'dependabot-prs': v => same(JSON.parse(v ?? 'null'), [{ createdMs: Date.parse(created[0]), security: true }, { createdMs: Date.parse(created[1]), security: false }]),
        'dependabot-alerts': '3',
        'codeql-alerts': '1',
    });
    const everyEndpoint = (f) => [f(EP.prs), f(EP.dep), f(EP.cql)];
    check('empty output with exit 0 writes nothing (empty is not 0)', 'security-reads', everyEndpoint(m => ok(m, '')), NONE);
    check('a 403 JSON error body with exit 1 writes nothing (an object is not 3 alerts)', 'security-reads', everyEndpoint(m => fail(m, 1, ERR403)), NONE);
    check('a 5xx page with exit 1 writes nothing', 'security-reads', everyEndpoint(m => fail(m, 1, '<html>502 Bad Gateway</html>')), NONE);
    check('a gh failure that still prints a valid empty list writes nothing', 'security-reads', everyEndpoint(m => fail(m, 1, '[[]]')), NONE);
    check('an error object with exit 0 writes nothing', 'security-reads', everyEndpoint(m => ok(m, ERR403)), NONE);
    check('a page of non-objects writes nothing', 'security-reads', everyEndpoint(m => ok(m, [['x']])), NONE);
    check('one failing read does not erase the others', 'security-reads', [ok(EP.prs, [[]]), fail(EP.dep, 1, ERR403), ok(EP.cql, [[]])], { 'dependabot-prs': '[]', 'codeql-alerts': '0' });
    check('a Dependabot PR without an open date writes no PR facts', 'security-reads', [ok(EP.prs, [[{ number: 1, user: { login: 'dependabot[bot]' }, labels: [] }]]), ok(EP.dep, [[]]), ok(EP.cql, [[]])], { 'dependabot-alerts': '0', 'codeql-alerts': '0' });
    const paged = runStep(ctx, byId['security-reads'], allOk);
    if (!paged.ghLog.includes('--paginate --slurp')) failures.push(`security-reads did not ask gh for every page with --paginate --slurp (calls: ${JSON.stringify(paged.ghLog)}), so only page 1 would be counted`);

    // repo-facts: the default branch, then the last push on that branch.
    const pushed = '2026-10-30T18:24:32Z';
    const acts = [act('branch_creation', '2026-11-01T00:00:00Z'), act('pr_merge', pushed), act('push', '2026-10-01T00:00:00Z')];
    for (const branch of ['trunk', 'master']) {
        check(`the default branch ${branch} is read and its last push is the newest push-type activity`, 'repo-facts', [
            ok(EP.act(branch), acts), ok(EP.repo, { default_branch: branch }),
        ], { 'default-branch': branch, 'codeql-push-ms': String(Date.parse(pushed)) });
    }
    check('a failed repository read writes nothing', 'repo-facts', [fail(EP.repo, 1, ERR403), ok(EP.act('trunk'), acts)], NONE);
    check('a repository error object with exit 0 writes nothing', 'repo-facts', [ok(EP.repo, ERR403), ok(EP.act('trunk'), acts)], NONE);
    const branchOnly = { 'default-branch': 'trunk' };
    check('a failed activity read writes the branch and no push time', 'repo-facts', [ok(EP.repo, { default_branch: 'trunk' }), fail(EP.act('trunk'), 1, ERR403)], branchOnly);
    check('an empty activity list writes no push time', 'repo-facts', [ok(EP.repo, { default_branch: 'trunk' }), ok(EP.act('trunk'), [])], branchOnly);
    check('activity that is only a branch creation writes no push time', 'repo-facts', [ok(EP.repo, { default_branch: 'trunk' }), ok(EP.act('trunk'), [act('branch_creation', pushed)])], branchOnly);
    check('an activity error object with exit 0 writes no push time', 'repo-facts', [ok(EP.repo, { default_branch: 'trunk' }), ok(EP.act('trunk'), ERR403)], branchOnly);

    // codeberg: unset writes the empty output; set always writes the pair.
    const slug = 'mirror-owner/mirror-repo';
    const cb = (sha) => JSON.stringify({ commit: { id: sha } });
    const refOk = [ok(EP.ref('trunk'), { object: { sha: SHA_A } })];
    const pair = (c, g) => JSON.stringify({ configured: true, codeberg: c, github: g });
    check('an unset mirror writes an empty output (no mirror declared)', 'codeberg', refOk, { codeberg: '' }, { CODEBERG_SLUG: '', BRANCH: 'trunk' }, { out: cb(SHA_A) });
    const equal = check('a declared mirror at the same full SHA writes the pair', 'codeberg', refOk, { codeberg: pair(SHA_A, SHA_A) }, { CODEBERG_SLUG: slug, BRANCH: 'trunk' }, { out: cb(SHA_A) });
    if (!equal.curlLog.includes(`https://codeberg.org/api/v1/repos/${slug}/branches/trunk`)) failures.push(`the Codeberg read did not ask for the default branch: curl calls ${JSON.stringify(equal.curlLog)}`);
    check('a declared mirror that does not answer writes a null Codeberg side', 'codeberg', refOk, { codeberg: pair(null, SHA_A) }, { CODEBERG_SLUG: slug, BRANCH: 'trunk' }, { out: '', code: 22 });
    check('a declared mirror answering a short SHA writes a null Codeberg side', 'codeberg', refOk, { codeberg: pair(null, SHA_A) }, { CODEBERG_SLUG: slug, BRANCH: 'trunk' }, { out: cb('abc1234') });
    check('a failed GitHub ref read writes a null GitHub side', 'codeberg', [fail(EP.ref('trunk'), 1, ERR403)], { codeberg: pair(SHA_B, null) }, { CODEBERG_SLUG: slug, BRANCH: 'trunk' }, { out: cb(SHA_B) });
    const invalid = check('a declared slug that is not owner/repo is never fetched and writes a null Codeberg side', 'codeberg', refOk, { codeberg: pair(null, SHA_A) }, { CODEBERG_SLUG: 'not a slug', BRANCH: 'trunk' }, { out: cb(SHA_A) });
    if (invalid.curlLog !== '') failures.push(`an invalid Codeberg slug was fetched: ${JSON.stringify(invalid.curlLog)}`);
    check('a declared mirror with no default branch read writes both sides null', 'codeberg', refOk, { codeberg: pair(null, null) }, { CODEBERG_SLUG: slug, BRANCH: '' }, { out: cb(SHA_A) });

    // Static: the deferral marker (WR-04) and the output wiring (WR-06).
    const build = stepsOf(wf?.jobs?.[RENDER]).find(s => s?.id === 'render');
    const buildText = String(build?.run ?? '');
    const nullRepo = /^\s*repoControls:\s*null\s*,/m.test(buildText);
    const marked = buildText.includes(DEFER_MARKER);
    if (nullRepo && !marked) failures.push(`the facts step builds repoControls as null with no "${DEFER_MARKER}" marker, so the missing live read is not a recorded deferral. Next step: restore the marker comment (BLOCKED.md item 13), or wire the read.`);
    if (!nullRepo && marked) failures.push(`the facts step carries the "${DEFER_MARKER}" marker but repoControls is no longer null. Next step: remove the marker now that the read is wired.`);
    const probeOutputs = wf?.jobs?.[PROBE]?.outputs ?? {};
    for (const [key, expr] of Object.entries(probeOutputs)) {
        const m = /steps\.([\w-]+)\.outputs\.([\w-]+)/.exec(String(expr));
        if (m === null) { failures.push(`probe output ${key} is not a steps.<id>.outputs.<name> reference (${expr})`); continue; }
        const step = byId[m[1]];
        if (step === undefined) failures.push(`probe output ${key} reads step ${m[1]}, which does not exist`);
        else if (!new RegExp(`["']?${m[2]}=`).test(String(step.run ?? ''))) failures.push(`probe output ${key} reads output ${m[2]} of step ${m[1]}, but that step never writes ${m[2]}=, so the fact is null forever`);
    }
    for (const s of stepsOf(wf?.jobs?.[RENDER])) {
        for (const m of JSON.stringify(s?.env ?? {}).matchAll(/needs\.maintenance-probe\.outputs\.([\w-]+)/g)) {
            if (!(m[1] in probeOutputs)) failures.push(`the render step reads needs.maintenance-probe.outputs.${m[1]}, which the probe job does not declare, so the fact is null forever`);
        }
    }
    return failures;
}

function main() {
    const real = readFileSync(join(REPO_ROOT, WORKFLOW_REL), 'utf8');
    const ctx = makeCtx();
    try {
        if (SELF_TEST) return selfTest(ctx, real);
        const failures = scenarios(ctx, real);
        if (failures.length > 0) {
            console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in ${WORKFLOW_REL} job ${PROBE}`);
            failures.forEach(f => console.error(`  ${f}`));
            return 1;
        }
        console.log(`${NAME}: PASS -- the shipped repo-facts, security-reads and codeberg steps write a count only from a successful, well-shaped read (empty output, error bodies, 4xx and 5xx write nothing), read the default branch, and the facts wiring is declared`);
        return 0;
    } finally {
        rmSync(ctx.dir, { recursive: true, force: true });
    }
}

function selfTest(ctx, real) {
    const baseline = scenarios(ctx, real);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified workflow is already red, so the planted-fault results would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  baseline -> green');
    // Each plant rewrites one anchor of the real text; an absent anchor is a self-test fault.
    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${WORKFLOW_REL}`);
        return real.split(from).join(to);
    };
    const SHAPE = `jq -e 'type == "array" and all(.[]; type == "array" and all(.[]; type == "object"))' "$PAGES" > /dev/null 2>&1`;
    const plants = [
        ['gh exit status ignored in the page read', edit('--paginate --slurp > "$PAGES" 2>/dev/null || return 1', '--paginate --slurp > "$PAGES" 2>/dev/null || true'), 'a gh failure that still prints a valid empty list'],
        ['page shape not validated', edit(SHAPE, 'true'), 'an error object with exit 0'],
        ['page shape without the per-item object check', edit('type == "array" and all(.[]; type == "array" and all(.[]; type == "object"))', 'type == "array" and all(.[]; type == "array")'), 'a page of non-objects'],
        ['pages not requested with --slurp', edit('--paginate --slurp', '--paginate'), 'did not ask gh for every page'],
        ['default branch hard-coded to main in the activity read', edit('activity?ref=refs/heads/${BRANCH}', 'activity?ref=refs/heads/main'), 'default branch'],
        ['an unset mirror reported as declared', edit('if [ -n "$CODEBERG_SLUG" ]; then', 'if true; then'), 'an unset mirror writes an empty output'],
        ['the Codeberg read hard-coded to main', edit('/branches/${BRANCH}', '/branches/main'), 'did not ask for the default branch'],
        ['a probe output renamed away from the step that writes it', edit('dependabot-alerts: ${{ steps.security-reads.outputs.dependabot-alerts }}', 'dependabot-alerts: ${{ steps.security-reads.outputs.dependabot-alert }}'), 'never writes dependabot-alert='],
        ['a render env reading an undeclared probe output', edit('needs.maintenance-probe.outputs.codeql-push-ms', 'needs.maintenance-probe.outputs.codeql-push'), 'does not declare'],
        ['the deferral marker removed from the null repoControls fact', edit(`${DEFER_MARKER} (BLOCKED.md item 13)`, '(BLOCKED.md item 13)'), 'marker'],
    ];
    let failed = 0;
    for (const [name, plant, expect] of plants) {
        const failures = scenarios(ctx, plant);
        if (failures.some(f => f.includes(expect))) {
            console.log(`  ok  ${name} -> red, naming '${expect}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified workflow is green and ${plants.length} planted faults each went red naming their drift`);
    return 0;
}

process.exit(main());
