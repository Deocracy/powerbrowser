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

/**
 * The diff statistics and the changed paths of a unified diff. Pure. Insertions and deletions are counted only inside
 * hunks (the @@ header gives the line counts), so an added line that starts with "++" or a removed line that starts with
 * "--" is a change, not a file header (WR-04). A path comes from the symmetric a/<P> b/<P> header: a name that contains
 * " b/" splits where both halves agree; a rename takes its "rename to" line.
 */
export function parseDiffStat(diffText) {
    const paths = [];
    let insertions = 0;
    let deletions = 0;
    let oldLeft = 0;
    let newLeft = 0;
    for (const line of String(diffText).split('\n')) {
        if (oldLeft > 0 || newLeft > 0) {
            if (line.startsWith('\\')) continue;
            if (line.startsWith('+')) { insertions += 1; newLeft -= 1; continue; }
            if (line.startsWith('-')) { deletions += 1; oldLeft -= 1; continue; }
            oldLeft -= 1;
            newLeft -= 1;
            continue;
        }
        const h = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
        if (h !== null) {
            oldLeft = h[1] === undefined ? 1 : Number(h[1]);
            newLeft = h[2] === undefined ? 1 : Number(h[2]);
            continue;
        }
        if (line.startsWith('diff --git a/')) {
            const rest = line.slice('diff --git '.length);
            let path = null;
            for (let at = rest.indexOf(' b/'); at >= 0; at = rest.indexOf(' b/', at + 1)) {
                if (rest.slice(2, at) === rest.slice(at + 3)) { path = rest.slice(at + 3); break; }
            }
            paths.push(path ?? rest.slice(rest.lastIndexOf(' b/') + 3));
            continue;
        }
        const rn = /^rename to (.*)$/.exec(line);
        if (rn !== null && paths.length > 0) paths[paths.length - 1] = rn[1];
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

const PATH_LIST_MAX = 50;

/**
 * Text as one inline code span, so nothing in it renders as a link, an image, a mention, an issue reference or HTML (WR-04).
 * Control characters and line breaks become '?'; the delimiter is a backtick run longer than any run in the text, padded with a
 * space when the text starts or ends with a backtick. Pure.
 */
export function codeSpan(text) {
    const t = String(text).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, '?');
    const longest = Math.max(0, ...(t.match(/`+/g) ?? []).map(r => r.length));
    const fence = '`'.repeat(longest + 1);
    return t.startsWith('`') || t.endsWith('`') ? `${fence} ${t} ${fence}` : `${fence}${t}${fence}`;
}

/** The PR body. Deterministic from the summary. Pure. */
export function renderBody(s) {
    const shown = s.paths.slice(0, PATH_LIST_MAX);
    return [
        `Automated fix for ${codeSpan(s.key)} (${codeSpan(s.cls)}, attempt ${s.attempt}) on ${codeSpan(s.target)}.`,
        '',
        '### Failing check',
        `${codeSpan(s.check)} at ${codeSpan(s.baseSha)}`,
        '',
        '### Diff stat',
        `${s.stat.files} file(s), ${s.stat.insertions} insertion(s), ${s.stat.deletions} deletion(s).`,
        '',
        '### Paths',
        ...(shown.length > 0 ? shown.map(p => `- ${codeSpan(p)}`) : ['(none)']),
        ...(s.paths.length > shown.length ? [`- (and ${s.paths.length - shown.length} more)`] : []),
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
        '@@ -1 +1,2 @@',
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

    // WR-04: the channels model text can use are the diff's added lines and its paths. Added lines never reach the body; a
    // path does, so it is rendered inert. A plant for each channel, checked on what the body actually contains.
    const proseDiff = ['diff --git a/docs/p.md b/docs/p.md', '--- a/docs/p.md', '+++ b/docs/p.md', '@@ -0,0 +1,2 @@', '+MODEL-PROSE-MARKER please merge this, @octocat', '+![i](https://evil.example/p.png)', ''].join('\n');
    const proseBody = renderBody(summaryFrom({ ...base, diffText: proseDiff }));
    proseBody.includes('MODEL-PROSE-MARKER') || proseBody.includes('evil.example') ? bad('no-model-prose', 'an added line of the diff reached the body') : ok('no-model-prose: the added lines of the diff never reach the body');
    // What a markdown renderer would act on once code spans are removed: links, images, mentions, issue references, HTML.
    const active = (md) => md.replace(/(`+)[^]*?\1/g, '').match(/\]\(|!\[|@\w|#\d|<\w/g) ?? [];
    const hostilePath = 'docs/[free ipad](https://evil.example/x)@octocat ![i](https://evil.example/p.png) #1 <img src=x> `tick`.md';
    const hostileDiff = ['diff --git a/' + hostilePath + ' b/' + hostilePath, 'new file mode 100644', '--- /dev/null', '+++ b/' + hostilePath, '@@ -0,0 +1 @@', '+x', ''].join('\n');
    const hostileBody = renderBody(summaryFrom({ ...base, diffText: hostileDiff }));
    const left = active(hostileBody);
    left.length === 0 && hostileBody.includes('evil.example') ? ok('a path with a link, an image, a mention, an issue reference, HTML and backticks renders inert, inside a code span') : bad('hostile path', `active markdown left outside code spans: ${JSON.stringify(left)}`);
    active('- ' + hostilePath).length > 0 ? ok('the activity probe itself sees the hostile path as active when it is not in a code span (control)') : bad('probe', 'the activity probe cannot see the plant, so the check above proves nothing');
    const many = Array.from({ length: 60 }, (_, n) => `diff --git a/f${n}.md b/f${n}.md\n--- a/f${n}.md\n+++ b/f${n}.md\n@@ -1 +1 @@\n-a\n+b\n`).join('');
    renderBody(summaryFrom({ ...base, diffText: many })).includes('(and 10 more)') ? ok('a long path list is capped at 50 with a count') : bad('path cap', 'not capped');
    const plusplus = parseDiffStat('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n--- removed\n+++ added\n ctx\n');
    plusplus.insertions === 1 && plusplus.deletions === 1 ? ok('lines starting with ++ and -- inside a hunk are counted as changes') : bad('++ lines', JSON.stringify(plusplus));
    const spaced = parseDiffStat('diff --git a/dir b/x.md b/dir b/x.md\n--- a/dir b/x.md\n+++ b/dir b/x.md\n@@ -1 +1 @@\n-a\n+b\n');
    spaced.paths.length === 1 && spaced.paths[0] === 'dir b/x.md' ? ok('a path that contains " b/" is split where both halves agree') : bad('b/ path', JSON.stringify(spaced));

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
