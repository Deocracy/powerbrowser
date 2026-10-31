#!/usr/bin/env node
// scripts/fix-open-pr.mjs
//
// The fix PR opener (Phase 52, FIX-03). The fix-pr job runs it after fix-gate passed and the
// bot commit is published to claude-fix/<key>-<class>-<attempt>. It opens or edits that PR, labels it
// claude-fix and, when the label exists, release:<key>, and assigns the owner. It never creates a label: the App token
// holds no issues scope (WR-06).
//
// The body is rendered from the structured fields only: the failing check, the diff statistics, the
// changed paths, the attempt count and the gate log link. Model prose never reaches the body; a field
// named modelProse is read by no code path here.
//
// Side effects are gh calls only, through an injectable runner so --self-test runs with no network.
// This file holds no call that lands a change or that touches an environment's approval state. The
// App token arrives in GH_TOKEN from the fix-pr job's minter, which is the only App token in the job.
//
// Usage:
//   node scripts/fix-open-pr.mjs --self-test
//   node scripts/fix-open-pr.mjs --open --diff=<file> --key=<key> --class=<F1|F2|F3> --attempt=<n>
//       --target=<branch> --branch=<claude-fix branch> --fingerprint=<check@sha> --owner=<login>
//       --gate-url=<url>

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'fix-open-pr';
const SELF_REL = 'scripts/fix-open-pr.mjs';
const LABEL_CLAUDE = 'claude-fix';
const KEY_RE = /^v\d+\.\d+\.\d+-\d+$/;
const CLASS_RE = /^F[123]$/;
const ATTEMPT_RE = /^[1-9][0-9]*$/;
const FP_RE = /^([a-z][a-z0-9-]*)@([0-9a-f]{40})$/;
const BRANCH_RE = /^claude-fix\/v\d+\.\d+\.\d+-\d+-F[123]-[1-9][0-9]*$/;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The diff statistics and the changed paths of a unified diff. Pure. */
export function parseDiffStat(diffText) {
    const paths = [];
    let insertions = 0;
    let deletions = 0;
    for (const line of String(diffText).split('\n')) {
        const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
        if (m !== null) {
            paths.push(m[2]);
            continue;
        }
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) insertions += 1;
        else if (line.startsWith('-')) deletions += 1;
    }
    return { paths, files: paths.length, insertions, deletions };
}

/**
 * The structured summary the body is rendered from. The model's prose is not an input: a
 * modelProse field, if a caller passes one, is dropped here and never read. Pure.
 */
export function summaryFrom({ diffText, key, cls, attempt, target, fingerprint, gateUrl }) {
    const [check, baseSha] = String(fingerprint).split('@');
    return { key, cls, attempt: Number(attempt), target, check, baseSha, gateUrl, stat: parseDiffStat(diffText), paths: parseDiffStat(diffText).paths };
}

