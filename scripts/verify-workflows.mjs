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
//  legion         A legion job carries a legion label: legion or the release
//                 runner label powerbrowser-release. It is release.yml with a
//                 job id build-* or matrix-*, with no environment key, no
//                 `secrets.` in the job or the workflow-level env, and no
//                 `secrets: inherit`.
//  claude-code-action  A step using anthropics/claude-code-action@ needs a
//                 hosted job, no actions/create-github-app-token@ step in the
//                 same job, and effective contents other than write.
//  issues-write   Effective issues: write only on release-train.yml job
//                 report and on triage.yml job apply (the write job; the
//                 model job classify holds read only).
//  workflow-run-guard  Every job of a workflow_run-triggered workflow has an
//                 `if` whose top-level && terms include github.event.workflow_run
//                 .head_repository.full_name == github.repository (whitespace
//                 collapsed, ${{ }} stripped), and no top-level ||.
//  workflow-run-chain  A workflow named in any on.workflow_run.workflows list
//                 (matched by name:) is not itself workflow_run-triggered.
//  write-trio     contents, id-token and attestations all at write only on
//                 release.yml job sign-publish.
//  no-pr-trigger  release.yml and release-train.yml have no pull_request or
//                 pull_request_target event.
//  no-cache       release.yml, and the release-train.yml fixer jobs fix, fix-gate
//                 and fix-pr, have no actions/cache step and no step with a
//                 `cache` input.
//  event-text     No step run: or with.prompt: string holds a ${{ }}
//                 expression reading github.event.(issue|comment|
//                 pull_request|head_commit|review), nested fields and
//                 review_comment included.
//  uptake-lane    In release-train.yml only (Phase 58, TRAIN-05, UPS-01), the uptake-replay
//                 job is read-only: no write scope in its effective permissions, no
//                 environment, no secrets key (secrets: inherit would hand it every
//                 repository secret), and a call to rebase-upstream.yml, the one replay definition.
//  bot-job-gate   In release-train.yml only (Phase 43, TRAIN-08), a job that enters an
//                 environment (the bot environment holds the App key and may wait on an
//                 approval) carries a negated inputs.dry-run in its job-level if:, so a
//                 dry run or a run with nothing to publish never reaches the environment.
//  dry-run-gate   In release-train.yml only (Phase 43, TRAIN-08), every step that
//                 commits, pushes, opens, comments, edits, dispatches, releases,
//                 labels, calls a write method of the API, or uses an action outside
//                 the read-only list (checkout, install-nix) carries a NEGATED
//                 inputs.dry-run gate in its if: (!inputs.dry-run, != true or
//                 == false). An inverted gate or one that merely mentions the input
//                 is red. A dry run then prints the write instead of making it.
//                 Read steps are exempt.
//  fixer-pin      In every workflow (release-train.yml and triage.yml included, FIX-08)
//                 every anthropics/claude-code-action step is exactly the pinned commit
//                 db77d4d3c98f... (v1.0.254; the tag object is refused), has
//                 with.path_to_claude_code_executable, and has no with.show_full_output
//                 or with.display_report set true.
//  fixer-debug    No ACTIONS_STEP_DEBUG anywhere in the workflow env or the job (env in
//                 any form, a step's run or with text) of a fixer job (release-train.yml
//                 fix, fix-gate, fix-pr) or of a job that runs claude-code-action.
//  fixer-tools    Every claude-code-action step of the fix job has claude_args with one
//                 --max-turns integer (1-100) and an explicit --allowedTools (or
//                 --allowed-tools) list, space- or comma-separated, each entry read: no
//                 Bash, Bash() or Bash(*), no bare Edit, Write, MultiEdit or NotebookEdit,
//                 no such grant outside work/ or reaching patches/. A work/** grant also
//                 needs --disallowedTools to deny that tool on work/**/patches/**. Refused
//                 flags: --dangerously-skip-permissions, --permission-mode other than
//                 default or plan (bypassPermissions and acceptEdits included),
//                 --settings, --mcp-config, --add-dir, and any flag outside the allowlist.
//  fixer-prompt   The fix job's if: is parsed: no top-level ||, and the head_repository
//                 guard, the claude-fix/ head exclusion and the bot-actor exclusion are
//                 each a top-level && term. Its --disallowedTools denies WebFetch and
//                 WebSearch, and its allowed_bots is exactly renovate[bot],powerbrowser-bot[bot].
//  dependabot     .github/dependabot.yml (Phase 51, AUTO-03): the ecosystems are exactly github-actions and
//                 npm; no registries and no insecure-external-code-execution; no auto-merge key anywhere;
//                 the npm entry has open-pull-requests-limit 0 (security updates only, Renovate owns the
//                 Theia line); every entry has a cooldown of at least 7 days (the github-actions entry also a
//                 semver-major-days no lower than its default-days); the github-actions entry ignores the
//                 pinned claude-code-action (derived from the fixer pin, re-pinned by hand with the two
//                 verifiers) and its groups list update-types without major.
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
const DEPENDABOT_REL = '.github/dependabot.yml';

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

