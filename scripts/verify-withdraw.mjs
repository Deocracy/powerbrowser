#!/usr/bin/env node
// scripts/verify-withdraw.mjs
//
// The withdraw row (Phase 50, REL-02, plan 50-05, NAME withdraw). docs/withdraw.yml and docs/release-probe.yml are
// landed by the owner in powerbrowser-updates and never in the product repository, so the product workflows row
// does not see them. This row proves them in the tree, offline:
//
//  1. The decision, on the workflows' own shell. Every run: body is executed under bash, in order, against a stub
//     gh that keeps a small fake of the GitHub API (Releases, Release assets, the updates repository contents) and
//     records every call. uses: steps are not run: the checkout is a temp product/ directory holding this tree's
//     docs/RELEASING.md (with the scenario's verdict line) and a recording stand-in for verify-channel-live.mjs; the
//     App token step yields a stub token. Withdraw scenarios: the flag, notes-only and pending verdicts; an unknown
//     verdict and two verdict lines (no write); an already marked Release (no second block); two targets (two
//     writes); an already withdrawn target (no write); a bad tag and a two-line reason (no call); a refused flag on
//     the flag verdict (the job fails); a write the re-read disproves (the job fails). Probe scenarios: a fresh
//     probe with the flag allowed and refused, a re-run (no second Release), a refused notes append and a
//     non-immutable Release (both fail). No scenario may issue a DELETE.
//  2. The source text, parsed with the repo's js-yaml (theia/): workflow_dispatch only; the input set (tag and
//     reason; none for the probe); contents read at the workflow and the job; one ubuntu-latest job, at most 15
//     minutes; every uses: an actions/* action pinned to 40 hex; no cache; no ${{ }} inside run:; no delete
//     command; one App token step with BOT_APP_CLIENT_ID, BOT_APP_PRIVATE_KEY and permission-contents write only.
//     The withdrawal mark (scripts/release-train.mjs), the manifest asset name (scripts/lib/channel-identity.mjs),
//     the --withdrawn rerun and the verdict line prefix are read from the tree, not typed here.
//  3. The probe tag. PROBE_TAG in docs/release-probe.yml is not a release key and matches no include pattern of
//     .github/settings/ruleset-release-tags.json, so the bot App may create it and no release tool reads it.
//  4. docs/RELEASING.md holds exactly one verdict line, valued pending, flag or notes-only.
//
// Usage:
//   node scripts/verify-withdraw.mjs             the gate: prints "withdraw: PASS" when every check holds
//   node scripts/verify-withdraw.mjs --self-test the control first (the real tree), then the planted faults;
//                                                each plant must go red naming its drift
// Any other argument: FAIL, exit 2. It writes only under a temp directory.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';
import { MANIFEST_ASSET, RELEASE_KEY_RE } from './lib/channel-identity.mjs';
import { WITHDRAWAL_MARK } from './release-train.mjs';
import { NO_UPDATE_XML } from './verify-channel-live.mjs';
import { repoSlug } from './verify-repo-controls.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'withdraw';
const SELF_REL = 'scripts/verify-withdraw.mjs';
const WITHDRAW_REL = 'docs/withdraw.yml';
const PROBE_REL = 'docs/release-probe.yml';
const DOCS_REL = 'docs/RELEASING.md';
const RULESET_REL = '.github/settings/ruleset-release-tags.json';
export const VERDICT_PREFIX = 'Immutable-release probe verdict: ';
const VERDICT_LINE = /^Immutable-release probe verdict: `([^`]*)`/;
const VERDICTS = Object.freeze(['pending', 'flag', 'notes-only']);
const PINNED_USE = /^actions\/[A-Za-z0-9._-]+@[0-9a-f]{40}$/;
const DELETE_FORMS = /-X\s*DELETE|--method\s+DELETE|\brelease\s+delete\b|git\s+push\b[^\n]*--delete|git\s+tag\s+-d\b|\bgit\s+rm\b/i;
const TARGET = 'Linux_x86_64-gcc3';
const OTHER_TARGET = 'WINNT_x86_64-msvc';
const REASON = 'the update breaks profile start';

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}

let OWNER, REPO, TAG;
try {
    ({ owner: OWNER, repo: REPO } = repoSlug(REPO_ROOT));
    TAG = releaseIdentity(resolveConfig(join(REPO_ROOT, 'configuration.toml')).config).releaseKey;
} catch (e) {
    console.error(`${NAME}: FAIL -- broken instrument: ${e.message}`);
    process.exit(1);
}
const PRODUCT = `${OWNER}/${REPO}`;
const UPDATES = `${PRODUCT}-updates`;

const blobOf = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const NO_UPDATE_BLOB = blobOf(Buffer.from(NO_UPDATE_XML));
const count = (hay, needle) => String(hay).split(needle).length - 1;

// ---------------------------------------------------------------------------------------------
// Source checks
// ---------------------------------------------------------------------------------------------

/** The text checks shared by both workflows. rel names the file; inputs is the exact input set. Pure over the text. */
export function checkSource(rel, text, inputs) {
    const failures = [];
    let doc;
    try {
        doc = yaml.load(text);
    } catch (e) {
        return [`${rel} does not parse as YAML 1.2 (${e.message}). Next step: fix the file.`];
    }
    if (doc === null || typeof doc !== 'object') return [`${rel} is not a workflow mapping. Next step: restore the file.`];
    const on = doc.on;
    const triggers = typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {});
    if (triggers.length !== 1 || triggers[0] !== 'workflow_dispatch') failures.push(`${rel} triggers are ${JSON.stringify(triggers)}, not workflow_dispatch alone. Next step: dispatch only; no push, schedule or pull_request trigger.`);
    const declared = Object.keys(on?.workflow_dispatch?.inputs ?? {}).sort();
    if (JSON.stringify(declared) !== JSON.stringify([...inputs].sort())) failures.push(`${rel} inputs are ${JSON.stringify(declared)}, not ${JSON.stringify(inputs)}. Next step: withdraw is no-update only, so there is no mode input.`);
    for (const name of inputs) if (on?.workflow_dispatch?.inputs?.[name]?.required !== true) failures.push(`${rel} input ${name} is not required. Next step: set required: true.`);
    const readOnly = p => p !== null && typeof p === 'object' && JSON.stringify(p) === JSON.stringify({ contents: 'read' });
    if (!readOnly(doc.permissions)) failures.push(`${rel} workflow permissions are ${JSON.stringify(doc.permissions)}, not contents read alone. Next step: the writes go through the App token, not GITHUB_TOKEN.`);
    const jobs = Object.entries(doc.jobs ?? {});
    if (jobs.length !== 1) failures.push(`${rel} has ${jobs.length} jobs, not one. Next step: keep one job.`);
    let appSteps = 0;
    for (const [id, job] of jobs) {
        if (!readOnly(job.permissions)) failures.push(`${rel} job ${id} permissions are ${JSON.stringify(job.permissions)}, not contents read alone. Next step: drop the grant.`);
        if (job['runs-on'] !== 'ubuntu-latest') failures.push(`${rel} job ${id} runs-on ${JSON.stringify(job['runs-on'])}, not ubuntu-latest. Next step: use the hosted runner; no legion job holds a write token.`);
        if (!(Number.isInteger(job['timeout-minutes']) && job['timeout-minutes'] <= 15)) failures.push(`${rel} job ${id} timeout-minutes is ${JSON.stringify(job['timeout-minutes'])}, not at most 15. Next step: set it.`);
        for (const step of job.steps ?? []) {
            if (typeof step.uses === 'string') {
                if (!PINNED_USE.test(step.uses)) failures.push(`${rel} uses ${step.uses}, which is not an actions/* action pinned to a 40-hex SHA. Next step: pin it.`);
                if (/^actions\/cache@/.test(step.uses) || step.with?.cache !== undefined) failures.push(`${rel} step "${step.name}" uses a cache. Next step: no cache in a write job.`);
                if (/^actions\/create-github-app-token@/.test(step.uses)) {
                    appSteps += 1;
                    const w = step.with ?? {};
                    if (w['client-id'] !== '${{ vars.BOT_APP_CLIENT_ID }}') failures.push(`${rel} App token client-id is ${JSON.stringify(w['client-id'])}, not vars.BOT_APP_CLIENT_ID. Next step: use the variable release.yml uses.`);
                    if (w['private-key'] !== '${{ secrets.BOT_APP_PRIVATE_KEY }}') failures.push(`${rel} App token private-key is ${JSON.stringify(w['private-key'])}, not secrets.BOT_APP_PRIVATE_KEY. Next step: use the secret release.yml uses.`);
                    const perms = Object.entries(w).filter(([k]) => k.startsWith('permission-'));
                    if (JSON.stringify(perms) !== JSON.stringify([['permission-contents', 'write']])) failures.push(`${rel} App token permission inputs are ${JSON.stringify(Object.fromEntries(perms))}, not permission-contents write alone. Next step: narrow the token.`);
                }
            }
            if (typeof step.run === 'string' && step.run.includes('${{')) failures.push(`${rel} step "${step.name}" has \${{ }} text inside run:. Next step: pass the value through env.`);
        }
    }
    if (appSteps !== 1) failures.push(`${rel} has ${appSteps} App token steps, not one. Next step: mint once, immediately before the writes.`);
    if (DELETE_FORMS.test(text)) failures.push(`${rel} carries a delete command (${DELETE_FORMS.exec(text)[0]}). Next step: never delete a Release, a tag or a descriptor; the fix is a new revision.`);
    if (!text.includes(WITHDRAWAL_MARK)) failures.push(`${rel} does not write the withdrawal mark ${WITHDRAWAL_MARK} (scripts/release-train.mjs), so the train cannot derive WITHDRAWN. Next step: restore the mark.`);
    return failures;
}

export function checkWithdrawText(text) {
    const failures = checkSource(WITHDRAW_REL, text, ['reason', 'tag']);
    if (!text.includes(MANIFEST_ASSET)) failures.push(`${WITHDRAW_REL} does not read the ${MANIFEST_ASSET} asset, so the target set is not derived from the Release. Next step: restore the manifest read.`);
    if (!text.includes('verify-channel-live.mjs --withdrawn "$TAG"')) failures.push(`${WITHDRAW_REL} does not rerun verify-channel-live.mjs --withdrawn "$TAG". Next step: the default run is red after a withdraw by construction; rerun in withdrawn mode.`);
    if (!text.includes(VERDICT_PREFIX)) failures.push(`${WITHDRAW_REL} does not read the verdict line "${VERDICT_PREFIX}" of ${DOCS_REL}. Next step: read the recorded probe verdict as configuration.`);
    return failures;
}

/** Convert a ruleset ref_name fnmatch pattern to a RegExp (* within a segment, ** across, ? one char, [..] kept). */
export function refPattern(pattern) {
    if (pattern === '~ALL') return /^/;
    let re = '';
    for (let i = 0; i < pattern.length; i += 1) {
        const c = pattern[i];
        if (c === '*' && pattern[i + 1] === '*') { re += '.*'; i += 1; }
        else if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else if (c === '[') {
            const end = pattern.indexOf(']', i + 1);
            if (end < 0) { re += '\\['; continue; }
            re += pattern.slice(i, end + 1);
            i = end;
        } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`);
}

export function checkProbeText(text, rulesetText) {
    const failures = checkSource(PROBE_REL, text, []);
    const m = /^\s*PROBE_TAG=([^\s]+)\s*$/m.exec(text);
    if (!m) return [...failures, `${PROBE_REL} sets no PROBE_TAG. Next step: restore PROBE_TAG=probe-1.`];
    const tag = m[1];
    if (RELEASE_KEY_RE.test(tag)) failures.push(`the probe tag ${tag} is a release key, so every release tool would read the probe as a release. Next step: use probe-1.`);
    let include = [];
    try {
        include = JSON.parse(rulesetText)?.conditions?.ref_name?.include ?? [];
    } catch (e) {
        failures.push(`${RULESET_REL} does not parse (${e.message}). Next step: fix it.`);
    }
    if (!Array.isArray(include) || include.length === 0) failures.push(`${RULESET_REL} has no include pattern, so the probe tag cannot be placed outside it. Next step: restore the release-tags ruleset.`);
    for (const p of Array.isArray(include) ? include : []) {
        if (refPattern(String(p)).test(`refs/tags/${tag}`)) failures.push(`the probe tag ${tag} matches the release-tags ruleset pattern ${p}, so the bot App may not be able to create it and it would read as a release tag. Next step: use a tag outside the pattern (probe-1).`);
    }
    if (!text.includes('-f make_latest=false')) failures.push(`${PROBE_REL} does not publish the probe with make_latest=false. Next step: the probe Release must never become the latest Release.`);
    return failures;
}

export function checkDocsText(text) {
    const lines = text.split('\n').filter(l => l.startsWith(VERDICT_PREFIX));
    if (lines.length !== 1) return [`${DOCS_REL} holds ${lines.length} probe verdict lines ("${VERDICT_PREFIX}"), not exactly one. Next step: keep one line; withdraw.yml refuses zero or several.`];
    const v = VERDICT_LINE.exec(lines[0])?.[1];
    return VERDICTS.includes(v) ? [] : [`${DOCS_REL} probe verdict is ${JSON.stringify(v)}, not one of ${VERDICTS.join(', ')}. Next step: record the printed verdict.`];
}

// ---------------------------------------------------------------------------------------------
// The decision, run as the workflow runs it.
// ---------------------------------------------------------------------------------------------

// The stub gh: a small fake of the GitHub API endpoints these workflows call. State lives in a JSON file.
const STUB_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + '\\n');
const S = JSON.parse(fs.readFileSync(process.env.STUB_STATE, 'utf8'));
const save = () => fs.writeFileSync(process.env.STUB_STATE, JSON.stringify(S));
const out = v => { process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v)); save(); process.exit(0); };
const fail = (status, text) => { process.stderr.write('gh: ' + text + ' (HTTP ' + status + ')\\n'); save(); process.exit(1); };
if (args[0] !== 'api') { process.stderr.write('stub gh: only gh api is answered\\n'); process.exit(2); }
let method = 'GET', path = null; const fields = {};
for (let i = 1; i < args.length; i += 1) {
  const a = args[i];
  if (a === '-X' || a === '--method') method = args[++i];
  else if (a === '-H') i += 1;
  else if (a === '-f' || a === '-F') {
    const kv = args[++i]; const k = kv.slice(0, kv.indexOf('=')); let v = kv.slice(kv.indexOf('=') + 1);
    if (a === '-F') v = v === 'true' ? true : v === 'false' ? false : /^[0-9]+$/.test(v) ? Number(v) : v;
    fields[k] = v;
  } else if (a.startsWith('-')) { process.stderr.write('stub gh: unknown flag ' + a + '\\n'); process.exit(2); }
  else path = a;
}
if (method === 'DELETE') { S.deletes.push(path); out({}); }
const [p, query] = String(path).split('?');
let m;
const rel = id => S.releases.find(r => r.id === Number(id));
if (method === 'GET' && p === 'repos/' + S.product + '/releases' && query === 'per_page=100') out(S.releases);
if (method === 'GET' && (m = new RegExp('^repos/' + S.product + '/releases/tags/(.+)$').exec(p))) {
  const r = S.releases.find(x => x.tag_name === m[1] && !x.draft); return r ? out(r) : fail(404, 'Not Found');
}
if (method === 'GET' && (m = new RegExp('^repos/' + S.product + '/releases/assets/([0-9]+)$').exec(p))) {
  return S.assets[m[1]] !== undefined ? out(S.assets[m[1]]) : fail(404, 'Not Found');
}
if (method === 'GET' && (m = new RegExp('^repos/' + S.product + '/releases/([0-9]+)$').exec(p))) { const r = rel(m[1]); return r ? out(r) : fail(404, 'Not Found'); }
if (method === 'POST' && p === 'repos/' + S.product + '/releases') {
  const r = { id: S.nextId++, tag_name: fields.tag_name, name: fields.name, body: fields.body ?? '', draft: fields.draft === true, prerelease: fields.prerelease === true, immutable: false, assets: [], created: true };
  S.releases.push(r); out(r);
}
if (method === 'PATCH' && (m = new RegExp('^repos/' + S.product + '/releases/([0-9]+)$').exec(p))) {
  const r = rel(m[1]); if (!r) return fail(404, 'Not Found');
  if ('prerelease' in fields && S.refuseFlag && !r.draft) return fail(422, 'Validation Failed: immutable release');
  if ('body' in fields && S.refuseBody && !r.draft) return fail(422, 'Validation Failed: immutable release');
  for (const [k, v] of Object.entries(fields)) r[k] = v;
  if (fields.draft === false) r.immutable = S.immutableOn;
  out(r);
}
if ((m = new RegExp('^repos/' + S.updates + '/contents/(.+)$').exec(p))) {
  const cur = S.contents[m[1]];
  if (method === 'GET') return cur ? out({ path: m[1], sha: cur.sha }) : fail(404, 'Not Found');
  if (method === 'PUT') {
    if (cur && fields.sha !== cur.sha) return fail(409, 'Conflict');
    const bytes = Buffer.from(String(fields.content), 'base64');
    const sha = b => crypto.createHash('sha1').update('blob ' + b.length + '\\0').update(b).digest('hex');
    const stored = S.putLies ? Buffer.from('other bytes\\n') : bytes;
    S.contents[m[1]] = { sha: sha(stored), text: stored.toString('utf8') };
    S.commits.push({ path: m[1], message: fields.message, branch: fields.branch });
    out({ content: { path: m[1], sha: sha(bytes) }, commit: { sha: 'c'.repeat(40) } });
  }
}
fail(404, 'Not Found (no stub endpoint for ' + method + ' ' + path + ')');
`;

const STUB_CHANNEL_LIVE = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.STUB_NODE_LOG, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');
`;

function resolveExpression(value, ctx) {
    if (typeof value !== 'string') return String(value);
    return value.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
        let m;
        if ((m = /^steps\.([\w-]+)\.outputs\.([\w-]+)$/.exec(expr))) return ctx.outputs[m[1]]?.[m[2]] ?? '';
        if ((m = /^inputs\.(\w+)$/.exec(expr))) return ctx.inputs[m[1]] ?? '';
        if (expr === 'github.token') return 'stub-github-token';
        if (expr === 'github.repository_owner') return OWNER;
        if (expr === 'vars.BOT_APP_CLIENT_ID') return 'stub-client-id';
        if (expr === 'secrets.BOT_APP_PRIVATE_KEY') return 'stub-key';
        throw new Error(`broken instrument: the gate cannot resolve \${{ ${expr} }}; teach resolveExpression about it`);
    });
}

const release = over => ({ id: 7, tag_name: TAG, name: TAG, body: 'Release notes.', draft: false, prerelease: false, immutable: true, assets: [{ name: MANIFEST_ASSET, id: 70 }, { name: 'fixture.mar', id: 71 }], ...over });
const manifestOf = (target = TARGET, key = TAG) => JSON.stringify({ release_key: key, version: key.slice(1, key.lastIndexOf('-')), build_id: '20261110120000', build_target: target, update_channel: 'default' });

/**
 * Run one workflow's steps under bash and return what they did. scenario: { inputs, releasing (the RELEASING.md text
 * of the checkout), state (the fake API) }. A failing step stops the job, as in Actions.
 */
export function runWorkflow(text, scenario) {
    const doc = yaml.load(text);
    const job = Object.values(doc.jobs)[0];
    const dir = mkdtempSync(join(tmpdir(), 'withdraw-run-'));
    try {
        const bin = join(dir, 'bin');
        const temp = join(dir, 'runner-temp');
        const work = join(dir, 'work');
        for (const d of [bin, temp, join(work, 'product', 'docs'), join(work, 'product', 'scripts')]) mkdirSync(d, { recursive: true });
        const files = { log: join(dir, 'gh.log'), state: join(dir, 'state.json'), node: join(dir, 'node.log'), out: join(dir, 'output'), summary: join(dir, 'summary') };
        for (const f of [files.log, files.node, files.summary]) writeFileSync(f, '');
        writeFileSync(files.state, JSON.stringify({ product: PRODUCT, updates: UPDATES, deletes: [], commits: [], nextId: 100, immutableOn: true, releases: [], assets: {}, contents: {}, ...scenario.state }));
        writeFileSync(join(bin, 'gh'), STUB_GH);
        chmodSync(join(bin, 'gh'), 0o755);
        writeFileSync(join(work, 'product', 'docs', 'RELEASING.md'), scenario.releasing ?? '');
        writeFileSync(join(work, 'product', 'scripts', 'verify-channel-live.mjs'), STUB_CHANNEL_LIVE);
        const ctx = { outputs: {}, inputs: scenario.inputs ?? {} };
        const steps = [];
        let stdout = '';
        for (const step of job.steps) {
            if (typeof step.uses === 'string') {
                if (/create-github-app-token@/.test(step.uses)) {
                    ctx.outputs[step.id] = { token: 'stub-app-token' };
                    steps.push({ name: step.name, status: 0, stderr: '', with: Object.fromEntries(Object.entries(step.with ?? {}).map(([k, v]) => [k, resolveExpression(v, ctx)])) });
                }
                continue;
            }
            const env = {
                PATH: `${bin}:${process.env.PATH}`, HOME: dir, RUNNER_TEMP: temp, GITHUB_OUTPUT: files.out, GITHUB_STEP_SUMMARY: files.summary,
                GITHUB_REPOSITORY: UPDATES, STUB_LOG: files.log, STUB_STATE: files.state, STUB_NODE_LOG: files.node,
            };
            for (const [k, v] of Object.entries(step.env ?? {})) env[k] = resolveExpression(v, ctx);
            writeFileSync(files.out, '');
            const cwd = step['working-directory'] ? join(work, step['working-directory']) : work;
            // stdin is /dev/null: bash reads the system bashrc when stdin is a socket, and on NixOS that resets PATH.
            const r = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run], { env, encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] });
            const outputs = {};
            for (const line of readFileSync(files.out, 'utf8').split('\n')) {
                const i = line.indexOf('=');
                if (i > 0) outputs[line.slice(0, i)] = line.slice(i + 1);
            }
            if (step.id) ctx.outputs[step.id] = outputs;
            stdout += r.stdout;
            steps.push({ name: step.name, status: r.status, stderr: r.stderr });
            if (r.status !== 0) break;
        }
        const calls = readFileSync(files.log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
        const state = JSON.parse(readFileSync(files.state, 'utf8'));
        const nodeCalls = readFileSync(files.node, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
        return { steps, calls, state, nodeCalls, stdout, failed: steps.some(s => s.status !== 0) };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const writesOf = r => r.calls.filter(c => c.includes('-X') && ['PUT', 'PATCH', 'POST', 'DELETE'].includes(c[c.indexOf('-X') + 1]));
const unclean = r => r.steps.filter(s => s.status !== 0).map(s => `${s.name}: ${s.stderr.trim().split('\n').pop()}`).join(' | ');
const withVerdict = (docs, v) => docs.replace(/^Immutable-release probe verdict: `[^`]*`/m, `${VERDICT_PREFIX}\`${v}\``);

/** The withdraw scenarios over the workflow's own shell. Returns the failures. */
export function withdrawDecisionFailures(text, docs, only = null) {
    const on = name => only === null || only.includes(name);
    const failures = [];
    const path = `default/${TARGET}/update.xml`;
    const base = (over = {}) => ({
        releases: [release()], assets: { 70: manifestOf() }, contents: { [path]: { sha: 'a'.repeat(40) } }, ...over,
    });
    const run = (verdict, state = base(), inputs = { tag: TAG, reason: REASON }, releasing = withVerdict(docs, verdict)) => runWorkflow(text, { inputs, releasing, state });
    const rel = r => r.state.releases.find(x => x.id === 7);
    const noDeletes = (label, r) => { if (r.state.deletes.length > 0 || r.calls.some(c => c.includes('DELETE'))) failures.push(`the ${label} scenario issued a delete (${JSON.stringify(r.state.deletes)}). Next step: never delete.`); };
    try {
        if (on('flag')) {
            const r = run('flag');
            noDeletes('flag', r);
            if (r.failed) failures.push(`the flag scenario did not run clean: ${unclean(r)}`);
            const commit = r.state.commits.find(c => c.path === path);
            if (!commit) failures.push(`the flag scenario wrote no descriptor at ${path}. Next step: write the no-update document per target.`);
            else {
                if (commit.message !== `Withdraw ${TAG}: no-update descriptors (${REASON})`) failures.push(`the descriptor commit message is ${JSON.stringify(commit.message)}, not "Withdraw ${TAG}: no-update descriptors (${REASON})". Next step: restore the message shape.`);
                if (commit.branch !== 'main') failures.push(`the descriptor commit went to ${JSON.stringify(commit.branch)}, not main.`);
                if (r.state.contents[path]?.sha !== NO_UPDATE_BLOB) failures.push(`the stored ${path} is not the no-update document (blob ${r.state.contents[path]?.sha}, want ${NO_UPDATE_BLOB}). Next step: write exactly NO_UPDATE_XML.`);
            }
            if (rel(r).prerelease !== true) failures.push('the flag verdict did not set the pre-release flag on the Release. Next step: add prerelease=true on the flag verdict.');
            if (count(rel(r).body, WITHDRAWAL_MARK) !== 1 || !rel(r).body.startsWith('Release notes.') || !rel(r).body.includes(`Withdrawn: ${REASON}.`)) failures.push(`the flag scenario's Release notes are not the original notes plus one withdrawal block with the reason: ${JSON.stringify(rel(r).body)}. Next step: append the block once.`);
            if (!r.nodeCalls.some(c => c.cwd.endsWith('/product') && c.args.length === 2 && c.args[0] === '--withdrawn' && c.args[1] === TAG)) failures.push(`the liveness row was not rerun as verify-channel-live.mjs --withdrawn ${TAG} (calls: ${JSON.stringify(r.nodeCalls)}). Next step: rerun it in withdrawn mode from the product checkout.`);
            const token = r.steps.find(s => s.with);
            const repos = String(token?.with?.repositories ?? '').split(',').map(s => s.trim()).sort();
            if (JSON.stringify(repos) !== JSON.stringify([REPO, `${REPO}-updates`].sort())) failures.push(`the App token is scoped to ${JSON.stringify(repos)}, not the product and updates repositories. Next step: scope it to those two.`);
            if (token?.with?.owner !== OWNER) failures.push(`the App token owner is ${JSON.stringify(token?.with?.owner)}, not ${OWNER}.`);
        }

        if (on('notes')) {
            for (const v of ['notes-only', 'pending']) {
                const r = run(v);
                noDeletes(v, r);
                if (r.failed) failures.push(`the ${v} scenario did not run clean: ${unclean(r)}`);
                if (rel(r).prerelease !== false) failures.push(`the ${v} verdict set the pre-release flag. Next step: the flag goes only with the flag verdict.`);
                if (count(rel(r).body, WITHDRAWAL_MARK) !== 1) failures.push(`the ${v} verdict did not leave exactly one withdrawal block in the notes (${count(rel(r).body, WITHDRAWAL_MARK)}). Next step: the notes mark is always written.`);
                if (r.state.contents[path]?.sha !== NO_UPDATE_BLOB) failures.push(`the ${v} verdict did not write the no-update document.`);
            }
        }

        if (on('verdict')) {
            for (const [label, releasing] of [['an unknown verdict', withVerdict(docs, 'maybe')], ['two verdict lines', `${withVerdict(docs, 'flag')}\n${VERDICT_PREFIX}\`notes-only\`\n`]]) {
                const r = run(null, base(), undefined, releasing);
                if (!r.failed || writesOf(r).length > 0) failures.push(`${label} in ${DOCS_REL} did not stop the job before any write (writes: ${writesOf(r).length}). Next step: accept exactly one verdict of ${VERDICTS.join(', ')}.`);
            }
        }

        if (on('marked')) {
            const r = run('notes-only', base({ releases: [release({ body: `Release notes.\n\n${WITHDRAWAL_MARK}\nWithdrawn: earlier.\n` })] }));
            if (r.failed) failures.push(`the already-marked scenario did not run clean: ${unclean(r)}`);
            if (count(rel(r).body, WITHDRAWAL_MARK) !== 1) failures.push(`the already-marked scenario left ${count(rel(r).body, WITHDRAWAL_MARK)} withdrawal blocks. Next step: append the block only when it is absent.`);
            if (r.calls.some(c => c.includes('PATCH'))) failures.push('the already-marked scenario with the notes-only verdict still PATCHed the Release. Next step: send no PATCH when nothing changes.');
        }

        if (on('targets')) {
            const r = run('notes-only', base({ assets: { 70: manifestOf(`${TARGET},${OTHER_TARGET}`) } }));
            if (r.failed) failures.push(`the two-target scenario did not run clean: ${unclean(r)}`);
            for (const t of [TARGET, OTHER_TARGET]) if (r.state.contents[`default/${t}/update.xml`]?.sha !== NO_UPDATE_BLOB) failures.push(`the two-target scenario did not write the no-update document for ${t}. Next step: every target of the manifest is withdrawn.`);
        }

        if (on('unchanged')) {
            const r = run('notes-only', base({ contents: { [path]: { sha: NO_UPDATE_BLOB } } }));
            if (r.failed) failures.push(`the already-withdrawn-target scenario did not run clean: ${unclean(r)}`);
            if (r.state.commits.length !== 0) failures.push('an already withdrawn target was written again. Next step: an unchanged descriptor is a no-op.');
        }

        if (on('inputs')) {
            for (const [label, inputs] of [['a bad tag', { tag: '../../contents/x', reason: REASON }], ['a two-line reason', { tag: TAG, reason: 'one\ntwo' }]]) {
                const r = run('flag', base(), inputs);
                if (!r.failed || r.calls.length > 0) failures.push(`${label} did not stop the job before any gh call (${r.calls.length} call(s)). Next step: validate the inputs first.`);
            }
        }

        if (on('refused')) {
            const r = run('flag', base({ refuseFlag: true }));
            if (!r.failed) failures.push('a refused pre-release flag on the flag verdict did not fail the job. Next step: re-read the Release and fail when the flag did not stick.');
        }

        if (on('reread')) {
            const r = run('notes-only', base({ putLies: true }));
            if (!r.failed) failures.push('a write the re-read disproves did not fail the job. Next step: re-read every path and set-compare the blobs.');
        }
    } catch (e) {
        failures.push(`the withdraw scenarios did not run (${e.message}). Next step: fix the run bodies or the gate's step resolver.`);
    }
    return failures;
}

/** The probe scenarios over the workflow's own shell. Returns the failures. */
export function probeDecisionFailures(text, only = null) {
    const on = name => only === null || only.includes(name);
    const failures = [];
    const probe = r => r.state.releases.find(x => x.tag_name === 'probe-1');
    const run = state => runWorkflow(text, { state });
    const noDeletes = (label, r) => { if (r.state.deletes.length > 0) failures.push(`the ${label} probe scenario issued a delete. Next step: never delete the probe Release or its tag.`); };
    try {
        if (on('fresh')) {
            const r = run({});
            noDeletes('fresh', r);
            if (r.failed) failures.push(`the fresh probe scenario did not run clean: ${unclean(r)}`);
            const post = r.calls.filter(c => c.includes('POST'));
            if (post.length !== 1 || !post[0].includes('tag_name=probe-1') || !post[0].includes('draft=true')) failures.push(`the fresh probe did not create exactly one draft Release on probe-1 (POST calls: ${JSON.stringify(post)}). Next step: create it as a draft.`);
            const pub = r.calls.find(c => c.includes('PATCH') && c.includes('draft=false'));
            if (!pub || !pub.includes('make_latest=false')) failures.push(`the probe was not published with make_latest=false (${JSON.stringify(pub ?? null)}). Next step: publish it, never as latest.`);
            if (probe(r)?.draft !== false || probe(r)?.prerelease !== true || count(probe(r)?.body, WITHDRAWAL_MARK) !== 1) failures.push(`the fresh probe Release is not published, flagged and marked once: ${JSON.stringify(probe(r) ?? null)}.`);
            if (!r.stdout.includes('release-probe: verdict flag')) failures.push('the fresh probe with the flag allowed did not print "release-probe: verdict flag".');
        }

        if (on('refused')) {
            const r = run({ refuseFlag: true });
            noDeletes('refused flag', r);
            if (r.failed) failures.push(`the refused-flag probe scenario did not run clean: ${unclean(r)}`);
            if (!r.stdout.includes('release-probe: verdict notes-only') || !/release-probe: refusal: .*HTTP 422/.test(r.stdout)) failures.push(`the refused flag did not print the notes-only verdict with the refusal line: ${JSON.stringify(r.stdout.split('\n').filter(l => l.startsWith('release-probe:')))}. Next step: record the refusal and fall back to notes-only.`);
        }

        if (on('rerun')) {
            const r = run({ releases: [{ id: 9, tag_name: 'probe-1', body: `x\n\n${WITHDRAWAL_MARK}\nWithdrawn: probe.\n`, draft: false, prerelease: true, immutable: true, assets: [] }] });
            if (r.failed) failures.push(`the re-run probe scenario did not run clean: ${unclean(r)}`);
            if (writesOf(r).length > 0) failures.push(`the re-run probe wrote again (${JSON.stringify(writesOf(r))}). Next step: reuse the probe Release; never create a second.`);
            if (!r.stdout.includes('release-probe: verdict flag')) failures.push('the re-run probe did not print its verdict.');
        }

        if (on('body')) {
            const r = run({ refuseBody: true });
            if (!r.failed) failures.push('a refused notes append did not fail the probe. Next step: fail when the notes append does not stick.');
        }

        if (on('immutable')) {
            const r = run({ immutableOn: false });
            if (!r.failed) failures.push('a probe Release that reads immutable false did not fail the probe. Next step: fail; the verdict would mean nothing.');
        }
    } catch (e) {
        failures.push(`the probe scenarios did not run (${e.message}). Next step: fix the run bodies or the gate's step resolver.`);
    }
    return failures;
}

const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
const realTexts = () => ({ withdraw: read(WITHDRAW_REL), probe: read(PROBE_REL), docs: read(DOCS_REL), ruleset: read(RULESET_REL) });

// A plant runs only the check family it targets, so the self-test stays a quick row; the control runs them all.
const SCOPES = Object.freeze({
    ws: t => checkWithdrawText(t.withdraw),
    wr: (t, only) => withdrawDecisionFailures(t.withdraw, t.docs, only),
    ps: t => checkProbeText(t.probe, t.ruleset),
    pr: (t, only) => probeDecisionFailures(t.probe, only),
    d: t => checkDocsText(t.docs),
});

function allFailures(t) {
    return [
        ...checkWithdrawText(t.withdraw), ...withdrawDecisionFailures(t.withdraw, t.docs),
        ...checkProbeText(t.probe, t.ruleset), ...probeDecisionFailures(t.probe),
        ...checkDocsText(t.docs),
    ];
}

function gate() {
    for (const rel of [WITHDRAW_REL, PROBE_REL, DOCS_REL, RULESET_REL]) {
        if (!existsSync(join(REPO_ROOT, rel))) {
            console.error(`${NAME}: FAIL -- ${rel} is missing. Next step: restore it.`);
            return 1;
        }
    }
    const failures = allFailures(realTexts());
    if (failures.length > 0) {
        failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${WITHDRAW_REL} and ${PROBE_REL}, run on their own shell under a stub gh: no-update per manifest target with re-read, the mark once, the flag only on the flag verdict, channel-live --withdrawn last, no write on a bad input or verdict, no delete; the probe on probe-1 (outside the release-tags pattern) published never as latest; one verdict line in ${DOCS_REL}`);
    return 0;
}

function selfTest() {
    const t = realTexts();
    const control = allFailures(t);
    if (control.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmutated control is already red, so the planted results would mean nothing:`);
        control.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  control: the real workflows under a stub gh, the source checks, the probe tag and the verdict line -> green');
    const edit = (text, rel, find, replace) => {
        if (text.split(find).length !== 2) throw new Error(`broken instrument: plant anchor ${JSON.stringify(find)} is not unique in ${rel}`);
        return text.replace(find, replace);
    };
    const W = (find, replace) => ({ ...t, withdraw: edit(t.withdraw, WITHDRAW_REL, find, replace) });
    const P = (find, replace) => ({ ...t, probe: edit(t.probe, PROBE_REL, find, replace) });
    const plants = [
        { name: 'a mode input', scope: 'ws', texts: W('      reason:\n', '      mode:\n        description: planted\n        required: true\n        type: string\n      reason:\n'), expect: 'there is no mode input' },
        { name: 'an unpinned uses', scope: 'ws', texts: W('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@v4'), expect: 'pinned to a 40-hex SHA' },
        { name: 'input text inside run:', scope: 'ws', texts: W('[[ "$TAG" =~ ^v', '[[ "${{ inputs.tag }}" =~ ^v'), expect: 'inside run:' },
        { name: 'a Release delete', scope: 'ws', texts: W('          echo "marked $TAG', '          gh api -X DELETE "repos/$PRODUCT/releases/$ID"\n          echo "marked $TAG'), expect: 'delete' },
        { name: 'a push trigger', scope: 'ws', texts: W('on:\n  workflow_dispatch:\n', 'on:\n  push:\n  workflow_dispatch:\n'), expect: 'not workflow_dispatch alone' },
        { name: 'a contents write at the job', scope: 'ws', texts: W('    timeout-minutes: 15\n    permissions:\n      contents: read', '    timeout-minutes: 15\n    permissions:\n      contents: write'), expect: 'not contents read alone' },
        { name: 'a widened App token', scope: 'ws', texts: W('          permission-contents: write\n\n      - name: Commit', '          permission-contents: write\n          permission-workflows: write\n\n      - name: Commit'), expect: 'permission-contents write alone' },
        { name: 'the flag sent on every verdict', scope: 'wr', only: ['notes'], texts: W('if [ "$MARKING" = flag ]; then\n            FIELDS+=', 'if true; then\n            FIELDS+='), expect: 'verdict set the pre-release flag' },
        { name: 'the flag never sent', scope: 'wr', only: ['flag'], texts: W('FIELDS+=(-F prerelease=true)', ':'), expect: 'did not set the pre-release flag' },
        { name: 'the mark respelled', scope: 'ws', texts: W("MARK='<!-- release-withdrawn -->'", "MARK='<!-- withdrawn -->'"), expect: 'withdrawal mark' },
        { name: 'the mark appended on every run', scope: 'wr', only: ['marked'], texts: W('if [[ "$BEFORE" == *"$MARK"* ]]; then', 'if false; then'), expect: 'already-marked scenario' },
        { name: 'an unknown verdict accepted', scope: 'wr', only: ['verdict'], texts: W('flag|notes-only|pending) ;;', 'flag|notes-only|pending|maybe) ;;'), expect: 'an unknown verdict' },
        { name: 'a target dropped from the writes', scope: 'wr', only: ['targets'], texts: W('sort -u > "$RUNNER_TEMP/targets.txt"', 'sort -u | head -n 1 > "$RUNNER_TEMP/targets.txt"'), expect: 'two-target scenario' },
        { name: 'the re-read set-compare removed', scope: 'wr', only: ['reread'], texts: W('diff "$RUNNER_TEMP/want.txt" "$RUNNER_TEMP/got.txt" ||', 'true ||'), expect: 'the re-read disproves' },
        { name: 'the liveness rerun in default mode', scope: 'ws', texts: W('node scripts/verify-channel-live.mjs --withdrawn "$TAG"', 'node scripts/verify-channel-live.mjs "$TAG"'), expect: '--withdrawn' },
        { name: 'the input validation removed', scope: 'wr', only: ['inputs'], texts: W('[[ "$TAG" =~ ^v[0-9]+(\\.[0-9]+)*-[0-9]+$ ]] ||', 'true ||'), expect: 'a bad tag' },
        { name: 'the commit message shape changed', scope: 'wr', only: ['flag'], texts: W('message=Withdraw $TAG: no-update descriptors ($REASON)', 'message=withdraw $TAG'), expect: 'commit message' },
        { name: 'the probe tag inside the ruleset pattern', scope: 'ps', texts: P('PROBE_TAG=probe-1', 'PROBE_TAG=v1.0-1'), expect: 'release-tags ruleset pattern' },
        { name: 'a ruleset pattern that covers probe-1', scope: 'ps', texts: { ...t, ruleset: t.ruleset.replace('"refs/tags/v[0-9]*.[0-9]*-[0-9]*"', '"refs/tags/*"') }, expect: 'release-tags ruleset pattern' },
        { name: 'the probe published as latest', scope: 'ps', texts: P('-f make_latest=false', '-f make_latest=true'), expect: 'make_latest=false' },
        { name: 'the probe created published', scope: 'pr', only: ['fresh'], texts: P('-F draft=true', '-F draft=false'), expect: 'one draft Release on probe-1' },
        { name: 'the probe deleting its Release', scope: 'ps', texts: P('          REFUSAL=none', '          gh api -X DELETE "repos/$PRODUCT/releases/$ID"\n          REFUSAL=none'), expect: 'delete' },
        { name: 'a refused notes append ignored', scope: 'pr', only: ['body'], texts: P('[ "$NOTES" = yes ] || {', 'true || {'), expect: 'refused notes append' },
        { name: 'the flag verdict printed whatever stuck', scope: 'pr', only: ['refused'], texts: P('[ "$FLAG" = no ] || VERDICT=flag', 'VERDICT=flag'), expect: 'refused flag did not print' },
        { name: 'a second probe Release on every run', scope: 'pr', only: ['rerun'], texts: P('if [ "$COUNT" -eq 0 ]; then', 'if true; then'), expect: 'never create a second' },
        { name: 'the immutable read ignored', scope: 'pr', only: ['immutable'], texts: P('[ "$IMMUTABLE" != false ] ||', 'true ||'), expect: 'immutable false' },
        { name: 'two verdict lines in RELEASING.md', scope: 'd', texts: { ...t, docs: `${t.docs}\n${VERDICT_PREFIX}\`flag\`\n` }, expect: 'not exactly one' },
        { name: 'a verdict outside the set', scope: 'd', texts: { ...t, docs: withVerdict(t.docs, 'yes') }, expect: 'not one of' },
    ];
    let failed = 0;
    for (const p of plants) {
        let failures;
        try {
            failures = SCOPES[p.scope](p.texts, p.only);
        } catch (e) {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' broke the instrument: ${e.message}`);
            failed += 1;
            continue;
        }
        if (failures.some(f => f.includes(p.expect))) console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`); failed += 1; }
    }
    // The pattern converter itself: the live pattern holds release keys and refuses probe-1.
    const live = refPattern('refs/tags/v[0-9]*.[0-9]*-[0-9]*');
    if (!live.test(`refs/tags/${TAG}`) || live.test('refs/tags/probe-1') || !refPattern('~ALL').test('refs/tags/probe-1')) {
        console.error(`${NAME}: --self-test FAIL -- refPattern does not match ${TAG} and refuse probe-1 under the release-tags pattern`);
        failed += 1;
    } else console.log(`  ok  refPattern: the release-tags pattern matches ${TAG}, not probe-1; ~ALL matches everything`);
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not go red naming their drift`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their drift, with the control green first (the decisions run on the workflows' own shell under a stub gh)`);
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