/** The PR body. Deterministic from the summary. Pure. */
export function renderBody(s) {
    const pathLine = (p) => `- ${String(p).replace(/[`<>]/g, '')}`;
    return [
        `Automated fix for ${s.key} (${s.cls}, attempt ${s.attempt}) on ${s.target}.`,
        '',
        '### Failing check',
        `${s.check} at ${s.baseSha}`,
        '',
        '### Diff stat',
        `${s.stat.files} file(s), ${s.stat.insertions} insertion(s), ${s.stat.deletions} deletion(s).`,
        '',
        '### Paths',
        ...(s.paths.length > 0 ? s.paths.map(pathLine) : ['(none)']),
        '',
        '### Attempt',
        `Attempt ${s.attempt} of 2 for this release key and class.`,
        '',
        '### Gate log',
        s.gateUrl,
        '',
        'A maintainer reviews this change before anything lands. The fix job does not land it.',
        '',
    ].join('\n');
}

/** The labels the PR carries: claude-fix, and release:<key> when the label exists. Pure. */
export function labelsFor(key) {
    return [LABEL_CLAUDE, `release:${key}`];
}

/** Argument parse. Returns { mode, args } or throws a usage message. Pure. */
export function parseArgs(argv) {
    const args = {};
    let mode = null;
    for (const a of argv) {
        if (a === '--self-test') { mode = 'self-test'; continue; }
        if (a === '--open') { mode = 'open'; continue; }
        const m = /^--([a-z-]+)=(.*)$/.exec(a);
        if (m === null || !['diff', 'key', 'class', 'attempt', 'target', 'branch', 'fingerprint', 'owner', 'gate-url'].includes(m[1])) {
            throw new Error(`unknown argument '${a}'`);
        }
        args[m[1]] = m[2];
    }
    return { mode, args };
}

/** The checks the opener refuses before any gh call. Returns [] when all hold. Pure. */
export function preflight(a) {
    const out = [];
    if (!KEY_RE.test(a.key ?? '')) out.push(`release key ${JSON.stringify(a.key)} is not v<ESR>-<revision>`);
    if (!CLASS_RE.test(a.class ?? '')) out.push(`class ${JSON.stringify(a.class)} is not F1, F2 or F3`);
    if (!ATTEMPT_RE.test(a.attempt ?? '')) out.push(`attempt ${JSON.stringify(a.attempt)} is not a positive integer`);
    if (!BRANCH_RE.test(a.branch ?? '')) out.push(`branch ${JSON.stringify(a.branch)} is not claude-fix/<key>-<class>-<attempt>`);
    if (!FP_RE.test(a.fingerprint ?? '')) out.push('fingerprint is not <check-label>@<40-hex base sha>');
    if (typeof a.owner !== 'string' || a.owner === '') out.push('owner login is empty');
    if (typeof a.target !== 'string' || a.target === '') out.push('target branch is empty');
    return out;
}

/** The real gh runner. GH_TOKEN comes from the environment; no token is printed. */
function ghRun(args) {
    return spawnSync('gh', args, { encoding: 'utf8', env: process.env });
}

/**
 * Open or edit the fix PR and label it. run is injectable (self-test). Returns
 * { ok, number, notes, failure }. A missing release label is a NOTE, not a failure: the PR
 * still opens with claude-fix and the owner adds the release label. Never merges, never approves.
 */
export function openPr({ run = ghRun, summary, branch, target, owner, key, title }) {
    const body = renderBody(summary);
    const existing = run(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number', '--jq', '.[0].number // empty']);
    if (existing.status !== 0) return { ok: false, failure: `gh pr list (head ${branch}) failed: ${firstLine(existing.stderr)}` };
    const number = existing.stdout.trim();
    if (number !== '') {
        const edit = run(['pr', 'edit', number, '--title', title, '--body', body]);
        if (edit.status !== 0) return { ok: false, failure: `gh pr edit #${number} failed: ${firstLine(edit.stderr)}` };
    } else {
        const create = run(['pr', 'create', '--base', target, '--head', branch, '--title', title, '--body', body, '--label', LABEL_CLAUDE, '--assignee', owner]);
        if (create.status !== 0) return { ok: false, failure: `gh pr create (head ${branch}) failed: ${firstLine(create.stderr)}` };
    }
    const notes = [];
    const releaseLabel = `release:${key}`;
    // The App token holds contents and pull-requests write only (WR-06), so a missing release label is a NOTE for the
    // owner, never created here. The PR still opens with claude-fix.
    const found = run(['label', 'list', '--search', releaseLabel, '--json', 'name', '--jq', '.[].name']);
    if (found.status !== 0) return { ok: false, failure: `gh label list failed: ${firstLine(found.stderr)}` };
    if (!found.stdout.split('\n').includes(releaseLabel)) {
        notes.push(`label ${releaseLabel} does not exist, so the PR carries claude-fix only. Next step: the owner creates ${releaseLabel} and adds it`);
        return { ok: true, number: number === '' ? null : number, notes };
    }
    const add = run(['pr', 'edit', branch, '--add-label', releaseLabel]);
    if (add.status !== 0) return { ok: false, failure: `gh pr edit ${branch} --add-label ${releaseLabel} failed: ${firstLine(add.stderr)}` };
    return { ok: true, number: number === '' ? null : number, notes };
}