const RULES = ['uses-pinned', 'uses-admitted', 'admission-used', 'no-schedule', 'runner', 'legion', 'claude-code-action', 'issues-write', 'workflow-run-guard', 'workflow-run-chain', 'write-trio', 'no-pr-trigger', 'no-cache', 'event-text', 'fixer-pin', 'fixer-debug', 'fixer-tools', 'fixer-prompt', 'dry-run-gate', 'bot-job-gate', 'uptake-lane', 'dependabot'];
// The fixer (Phase 52): its jobs live only in release-train.yml. FIX_PIN is the
// v1.0.254 commit of claude-code-action; its tag object is a different hash and is refused.
const FIXER_FILE = 'release-train.yml';
const FIXER_JOBS = ['fix', 'fix-gate', 'fix-pr'];
const FIX_PIN = 'anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c';
const CLAUDE_ACTION = FIX_PIN.split('@')[0];
const FIX_BOTS = 'renovate[bot],powerbrowser-bot[bot]';
const FIX_GUARDS = [
    ['head_repository', 'github.event.workflow_run.head_repository.full_name == github.repository'],
    ['claude-fix/', "!startsWith(github.event.workflow_run.head_branch, 'claude-fix/')"],
    ['powerbrowser-bot[bot]', "github.actor != 'powerbrowser-bot[bot]'"],
];
// claude_args flags the fixer may pass; everything else is refused, with a reason for the known-dangerous ones.
const FIXER_FLAGS = new Set(['--max-turns', '--allowedTools', '--allowed-tools', '--disallowedTools', '--disallowed-tools', '--permission-mode']);
const FIXER_REFUSED_FLAGS = {
    '--dangerously-skip-permissions': 'turns every permission check off',
    '--allow-dangerously-skip-permissions': 'makes turning every permission check off available',
    '--settings': 'can load settings that widen the allowlist',
    '--mcp-config': 'adds tools outside the allowlist',
    '--add-dir': 'widens the directories the tools reach',
};
const SCOPES = ['actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token', 'issues', 'models', 'packages', 'pages', 'pull-requests', 'repository-projects', 'security-events', 'statuses'];
const HOSTED = /^(ubuntu|windows|macos)-[\w.-]+$/;
// The legion label set: the generic legion label and the release runner label that
// plan 49-01 registers the self-hosted runner under.
const LEGION_LABELS = ['legion', 'powerbrowser-release'];
const GUARD = 'github.event.workflow_run.head_repository.full_name == github.repository';
const EVENT_TEXT = /\$\{\{[^}]*\bgithub\.event\.(issue|comment|pull_request|head_commit|review)/;
const TRIO = ['contents', 'id-token', 'attestations'];
const PIN = /^([^/@]+)\/([^@/]+)(\/[^@]*)?@([0-9a-f]{40})$/;
const PATTERN = /^([^/@]+\/[^/@]+)@\*$/;
const WF_LEVEL = '(workflow)';
const DRY_RUN_FILE = 'release-train.yml';
const DRY_RUN_GATE = 'inputs.dry-run';
// A run: body that commits, pushes, opens, comments, edits, dispatches, releases or labels on
// GitHub, or writes through the API by method or implicit POST (-f, -F, --field, --input).
// The git form is any git line naming push or commit, so `git -c "..." push` is caught.
const WRITE_RUN = /\bgit\b[^\n]*\b(push|commit)\b|\bgh\s+api\b[^\n]*(\s-X\s*\S|\s--method\b|\s-[fF]\b|\s--field\b|\s--raw-field\b|\s--input\b)|\bgh\s+(pr|issue|release|label|workflow)\s+(create|edit|close|merge|comment|ready|review|run|reopen|lock|delete|upload)\b|\bcurl\b[^\n]*-X\s*(POST|PUT|PATCH|DELETE)\b|dispatches/;
// Actions a release-train step may use without a gate: they read the repository or install a toolchain.
const READ_USES = ['actions/checkout', 'cachix/install-nix-action'];
// A gate is a negation of the dry-run input: !inputs.dry-run, inputs.dry-run != true, inputs.dry-run == false.
const DRY_RUN_NEGATED = /!\s*inputs\.dry-run\b|inputs\.dry-run\s*(!=\s*true|==\s*false)/;
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

// claude_args split the way a shell would: whitespace separates, '...' and "..." group, quotes are dropped.
function argTokens(text) {
    const out = [];
    let cur = null;
    let q = null;
    for (const ch of text) {
        if (q !== null) { if (ch === q) q = null; else cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur ??= ''; continue; }
        if (/\s/.test(ch)) { if (cur !== null) { out.push(cur); cur = null; } continue; }
        cur = (cur ?? '') + ch;
    }
    if (cur !== null) out.push(cur);
    return out;
}

// [{ name, values }]: a flag and the tokens up to the next `--flag`; `--flag=value` gives one value.
function claudeFlags(text) {
    const flags = [];
    for (const t of argTokens(text)) {
        if (t.startsWith('--')) {
            const eq = t.indexOf('=');
            flags.push(eq > 0 ? { name: t.slice(0, eq), values: [t.slice(eq + 1)] } : { name: t, values: [] });
        } else if (flags.length > 0) flags[flags.length - 1].values.push(t);
        else flags.push({ name: '(positional)', values: [t] });
    }
    return flags;
}

// Entries of a tool list: comma or whitespace separated; a separator inside parentheses does not split.
function toolEntries(values) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of values.join(' ')) {
        if (ch === '(') depth += 1;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        if (depth === 0 && (ch === ',' || /\s/.test(ch))) { if (cur.trim() !== '') out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim() !== '') out.push(cur.trim());
    return out;
}

// Split an if: expression at a top-level operator (outside parentheses and 'strings').
function splitTop(expr, op) {
    const out = [];
    let depth = 0;
    let str = false;
    let cur = '';
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === "'") str = !str;
        else if (!str && ch === '(') depth += 1;
        else if (!str && ch === ')') depth -= 1;
        if (!str && depth === 0 && expr.startsWith(op, i)) { out.push(cur.trim()); cur = ''; i += op.length - 1; continue; }
        cur += ch;
    }
    out.push(cur.trim());
    return out;
}

const unparen = (t) => {
    for (;;) {
        if (!(t.startsWith('(') && t.endsWith(')'))) return t;
        let depth = 0;
        let str = false;
        for (let i = 0; i < t.length - 1; i++) {
            if (t[i] === "'") str = !str;
            else if (!str && t[i] === '(') depth += 1;
            else if (!str && t[i] === ')') depth -= 1;
            if (!str && depth === 0) return t;
        }
        t = t.slice(1, -1).trim();
    }
};

// An if: as { or, terms }: `or` is true when a top-level || exists (the job can then run with a guard false);
// terms are the top-level && terms, outer parentheses stripped, whitespace collapsed.
function ifTerms(job) {
    const cond = String(job.if ?? '').replace(/\$\{\{|\}\}/g, ' ').replace(/\s+/g, ' ').trim();
    return { or: splitTop(cond, '||').length > 1, terms: splitTop(cond, '&&').map(unparen).map(t => t.replace(/\s+/g, ' ')) };
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
                } else if (l.labels.some(x => LEGION_LABELS.includes(x))) {
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

            // FIX-08 / FIX-09 / FIX-04: the fixer's trust boundary. Only release-train.yml runs the fixer jobs;
            // the claude-code-action pin holds in every workflow (triage.yml too).
            const fixer = file === FIXER_FILE && FIXER_JOBS.includes(jobId);
            const claude = steps.filter(s => typeof s.uses === 'string' && s.uses.startsWith('anthropics/claude-code-action@'));
            for (const s of claude) {
                const w = s.with ?? {};
                if (s.uses !== FIX_PIN) fail(rel, jobId, 'fixer-pin', `uses '${s.uses}', which is not the pinned commit ${FIX_PIN} (v1.0.254; the tag object is a different hash). Next step: pin the step to ${FIX_PIN}.`);
                if (typeof w.path_to_claude_code_executable !== 'string' || w.path_to_claude_code_executable.trim() === '') fail(rel, jobId, 'fixer-pin', `with has no path_to_claude_code_executable, so the Claude Code binary is not pinned. Next step: set it to the pinned binary path.`);
                for (const k of ['show_full_output', 'display_report']) {
                    if (w[k] === true || w[k] === 'true') fail(rel, jobId, 'fixer-pin', `with.${k} is true, which echoes model output into the log. Next step: set it to false.`);
                }
            }
            if (fixer || claude.length > 0) {
                // Any form: an env map, an env expression string, or a run:/with: text that writes it to GITHUB_ENV.
                for (const [where, v] of [['workflow env', wf.env], ['job', job]]) {
                    if (/ACTIONS_STEP_DEBUG/i.test(JSON.stringify(v ?? null))) fail(rel, jobId, 'fixer-debug', `${where} mentions ACTIONS_STEP_DEBUG, and debug logging can echo the model's input. Next step: remove it from the fixer job.`);
                }
            }
            if (fixer && jobId === 'fix') {
                for (const step of claude.length > 0 ? claude : [{}]) {
                    const w = step.with ?? {};
                    const flags = claudeFlags(String(w.claude_args ?? ''));
                    const flagsOf = (...names) => flags.filter(f => names.includes(f.name));
                    const turns = flagsOf('--max-turns');
                    if (turns.length !== 1 || turns[0].values.length !== 1 || !/^\d+$/.test(turns[0].values[0]) || Number(turns[0].values[0]) < 1 || Number(turns[0].values[0]) > 100) fail(rel, jobId, 'fixer-tools', `claude_args needs exactly one --max-turns integer from 1 to 100, so the run is bounded. Next step: add --max-turns 40.`);
                    for (const f of flags) {
                        if (FIXER_FLAGS.has(f.name)) continue;
                        const why = FIXER_REFUSED_FLAGS[f.name] ?? 'is not in the fixer flag allowlist';
                        fail(rel, jobId, 'fixer-tools', `claude_args passes ${f.name}, which ${why}. Next step: remove it; the fixer flag allowlist changes only by a reviewed edit of ${SELF_REL}.`);
                    }
                    for (const f of flagsOf('--permission-mode')) {
                        if (!(f.values.length === 1 && ['default', 'plan'].includes(f.values[0]))) fail(rel, jobId, 'fixer-tools', `claude_args passes --permission-mode ${f.values.join(' ') || '(no value)'}; bypassPermissions and acceptEdits skip the allowlist. Next step: drop --permission-mode, or use default or plan.`);
                    }
                    const allowedFlags = flagsOf('--allowedTools', '--allowed-tools');
                    const denied = flagsOf('--disallowedTools', '--disallowed-tools').flatMap(f => toolEntries(f.values));
                    if (allowedFlags.length === 0) {
                        fail(rel, jobId, 'fixer-tools', `claude_args has no --allowedTools list, so every tool is open. Next step: list the scoped tools explicitly.`);
                    } else {
                        const entries = allowedFlags.flatMap(f => toolEntries(f.values));
                        const granted = new Set();
                        for (const e of entries) {
                            if (/^Bash(\(\s*:?\*+\s*\)|\(\s*\))?$/.test(e)) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${e}, an unscoped shell. Next step: scope it, for example Bash(git -C work diff:*).`);
                            if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(e)) {
                                fail(rel, jobId, 'fixer-tools', `--allowedTools grants bare ${e}, which reaches patches/ and every other path. Next step: scope it, for example ${e}(work/**).`);
                                continue;
                            }
                            const g = e.match(/^(Edit|Write|MultiEdit|NotebookEdit)\((.*)\)$/);
                            if (!g) continue;
                            if (g[2].includes('patches')) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${g[1]}(${g[2]}), which reaches patches/. Next step: drop it; patches change only through scripts/regenerate-patches.sh.`);
                            else if (!g[2].startsWith('work/') || g[2].includes('..')) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${g[1]}(${g[2]}), which is not confined to work/ and so reaches patches/. Next step: scope it to ${g[1]}(work/**).`);
                            else if (g[2] === 'work/**') granted.add(g[1]);
                        }
                        // work/** reaches work/**/patches/**: each granted tool needs that path denied (Edit and Write always travel together).
                        if (granted.has('Edit') || granted.has('Write')) { granted.add('Edit'); granted.add('Write'); }
                        for (const t of granted) {
                            if (!denied.includes(`${t}(work/**/patches/**)`)) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${t}(work/**), which reaches patches/, and --disallowedTools does not deny ${t}(work/**/patches/**). Next step: add that deny entry.`);
                        }
                    }
                    for (const t of ['WebFetch', 'WebSearch']) {
                        if (!denied.includes(t)) fail(rel, jobId, 'fixer-prompt', `--disallowedTools does not deny ${t}, so the model can reach the open web with repository text. Next step: add ${t} to --disallowedTools.`);
                    }
                    if (w.allowed_bots !== FIX_BOTS) fail(rel, jobId, 'fixer-prompt', `allowed_bots is '${w.allowed_bots ?? '(absent)'}', not the explicit list '${FIX_BOTS}'. A wildcard lets any bot steer the model. Next step: set allowed_bots to that list.`);
                }
                const cond = ifTerms(job);
                if (cond.or) fail(rel, jobId, 'fixer-prompt', `if: has a top-level ||, so the fixer can start with a guard false (for example always() || (...)). Next step: join the guards with && only.`);
                for (const [kw, lit] of FIX_GUARDS) {
                    if (!cond.terms.includes(lit)) fail(rel, jobId, 'fixer-prompt', `if: lacks the ${kw} guard (${lit}) as a top-level && term, so a fork, a fixer head or the bot actor could start the fixer. Next step: add it to the job's if: joined with &&.`);
                }
            }

            // permissions
            if (eff.issues === 'write' && !((file === 'release-train.yml' && jobId === 'report') || (file === 'triage.yml' && jobId === 'apply'))) {
                fail(rel, jobId, 'issues-write', `has effective issues write, admitted only on release-train.yml job report and on triage.yml job apply. Next step: drop issues write from the job or workflow permissions.`);
            }
            if (TRIO.every(s => eff[s] === 'write') && !(file === 'release.yml' && jobId === 'sign-publish')) {
                fail(rel, jobId, 'write-trio', `holds contents, id-token and attestations write together, admitted only on release.yml job sign-publish. Next step: narrow the job permissions.`);
            }

            // workflow_run guard
            if (wfRun) {
                const cond = ifTerms(job);
                if (cond.or || !cond.terms.includes(GUARD)) fail(rel, jobId, 'workflow-run-guard', `runs on workflow_run without the guard '${GUARD}' as a top-level && term of its if: (and no top-level ||), so a fork's run can trigger it. Next step: add the guard to the job's if: joined with &&.`);
            }

            // no cache in the release path or the fixer path (RESEARCH pitfall 5)
            if (file === 'release.yml' || (file === FIXER_FILE && FIXER_JOBS.includes(jobId))) {
                steps.forEach((s, i) => {
                    if (stepUses[i].startsWith('actions/cache')) fail(rel, jobId, 'no-cache', `step ${i} uses ${stepUses[i]}; a cache restored into release bytes can be poisoned. Next step: remove the actions/cache step.`);
                    if (s.with !== null && typeof s.with === 'object' && Object.hasOwn(s.with, 'cache')) fail(rel, jobId, 'no-cache', `step ${i} (${stepUses[i] || 'run'}) sets a cache input; a cache restored into release bytes can be poisoned. Next step: remove the cache input.`);
                });
            }

            // bot-job-gate: a job that enters an environment is gated at job level, not only by its steps.
            if (file === DRY_RUN_FILE && job.environment !== undefined) {
                const jobCond = String(job.if ?? '');
                if (!DRY_RUN_NEGATED.test(jobCond)) fail(rel, jobId, 'bot-job-gate', `enters environment ${JSON.stringify(job.environment)} with no negated ${DRY_RUN_GATE} in its job-level if:, so a dry run or a run with nothing to publish would reach the environment and wait on its approval. Next step: gate the job itself with if: \${{ !${DRY_RUN_GATE} && ... }}.`);
            }

            // uptake-lane (TRAIN-05, UPS-01): the 175 replay is read-only and publishes nothing. It holds
            // no write scope, enters no environment, and calls only the one replay definition.
            if (file === DRY_RUN_FILE && jobId === 'uptake-replay') {
                const writeScopes = Object.entries(eff).filter(([, v]) => v === 'write').map(([k]) => k);
                if (writeScopes.length > 0) fail(rel, jobId, 'uptake-lane', `holds write scope on ${writeScopes.join(', ')}; the uptake replay is read-only and publishes nothing. Next step: set its permissions to contents: read.`);
                if (job.environment !== undefined) fail(rel, jobId, 'uptake-lane', `enters environment ${JSON.stringify(job.environment)}; the uptake replay holds no environment. Next step: remove the environment key.`);
                if (job.uses !== './.github/workflows/rebase-upstream.yml') fail(rel, jobId, 'uptake-lane', `calls ${JSON.stringify(job.uses ?? null)}, not the one replay definition rebase-upstream.yml. Next step: call rebase-upstream.yml, the only replay.`);
                if (job.secrets !== undefined) fail(rel, jobId, 'uptake-lane', `passes secrets (${JSON.stringify(job.secrets)}) to the replay; the uptake replay holds no secret, and secrets: inherit would hand it every repository secret. Next step: remove the secrets key.`);
            }

            // dry-run gate: every write step in release-train.yml names the gate in its if:.
            if (file === DRY_RUN_FILE) {
                steps.forEach((s, i) => {
                    const unreadUse = stepUses[i] !== '' && !READ_USES.includes(stepUses[i].split('@')[0]);
                    const writes = (typeof s.run === 'string' && WRITE_RUN.test(s.run)) || unreadUse;
                    if (!writes) return;
                    const cond = s.if === undefined ? '' : String(s.if);
                    if (!DRY_RUN_NEGATED.test(cond)) fail(rel, jobId, 'dry-run-gate', `step ${i} (${stepUses[i] || 'run'}) writes to GitHub or the repository, or uses an action outside the read-only list, with no negated ${DRY_RUN_GATE} gate in its if:. Next step: add if: \${{ !${DRY_RUN_GATE} }} and print the write as a dry-run line instead.`);
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

    // dependabot.yml (AUTO-03): read as data, never parsed by the workflow rules above.
    {
        const fail1 = msg => fail(DEPENDABOT_REL, WF_LEVEL, 'dependabot', msg);
        let text = overrides.dependabot;
        if (text === undefined) {
            try { text = readFileSync(join(root, DEPENDABOT_REL), 'utf8'); } catch (e) { fail1(`could not be read (${e.message}). Next step: restore the file.`); }
        }
        let dep = null;
        if (typeof text === 'string') {
            try { dep = yaml.load(text); } catch (e) { fail1(`does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file.`); }
        }
        if (dep !== null && (typeof dep !== 'object' || !Array.isArray(dep.updates))) { fail1('carries no updates list. Next step: fix the file.'); dep = null; }
        if (dep !== null) {
            const ecosystems = dep.updates.map(u => u?.['package-ecosystem']).sort();
            if (JSON.stringify(ecosystems) !== JSON.stringify(['github-actions', 'npm'])) fail1(`updates the ecosystems [${ecosystems.join(', ')}], not exactly github-actions and npm. Next step: restore the two entries; another ecosystem is a scope decision.`);
            if (dep.registries !== undefined) fail1('declares registries, which hand Dependabot credentials. Next step: remove the registries key.');
            const autoKeys = [];
            const walk = (v, path) => {
                if (v === null || typeof v !== 'object') return;
                for (const [k, c] of Object.entries(v)) {
                    if (/auto[-_]?merge/i.test(k)) autoKeys.push(`${path}${k}`);
                    walk(c, `${path}${k}.`);
                }
            };
            walk(dep, '');
            if (autoKeys.length > 0) fail1(`carries an auto-merge key (${autoKeys.join(', ')}). Next step: remove it; every Dependabot pull request merges by owner hand.`);
            for (const u of dep.updates) {
                const eco = u?.['package-ecosystem'];
                if (u?.['insecure-external-code-execution'] !== undefined) fail1(`${eco} sets insecure-external-code-execution. Next step: remove the key.`);
                const cd = u?.cooldown?.['default-days'];
                if (!Number.isInteger(cd) || cd < 7) fail1(`${eco} has no cooldown with default-days of at least 7 (got ${JSON.stringify(cd ?? null)}), so a release is adopted minutes after it is published. Next step: add cooldown: default-days: 7.`);
                if (eco === 'npm' && u['open-pull-requests-limit'] !== 0) fail1(`npm has open-pull-requests-limit ${JSON.stringify(u['open-pull-requests-limit'] ?? null)}, not 0, so version-update pull requests would fight Renovate's Theia group. Next step: set open-pull-requests-limit: 0 (security updates only).`);
                if (eco === 'github-actions') {
                    const ignored = (u.ignore ?? []).map(i => i?.['dependency-name']);
                    if (!ignored.includes(CLAUDE_ACTION)) fail1(`github-actions does not ignore ${CLAUDE_ACTION}, whose pin is exact in the fixer-pin and triage rules, so a Dependabot bump cannot merge. Next step: add it to ignore; it is re-pinned by hand with the two verifiers.`);
                    const smd = u.cooldown?.['semver-major-days'];
                    if (!Number.isInteger(smd) || smd < (Number.isInteger(cd) ? cd : 7)) fail1(`github-actions has semver-major-days ${JSON.stringify(smd ?? null)}, not at least its default-days. Next step: set cooldown semver-major-days no lower than default-days.`);
                    if (u.groups === undefined || typeof u.groups !== 'object' || Object.keys(u.groups).length === 0) fail1('github-actions has no group, so its updates are not one weekly pull request. Next step: restore the actions group.');
                }
                for (const [gName, g] of Object.entries(u?.groups ?? {})) {
                    const types = g?.['update-types'];
                    if (!Array.isArray(types) || types.length === 0 || types.some(t => t !== 'minor' && t !== 'patch')) fail1(`${eco} group ${gName} has update-types ${JSON.stringify(types ?? null)}, not a subset of minor and patch, so a major update lands in the grouped pull request. Next step: set update-types: [minor, patch]; majors arrive as separate pull requests.`);
                }
            }
        }
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
    // The good release.yml, the 4-job shape: dispatch only with a required sha input;
    // build-linux on the release runner label with contents read and no environment;
    // sign-publish hosted with environment release and the trio; descriptor and
    // channel-live hosted, with no trio. The upload step carries retention-days 1.
    const R = 'release.yml';
    const GOOD_RELEASE = [
        'name: Release',
        'on:',
        '  workflow_dispatch:',
        '    inputs:',
        '      sha:',
        '        required: true',
        '        type: string',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  build-linux:',
        '    runs-on: [self-hosted, powerbrowser-release]',
        '    permissions:',
        '      contents: read',
        '    steps:',
        `      - uses: actions/checkout@${H40}`,
        '        with:',
        '          persist-credentials: false',
        '      - run: echo build',
        `      - uses: actions/upload-artifact@${H40}`,
        '        with:',
        '          retention-days: 1',
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
        '  descriptor:',
        '    needs: sign-publish',
        '    runs-on: ubuntu-latest',
        '    environment: descriptor',
        '    permissions:',
        '      contents: read',
        '    steps:',
        '      - run: echo descriptor',
        '  channel-live:',
        '    needs: descriptor',
        '    runs-on: ubuntu-latest',
        '    permissions:',
        '      contents: read',
        '    steps:',
        '      - run: echo live',
        '',
    ].join('\n');
    const base = { ...files, [R]: GOOD_RELEASE };
    const BUILD = '  build-linux:\n    runs-on: [self-hosted, powerbrowser-release]\n';
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
    const assist = (perm, extraSteps = [], prompt = 'Review the change', pin = FIX_PIN) => [
        'name: Assist',
        'on: workflow_dispatch',
        'permissions:',
        `  contents: ${perm}`,
        'jobs:',
        '  assist:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        ...extraSteps,
        `      - uses: ${pin}`,
        '        with:',
        '          path_to_claude_code_executable: /opt/claude-pinned/claude',
        `          prompt: "${prompt}"`,
        '',
    ].join('\n');
    const plain = (perms) => ['name: Plain', 'on: workflow_dispatch', ...(perms ? [`permissions: ${perms}`] : []), 'jobs:', '  plain:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo plain', ''].join('\n');
    const issuesJob = (name, jobId) => [`name: ${name}`, 'on: workflow_dispatch', 'jobs:', `  ${jobId}:`, '    runs-on: ubuntu-latest', '    permissions:', '      issues: write', '    steps:', '      - run: echo report', ''].join('\n');
    const withClaude = { ...selected, patterns_allowed: [...selected.patterns_allowed, 'anthropics/claude-code-action@*'] };
    // The real triage.yml admits the claude-code-action star. A control that replaces triage.yml sets that admission aside, or admission-used reds on an entry nothing uses.
    const withoutClaude = { ...selected, patterns_allowed: selected.patterns_allowed.filter(p => !p.startsWith('anthropics/claude-code-action@')) };
    const V_PERMS = '    permissions:\n      contents: read\n';
    const V_CHECK = 'run: nix develop .#theia --command node scripts/generate.mjs --check';

    // The good fixer triple in release-train.yml: fix (Claude, read-only), fix-gate (no
    // secrets, no environment), fix-pr (the one App-token minter). Every fixer rule is
    // edited from here, so a plant changes one fact and the rest stays green.
    const T = FIXER_FILE;
    const FIXER = FIX_PIN.split('@')[1];
    const FIX_APP = 'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510';
    const CLAUDE_ARGS = '--max-turns 40 --allowedTools "Bash(git -C work diff:*),Bash(scripts/regenerate-patches.sh:*),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read" --disallowedTools "WebFetch,WebSearch,Edit(work/**/patches/**),Write(work/**/patches/**)"';
    const FIX_IF = "github.event.workflow_run.head_repository.full_name == github.repository && !startsWith(github.event.workflow_run.head_branch, 'claude-fix/') && github.actor != 'powerbrowser-bot[bot]'";
    const GOOD_TRAIN = [
        'name: Release train',
        'on:',
        '  workflow_run:',
        '    workflows: [Verify static layers]',
        '    types: [completed]',
        'permissions: {}',
        'jobs:',
        '  fix:',
        '    runs-on: ubuntu-latest',
        '    environment: fixer',
        '    concurrency: claude-fixer',
        '    timeout-minutes: 90',
        '    permissions:',
        '      contents: read',
        '      actions: read',
        '      id-token: write',
        `    if: "!inputs.dry-run && ${FIX_IF}"`,
        '    steps:',
        `      - uses: ${CHECKOUT}`,
        '        with:',
        '          persist-credentials: false',
        `      - uses: ${FIX_PIN}`,
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          github_token: ${{ secrets.GITHUB_TOKEN }}',
        '          path_to_claude_code_executable: /opt/claude-pinned/claude',
        "          allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'",
        '          show_full_output: false',
        '          display_report: false',
        '          prompt: ${{ inputs.trusted-prompt }}',
        `          claude_args: '${CLAUDE_ARGS}'`,
        '  fix-gate:',
        '    needs: fix',
        '    runs-on: ubuntu-latest',
        '    permissions:',
        '      contents: read',
        `    if: "${GUARD}"`,
        '    steps:',
        '      - run: echo gate',
        '  fix-pr:',
        '    needs: fix-gate',
        `    if: "!inputs.dry-run && needs.fix-gate.outputs.verdict == 'pass' && ${GUARD}"`,
        '    runs-on: ubuntu-latest',
        '    environment: bot',
        '    permissions: {}',
        '    steps:',
        `      - uses: ${FIX_APP}`,
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          permission-contents: write',
        '          permission-pull-requests: write',
        '      - if: ${{ !inputs.dry-run }}',
        '        run: node scripts/fix-open-pr.mjs',
        '',
    ].join('\n');
    const fixerEdit = (from, to) => {
        if (!GOOD_TRAIN.includes(from)) throw new Error(`self-test anchor '${from}' is absent from the fixer fixture`);
        return { files: { ...base, [T]: GOOD_TRAIN.replace(from, to) }, selected: withClaude };
    };

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
        ['issues write on triage.yml model job classify', { ...with_({ 'triage.yml': issuesJob('Triage', 'classify') }), selected: withoutClaude }, rel('triage.yml'), 'classify', 'issues-write', 'issues write'],
        ['write trio in job publish (not sign-publish)', append(R, job('publish', ['runs-on: ubuntu-latest', 'permissions:', '  contents: write', '  id-token: write', '  attestations: write', 'steps:', '  - run: echo x'])), rel(R), 'publish', 'write-trio', 'sign-publish'],
        ['pull_request on release.yml', edit(R, 'on:\n  workflow_dispatch:', 'on:\n  pull_request:\n  workflow_dispatch:'), rel(R), WF_LEVEL, 'no-pr-trigger', 'pull_request'],
        ['pull_request_target on release-train.yml', with_({ 'release-train.yml': plain(null).replace('on: workflow_dispatch', 'on: [workflow_dispatch, pull_request_target]') }), rel('release-train.yml'), WF_LEVEL, 'no-pr-trigger', 'pull_request_target'],
        ['actions/cache in release.yml', edit(R, '      - run: echo build\n', `      - uses: actions/cache@${H40}\n      - run: echo build\n`), rel(R), 'build-linux', 'no-cache', 'actions/cache'],
        ['setup-node with cache: in release.yml', edit(R, '      - run: echo build\n', `      - uses: actions/setup-node@${H40}\n        with:\n          cache: yarn\n      - run: echo build\n`), rel(R), 'build-linux', 'no-cache', 'cache input'],
        ['claude-code-action beside an App-token step', { files: { ...base, 'assist.yml': assist('read', [`      - uses: actions/create-github-app-token@${H40}`]) }, selected: withClaude }, rel('assist.yml'), 'assist', 'claude-code-action', 'create-github-app-token'],
        ['claude-code-action on legion', edit(R, '      - run: echo build\n', `      - uses: anthropics/claude-code-action@${H40}\n      - run: echo build\n`), rel(R), 'build-linux', 'claude-code-action', 'not GitHub-hosted'],
        ['claude-code-action with contents write', { files: { ...base, 'assist.yml': assist('write') }, selected: withClaude }, rel('assist.yml'), 'assist', 'claude-code-action', 'contents write'],
        // TRAIN-08 and the release-train trust shape, planted on the real release-train.yml
        ['ungated git push in bump-pr', withRt(d => d.jobs['bump-pr'].steps.push({ run: 'git push origin HEAD:refs/heads/x' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated gh issue comment in report', withRt(d => d.jobs.report.steps.push({ run: 'gh issue comment 1 --body x' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated App-token mint in bump-pr', withRt(d => d.jobs['bump-pr'].steps.push({ uses: `${APP_TOKEN}${H40}` })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        // TRAIN-08, the forms the first rule missed: an inverted or always()-wrapped gate, the git -c
        // extraheader push, a commit, a write method or implicit POST on gh api, gh release, curl -X,
        // and an action outside the read-only list. Each plant is one step on the real release-train.yml.
        ['inverted dry-run gate on a git push', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ ${DRY_RUN_GATE} }}`, run: 'git push origin HEAD:refs/heads/x' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['always() || gate on a git push', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ always() || ${DRY_RUN_GATE} }}`, run: 'git push origin HEAD:refs/heads/x' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated git -c extraheader push', withRt(d => d.jobs['bump-pr'].steps.push({ run: 'git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic x" push --force origin HEAD:refs/heads/x' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated git commit', withRt(d => d.jobs['bump-pr'].steps.push({ run: 'git commit -m "x"' })), rel(DRY_RUN_FILE), 'bump-pr', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated gh api -X POST', withRt(d => d.jobs.report.steps.push({ run: 'gh api -X POST repos/o/r/issues' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated gh api with an implicit POST field', withRt(d => d.jobs.report.steps.push({ run: 'gh api repos/o/r/issues -f title=x' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated gh release create', withRt(d => d.jobs.report.steps.push({ run: 'gh release create v1 --notes x' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated curl -X POST', withRt(d => d.jobs.report.steps.push({ run: 'curl -X POST https://api.github.com/x' })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        ['ungated actions/github-script', withRt(d => d.jobs.report.steps.push({ uses: `actions/github-script@${H40}` })), rel(DRY_RUN_FILE), 'report', 'dry-run-gate', 'no negated inputs.dry-run gate'],
        // WR-09: the environment-bound job is gated at job level, so a dry run never reaches the bot environment.
        ['bump-pr without a job-level dry-run gate', withRt(d => { delete d.jobs['bump-pr'].if; }), rel(DRY_RUN_FILE), 'bump-pr', 'bot-job-gate', 'job-level if'],
        ['bump-pr-node gated only by always()', withRt(d => { d.jobs['bump-pr-node'].if = '${{ always() }}'; }), rel(DRY_RUN_FILE), 'bump-pr-node', 'bot-job-gate', 'job-level if'],
        // TRAIN-05 / T-58-01: the 175 replay-only job holds no write scope, no environment, and one replay definition.
        ['uptake-replay granted contents write', withRt(d => { d.jobs['uptake-replay'].permissions = { contents: 'write' }; }), rel(DRY_RUN_FILE), 'uptake-replay', 'uptake-lane', 'holds write scope on contents'],
        ['uptake-replay granted pull-requests write', withRt(d => { d.jobs['uptake-replay'].permissions = { contents: 'read', 'pull-requests': 'write' }; }), rel(DRY_RUN_FILE), 'uptake-replay', 'uptake-lane', 'holds write scope on pull-requests'],
        ['uptake-replay entering the bot environment', withRt(d => { d.jobs['uptake-replay'].environment = 'bot'; }), rel(DRY_RUN_FILE), 'uptake-replay', 'uptake-lane', 'holds no environment'],
        ['uptake-replay calling a publishing workflow', withRt(d => { d.jobs['uptake-replay'].uses = './.github/workflows/release.yml'; }), rel(DRY_RUN_FILE), 'uptake-replay', 'uptake-lane', 'not the one replay definition'],
        ['uptake-replay passing secrets: inherit to the replay', withRt(d => { d.jobs['uptake-replay'].secrets = 'inherit'; }), rel(DRY_RUN_FILE), 'uptake-replay', 'uptake-lane', 'holds no secret'],
        ['schedule key on release-train.yml', withRt(d => { d.on.schedule = [{ cron: '0 3 * * *' }]; }), rel(DRY_RUN_FILE), WF_LEVEL, 'no-schedule', 'schedule'],
        ['pull_request trigger on release-train.yml', withRt(d => { d.on.pull_request = null; }), rel(DRY_RUN_FILE), WF_LEVEL, 'no-pr-trigger', 'pull_request'],
        ['unguarded workflow_run job in release-train.yml', withRt(d => { d.on.workflow_run = { workflows: ['Verify static layers'], types: ['completed'] }; d.jobs.derive.if = 'true'; }), rel(DRY_RUN_FILE), 'derive', 'workflow-run-guard', 'head_repository'],
        ['legion runs-on on release-train.yml job detect', withRt(d => { d.jobs.detect['runs-on'] = ['self-hosted', 'legion']; }), rel(DRY_RUN_FILE), 'detect', 'legion', 'build-* or matrix-*'],
    ];

    // Fixer plants (FIX-08 pin and flags, FIX-09 tools and prompt, FIX-04 hosted-only,
    // no-cache in the fixer). Each edits one fact of the good triple.
    const fixerPlants = [
        ['claude-code-action tag object instead of the commit pin', fixerEdit(`uses: ${FIX_PIN}`, 'uses: anthropics/claude-code-action@c335fd6d' + '0'.repeat(32)), rel(T), 'fix', 'fixer-pin', 'db77d4d3'],
        ['claude-code-action commit with one hex digit changed', fixerEdit(`uses: ${FIX_PIN}`, `uses: ${FIX_PIN.slice(0, -1)}d`), rel(T), 'fix', 'fixer-pin', 'db77d4d3'],
        ['missing path_to_claude_code_executable', fixerEdit('          path_to_claude_code_executable: /opt/claude-pinned/claude\n', ''), rel(T), 'fix', 'fixer-pin', 'path_to_claude_code_executable'],
        ['show_full_output true', fixerEdit('          show_full_output: false', '          show_full_output: true'), rel(T), 'fix', 'fixer-pin', 'show_full_output'],
        ['display_report true', fixerEdit('          display_report: false', '          display_report: true'), rel(T), 'fix', 'fixer-pin', 'display_report'],
        ['ACTIONS_STEP_DEBUG set on fix', fixerEdit('    concurrency: claude-fixer', "    concurrency: claude-fixer\n    env:\n      ACTIONS_STEP_DEBUG: '1'"), rel(T), 'fix', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
        ['bare Bash in --allowedTools', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash'), rel(T), 'fix', 'fixer-tools', 'Bash'],
        ['--allowedTools missing', fixerEdit(' --allowedTools "Bash(git -C work diff:*),Bash(scripts/regenerate-patches.sh:*),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read"', ''), rel(T), 'fix', 'fixer-tools', '--allowedTools'],
        ['--max-turns missing', fixerEdit('--max-turns 40 ', ''), rel(T), 'fix', 'fixer-tools', '--max-turns'],
        ['Edit(patches) granted in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**/patches/**),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(work/**/patches/**)'],
        ['Write(patches) granted in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),Write(work/**/patches/**),Read'), rel(T), 'fix', 'fixer-tools', 'Write(work/**/patches/**)'],
        ['Edit(work/**) granted with no patches deny', fixerEdit(',Edit(work/**/patches/**),Write(work/**/patches/**)"', '"'), rel(T), 'fix', 'fixer-tools', 'Edit(work/**/patches/**)'],
        ['WebFetch not denied', fixerEdit('"WebFetch,WebSearch,', '"WebSearch,'), rel(T), 'fix', 'fixer-prompt', 'WebFetch'],
        ['if: without the claude-fix/ head exclusion', fixerEdit(" && !startsWith(github.event.workflow_run.head_branch, 'claude-fix/')", ''), rel(T), 'fix', 'fixer-prompt', 'claude-fix/'],
        ['if: without the bot-actor exclusion', fixerEdit(" && github.actor != 'powerbrowser-bot[bot]'", ''), rel(T), 'fix', 'fixer-prompt', 'powerbrowser-bot[bot]'],
        ['allowed_bots star', fixerEdit("allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'", "allowed_bots: '*'"), rel(T), 'fix', 'fixer-prompt', 'allowed_bots'],
        ['event text in the fixer prompt', fixerEdit('prompt: ${{ inputs.trusted-prompt }}', 'prompt: ${{ github.event.pull_request.body }}'), rel(T), 'fix', 'event-text', 'with.prompt'],
        ['legion runner on fix', fixerEdit('    runs-on: ubuntu-latest\n    environment: fixer', '    runs-on: [self-hosted, legion]\n    environment: fixer'), rel(T), 'fix', 'legion', 'build-* or matrix-*'],
        ['bare self-hosted runner on fix', fixerEdit('    runs-on: ubuntu-latest\n    environment: fixer', '    runs-on: self-hosted\n    environment: fixer'), rel(T), 'fix', 'runner', '"self-hosted"'],
        ['actions/create-github-app-token beside Claude in fix', fixerEdit(`      - uses: ${FIX_PIN}`, `      - uses: ${FIX_APP}\n      - uses: ${FIX_PIN}`), rel(T), 'fix', 'claude-code-action', 'create-github-app-token'],
        ['actions/cache in fix', fixerEdit(`      - uses: ${FIX_PIN}`, `      - uses: actions/cache@${H40}\n      - uses: ${FIX_PIN}`), rel(T), 'fix', 'no-cache', 'actions/cache'],
        ['setup-node with cache: in fix-gate', fixerEdit('    steps:\n      - run: echo gate', `    steps:\n      - uses: actions/setup-node@${H40}\n        with:\n          cache: yarn\n      - run: echo gate`), rel(T), 'fix-gate', 'no-cache', 'cache input'],
        // FIX-08 in triage.yml (WR-07): the pin holds in every workflow, not only release-train.yml.
        ['triage.yml pinned to the claude-code-action tag object', { files: { ...base, 'triage.yml': assist('read', [], 'Label the issue', 'anthropics/claude-code-action@c335fd6d' + '0'.repeat(32)) }, selected: withClaude }, rel('triage.yml'), 'assist', 'fixer-pin', 'db77d4d3'],
        // WR-07: if: guards are parsed, not searched for substrings.
        ['if: always() || (all three guards)', fixerEdit(`    if: "!inputs.dry-run && ${FIX_IF}"`, `    if: "always() || (!inputs.dry-run && ${FIX_IF})"`), rel(T), 'fix', 'fixer-prompt', '||'],
        ['if: !(all three guards)', fixerEdit(`    if: "!inputs.dry-run && ${FIX_IF}"`, `    if: "!(!inputs.dry-run && ${FIX_IF})"`), rel(T), 'fix', 'fixer-prompt', 'head_repository'],
        ['workflow_run guard behind always() ||', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true).replace(`if: \${{ ${GUARD} }}`, `if: \${{ always() || ${GUARD} }}`) }), rel('after.yml'), 'report', 'workflow-run-guard', 'head_repository'],
        ['ACTIONS_STEP_DEBUG as an env expression string', fixerEdit('    concurrency: claude-fixer', "    concurrency: claude-fixer\n    env: ${{ fromJSON('{\"ACTIONS_STEP_DEBUG\":\"1\"}') }}"), rel(T), 'fix', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
        ['ACTIONS_STEP_DEBUG written to GITHUB_ENV by a step', fixerEdit('    steps:\n      - run: echo gate', '    steps:\n      - run: echo ACTIONS_STEP_DEBUG=true >> "$GITHUB_ENV"\n      - run: echo gate'), rel(T), 'fix-gate', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
        // WR-06: grants and flags that open the shell, reach patches/ or make the allowlist moot.
        ['bare Edit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit,Read'), rel(T), 'fix', 'fixer-tools', 'bare Edit'],
        ['bare Write in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),Write,Read'), rel(T), 'fix', 'fixer-tools', 'bare Write'],
        ['bare MultiEdit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),MultiEdit,Read'), rel(T), 'fix', 'fixer-tools', 'bare MultiEdit'],
        ['bare NotebookEdit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),NotebookEdit,Read'), rel(T), 'fix', 'fixer-tools', 'bare NotebookEdit'],
        ['Edit(**) in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(**),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(**)'],
        ['Edit(*) in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(*),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(*)'],
        ['MultiEdit(work/**) without its patches deny', fixerEdit('Edit(work/**),Read', 'Edit(work/**),MultiEdit(work/**),Read'), rel(T), 'fix', 'fixer-tools', 'MultiEdit(work/**/patches/**)'],
        ['Bash(*) in --allowedTools', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash(*)'), rel(T), 'fix', 'fixer-tools', 'Bash(*)'],
        ['Bash(:*) in --allowedTools', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash(:*)'), rel(T), 'fix', 'fixer-tools', 'Bash(:*)'],
        ['space-separated --allowedTools Read Bash', fixerEdit(' --allowedTools "Bash(git -C work diff:*),Bash(scripts/regenerate-patches.sh:*),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read"', ' --allowedTools Read Bash'), rel(T), 'fix', 'fixer-tools', 'unscoped shell'],
        ['bare Bash through the --allowed-tools alias', fixerEdit('--max-turns 40 ', '--max-turns 40 --allowed-tools Bash '), rel(T), 'fix', 'fixer-tools', 'unscoped shell'],
        ['--dangerously-skip-permissions', fixerEdit('--max-turns 40 ', '--max-turns 40 --dangerously-skip-permissions '), rel(T), 'fix', 'fixer-tools', '--dangerously-skip-permissions'],
        ['--permission-mode bypassPermissions', fixerEdit('--max-turns 40 ', '--max-turns 40 --permission-mode bypassPermissions '), rel(T), 'fix', 'fixer-tools', 'bypassPermissions'],
        ['--permission-mode=acceptEdits', fixerEdit('--max-turns 40 ', '--max-turns 40 --permission-mode=acceptEdits '), rel(T), 'fix', 'fixer-tools', 'acceptEdits'],
        ['--settings', fixerEdit('--max-turns 40 ', '--max-turns 40 --settings /tmp/s.json '), rel(T), 'fix', 'fixer-tools', '--settings'],
        ['--mcp-config', fixerEdit('--max-turns 40 ', '--max-turns 40 --mcp-config /tmp/m.json '), rel(T), 'fix', 'fixer-tools', '--mcp-config'],
        ['--add-dir', fixerEdit('--max-turns 40 ', '--max-turns 40 --add-dir /tmp '), rel(T), 'fix', 'fixer-tools', '--add-dir'],
        ['a flag outside the allowlist', fixerEdit('--max-turns 40 ', '--max-turns 40 --append-system-prompt x '), rel(T), 'fix', 'fixer-tools', '--append-system-prompt'],
        ['--max-turns 4000', fixerEdit('--max-turns 40 ', '--max-turns 4000 '), rel(T), 'fix', 'fixer-tools', '--max-turns'],
        ['a second claude step with bare Bash', fixerEdit('  fix-gate:\n    needs: fix\n', `      - uses: ${FIX_PIN}\n        with:\n          path_to_claude_code_executable: /opt/claude-pinned/claude\n          allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'\n          claude_args: '--max-turns 40 --allowedTools Bash --disallowedTools "WebFetch,WebSearch"'\n  fix-gate:\n    needs: fix\n`), rel(T), 'fix', 'fixer-tools', 'unscoped shell'],
        ['admitted claude-code-action used by no workflow', { files: Object.fromEntries(Object.entries(base).filter(([k]) => !k.endsWith('triage.yml'))), selected: withClaude }, SELECTED_REL, WF_LEVEL, 'admission-used', 'anthropics/claude-code-action'],
    ];
    plants.push(...fixerPlants);

    // dependabot.yml (AUTO-03, BL-02, WR-04, WR-05, WR-06): each plant edits the real file text in memory.
    const DEP = readFileSync(join(REPO_ROOT, DEPENDABOT_REL), 'utf8');
    const depEdit = (from, to, all = false) => {
        if (!DEP.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${DEPENDABOT_REL}`);
        return { dependabot: all ? DEP.replaceAll(from, to) : DEP.replace(from, to) };
    };
    const D = [DEPENDABOT_REL, WF_LEVEL, 'dependabot'];
    plants.push(
        ['dependabot: claude-code-action no longer ignored', depEdit('      - dependency-name: "anthropics/claude-code-action"\n', ''), ...D, CLAUDE_ACTION],
        ['dependabot: the ignore names another dependency', depEdit('"anthropics/claude-code-action"', '"actions/checkout"'), ...D, CLAUDE_ACTION],
        ['dependabot: no cooldown on either entry', depEdit('    cooldown:\n      default-days: 7\n      semver-major-days: 14\n', '', true), ...D, 'no cooldown'],
        ['dependabot: cooldown default-days 3', depEdit('default-days: 7', 'default-days: 3', true), ...D, 'default-days of at least 7'],
        ['dependabot: github-actions semver-major-days below default-days', depEdit('semver-major-days: 14', 'semver-major-days: 2'), ...D, 'semver-major-days'],
        ['dependabot: an auto-merge key', depEdit('    open-pull-requests-limit: 5\n', '    open-pull-requests-limit: 5\n    automerge: true\n'), ...D, 'auto-merge key'],
        ['dependabot: npm open-pull-requests-limit 5', depEdit('    open-pull-requests-limit: 0\n', '    open-pull-requests-limit: 5\n'), ...D, 'not 0'],
        ['dependabot: npm open-pull-requests-limit removed', depEdit('    open-pull-requests-limit: 0\n', ''), ...D, 'not 0'],
        ['dependabot: group update-types include major', depEdit('          - "patch"\n', '          - "patch"\n          - "major"\n'), ...D, 'not a subset of minor and patch'],
        ['dependabot: group without update-types', depEdit('        update-types:\n          - "minor"\n          - "patch"\n', ''), ...D, 'not a subset of minor and patch'],
        ['dependabot: a third ecosystem', { dependabot: `${DEP}  - package-ecosystem: "pip"\n    directory: "/"\n    schedule:\n      interval: "weekly"\n    cooldown:\n      default-days: 7\n` }, ...D, 'not exactly github-actions and npm'],
        ['dependabot: registries declared', { dependabot: `${DEP}registries:\n  r:\n    type: npm-registry\n    url: https://example.invalid\n` }, ...D, 'registries'],
        ['dependabot: the file does not parse', { dependabot: 'updates: [\n' }, ...D, 'does not parse'],
        ['dependabot: no updates list', { dependabot: 'version: 2\n' }, ...D, 'no updates list'],
    );

    // Green controls: the good release.yml (every plant's base), the two
    // admitted issues-write jobs, a guarded workflow_run, a hosted read-only
    // claude-code-action, and read-all over a write repository default.
    const controls = [
        ['good release.yml: build-linux on legion, sign-publish with the write trio', { files: base }],
        ['issues write on release-train.yml job report', with_({ 'release-train.yml': issuesJob('Release train', 'report') })],
        ['issues write on triage.yml job apply', { ...with_({ 'triage.yml': issuesJob('Triage', 'apply') }), selected: withoutClaude }],
        ['guarded workflow_run', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true) })],
        ['claude-code-action hosted with contents read', { files: { ...base, 'assist.yml': assist('read') }, selected: withClaude }],
        ['permissions: read-all over a write repository default', { files: { ...base, 'plain.yml': plain('read-all') }, defaultPermissions: 'write' }],
        ['release-train.yml with its write steps gated by inputs.dry-run', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ !${DRY_RUN_GATE} }}`, run: 'git push origin HEAD:refs/heads/x' }))],
        ['a negated == false gate on a git commit', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ ${DRY_RUN_GATE} == false }}`, run: 'git commit -m "x"' }))],
        ['a read gh api GET stays ungated', withRt(d => d.jobs.report.steps.push({ run: 'gh api repos/o/r/branches/x --jq .commit.sha' }))],
        ['the unmodified release-train.yml under the new rule', { files }],
        ['good fixer triple: fix, fix-gate and fix-pr', { files: { ...base, [T]: GOOD_TRAIN }, selected: withClaude }],
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