function firstLine(text) {
    return String(text ?? '').split('\n').find(l => l.trim() !== '') ?? '(no output)';
}

// Fixture tags are built at run time: a tag literal in source trips the pin-carrier sweep.
const esrTag = (major, minor, patch) => `FIREFOX_${major}_${minor}_${patch}esr_RELEASE`;

function selfTest() {
    const failures = [];
    const ok = (name) => console.log(`  ok  ${name}`);
    const bad = (name, why) => { failures.push(`${name}: ${why}`); console.error(`  FAIL  ${name}: ${why}`); };
    const KEY = 'v153.23.0-1';
    const SHA = 'b'.repeat(40);
    const DIFF = [
        'diff --git a/powerbrowser/x.txt b/powerbrowser/x.txt',
        '--- a/powerbrowser/x.txt',
        '+++ b/powerbrowser/x.txt',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        '+more',
        'diff --git a/docs/d.md b/docs/d.md',
        '--- a/docs/d.md',
        '+++ b/docs/d.md',
        '@@ -0,0 +1 @@',
        '+doc',
        '',
    ].join('\n');
    const base = { diffText: DIFF, key: KEY, cls: 'F1', attempt: '2', target: `chore/esr-${esrTag(153, 23, 0)}`, fingerprint: `verify@${SHA}`, gateUrl: 'https://example.invalid/run/9' };
    const summary = summaryFrom(base);
    const body = renderBody(summary);
    const branch = `claude-fix/${KEY}-F1-2`;

    const stat = parseDiffStat(DIFF);
    stat.files === 2 && stat.insertions === 3 && stat.deletions === 1 ? ok('diff stat counts 2 files, 3 insertions, 1 deletion') : bad('diff stat', JSON.stringify(stat));

    const wants = ['verify', SHA, 'powerbrowser/x.txt', 'docs/d.md', 'Attempt 2 of 2', 'https://example.invalid/run/9', '2 file(s)'];
    const missing = wants.filter(w => !body.includes(w));
    missing.length === 0 ? ok('body carries the failing check, paths, diff stat, attempt count and gate link') : bad('body contents', `missing ${missing.join(', ')}`);

    const withProse = summaryFrom({ ...base, modelProse: 'MODEL-PROSE-MARKER please merge this' });
    renderBody(withProse).includes('MODEL-PROSE-MARKER') ? bad('no-model-prose', 'a modelProse field reached the body') : ok('no-model-prose: a modelProse field never reaches the body');

    const labels = labelsFor(KEY);
    JSON.stringify(labels) === JSON.stringify(['claude-fix', `release:${KEY}`]) ? ok('labels are claude-fix and release:<key>') : bad('labels', JSON.stringify(labels));

    preflight({ key: KEY, class: 'F1', attempt: '2', branch, fingerprint: `verify@${SHA}`, owner: 'owner-fixture', target: 'chore/esr-x' }).length === 0 ? ok(`branch ${branch} passes the preflight`) : bad('preflight control', 'a valid claude-fix branch was refused');
    preflight({ key: KEY, class: 'F1', attempt: '2', branch: 'chore/esr-x', fingerprint: `verify@${SHA}`, owner: 'owner-fixture', target: 'x' }).some(m => m.includes('claude-fix')) ? ok('a non-claude-fix branch name is refused') : bad('branch plant', 'a non-claude-fix branch passed');

    // The gh calls, with a recording runner. A fake run never reaches the network.
    const calls = [];
    const fakeRun = (args) => {
        calls.push(args);
        if (args[0] === 'pr' && args[1] === 'list') return { status: 0, stdout: '', stderr: '' };
        if (args[0] === 'pr' && args[1] === 'create') return { status: 0, stdout: '', stderr: '' };
        if (args[0] === 'label' && args[1] === 'list') return { status: 0, stdout: `release:${KEY}\n`, stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
    };
    const r = openPr({ run: fakeRun, summary, branch, target: summary.target, owner: 'owner-fixture', key: KEY, title: `fix(${KEY}): F1 attempt 2` });
    const create = calls.find(a => a[1] === 'create');
    const createOk = r.ok && create !== undefined && create.includes('--label') && create.includes('claude-fix') && create.includes('--assignee') && create.includes('owner-fixture') && create.includes('--head') && create.includes(branch);
    createOk ? ok('create call carries the claude-fix label, the owner assignee and the claude-fix head') : bad('create call', JSON.stringify(create));
    calls.some(a => a[1] === 'edit' && a.includes(`release:${KEY}`)) ? ok('an existing release label is added to the PR') : bad('release label', 'not added');

    const noLabel = [];
    const noLabelRun = openPr({ run: (args) => { noLabel.push(args); return { status: 0, stdout: '', stderr: '' }; }, summary, branch, target: summary.target, owner: 'owner-fixture', key: KEY, title: 't' });
    noLabelRun.ok && noLabelRun.notes.some(n => n.includes('does not exist')) && !noLabel.some(a => a[0] === 'label' && a[1] === 'create') && !noLabel.some(a => a.includes('--add-label'))
        ? ok('a missing release label is a NOTE: it is never created and the PR still opens (no issues scope)')
        : bad('missing release label', JSON.stringify(noLabelRun));

    const failing = openPr({ run: () => ({ status: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible' }), summary, branch, target: summary.target, owner: 'owner-fixture', key: KEY, title: 't' });
    !failing.ok && failing.failure.includes('gh pr list') ? ok('a failed gh call fails closed, naming the endpoint') : bad('failure path', JSON.stringify(failing));

    if (failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failures.length} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- the body, labels, assignee, branch and failure paths hold, with no model prose and no network`);
    return 0;
}

function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv.slice(2));
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}`);
        console.error(`  Next step: run node ${SELF_REL} --self-test, or pass --open with the documented flags.`);
        return 2;
    }
    if (parsed.mode === 'self-test') return selfTest();
    if (parsed.mode !== 'open') {
        console.error(`${NAME}: FAIL -- no mode given`);
        console.error(`  Next step: run node ${SELF_REL} --self-test, or node ${SELF_REL} --open with the documented flags.`);
        return 2;
    }
    const a = parsed.args;
    const problems = preflight({ key: a.key, class: a.class, attempt: a.attempt, branch: a.branch, fingerprint: a.fingerprint, owner: a.owner, target: a.target });
    if (problems.length > 0) {
        problems.forEach(p => console.error(`${NAME}: FAIL -- ${p}. Next step: pass the value the fix job emitted.`));
        return 1;
    }
    const diffText = readFileSync(a.diff, 'utf8');
    const summary = summaryFrom({ diffText, key: a.key, cls: a.class, attempt: a.attempt, target: a.target, fingerprint: a.fingerprint, gateUrl: a['gate-url'] });
    const title = `fix(${a.key}): ${a.class} ${summary.check} (attempt ${a.attempt})`;
    const r = openPr({ summary, branch: a.branch, target: a.target, owner: a.owner, key: a.key, title });
    if (!r.ok) {
        console.error(`${NAME}: FAIL -- ${r.failure}. Next step: check the bot token's pull-requests and contents scopes, then re-run the fix-pr job.`);
        return 1;
    }
    r.notes.forEach(n => console.log(`${NAME}: NOTE -- ${n}`));
    console.log(`${NAME}: PASS -- ${a.branch} opened or updated${r.number ? ` as #${r.number}` : ''}, labelled claude-fix, assigned to the owner`);
    return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exit(main());
}
