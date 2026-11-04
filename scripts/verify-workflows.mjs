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
//                 owner/repo@* or owner/repo@<40-hex commit>; a commit
//                 entry admits that commit only. claude-code-action is
//                 admitted exactly at FIX_PIN, never by star (IN-02).
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
//                 model job classify holds read only). An actions/create-github-app-token step
//                 counts too: permission-issues: write, or no permission-* input at all (which
//                 inherits every permission of the App), is red outside those two jobs (WR-06).
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
//  call-event-gate  In a workflow that has a workflow_call event, no job-level or step-level `if` reads
//                 github.event_name. Inside a called workflow the github context is the caller's, so the
//                 gate is decided by the caller's event, not by the stage, and a stage meant to run from the
//                 train silently skips its live jobs (Phase 56 CR-01). Gate on a boolean input instead.
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
//                 guard, the claude-fix/ head exclusion, the bot-actor exclusion and the
//                 dependabot[bot] actor exclusion (a red Dependabot pull request never starts the
//                 model once the workflow_run trigger is re-added) are each a top-level && term.
//                 Its --disallowedTools denies WebFetch and
//                 WebSearch, and its allowed_bots is exactly renovate[bot],powerbrowser-bot[bot].
//  app-token-inputs  Every permission-* input of an actions/create-github-app-token step is declared by
//                 that exact pinned commit's action.yml, as recorded in .github/app-token-inputs.json (names
//                 only, with the fetch command; one entry per pin). The action does not validate input names,
//                 so permission-dependabot-alerts (the real name is permission-vulnerability-alerts) would mint
//                 a token that silently lacks the permission. A pin with no record entry that requests a
//                 permission is red too: re-fetch the list when the pin moves.
//  renovate-job   In release-train.yml (Phase 51, AUTO-02, owner answer A4), no renovatebot/github-action step
//                 sets RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS (step or job level): the config runs no hook, and an
//                 allow-list would re-admit one. Each Renovate step sets RENOVATE_PLATFORM_COMMIT: disabled and the config
//                 sets no other platformCommit, so Renovate commits as the bot address. Each Renovate job is followed by exactly one job that needs it and
//                 runs the line nix develop .#theia --command node scripts/generate-licensing.mjs (the generate job), and that job: carries
//                 continue-on-error: true (sweep-clock reads successful runs only), permissions: {}, job env BRANCH equal to the
//                 branchPrefix plus the theia groupSlug read from .github/renovate.json5 at check time, no App token step, no
//                 environment and no secrets., github.token or GITHUB_TOKEN reference, checkouts with persist-credentials: false,
//                 run steps that fetch and apply upstream/, take only every theia/**/package.json, theia/yarn.lock and
//                 configuration.toml from the head with git checkout "$HEAD_SHA" -- <paths>, refuse a package.json change other
//                 than an @theia/* version string, no checkout input ref or repository, never move HEAD (switch, ref checkout,
//                 reset, read-tree, pull, merge, rebase, worktree...), and install theia/ with
//                 --ignore-scripts --frozen-lockfile, one upload of exactly LICENSING.md and THIRD-PARTY-NOTICES.txt, and a head
//                 output (plan 51-09). Exactly one job that needs it mints an App token (the publish job), and it carries
//                 continue-on-error: true, permissions: {}, the same BRANCH, one App token with permission-contents: write only,
//                 checkouts with persist-credentials: false and no ref or repository input, unset NODE_OPTIONS in every run step,
//                 no HEAD, index or workspace move other than the one pinned worktree add, no $GITHUB_WORKSPACE/target path, and
//                 every command word scanned: an interpreter or build tool (., source, yarn, npm, npx, make, env, node...) or a
//                 path runs only as bash "$GITHUB_WORKSPACE/scripts/<name>" (the branch tree is never executed), HEAD_SHA from the generate job's head output,
//                 the moved-branch refusal, a detached worktree at "$HEAD_SHA", git with no system or global config, the
//                 refusal of a diff outside the two notice files, one git add of exactly those two, and publishes with
//                 "$GITHUB_WORKSPACE/scripts/publish-bump-branch.sh" "$BRANCH" "$BASE" "$HEAD_SHA".
//  fixer-spend    The fix job (release-train.yml) carries timeout-minutes: 90 and the
//                 claude-fixer concurrency group, so one attempt is time-bounded and the
//                 attempts for every release key are serialized (FIX-05). The Console
//                 workspace monthly cap is an owner setting, not an in-tree surface.
//
//  dependabot     .github/dependabot.yml (Phase 51, AUTO-03): the ecosystems are exactly github-actions and
//                 npm; no registries and no insecure-external-code-execution; no auto-merge key anywhere;
//                 the npm entry has open-pull-requests-limit 0 (security updates only, Renovate owns the
//                 Theia line); every entry has a cooldown of at least 7 days (the github-actions entry also a
//                 semver-major-days no lower than its default-days); the github-actions entry ignores the
//                 pinned claude-code-action (derived from the fixer pin, re-pinned by hand with the two
//                 verifiers) and its groups list update-types without major.
//
//  fixer-gate     The isolation of the job that runs the model's diff and of the only App-token minter
//                 (release-train.yml fix, fix-gate, fix-pr; FIX-04, FIX-06, CR-02, CR-03). fix exports
//                 diff-sha256 and base-sha. fix-gate has no environment, no secrets. text, permissions
//                 of exactly contents: read, no App-token step, persist-credentials: false on every
//                 checkout, --ignore-scripts on every yarn or npm install, and runs the gate through
//                 scripts/fixer-isolate.sh against the fix job's base-sha after checking the artifact's
//                 sha256 against the fix job's diff-sha256. fix-pr needs fix and fix-gate; its if: holds
//                 top-level && terms for the gate result, the verdict and both bindings (digest and base);
//                 it runs no claude step; its root checkout is main and its target checkout lives under a
//                 path at the gated base-sha; its App token carries exactly contents and pull-requests
//                 write, and is read by exactly one step; it re-runs the pure gate stages (--static-only)
//                 on the digest-checked bytes. Every download-artifact step in the three jobs names no
//                 github-token and no run-id other than this run's.
//  fixer-auth     The fixer credential path (FIX-12, workload identity federation). The fix job
//                 holds id-token: write, and its Claude step carries with.anthropic_federation_rule_id
//                 and with.anthropic_organization_id. fix-gate and fix-pr hold no id-token. In
//                 release-train.yml, a reference to secrets.ANTHROPIC_API_KEY (the owner-chosen fallback)
//                 is refused in any job whose environment is not exactly fixer. triage.yml keeps its key
//                 in its own triage environment (Phase 53) and is outside this rule.
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
const APP_INPUTS_REL = '.github/app-token-inputs.json';
const RENOVATE_REL = '.github/renovate.json5';
const RENOVATE_ACTION = 'renovatebot/github-action';

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

const RULES = ['uses-pinned', 'uses-admitted', 'admission-used', 'no-schedule', 'runner', 'legion', 'claude-code-action', 'issues-write', 'workflow-run-guard', 'workflow-run-chain', 'write-trio', 'no-pr-trigger', 'no-cache', 'event-text', 'fixer-pin', 'fixer-debug', 'fixer-tools', 'fixer-prompt', 'dry-run-gate', 'bot-job-gate', 'uptake-lane', 'dependabot', 'call-event-gate', 'app-token-inputs', 'renovate-job', 'fixer-spend', 'fixer-auth', 'fixer-gate'];
// The fixer (Phase 52): its jobs live only in release-train.yml. FIX_PIN is the
// v1.0.254 commit of claude-code-action; its tag object is a different hash and is refused.
const FIXER_FILE = 'release-train.yml';
const FIXER_JOBS = ['fix', 'fix-gate', 'fix-pr'];
const FIX_PIN = 'anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c';
const CLAUDE_ACTION = FIX_PIN.split('@')[0];
const FIX_BOTS = 'renovate[bot],powerbrowser-bot[bot]';
// Two forms. workflow_dispatch (the live form): the fixer is started by a dispatch with reason fix, which the
// derive job validated and which needs write access to dispatch, so no fork can reach it; the branch is the target
// branch the dispatch names. workflow_run (held out): the head repository and head branch of the triggering run.
const FIX_GUARD_FORMS = {
    'workflow_dispatch': [
        ['workflow_dispatch', "github.event_name == 'workflow_dispatch'"],
        ['reason', "inputs.reason == 'fix'"],
        ['claude-fix/', "!startsWith(inputs.target-branch, 'claude-fix/')"],
        ['powerbrowser-bot[bot]', "github.actor != 'powerbrowser-bot[bot]'"],
        ['dependabot[bot]', "github.actor != 'dependabot[bot]'"],
    ],
    'workflow_run': [
        ['head_repository', 'github.event.workflow_run.head_repository.full_name == github.repository'],
        ['claude-fix/', "!startsWith(github.event.workflow_run.head_branch, 'claude-fix/')"],
        ['powerbrowser-bot[bot]', "github.actor != 'powerbrowser-bot[bot]'"],
        ['dependabot[bot]', "github.actor != 'dependabot[bot]'"],
    ],
};
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
const PATTERN = /^([^/@]+\/[^/@]+)@(\*|[0-9a-f]{40})$/;
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
    // owner/repo -> admitted refs: '*' or 40-hex commits.
    const admitted = new Map();
    for (const p of selected.patterns_allowed ?? []) {
        const m = typeof p === 'string' ? p.match(PATTERN) : null;
        if (m) admitted.set(m[1], (admitted.get(m[1]) ?? new Set()).add(m[2]));
        else fail(SELECTED_REL, WF_LEVEL, 'uses-admitted', `patterns_allowed entry ${JSON.stringify(p)} is not of the form owner/repo@* or owner/repo@<40-hex commit>. Next step: admit the action by owner/repo@* or by its full commit SHA.`);
    }
    // IN-02 (Phase 53 ruling): claude-code-action is admitted at the fixer pin only, never by star.
    {
        const [repo, sha] = FIX_PIN.split('@');
        const refs = admitted.get(repo);
        if (refs && (refs.size !== 1 || !refs.has(sha))) {
            fail(SELECTED_REL, WF_LEVEL, 'uses-admitted', `admits ${[...refs].map(r => `'${repo}@${r}'`).join(', ')}, but the claude-code-action admission is exactly '${FIX_PIN}'. Next step: replace the entry with '${FIX_PIN}' and re-apply.`);
        }
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
                const refs = admitted.get(repo);
                if (!refs) {
                    fail(rel, jobId, 'uses-admitted', `${where} uses '${v}', and ${SELECTED_REL} admits no '${repo}@*'. Next step: add '${repo}@*' to patterns_allowed and re-apply, or drop the action.`);
                } else if (!refs.has('*') && !refs.has(m[4])) {
                    fail(rel, jobId, 'uses-admitted', `${where} uses '${v}', and ${SELECTED_REL} admits ${repo} only at ${[...refs].join(', ')}. Next step: pin the step to the admitted commit, or admit this commit in the same commit and re-apply.`);
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
        if (ev.has('workflow_call')) {
            for (const [jobId, job] of Object.entries(wf.jobs)) {
                const gates = [['job', job?.if], ...(Array.isArray(job?.steps) ? job.steps.map((st, i) => [`step ${i}`, st?.if]) : [])];
                for (const [where, expr] of gates) {
                    if (typeof expr === 'string' && /github\.event_name/.test(expr)) {
                        fail(rel, jobId, 'call-event-gate', `has an if on its ${where} that reads github.event_name, but this workflow is called, so the context is the caller's event. Next step: gate on a boolean workflow_call input such as inputs.live.`);
                    }
                }
            }
        }
        // IN-02 (re-review): the fix budget is counted from the display title, per key, class and fingerprint, so the title must be exactly
        // that, and the derive job must read the earlier runs through the checked reader (a cut-off list is a refusal, IN-01).
        if (file === FIXER_FILE && wf.jobs?.derive !== undefined) {
            const rn = String(wf['run-name'] ?? '');
            if (!rn.includes("format('fix {0} {1} attempt {2} {3}', inputs.release-key, inputs.class, inputs.attempt, inputs.fingerprint)")) {
                fail(rel, WF_LEVEL, 'fixer-spend', `run-name does not title a fix run \`fix <release-key> <class> attempt <n> <fingerprint>\`, so the attempt count (fixAttempts) cannot find the earlier runs of one key, class and fingerprint. Next step: restore the run-name format.`);
            }
            const derive = wf.jobs?.derive;
            const readsRuns = (derive?.steps ?? []).some(x => typeof x.run === 'string' && /release-train\.mjs\s+--run-titles\b/.test(x.run));
            if (!readsRuns) fail(rel, 'derive', 'fixer-spend', `the derive job does not read the earlier runs through scripts/release-train.mjs --run-titles, so a run list cut off at the API's 1000-result window could silently reset the attempt budget. Next step: read them with --run-titles.`);
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
                            if (/^Bash\(.*\*/.test(e) && !/^Bash\(\s*:?\*+\s*\)$/.test(e)) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${e}, a wildcard shell grant; a git wildcard lets the model rewrite work/.git and run git with free arguments. Next step: name one exact command with no free arguments.`);
                            // WR-02: Read reaches /proc/self/environ (the job's id-token request token), ~/.claude* and the checkout's
                            // .git/config. Every grant is confined to the two trees the model reads (IN-04: not upstream/, which a patch can plant symlinks in).
                            const rd = e.match(/^Read(?:\((.*)\))?$/);
                            if (rd) {
                                const g = (rd[1] ?? '').trim();
                                if (g === '') fail(rel, jobId, 'fixer-tools', `--allowedTools grants bare ${e}, which reaches the whole filesystem (/proc/self/environ, the home directory, .git/config). Next step: scope it, for example Read(work/**).`);
                                else if (!['work/', 'fixer-data/'].some(pre => g.startsWith(pre)) || g.includes('..')) fail(rel, jobId, 'fixer-tools', `--allowedTools grants Read(${g}), which is not confined to work/ or fixer-data/ (upstream/ carries symlinks the target's patches can create, IN-04). Next step: scope it to one of those.`);
                                continue;
                            }
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
                            for (const guarded of ['work/.git/**', 'work/**/.gitattributes']) {
                                if (!denied.includes(`${t}(${guarded})`)) fail(rel, jobId, 'fixer-tools', `--allowedTools grants ${t}(work/**), which reaches ${guarded}: a planted git config or attributes file runs or changes git on the next command, and --disallowedTools does not deny ${t}(${guarded}). Next step: add that deny entry.`);
                            }
                        }
                    }
                    for (const d of ['Read(//proc/**)', 'Read(~/**)', 'Read(.git/**)', 'Read(upstream/**)']) {
                        if (!denied.includes(d)) fail(rel, jobId, 'fixer-tools', `--disallowedTools does not deny ${d}, so the model can read the process environment, the home directory, the checkout's git config or the upstream tree (IN-04: the target's patches can plant a symlink there). Next step: add ${d} to --disallowedTools.`);
                    }
                    for (const t of ['WebFetch', 'WebSearch']) {
                        if (!denied.includes(t)) fail(rel, jobId, 'fixer-prompt', `--disallowedTools does not deny ${t}, so the model can reach the open web with repository text. Next step: add ${t} to --disallowedTools.`);
                    }
                    if (w.allowed_bots !== FIX_BOTS) fail(rel, jobId, 'fixer-prompt', `allowed_bots is '${w.allowed_bots ?? '(absent)'}', not the explicit list '${FIX_BOTS}'. A wildcard lets any bot steer the model. Next step: set allowed_bots to that list.`);
                }
                // FIX-05: one attempt is time-bounded, and attempts for every release key share one serialized group.
                if (job['timeout-minutes'] !== 90) fail(rel, jobId, 'fixer-spend', `timeout-minutes is ${JSON.stringify(job['timeout-minutes']) ?? '(absent)'}, not 90, so one attempt is not time-bounded. Next step: set timeout-minutes: 90 on the fix job.`);
                const concurrency = job.concurrency !== null && typeof job.concurrency === 'object' ? job.concurrency.group : job.concurrency;
                if (concurrency !== 'claude-fixer') fail(rel, jobId, 'fixer-spend', `concurrency is ${JSON.stringify(concurrency) ?? '(absent)'}, not the claude-fixer group, so fixer attempts are not serialized. Next step: set concurrency: claude-fixer on the fix job.`);
                const cond = ifTerms(job);
                if (cond.or) fail(rel, jobId, 'fixer-prompt', `if: has a top-level ||, so the fixer can start with a guard false (for example always() || (...)). Next step: join the guards with && only.`);
                const rawIf = String(job.if ?? '').replace(/\$\{\{|\}\}/g, ' ').replace(/\s+/g, ' ').trim();
                const form = rawIf.includes("github.event_name == 'workflow_dispatch'") ? 'workflow_dispatch' : 'workflow_run';
                for (const [kw, lit] of FIX_GUARD_FORMS[form]) {
                    if (!cond.terms.includes(lit)) fail(rel, jobId, 'fixer-prompt', `if: lacks the ${kw} guard (${lit}) as a top-level && term of the ${form} form, so a fork, a fixer head, the bot actor or Dependabot could start the fixer. Next step: add it to the job's if: joined with &&.`);
                }
            }

            // FIX-12 (fixer-auth): the Anthropic credential path. Workload identity federation is the
            // path: id-token write on the fix job only, with the federation rule and organization ids.
            if (fixer && jobId === 'fix') {
                if (eff['id-token'] !== 'write') fail(rel, jobId, 'fixer-auth', `has no effective id-token: write, so workload identity federation cannot mint the Claude credential. Next step: grant id-token: write on the fix job.`);
                for (const s of claude) {
                    for (const k of ['anthropic_federation_rule_id', 'anthropic_organization_id']) {
                        if (!(s.with !== null && typeof s.with === 'object' && Object.hasOwn(s.with, k))) fail(rel, jobId, 'fixer-auth', `the Claude step has no with.${k}, so federation has no rule to exchange under. Next step: set ${k} from its repository variable.`);
                    }
                }
            }
            if (fixer && (jobId === 'fix-gate' || jobId === 'fix-pr') && eff['id-token'] === 'write') {
                fail(rel, jobId, 'fixer-auth', `holds effective id-token: write, so a job with no model and no environment could mint a credential. Next step: remove id-token from ${jobId}; only the fix job holds it.`);
            }
            // fixer-gate: the gate job runs the model's code and holds nothing; fix-pr is the one minter and publishes
            // only the bytes the gate judged. Each term below is one fact a plant removes.
            if (fixer) {
                const gf = (msg) => fail(rel, jobId, 'fixer-gate', msg);
                const uses = (prefix) => steps.filter(x => typeof x.uses === 'string' && x.uses.startsWith(prefix));
                const exprOf = (v) => String(v ?? '').replace(/\s+/g, '');
                for (const d of uses('actions/download-artifact@')) {
                    const w = d.with ?? {};
                    if (w['github-token'] !== undefined) gf(`a download-artifact step passes github-token, which can reach another run's or repository's artifacts. Next step: remove it; the default token reads this run's artifacts.`);
                    if (w['run-id'] !== undefined && exprOf(w['run-id']) !== '${{github.run_id}}') gf(`a download-artifact step names run-id ${JSON.stringify(w['run-id'])}, not this run (\${{ github.run_id }}), so it could take another run's artifact. Next step: remove run-id.`);
                }
                const runText = (x) => (typeof x.run === 'string' ? x.run : '');
                // WR-07 (re-review): fix and fix-gate hold a 5.6 GB upstream tree plus its copies on a hosted runner, so each frees the same disk
                // space rebase-upstream.yml frees, before the step that fetches upstream. The expected text is read from that workflow, not kept here.
                if (jobId === 'fix' || jobId === 'fix-gate') {
                    const refStep = Object.values(docs['rebase-upstream.yml']?.jobs ?? {}).flatMap(j => j?.steps ?? []).find(x => x?.name === 'Free disk space');
                    const refRun = typeof refStep?.run === 'string' ? refStep.run.trim() : null;
                    if (refRun === null) gf(`rebase-upstream.yml has no 'Free disk space' step to compare against, so the fixer's disk step cannot be checked. Next step: restore it.`);
                    else {
                        const freeAt = steps.findIndex(x => typeof x.run === 'string' && x.run.trim() === refRun);
                        const fetchAt = steps.findIndex(x => /fetch-upstream\.sh|fixer-prepare\.sh\s+--tag=/.test(runText(x)));
                        if (freeAt < 0) gf(`has no step that frees disk space exactly as rebase-upstream.yml's 'Free disk space' step does, so the fetch of the 5.6 GB upstream tree can fill a hosted runner's disk. Next step: add that step before the fetch.`);
                        else if (fetchAt >= 0 && freeAt > fetchAt) gf(`frees disk space only after the step that fetches upstream, which is too late to help it. Next step: move the 'Free disk space' step before the fetch.`);
                    }
                }
                // WR-01 (re-review): "Re-run failed jobs" re-runs the failed fixer job with github.run_attempt 2 but keeps the derive job's
                // result, so the derive job's own run_attempt refusal never sees it and each click would buy another model run the attempt
                // count does not see. Every fixer job therefore refuses a run_attempt other than 1 itself.
                if (!ifTerms(job).terms.includes('github.run_attempt == 1')) gf(`if: lacks the github.run_attempt == 1 term as a top-level && term, so "Re-run failed jobs" can start this job again (run_attempt 2 with derive's result kept) and spend model budget or publish with no attempt count. Next step: add github.run_attempt == 1 to the job's if: joined with &&.`);
                if (jobId === 'fix') {
                    // WR-02: no credential on disk for the model to read: every checkout drops the token from .git/config.
                    for (const c of uses('actions/checkout@')) {
                        if ((c.with ?? {})['persist-credentials'] !== false) gf(`a checkout step does not set persist-credentials: false, so the job token stays in .git/config where the model's Read could reach it. Next step: set it.`);
                    }
                    // WR-05, WR-07: the log is chosen by the fingerprint's commit, and its fence carries a nonce the prompt names.
                    for (const x of steps) {
                        for (const m of runText(x).matchAll(/gh\s+run\s+list\b[^\n]*/g)) {
                            if (!/--commit\b/.test(m[0])) gf(`selects a failing run with \`${m[0].trim().slice(0, 80)}\` and no --commit, so the newest failure on a branch (possibly the fixer's own earlier run) can stand in for the one the fingerprint names. Next step: select by --commit "$BASE".`);
                        }
                    }
                    for (const c of claude) {
                        if (!/\$\{\{\s*steps\.[\w-]+\.outputs\.nonce\s*\}\}/.test(String(c.with?.prompt ?? ''))) gf(`the Claude prompt does not name the per-run nonce of the failing-log fence (steps.<id>.outputs.nonce), so the log can forge the fence markers. Next step: put the nonce in the prompt and in the fence lines.`);
                    }
                    if (!steps.some(x => /\$NONCE\b/.test(runText(x)) && /\/dev\/urandom|openssl\s+rand/.test(runText(x)))) gf(`no step builds the failing-log fence from a random nonce. Next step: generate a nonce from /dev/urandom and put it in both fence lines.`);
                    for (const o of ['diff-sha256', 'base-sha']) {
                        if (!/^\$\{\{\s*steps\.[\w-]+\.outputs\.[\w-]+\s*\}\}$/.test(String(job.outputs?.[o] ?? ''))) gf(`has no job output ${o} taken from a step, so the later jobs cannot bind the diff to what this job produced. Next step: export ${o} from a step that runs after or without the model.`);
                    }
                    // WR-06 (re-review): each output comes from the step that does the work, not from any step that has an output of that
                    // name. diff-sha256: a step that hashes work.diff and runs after the emit step; base-sha: a step that reads the prep's
                    // base-sha and runs after the prep and before the model. A rebinding to an earlier or unrelated step passes the shape test above.
                    const at = (re) => steps.findIndex(x => re.test(runText(x)));
                    const claudeAt = steps.findIndex(x => typeof x.uses === 'string' && x.uses.startsWith(`${CLAUDE_ACTION}@`));
                    const outStep = (o) => {
                        const m = /^\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+)\s*\}\}$/.exec(String(job.outputs?.[o] ?? ''));
                        return m === null ? null : { id: m[1], name: m[2], idx: steps.findIndex(x => x.id === m[1]) };
                    };
                    const dg = outStep('diff-sha256');
                    const emitAt = at(/fixer-prepare\.sh\s+--emit-diff/);
                    if (dg !== null && (dg.name !== 'diff-sha256' || dg.idx < 0 || !/sha256sum[^\n]*work\.diff/.test(runText(steps[dg.idx])) || emitAt < 0 || dg.idx <= emitAt)) {
                        gf(`its diff-sha256 output is taken from step ${JSON.stringify(dg.id)}, which is not a step that runs sha256sum on work.diff after the emit step (fixer-prepare.sh --emit-diff), so the digest the later jobs bind to may not describe the emitted diff. Next step: export it from the step that hashes the emitted diff.`);
                    }
                    const bs = outStep('base-sha');
                    const prepAt = at(/fixer-prepare\.sh\s+--tag=/);
                    if (bs !== null && (bs.name !== 'base-sha' || bs.idx < 0 || !/fixer-state\/base-sha/.test(runText(steps[bs.idx])) || prepAt < 0 || bs.idx <= prepAt || (claudeAt >= 0 && bs.idx >= claudeAt))) {
                        gf(`its base-sha output is taken from step ${JSON.stringify(bs.id)}, which is not a step that reads the prep's base-sha after the prep and before the model runs, so the base the gate and fix-pr check out may not be the commit the model started from. Next step: export it from the step that reads fixer-state/base-sha.`);
                    }
                }
                if (jobId === 'fix-gate') {
                    if (job.environment !== undefined) gf(`has environment ${JSON.stringify(job.environment)}; the gate runs the model's code and may hold no environment or its secrets. Next step: remove the environment key.`);
                    if (JSON.stringify(job).includes('secrets.')) gf(`references a secrets. value; the gate runs the model's code and may hold no secret. Next step: remove it.`);
                    const extra = Object.entries(eff).filter(([k, v]) => !(k === 'contents' && v === 'read') && v !== 'none');
                    if (eff.contents !== 'read' || extra.length > 0) gf(`holds permissions ${JSON.stringify(Object.fromEntries(extra.length > 0 || eff.contents !== 'read' ? [...extra, ['contents', eff.contents]] : []))}; the gate may hold exactly contents: read. Next step: set permissions to contents: read only.`);
                    if (uses(APP_TOKEN).length > 0) gf(`mints an App token; the gate runs the model's code. Next step: remove the actions/create-github-app-token step.`);
                    for (const c of uses('actions/checkout@')) {
                        if ((c.with ?? {})['persist-credentials'] !== false) gf(`a checkout step does not set persist-credentials: false, so the token stays in .git/config beside the model's code. Next step: set it.`);
                    }
                    for (const x of steps) {
                        for (const m of runText(x).matchAll(/\b(yarn\s+install|npm\s+(?:ci|install|i))\b[^\n'"]*/g)) {
                            if (!m[0].includes('--ignore-scripts')) gf(`runs \`${m[0].trim()}\` without --ignore-scripts, so a dependency's install script runs beside the model's code. Next step: add --ignore-scripts.`);
                        }
                    }
                    const gateRuns = steps.filter(x => /verify-fix-gate\.mjs\s+--diff/.test(runText(x)));
                    if (gateRuns.length === 0) gf(`has no step that runs verify-fix-gate.mjs --diff. Next step: restore the gate step.`);
                    for (const x of gateRuns) {
                        const t = runText(x);
                        if (!/fixer-isolate\.sh\s+--\s+node\s+scripts\/verify-fix-gate\.mjs/.test(t)) gf(`runs the gate outside scripts/fixer-isolate.sh, so the diff's code has the network and sudo. Next step: run it as: bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs ...`);
                        if (!/--ref="?\$BASE_SHA"?/.test(t) || exprOf(x.env?.BASE_SHA) !== '${{needs.fix.outputs.base-sha}}') gf(`does not gate against the fix job's base-sha (--ref="$BASE_SHA" with BASE_SHA from needs.fix.outputs.base-sha), so the target could have moved between the fix and the gate. Next step: gate that exact commit.`);
                        if (!/sha256sum/.test(t) || exprOf(x.env?.DIFF_SHA256) !== '${{needs.fix.outputs.diff-sha256}}') gf(`does not check the downloaded diff's sha256 against needs.fix.outputs.diff-sha256, so the gate could judge other bytes than the fix job produced. Next step: compare the digests before the gate runs.`);
                    }
                }
                if (jobId === 'fix-pr') {
                    const needs = [].concat(job.needs ?? []).map(String);
                    for (const n of ['fix', 'fix-gate']) if (!needs.includes(n)) gf(`does not need ${n}, so its if: cannot read ${n}'s outputs. Next step: add ${n} to needs.`);
                    const cond = ifTerms(job);
                    if (cond.or) gf(`if: has a top-level ||, so the PR job can run with a guard false. Next step: join the terms with && only.`);
                    for (const t of ["needs.fix-gate.result == 'success'", "needs.fix-gate.outputs.verdict == 'pass'", 'needs.fix-gate.outputs.diff-sha256 == needs.fix.outputs.diff-sha256', 'needs.fix-gate.outputs.base-sha == needs.fix.outputs.base-sha']) {
                        if (!cond.terms.includes(t)) gf(`if: lacks the top-level && term (${t}), so a verdict that names another diff or base, or a gate that did not pass, could publish. Next step: add it.`);
                    }
                    if (claude.length > 0) gf(`runs a claude-code-action step; fix-pr is the App-token minter and reads no model. Next step: remove it.`);
                    const mints = uses(APP_TOKEN);
                    for (const m of mints) {
                        const grants = Object.entries(m.with ?? {}).filter(([k]) => k.startsWith('permission-')).map(([k, v]) => `${k}: ${v}`).sort();
                        if (JSON.stringify(grants) !== JSON.stringify(['permission-contents: write', 'permission-pull-requests: write'])) gf(`mints an App token with ${JSON.stringify(grants)}, not exactly contents and pull-requests write. Next step: grant only those two.`);
                        const id = m.id;
                        const readers = steps.filter(x => x !== m && id !== undefined && JSON.stringify(x).includes(`steps.${id}.outputs.token`));
                        if (id === undefined || readers.length !== 1) gf(`its App token is read by ${readers.length} step(s), not exactly one, so the token is present in more steps than need it. Next step: read steps.${id ?? '<id>'}.outputs.token in the one step that publishes.`);
                    }
                    if (mints.length === 0) gf(`mints no App token, so nothing here is the minter the policy names. Next step: restore the minting step.`);
                    for (const c of uses('actions/checkout@')) {
                        const w = c.with ?? {};
                        if (w['persist-credentials'] !== false || w.token !== undefined) gf(`a checkout step keeps or sets a credential (persist-credentials must be false, no token input). Next step: set persist-credentials: false.`);
                        if (w.path === undefined && w.ref !== 'main') gf(`its root checkout is ref ${JSON.stringify(w.ref ?? '(default)')}, not main, so scripts from the target branch run with the App token. Next step: check out main at the root and the target under a path.`);
                        if (w.path !== undefined && exprOf(w.ref) !== '${{needs.fix.outputs.base-sha}}') gf(`its target checkout is not at the gated base-sha (needs.fix.outputs.base-sha), so it could publish onto a tree nobody gated. Next step: check out that exact commit.`);
                    }
                    // WR-06 (re-review): the bytes verified are the bytes applied and published. One job variable names the path; the step that
                    // hashes it, the step that re-gates it, the step that applies it and the opener all read that variable, and none of them
                    // may swallow a failure (continue-on-error, || true, set +e), because a swallowed re-gate publishes bytes nobody verified.
                    if (exprOf(job.env?.FIX_DIFF) !== '${{runner.temp}}/fix-diff/work.diff') gf(`job env FIX_DIFF is ${JSON.stringify(job.env?.FIX_DIFF ?? '(absent)')}, not \${{ runner.temp }}/fix-diff/work.diff, so the steps that hash, re-gate, apply and render the diff have no one path. Next step: set FIX_DIFF on the job.`);
                    for (const d of uses('actions/download-artifact@')) {
                        if (exprOf(d.with?.path) !== '${{runner.temp}}/fix-diff') gf(`a download-artifact step puts the gated diff at ${JSON.stringify(d.with?.path ?? '(absent)')}, not \${{ runner.temp }}/fix-diff, so FIX_DIFF is not the downloaded file. Next step: download into \${{ runner.temp }}/fix-diff.`);
                    }
                    const swallow = /\|\|\s*(?:true|:|exit\s+0)\b|;\s*true\s*$|\bset\s+\+e\b/m;
                    const stepKinds = [
                        ['re-gates the diff (verify-fix-gate.mjs --static-only)', steps.filter(x => /verify-fix-gate\.mjs\s+--static-only/.test(runText(x))), [[/sha256sum\s+"?\$FIX_DIFF"?(?![\w/.])/, 'hash "$FIX_DIFF"'], [/--static-only\s+--diff="?\$FIX_DIFF"?(?![\w/.])/, '--diff="$FIX_DIFF"']]],
                        ['applies the diff (apply --index)', steps.filter(x => /\bapply\s+--index\b/.test(runText(x))), [[/\bapply\s+--index\s+"?\$FIX_DIFF"?(?![\w/.])/, 'apply --index "$FIX_DIFF"']]],
                        ['renders the PR (fix-open-pr.mjs --open)', steps.filter(x => /fix-open-pr\.mjs\s+--open/.test(runText(x))), [[/--diff="?\$FIX_DIFF"?(?![\w/.])/, '--diff="$FIX_DIFF"']]],
                    ];
                    for (const [what, found, needs2] of stepKinds) {
                        if (found.length !== 1) gf(`has ${found.length} step(s) that ${what}, not exactly one. Next step: restore the step.`);
                        for (const x of found) {
                            const t = runText(x);
                            if (x['continue-on-error'] !== undefined && x['continue-on-error'] !== false) gf(`the step that ${what} sets continue-on-error: ${JSON.stringify(x['continue-on-error'])}, so a failure there no longer stops the job and bytes nobody verified can be published. Next step: remove it.`);
                            if (swallow.test(t)) gf(`the step that ${what} swallows a failure (\`|| true\`, \`|| :\`, \`|| exit 0\`, \`; true\` or \`set +e\`), so a failed check no longer stops the job. Next step: let the failure fail the step.`);
                            for (const [re, label] of needs2) {
                                if (!re.test(t)) gf(`the step that ${what} does not use ${label}, the path the diff was hashed at, so the bytes it works on may not be the verified bytes. Next step: use "$FIX_DIFF".`);
                            }
                            if (/work\.diff/.test(t)) gf(`the step that ${what} names a work.diff path directly instead of "$FIX_DIFF". Next step: use the one job variable.`);
                        }
                    }
                    // IN-03: the apply step's git helper reads no system or global config and no attributes file, as fixer-prepare.sh does.
                    for (const x of steps.filter(y => /\bapply\s+--index\b/.test(runText(y)))) {
                        for (const frag of ['GIT_CONFIG_NOSYSTEM=1', 'GIT_CONFIG_GLOBAL=/dev/null', 'core.attributesFile=/dev/null', 'core.hooksPath=/dev/null', 'core.fsmonitor=false']) {
                            if (!runText(x).includes(frag)) gf(`the git helper of the step that applies the diff lacks ${frag}, so a system or global git config, a filter driver or a hook of the checked-out tree can change what apply and commit store. Next step: add it to the helper.`);
                        }
                    }
                    if (!steps.some(x => /verify-fix-gate\.mjs\s+--static-only/.test(runText(x)) && /sha256sum/.test(runText(x)) && exprOf(x.env?.DIFF_SHA256) === '${{needs.fix.outputs.diff-sha256}}')) gf(`does not check the downloaded diff against needs.fix.outputs.diff-sha256 and re-run verify-fix-gate.mjs --static-only on it before publishing. Next step: add that step.`);
                }
            }

            // The fallback key (the owner's choice at the 52-05 checkpoint) is confined to the fixer environment.
            // Scoped to release-train.yml: triage.yml's key lives in its own triage environment (Phase 53).
            if (file === FIXER_FILE && (/secrets\.ANTHROPIC_API_KEY\b/.test(JSON.stringify(job)) || /secrets\.ANTHROPIC_API_KEY\b/.test(JSON.stringify(wf.env ?? {})))) {
                const envName = typeof job.environment === 'string' ? job.environment : job.environment?.name;
                if (envName !== 'fixer') fail(rel, jobId, 'fixer-auth', `references secrets.ANTHROPIC_API_KEY in a job whose environment is ${JSON.stringify(envName ?? '(none)')}, not fixer, so the fallback key is reachable outside the fixer environment. Next step: move the reference into the fixer environment or drop it.`);
            }

            // permissions
            if (eff.issues === 'write' && !((file === 'release-train.yml' && jobId === 'report') || (file === 'triage.yml' && jobId === 'apply'))) {
                fail(rel, jobId, 'issues-write', `has effective issues write, admitted only on release-train.yml job report and on triage.yml job apply. Next step: drop issues write from the job or workflow permissions.`);
            }
            // The App token is a permission grant too: permission-issues: write mints an issues-write token, and a token
            // step with no permission-* input at all inherits every permission of the App, issues write included (WR-06).
            if (!((file === 'release-train.yml' && jobId === 'report') || (file === 'triage.yml' && jobId === 'apply'))) {
                for (const s of steps.filter(x => typeof x.uses === 'string' && x.uses.startsWith(APP_TOKEN))) {
                    const grants = Object.entries(s.with ?? {}).filter(([k]) => k.startsWith('permission-'));
                    if (grants.some(([k, v]) => k === 'permission-issues' && String(v) === 'write')) fail(rel, jobId, 'issues-write', `mints an App token with permission-issues: write, admitted only on release-train.yml job report and on triage.yml job apply. Next step: drop permission-issues from the token step.`);
                    if (grants.length === 0) fail(rel, jobId, 'issues-write', `mints an App token with no permission-* input, so it inherits every permission of the App, issues write included. Next step: list the permission-* inputs the job needs.`);
                }
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

    for (const repo of [...admitted.keys()].sort()) {
        if (!used.has(repo)) fail(SELECTED_REL, WF_LEVEL, 'admission-used', `patterns_allowed admits '${repo}@*', which no workflow uses. Next step: remove it from ${SELECTED_REL} and re-apply.`);
    }

    // actions/create-github-app-token permission-* inputs (CR-02): the action does not validate input names.
    {
        let rec = overrides.appTokenInputs;
        if (rec === undefined) {
            try { rec = readJson(root, APP_INPUTS_REL); } catch (e) { fail(APP_INPUTS_REL, WF_LEVEL, 'app-token-inputs', `could not be read or parsed (${e.message}), so no permission-* input can be checked. Next step: restore the file.`); rec = { pins: {} }; }
        }
        for (const file of Object.keys(docs)) {
            for (const [jobId, job] of Object.entries(docs[file].jobs)) {
                for (const s of job?.steps ?? []) {
                    const uses = String(s?.uses ?? '');
                    if (!uses.startsWith(APP_TOKEN)) continue;
                    const sha = uses.slice(APP_TOKEN.length).split(/\s/)[0];
                    const requested = Object.keys(s.with ?? {}).filter(k => k.startsWith('permission-'));
                    if (requested.length === 0) continue;
                    const declared = rec?.pins?.[sha]?.permissionInputs;
                    if (!Array.isArray(declared)) {
                        fail(`${WF_DIR}/${file}`, jobId, 'app-token-inputs', `requests ${requested.join(', ')} from ${APP_TOKEN}${sha}, and ${APP_INPUTS_REL} has no entry for that commit. Next step: fetch the action.yml of that commit read-only and record its permission-* input names.`);
                        continue;
                    }
                    for (const k of requested.filter(k => !declared.includes(k))) {
                        fail(`${WF_DIR}/${file}`, jobId, 'app-token-inputs', `passes ${k}, which the pinned create-github-app-token action does not declare, so the token would be minted without that permission. Next step: use a declared name (Dependabot alerts is permission-vulnerability-alerts).`);
                    }
                }
            }
        }
    }

    // renovate-job (AUTO-02, owner answer A4): no hook allow-list; one licensing job regenerates the notices on the Theia branch.
    {
        const failR = (job, msg) => fail(`${WF_DIR}/${DRY_RUN_FILE}`, job, 'renovate-job', msg);
        let cfg = overrides.renovateConfig;
        if (cfg === undefined) {
            try { cfg = readFileSync(join(root, RENOVATE_REL), 'utf8'); } catch { cfg = null; }
        }
        // shortcut: branchPrefix and the theia groupSlug are read by pattern, not a JSON5 parser; the renovate-config row owns the full parse.
        const prefix = typeof cfg === 'string' ? cfg.match(/"branchPrefix"\s*:\s*"([^"]+)"/)?.[1] : undefined;
        const slug = typeof cfg === 'string' ? cfg.match(/"groupName"\s*:\s*"theia"\s*,\s*"groupSlug"\s*:\s*"([^"]+)"/)?.[1] : undefined;
        const branch = prefix && slug ? `${prefix}${slug}` : null;
        const jobs = docs[DRY_RUN_FILE]?.jobs ?? {};
        const runText = job => (job?.steps ?? []).map(st => String(st?.run ?? '')).join('\n');
        const needsOf = job => [job?.needs ?? []].flat().map(String);
        for (const [jobId, job] of Object.entries(jobs)) {
            const steps = (job?.steps ?? []).map((st, i) => [i, st]).filter(([, st]) => String(st?.uses ?? '').split('@')[0] === RENOVATE_ACTION);
            if (steps.length === 0) continue;
            for (const [i, st] of steps) {
                if ((st.env ?? {}).RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS !== undefined || (job.env ?? {}).RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS !== undefined) {
                    failR(jobId, `step ${i} sets RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS, which re-admits a post-upgrade hook that cannot run in Renovate's container clone (BLOCKED.md item 18). Next step: remove it; the licensing job regenerates the notices.`);
                }
                // Platform commits (Renovate's auto default under an App token) are authored by the App and ignore the git author.
                if ((st.env ?? {}).RENOVATE_PLATFORM_COMMIT !== 'disabled') {
                    failR(jobId, `step ${i} sets RENOVATE_PLATFORM_COMMIT to ${JSON.stringify((st.env ?? {}).RENOVATE_PLATFORM_COMMIT)}, not disabled, so Renovate commits as the App, not the bot address, and publish-bump-branch.sh refuses the Theia branch. Next step: set RENOVATE_PLATFORM_COMMIT: disabled.`);
                }
                if (typeof cfg === 'string' && /"platformCommit"\s*:\s*"(?!disabled")/.test(cfg)) {
                    failR(jobId, `${RENOVATE_REL} sets platformCommit to a value other than disabled, which overrides the step env, so Renovate commits as the App. Next step: remove the key or set it to disabled.`);
                }
            }
            // The generator as a command line of its own, in the theia shell (python3 for the Gecko preprocessor); a mention in a message does not count.
            const lic = Object.entries(jobs).filter(([, k]) => needsOf(k).includes(jobId) && /^\s*nix develop \.#theia --command node scripts\/generate-licensing\.mjs\s*$/m.test(runText(k)));
            if (lic.length !== 1) { failR(jobId, `runs Renovate, and ${lic.length} jobs that need it run nix develop .#theia --command node scripts/generate-licensing.mjs, not exactly one, so the Theia PR's notices are ${lic.length === 0 ? 'never regenerated' : 'regenerated twice'}. Next step: keep one licensing job after ${jobId}.`); continue; }
            const [kId, k] = lic[0];
            if (k['continue-on-error'] !== true) failR(kId, `does not set continue-on-error: true, so a failed regeneration fails the run and sweep-clock, which reads successful runs only, loses the previous sweep. Next step: set it.`);
            if (!(k.permissions && typeof k.permissions === 'object' && Object.keys(k.permissions).length === 0)) failR(kId, `has permissions ${JSON.stringify(k.permissions)}, not {}; it runs the branch's dependency install and needs no GitHub credential. Next step: set permissions: {}.`);
            if (branch === null) failR(kId, `its branch cannot be derived: no branchPrefix or theia groupSlug could be read from ${RENOVATE_REL}. Next step: restore the file.`);
            else if (k.env?.BRANCH !== branch) failR(kId, `job env BRANCH is ${JSON.stringify(k.env?.BRANCH)}, not ${JSON.stringify(branch)} (branchPrefix plus the theia groupSlug in ${RENOVATE_REL}), so it regenerates a branch Renovate does not write. Next step: set BRANCH: ${branch}.`);
            // The generate job installs from branch-controlled data, so it holds no credential at all (plan 51-09).
            const isToken = st => String(st?.uses ?? '').split('@')[0] === APP_TOKEN.replace(/@$/, '');
            const kJson = JSON.stringify(k);
            if ((k.steps ?? []).some(isToken) || k.environment !== undefined || /\bsecrets\.|\bgithub\.token\b|GITHUB_TOKEN/.test(kJson)) {
                failR(kId, `mints or receives a token or secret (an App token step, an environment, or a secrets., github.token or GITHUB_TOKEN reference), but it installs and generates from the branch's files. Next step: keep every credential in the publish job.`);
            }
            const checkouts = (k.steps ?? []).filter(st => String(st?.uses ?? '').split('@')[0] === 'actions/checkout');
            if (checkouts.some(st => st.with?.['persist-credentials'] !== false)) failR(kId, `checks out with credentials persisted. Next step: set persist-credentials: false.`);
            const text = runText(k);
            for (const [need, why] of [
                ['scripts/fetch-upstream.sh', 'fetch upstream/'],
                ['scripts/apply-patches.sh', 'apply the patch stack to upstream/'],
                ['yarn install --ignore-scripts --frozen-lockfile', 'install theia/ from the branch lockfile without lifecycle scripts'],
                ['git checkout "$HEAD_SHA" -- \':(glob)theia/**/package.json\' theia/yarn.lock configuration.toml', 'take only the data files from the branch head, every workspace manifest Renovate bumps included'],
                ['grep -vE \'^[-+] *"@theia/[a-z0-9-]+": "[0-9A-Za-z.+-]+",?$\'', 'refuse a package.json change other than an @theia/* version string'],
            ]) {
                if (!text.includes(need)) failR(kId, `no run step contains ${JSON.stringify(need)}, so it does not ${why}. Next step: restore that step.`);
            }
            // A checkout input naming another ref or repository, a ref checkout (no " -- " pathspec), or any other HEAD move
            // would put the branch's scripts in the workspace. Both jobs must stay on the run's own ref.
            const refInputs = (jobId2, job2) => {
                const bad = (job2.steps ?? []).filter(st => String(st?.uses ?? '').split('@')[0] === 'actions/checkout' && (st.with?.ref !== undefined || st.with?.repository !== undefined));
                if (bad.length > 0) failR(jobId2, `has an actions/checkout step that sets ref or repository, so the workspace is not the run's trusted ref. Next step: drop the input; take branch data with git checkout "$HEAD_SHA" -- <paths>.`);
            };
            const MOVE = /\b(?:git|T)\b[^;&|]*?\s(switch|reset|read-tree|pull|merge|rebase|cherry-pick|stash|worktree|checkout|restore)(?![\w-])/;
            refInputs(kId, k);
            const refMoves = text.split('\n').filter(l => { const m = l.match(MOVE); return m && !((m[1] === 'checkout') && /\s--\s/.test(l)); });
            if (refMoves.length > 0) failR(kId, `moves the workspace to a branch ref (${refMoves.map(l => l.trim()).join('; ')}), so the scripts it then runs come from the branch. Next step: check out only the data files with git checkout "$HEAD_SHA" -- <paths>.`);
            const uploads = (k.steps ?? []).filter(st => String(st?.uses ?? '').split('@')[0] === 'actions/upload-artifact');
            const upPaths = uploads.flatMap(st => String(st.with?.path ?? '').split('\n').map(x => x.trim()).filter(Boolean).map(x => x.split('/').pop())).sort();
            if (uploads.length !== 1 || JSON.stringify(upPaths) !== JSON.stringify(['LICENSING.md', 'THIRD-PARTY-NOTICES.txt'])) failR(kId, `uploads [${upPaths.join(', ')}] in ${uploads.length} artifact step(s), not exactly LICENSING.md and THIRD-PARTY-NOTICES.txt in one. Next step: upload the two notice files only.`);
            if (!/steps\.\w+\.outputs\.head\b/.test(String(k.outputs?.head ?? ''))) failR(kId, `exports no head output, so the publish job cannot pin the branch head the notices were generated from. Next step: add outputs.head.`);

            // The publish job: the only holder of the App token, and it runs nothing from the branch tree.
            const pub = Object.entries(jobs).filter(([, p]) => needsOf(p).includes(kId) && (p.steps ?? []).some(isToken));
            if (pub.length !== 1) { failR(kId, `${pub.length} jobs that need it mint an App token, not exactly one, so the notices are ${pub.length === 0 ? 'never published' : 'published twice'}. Next step: keep one publish job after ${kId}.`); continue; }
            const [pId, p] = pub[0];
            if (p['continue-on-error'] !== true) failR(pId, `does not set continue-on-error: true, so a refused publish fails the run and sweep-clock, which reads successful runs only, loses the previous sweep. Next step: set it.`);
            if (!(p.permissions && typeof p.permissions === 'object' && Object.keys(p.permissions).length === 0)) failR(pId, `has permissions ${JSON.stringify(p.permissions)}, not {}; the App token is its only credential. Next step: set permissions: {}.`);
            if (branch !== null && p.env?.BRANCH !== branch) failR(pId, `job env BRANCH is ${JSON.stringify(p.env?.BRANCH)}, not ${JSON.stringify(branch)}. Next step: set BRANCH: ${branch}.`);
            const ptokens = (p.steps ?? []).filter(isToken);
            const perms = ptokens.flatMap(st => Object.entries(st.with ?? {}).filter(([n]) => n.startsWith('permission-')).map(([n, v]) => `${n}: ${v}`));
            if (ptokens.length !== 1 || perms.length !== 1 || perms[0] !== 'permission-contents: write') failR(pId, `mints ${ptokens.length} App token(s) with [${perms.join(', ')}], not one with permission-contents: write only; the PR already exists, so no other permission is needed. Next step: request contents write only.`);
            if ((p.steps ?? []).filter(st => String(st?.uses ?? '').split('@')[0] === 'actions/checkout').some(st => st.with?.['persist-credentials'] !== false)) failR(pId, `checks out with credentials persisted. Next step: set persist-credentials: false.`);
            refInputs(pId, p);
            const ptext = runText(p);
            // Only the pinned worktree may be added; any other HEAD or index move (even a pathspec checkout) could replace a trusted script with the branch's.
            const pMoves = ptext.split('\n').filter(l => MOVE.test(l) && !/^\s*T worktree add --detach target "\$HEAD_SHA"\s*$/.test(l));
            if (pMoves.length > 0) failR(pId, `moves HEAD, the index or the workspace (${pMoves.map(l => l.trim()).join('; ')}), so a branch file may stand where a trusted one was. Next step: keep only T worktree add --detach target "$HEAD_SHA".`);
            const runSteps = (p.steps ?? []).filter(st => typeof st?.run === 'string');
            if (runSteps.some(st => !/^\s*unset NODE_OPTIONS\s*$/m.test(st.run))) failR(pId, `has a run step that does not unset NODE_OPTIONS, so a preload set for the runner reaches node in the step that holds the token. Next step: add unset NODE_OPTIONS to every run step.`);
            // Every command word is scanned: an interpreter or build tool (., source, yarn, npx, make, env...) runs only as
            // bash "$GITHUB_WORKSPACE/scripts/<name>", and a command word that is a path must be that same trusted form, so
            // nothing under target/ (or a relative path that resolves into it) executes with the App token.
            const CMD = /(?:^|[;&|(!`]|\{\s|\$\(|\b(?:then|do|else|if|while|until)\s)\s*(?:\w+=(?:"[^"]*"|'[^']*'|\S*)\s+)*("[^"]*"|'[^']*'|[^\s;&|()]+)(?:\s+("[^"]*"|'[^']*'|[^\s;&|()]+))?/g;
            const TRUSTED = /^"\$GITHUB_WORKSPACE\/scripts\/[\w.-]+"$/;
            const INTERP = /^(?:bash|sh|dash|zsh|ksh|node|python3?|perl|ruby|source|\.|yarn|npm|npx|pnpm|corepack|make|env|exec|eval|xargs|nix|command|builtin)$/;
            const badCmd = l => /\$\{?GITHUB_WORKSPACE\}?\/target\b/.test(l) || [...l.matchAll(CMD)].some(([, w, a]) => INTERP.test(w) ? !(/^(?:bash|sh)$/.test(w) && TRUSTED.test(a ?? '')) : w.includes('/') && !TRUSTED.test(w));
            const branchRuns = ptext.split('\n').filter(badCmd);
            if (branchRuns.length > 0) failR(pId, `runs a script path that is not under "$GITHUB_WORKSPACE/" (${branchRuns.map(l => l.trim()).join('; ')}), so it may execute the branch tree with the App token. Next step: invoke the trusted copy as bash "$GITHUB_WORKSPACE/scripts/<name>".`);
            if (p.env?.HEAD_SHA !== `\${{ needs.${kId}.outputs.head }}`) failR(pId, `job env HEAD_SHA is ${JSON.stringify(p.env?.HEAD_SHA)}, not \${{ needs.${kId}.outputs.head }}, so the branch head is not pinned to the one the notices were generated from. Next step: set it.`);
            for (const [need, why] of [
                ['!= "$HEAD_SHA" ]', 'refuse a branch that moved since the notices were generated (head-SHA pin)'],
                ['worktree add --detach target "$HEAD_SHA"', 'check the branch out at exactly the pinned head'],
                ['publish-bump-branch.sh" "$BRANCH" "$BASE" "$HEAD_SHA"', 'publish through the trusted publish-bump-branch.sh pinned to the head SHA'],
                ['GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null', 'run git with no system or global config'],
                ["':(exclude)THIRD-PARTY-NOTICES.txt' ':(exclude)LICENSING.md'", 'refuse a diff outside the two notice files'],
            ]) {
                if (!ptext.includes(need)) failR(pId, `no run step contains ${JSON.stringify(need)}, so it does not ${why}. Next step: restore that step.`);
            }
            const adds = ptext.split('\n').filter(l => /\b(git|T)\b.*\sadd\b/.test(l) && !/\bworktree\s+add\b/.test(l)).map(l => l.replace(/^.*\sadd\s*/, '').trim());
            if (adds.length !== 1 || adds[0] !== '-- THIRD-PARTY-NOTICES.txt LICENSING.md') failR(pId, `stages [${adds.join(' | ')}], not exactly -- THIRD-PARTY-NOTICES.txt LICENSING.md, so more than the two notice files could be committed. Next step: stage the two files only.`);
        }
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
        // The Windows sign job (Phase 54): hosted, OIDC to Azure, so Azure/login's admission is used here too.
        '  sign-windows:',
        '    runs-on: ubuntu-latest',
        '    environment: release',
        '    permissions:',
        '      contents: read',
        '      id-token: write',
        '    steps:',
        `      - uses: Azure/login@${H40}`,
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
    const withClaude = { ...selected, patterns_allowed: [...selected.patterns_allowed, FIX_PIN] };
    // A control that replaces release-train.yml with a fixture drops the renovate-theia job, so its admission is set aside too.
    const noRenovate = sel => ({ ...sel, patterns_allowed: sel.patterns_allowed.filter(p => p !== `${RENOVATE_ACTION}@*`) });
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
    const ALLOWED = 'Bash(scripts/regenerate-patches.sh --upstream upstream --patches work/patches),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read(work/**),Read(fixer-data/**)';
    const DENIED = 'WebFetch,WebSearch,Read(//proc/**),Read(~/**),Read(.git/**),Read(upstream/**),Read(work/.git/**),Edit(work/**/patches/**),Write(work/**/patches/**),Edit(work/.git/**),Write(work/.git/**),Edit(work/**/.gitattributes),Write(work/**/.gitattributes)"';
    const CLAUDE_ARGS = `--max-turns 40 --allowedTools "${ALLOWED}" --disallowedTools "${DENIED}"`;
    const FIX_IF = "github.run_attempt == 1 && github.event_name == 'workflow_dispatch' && inputs.reason == 'fix' && !startsWith(inputs.target-branch, 'claude-fix/') && github.actor != 'powerbrowser-bot[bot]' && github.actor != 'dependabot[bot]'";
    const GATE_IF = "!inputs.dry-run && github.run_attempt == 1 && needs.fix.result == 'success'";
    const PR_IF = "!inputs.dry-run && github.run_attempt == 1 && needs.fix-gate.result == 'success' && needs.fix-gate.outputs.verdict == 'pass' && needs.fix-gate.outputs.diff-sha256 == needs.fix.outputs.diff-sha256 && needs.fix-gate.outputs.base-sha == needs.fix.outputs.base-sha";
    const FREE_RUN = String(Object.values(yaml.load(files['rebase-upstream.yml']).jobs).flatMap(j => j.steps ?? []).find(x => x.name === 'Free disk space')?.run ?? '').trim();
    const FREE_STEP = ['      - name: Free disk space', '        run: |', ...FREE_RUN.split('\n').map(l => `          ${l}`)];
    const GOOD_TRAIN = [
        'name: Release train',
        'on:',
        '  workflow_dispatch:',
        '    inputs:',
        '      reason:',
        '        type: string',
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
        '    outputs:',
        '      diff-sha256: ${{ steps.digest.outputs.diff-sha256 }}',
        '      base-sha: ${{ steps.base.outputs.base-sha }}',
        `    if: "!inputs.dry-run && ${FIX_IF}"`,
        '    steps:',
        `      - uses: ${CHECKOUT}`,
        '        with:',
        '          persist-credentials: false',
        ...FREE_STEP,
        '      - id: log',
        '        run: |',
        '          NONCE=$(head -c 16 /dev/urandom | od -An -tx1)',
        '          echo "fence $NONCE"',
        '          gh run list --workflow verify.yml --commit "$BASE" --status failure',
        '      - run: bash scripts/fixer-prepare.sh --tag="$TARGET_TAG" --state="$RUNNER_TEMP/fixer-state"',
        '      - id: base',
        '        run: |',
        '          BASE=$(cat "$RUNNER_TEMP/fixer-state/base-sha")',
        '          echo "base-sha=$BASE" >> "$GITHUB_OUTPUT"',
        `      - uses: ${FIX_PIN}`,
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          github_token: ${{ secrets.GITHUB_TOKEN }}',
        '          path_to_claude_code_executable: /opt/claude-pinned/claude',
        '          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}',
        '          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}',
        "          allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'",
        '          show_full_output: false',
        '          display_report: false',
        "          prompt: 'Fix release ${{ inputs.release-key }} log ${{ steps.log.outputs.nonce }}'",
        `          claude_args: '${CLAUDE_ARGS}'`,
        '      - run: bash scripts/fixer-prepare.sh --emit-diff --state="$RUNNER_TEMP/fixer-state" --out="$RUNNER_TEMP/work.diff"',
        '      - id: digest',
        '        run: |',
        `          echo "diff-sha256=$(sha256sum "$RUNNER_TEMP/work.diff" | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"`,
        '  fix-gate:',
        '    needs: fix',
        '    runs-on: ubuntu-latest',
        '    permissions:',
        '      contents: read',
        `    if: "${GATE_IF}"`,
        '    steps:',
        '      - run: echo gate',
        `      - uses: ${CHECKOUT}`,
        '        with:',
        '          persist-credentials: false',
        ...FREE_STEP,
        `      - uses: actions/download-artifact@${H40}`,
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          name: fix-diff',
        '          path: /tmp/fix-diff',
        '      - run: cd theia && yarn install --ignore-scripts --frozen-lockfile',
        '      - id: gate',
        '        if: ${{ !inputs.dry-run }}',
        '        env:',
        '          DIFF_SHA256: ${{ needs.fix.outputs.diff-sha256 }}',
        '          BASE_SHA: ${{ needs.fix.outputs.base-sha }}',
        '        run: |',
        '          sha256sum /tmp/fix-diff/work.diff',
        '          bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs --diff=/tmp/fix-diff/work.diff --ref="$BASE_SHA"',
        '  fix-pr:',
        '    needs: [fix, fix-gate]',
        `    if: "${PR_IF}"`,
        '    runs-on: ubuntu-latest',
        '    environment: bot',
        '    permissions: {}',
        '    env:',
        '      FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff',
        '    steps:',
        `      - uses: ${CHECKOUT}`,
        '        with:',
        '          ref: main',
        '          persist-credentials: false',
        `      - uses: ${CHECKOUT}`,
        '        with:',
        '          ref: ${{ needs.fix.outputs.base-sha }}',
        '          path: target',
        '          persist-credentials: false',
        `      - uses: actions/download-artifact@${H40}`,
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          name: fix-diff',
        '          path: ${{ runner.temp }}/fix-diff',
        '      - if: ${{ !inputs.dry-run }}',
        '        env:',
        '          DIFF_SHA256: ${{ needs.fix.outputs.diff-sha256 }}',
        '        run: |',
        '          sha256sum "$FIX_DIFF"',
        '          node scripts/verify-fix-gate.mjs --static-only --diff="$FIX_DIFF"',
        '      - if: ${{ !inputs.dry-run }}',
        '        run: |',
        '          T() { GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -C target -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.attributesFile=/dev/null "$@"; }',
        '          T apply --index "$FIX_DIFF"',
        `      - uses: ${FIX_APP}`,
        '        id: app',
        '        if: ${{ !inputs.dry-run }}',
        '        with:',
        '          permission-contents: write',
        '          permission-pull-requests: write',
        '      - if: ${{ !inputs.dry-run }}',
        '        env:',
        '          GH_TOKEN: ${{ steps.app.outputs.token }}',
        '        run: node scripts/fix-open-pr.mjs --open --diff="$FIX_DIFF"',
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
        // IN-02: commit-form admissions. The claude entry is FIX_PIN; a star or another commit is red, and a commit entry admits no other commit.
        ['claude-code-action admitted by star', { selected: { ...selected, patterns_allowed: selected.patterns_allowed.map(p => p.startsWith('anthropics/claude-code-action@') ? 'anthropics/claude-code-action@*' : p) } }, SELECTED_REL, WF_LEVEL, 'uses-admitted', "'anthropics/claude-code-action@*'"],
        ['claude-code-action admitted by star beside the pin', { selected: { ...selected, patterns_allowed: [...selected.patterns_allowed, 'anthropics/claude-code-action@*'] } }, SELECTED_REL, WF_LEVEL, 'uses-admitted', 'exactly'],
        ['cachix admitted at a commit verify.yml does not use', { selected: { ...selected, patterns_allowed: selected.patterns_allowed.map(p => p === 'cachix/install-nix-action@*' ? `cachix/install-nix-action@${'0'.repeat(40)}` : p) } }, rel(V), 'verify', 'uses-admitted', 'only at'],
        ['patterns_allowed entry with a tag ref', { selected: { ...selected, patterns_allowed: [...selected.patterns_allowed, 'foo/bar@v1'] } }, SELECTED_REL, WF_LEVEL, 'uses-admitted', 'foo/bar@v1'],
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
        ['github.event_name gate on a job of the called channel stage', edit('channel-manifests.yml', "if: ${{ !inputs.live || inputs.dry_run }}", "if: ${{ github.event_name == 'workflow_dispatch' }}"), rel('channel-manifests.yml'), 'dry-run', 'call-event-gate', 'github.event_name'],
        ['github.event_name gate on a step of the called channel stage', edit('channel-manifests.yml', '      - name: Check that the x-checker-data template resolves for the release key\n', "      - name: Check that the x-checker-data template resolves for the release key\n        if: ${{ github.event_name == 'workflow_call' }}\n"), rel('channel-manifests.yml'), 'checker-freshness', 'call-event-gate', 'step '],
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
        ['--allowedTools missing', fixerEdit(` --allowedTools "${ALLOWED}"`, ''), rel(T), 'fix', 'fixer-tools', '--allowedTools'],
        ['--max-turns missing', fixerEdit('--max-turns 40 ', ''), rel(T), 'fix', 'fixer-tools', '--max-turns'],
        ['Edit(patches) granted in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**/patches/**),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(work/**/patches/**)'],
        ['Write(patches) granted in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),Write(work/**/patches/**),Read'), rel(T), 'fix', 'fixer-tools', 'Write(work/**/patches/**)'],
        ['Edit(work/**) granted with no patches deny', fixerEdit(',Edit(work/**/patches/**),Write(work/**/patches/**),Edit(work/.git/**),Write(work/.git/**),Edit(work/**/.gitattributes),Write(work/**/.gitattributes)"', '"'), rel(T), 'fix', 'fixer-tools', 'Edit(work/**/patches/**)'],
        ['WebFetch not denied', fixerEdit('"WebFetch,WebSearch,', '"WebSearch,'), rel(T), 'fix', 'fixer-prompt', 'WebFetch'],
        ['if: without the claude-fix/ head exclusion', fixerEdit(" && !startsWith(inputs.target-branch, 'claude-fix/')", ''), rel(T), 'fix', 'fixer-prompt', 'claude-fix/'],
        ['if: without the bot-actor exclusion', fixerEdit(" && github.actor != 'powerbrowser-bot[bot]'", ''), rel(T), 'fix', 'fixer-prompt', 'powerbrowser-bot[bot]'],
        ['if: without the dependabot actor exclusion', fixerEdit(" && github.actor != 'dependabot[bot]'", ''), rel(T), 'fix', 'fixer-prompt', 'dependabot[bot]'],
        ['allowed_bots star', fixerEdit("allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'", "allowed_bots: '*'"), rel(T), 'fix', 'fixer-prompt', 'allowed_bots'],
        ['event text in the fixer prompt', fixerEdit("prompt: 'Fix release ${{ inputs.release-key }} log ${{ steps.log.outputs.nonce }}'", 'prompt: ${{ github.event.pull_request.body }} ${{ steps.log.outputs.nonce }}'), rel(T), 'fix', 'event-text', 'with.prompt'],
        ['legion runner on fix', fixerEdit('    runs-on: ubuntu-latest\n    environment: fixer', '    runs-on: [self-hosted, legion]\n    environment: fixer'), rel(T), 'fix', 'legion', 'build-* or matrix-*'],
        ['bare self-hosted runner on fix', fixerEdit('    runs-on: ubuntu-latest\n    environment: fixer', '    runs-on: self-hosted\n    environment: fixer'), rel(T), 'fix', 'runner', '"self-hosted"'],
        ['actions/create-github-app-token beside Claude in fix', fixerEdit(`      - uses: ${FIX_PIN}`, `      - uses: ${FIX_APP}\n      - uses: ${FIX_PIN}`), rel(T), 'fix', 'claude-code-action', 'create-github-app-token'],
        ['actions/cache in fix', fixerEdit(`      - uses: ${FIX_PIN}`, `      - uses: actions/cache@${H40}\n      - uses: ${FIX_PIN}`), rel(T), 'fix', 'no-cache', 'actions/cache'],
        ['setup-node with cache: in fix-gate', fixerEdit('    steps:\n      - run: echo gate', `    steps:\n      - uses: actions/setup-node@${H40}\n        with:\n          cache: yarn\n      - run: echo gate`), rel(T), 'fix-gate', 'no-cache', 'cache input'],
        // FIX-08 in triage.yml (WR-07): the pin holds in every workflow, not only release-train.yml.
        ['triage.yml pinned to the claude-code-action tag object', { files: { ...base, 'triage.yml': assist('read', [], 'Label the issue', 'anthropics/claude-code-action@c335fd6d' + '0'.repeat(32)) }, selected: withClaude }, rel('triage.yml'), 'assist', 'fixer-pin', 'db77d4d3'],
        // WR-07: if: guards are parsed, not searched for substrings.
        ['if: always() || (all three guards)', fixerEdit(`    if: "!inputs.dry-run && ${FIX_IF}"`, `    if: "always() || (!inputs.dry-run && ${FIX_IF})"`), rel(T), 'fix', 'fixer-prompt', '||'],
        ['if: !(all guards)', fixerEdit(`    if: "!inputs.dry-run && ${FIX_IF}"`, `    if: "!(!inputs.dry-run && ${FIX_IF})"`), rel(T), 'fix', 'fixer-prompt', 'workflow_dispatch'],
        ['workflow_run guard behind always() ||', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true).replace(`if: \${{ ${GUARD} }}`, `if: \${{ always() || ${GUARD} }}`) }), rel('after.yml'), 'report', 'workflow-run-guard', 'head_repository'],
        ['ACTIONS_STEP_DEBUG as an env expression string', fixerEdit('    concurrency: claude-fixer', "    concurrency: claude-fixer\n    env: ${{ fromJSON('{\"ACTIONS_STEP_DEBUG\":\"1\"}') }}"), rel(T), 'fix', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
        ['ACTIONS_STEP_DEBUG written to GITHUB_ENV by a step', fixerEdit('    steps:\n      - run: echo gate', '    steps:\n      - run: echo ACTIONS_STEP_DEBUG=true >> "$GITHUB_ENV"\n      - run: echo gate'), rel(T), 'fix-gate', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
        // WR-06: grants and flags that open the shell, reach patches/ or make the allowlist moot.
        ['bare Read in --allowedTools', fixerEdit('Read(work/**),Read(fixer-data/**)', 'Read,Read(fixer-data/**)'), rel(T), 'fix', 'fixer-tools', 'bare Read'],
        ['Read(**) in --allowedTools', fixerEdit('Read(work/**),Read(fixer-data/**)', 'Read(**),Read(fixer-data/**)'), rel(T), 'fix', 'fixer-tools', 'Read(**)'],
        ['Read(//proc/**) granted', fixerEdit('Read(work/**),Read(fixer-data/**)', 'Read(//proc/**),Read(fixer-data/**)'), rel(T), 'fix', 'fixer-tools', 'Read(//proc/**)'],
        ['Read climbing out of work/ with ..', fixerEdit('Read(work/**),Read(fixer-data/**)', 'Read(work/../.git/**),Read(fixer-data/**)'), rel(T), 'fix', 'fixer-tools', 'Read(work/../.git/**)'],
        ['Read(//proc/**) not denied', fixerEdit('Read(//proc/**),', ''), rel(T), 'fix', 'fixer-tools', 'Read(//proc/**)'],
        ['Read(upstream/**) granted (IN-04)', fixerEdit('Read(work/**),Read(fixer-data/**)', 'Read(work/**),Read(fixer-data/**),Read(upstream/**)'), rel(T), 'fix', 'fixer-tools', 'Read(upstream/**)'],
        ['Read(upstream/**) not denied (IN-04)', fixerEdit('Read(upstream/**),', ''), rel(T), 'fix', 'fixer-tools', 'Read(upstream/**)'],
        ['Read(~/**) not denied', fixerEdit('Read(~/**),', ''), rel(T), 'fix', 'fixer-tools', 'Read(~/**)'],
        ['Read(.git/**) not denied', fixerEdit('Read(.git/**),', ''), rel(T), 'fix', 'fixer-tools', 'Read(.git/**)'],
        ['bare Edit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit,Read'), rel(T), 'fix', 'fixer-tools', 'bare Edit'],
        ['bare Write in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),Write,Read'), rel(T), 'fix', 'fixer-tools', 'bare Write'],
        ['bare MultiEdit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),MultiEdit,Read'), rel(T), 'fix', 'fixer-tools', 'bare MultiEdit'],
        ['bare NotebookEdit in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(work/**),NotebookEdit,Read'), rel(T), 'fix', 'fixer-tools', 'bare NotebookEdit'],
        ['Edit(**) in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(**),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(**)'],
        ['Edit(*) in --allowedTools', fixerEdit('Edit(work/**),Read', 'Edit(*),Read'), rel(T), 'fix', 'fixer-tools', 'Edit(*)'],
        ['MultiEdit(work/**) without its patches deny', fixerEdit('Edit(work/**),Read', 'Edit(work/**),MultiEdit(work/**),Read'), rel(T), 'fix', 'fixer-tools', 'MultiEdit(work/**/patches/**)'],
        ['Bash(*) in --allowedTools', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash(*)'), rel(T), 'fix', 'fixer-tools', 'Bash(*)'],
        ['Bash(:*) in --allowedTools', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash(:*)'), rel(T), 'fix', 'fixer-tools', 'Bash(:*)'],
        ['space-separated --allowedTools Read Bash', fixerEdit(` --allowedTools "${ALLOWED}"`, ' --allowedTools Read Bash'), rel(T), 'fix', 'fixer-tools', 'unscoped shell'],
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
        ['admitted claude-code-action used by no workflow', { files: Object.fromEntries(Object.entries(base).filter(([k]) => !k.endsWith('triage.yml') && k !== 'release-train.yml')), selected: withClaude }, SELECTED_REL, WF_LEVEL, 'admission-used', 'anthropics/claude-code-action'],
    ];
    plants.push(...fixerPlants);
    // FIX-05 spend: the fix job's time bound and its serialized attempt group.
    // CR-01 trust boundary: no wildcard shell grant, and Edit/Write on the git directory and attributes files denied.
    // WR-06: the App token's permission inputs are seen by the issues-write rule.
    const rtEdit = (from, to) => {
        const t = files[T];
        if (!t.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${T}`);
        return { files: { ...files, [T]: t.replace(from, to) } };
    };
    plants.push(
        ['permission-issues: write on the fix-pr App token (real release-train.yml)', rtEdit('          permission-pull-requests: write\n\n      # The one step that holds the token', '          permission-pull-requests: write\n          permission-issues: write\n\n      # The one step that holds the token'), rel(T), 'fix-pr', 'issues-write', 'permission-issues: write'],
        ['an App token step with no permission-* input in fix-pr', fixerEdit('          permission-contents: write\n          permission-pull-requests: write\n', ''), rel(T), 'fix-pr', 'issues-write', 'no permission-* input'],
    );
    // WR-01: the fix-gate and fix-pr isolation, each fact removed from the real release-train.yml (the reviewer's survivors
    // 1-7 and the CR-02 and CR-03 bindings). rtEdit throws when an anchor is gone, so a rewrite of the job fails loudly here.
    const GATE_HEAD = "    if: ${{ !inputs.dry-run && github.run_attempt == 1 && needs.fix.result == 'success' }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 60\n";
    const DL_GATE = '      - name: Download the diff\n        if: ${{ !inputs.dry-run }}\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n';
    const gateEdit = (from, to) => rtEdit(from, to);
    plants.push(
        ['fix job if: without the run_attempt term', gateEdit("    if: ${{ !inputs.dry-run && github.run_attempt == 1 && inputs.reason == 'fix'", "    if: ${{ !inputs.dry-run && inputs.reason == 'fix'"), rel(T), 'fix', 'fixer-gate', 'github.run_attempt == 1'],
        ['fix-gate if: without the run_attempt term', gateEdit(GATE_HEAD, GATE_HEAD.replace(' && github.run_attempt == 1', '')), rel(T), 'fix-gate', 'fixer-gate', 'github.run_attempt == 1'],
        ['fix-pr if: without the run_attempt term', gateEdit("    if: ${{ !inputs.dry-run && github.run_attempt == 1 && needs.fix-gate.result", "    if: ${{ !inputs.dry-run && needs.fix-gate.result"), rel(T), 'fix-pr', 'fixer-gate', 'github.run_attempt == 1'],
        ['fix-gate with environment bot', gateEdit(GATE_HEAD, `${GATE_HEAD}    environment: bot\n`), rel(T), 'fix-gate', 'fixer-gate', 'environment'],
        ['fix-gate reading secrets.BOT_APP_PRIVATE_KEY', gateEdit('    outputs:\n      verdict: ${{ steps.gate.outputs.verdict }}', '    env:\n      K: ${{ secrets.BOT_APP_PRIVATE_KEY }}\n    outputs:\n      verdict: ${{ steps.gate.outputs.verdict }}'), rel(T), 'fix-gate', 'fixer-gate', 'secrets.'],
        ['fix-gate with contents write and pull-requests write', gateEdit('    timeout-minutes: 60\n    permissions:\n      contents: read\n', '    timeout-minutes: 60\n    permissions:\n      contents: write\n      pull-requests: write\n'), rel(T), 'fix-gate', 'fixer-gate', 'contents: read'],
        ['fix-gate with actions read as well', gateEdit('    timeout-minutes: 60\n    permissions:\n      contents: read\n', '    timeout-minutes: 60\n    permissions:\n      contents: read\n      actions: read\n'), rel(T), 'fix-gate', 'fixer-gate', 'exactly contents: read'],
        ['an App-token step inside fix-gate', gateEdit(DL_GATE, `      - uses: ${FIX_APP}\n        if: \${{ !inputs.dry-run }}\n        with:\n          permission-contents: write\n${DL_GATE}`), rel(T), 'fix-gate', 'fixer-gate', 'mints an App token'],
        ['fix-gate yarn install without --ignore-scripts', gateEdit('            yarn install --ignore-scripts --frozen-lockfile', '            yarn install --frozen-lockfile'), rel(T), 'fix-gate', 'fixer-gate', '--ignore-scripts'],
        ['fix-gate checkout without persist-credentials false', gateEdit("          ref: main\n          fetch-depth: 0\n          persist-credentials: false\n", "          ref: main\n          fetch-depth: 0\n"), rel(T), 'fix-gate', 'fixer-gate', 'persist-credentials'],
        ['fix-gate download-artifact with another run-id', gateEdit(DL_GATE, `${DL_GATE}          run-id: 12345\n`), rel(T), 'fix-gate', 'fixer-gate', 'run-id'],
        ['fix-gate download-artifact with a github-token', gateEdit(DL_GATE, `${DL_GATE}          github-token: \${{ secrets.GITHUB_TOKEN }}\n`), rel(T), 'fix-gate', 'fixer-gate', 'github-token'],
        ['fix-gate running the gate outside fixer-isolate.sh', gateEdit('bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs', 'node scripts/verify-fix-gate.mjs'), rel(T), 'fix-gate', 'fixer-gate', 'fixer-isolate.sh'],
        ['fix-gate gating HEAD instead of the fix job base-sha', gateEdit('--ref="$BASE_SHA"', '--ref=HEAD'), rel(T), 'fix-gate', 'fixer-gate', 'base-sha'],
        ['fix-gate not checking the artifact digest', gateEdit('          DIFF_SHA256: ${{ needs.fix.outputs.diff-sha256 }}\n          BASE_SHA: ${{ needs.fix.outputs.base-sha }}\n        run: |\n          set -euo pipefail\n          DIFF=', '          BASE_SHA: ${{ needs.fix.outputs.base-sha }}\n        run: |\n          set -euo pipefail\n          DIFF='), rel(T), 'fix-gate', 'fixer-gate', 'sha256'],
        ['fix job checkout of work/ without persist-credentials false', gateEdit("          path: work\n          fetch-depth: 0\n          persist-credentials: false\n", "          path: work\n          fetch-depth: 0\n"), rel(T), 'fix', 'fixer-gate', 'persist-credentials'],
        ['failing run chosen by branch, not by the fingerprint commit', gateEdit('gh run list --workflow "${CHECK}.yml" --commit "$BASE" --status failure', 'gh run list --branch "$TARGET" --status failure'), rel(T), 'fix', 'fixer-gate', 'no --commit'],
        ['prompt without the fence nonce', { files: { ...files, [T]: files[T].split('${{ steps.log.outputs.nonce }}').join('') } }, rel(T), 'fix', 'fixer-gate', 'per-run nonce'],
        ['fence built from constant markers (no nonce step)', gateEdit('NONCE=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d \' \\n\')', 'NONCE=fixed'), rel(T), 'fix', 'fixer-gate', 'random nonce'],
        ['fix job without the diff-sha256 output', gateEdit('      diff-sha256: ${{ steps.digest.outputs.diff-sha256 }}\n', ''), rel(T), 'fix', 'fixer-gate', 'diff-sha256'],
        ['fix job without the base-sha output', gateEdit('      base-sha: ${{ steps.base.outputs.base-sha }}\n    steps:', '    steps:'), rel(T), 'fix', 'fixer-gate', 'base-sha'],
        ['fix-pr if: without the verdict term', gateEdit(" && needs.fix-gate.outputs.verdict == 'pass'", ''), rel(T), 'fix-pr', 'fixer-gate', "verdict == 'pass'"],
        ['fix-pr if: without the gate result term', gateEdit(" && needs.fix-gate.result == 'success' && needs.fix-gate.outputs.verdict == 'pass' && needs.fix-gate.outputs.diff-sha256", " && needs.fix-gate.outputs.verdict == 'pass' && needs.fix-gate.outputs.diff-sha256"), rel(T), 'fix-pr', 'fixer-gate', "result == 'success'"],
        ['fix-pr if: without the digest binding', gateEdit(' && needs.fix-gate.outputs.diff-sha256 == needs.fix.outputs.diff-sha256', ''), rel(T), 'fix-pr', 'fixer-gate', 'diff-sha256 =='],
        ['fix-pr if: without the base binding', gateEdit(' && needs.fix-gate.outputs.base-sha == needs.fix.outputs.base-sha }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 30', ' }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 30'), rel(T), 'fix-pr', 'fixer-gate', 'base-sha =='],
        ['fix-pr not needing the fix job', gateEdit('    needs: [fix, fix-gate]\n    if: ${{ !inputs.dry-run && github.run_attempt == 1 && needs.fix-gate.result', '    needs: fix-gate\n    if: ${{ !inputs.dry-run && github.run_attempt == 1 && needs.fix-gate.result'), rel(T), 'fix-pr', 'fixer-gate', 'does not need fix'],
        ['fix-pr root checkout of the target branch', gateEdit("          ref: main\n          persist-credentials: false\n\n      - name: Check out the target at exactly the gated base commit, under target/", "          ref: ${{ inputs.target-branch }}\n          persist-credentials: false\n\n      - name: Check out the target at exactly the gated base commit, under target/"), rel(T), 'fix-pr', 'fixer-gate', 'not main'],
        ['fix-pr target checkout at the branch name instead of the base-sha', gateEdit('          ref: ${{ needs.fix.outputs.base-sha }}\n          path: target', '          ref: ${{ inputs.target-branch }}\n          path: target'), rel(T), 'fix-pr', 'fixer-gate', 'gated base-sha'],
        ['fix-pr App token read by a second step', gateEdit('          BASE_SHA: ${{ needs.fix.outputs.base-sha }}\n        run: |\n          set -euo pipefail\n          # No system or global git config', '          BASE_SHA: ${{ needs.fix.outputs.base-sha }}\n          LEAK: ${{ steps.app.outputs.token }}\n        run: |\n          set -euo pipefail\n          # No system or global git config'), rel(T), 'fix-pr', 'fixer-gate', 'read by 2 step(s)'],
        ['fix-pr App token with workflows write as well', gateEdit('          permission-pull-requests: write\n\n      # The one step that holds the token', '          permission-pull-requests: write\n          permission-workflows: write\n\n      # The one step that holds the token'), rel(T), 'fix-pr', 'fixer-gate', 'not exactly contents and pull-requests write'],
        ['fix-pr not re-running the pure stages on the digest-checked bytes', gateEdit('          node scripts/verify-fix-gate.mjs --static-only --diff="$FIX_DIFF"', '          true'), rel(T), 'fix-pr', 'fixer-gate', '--static-only'],
        ['a claude step inside fix-pr', gateEdit("      - name: Mint the bot App token\n        id: app\n        if: ${{ !inputs.dry-run && steps.apply.outputs.committed == 'true' }}\n", `      - uses: ${FIX_PIN}\n        if: \${{ !inputs.dry-run }}\n      - name: Mint the bot App token\n        id: app\n        if: \${{ !inputs.dry-run && steps.apply.outputs.committed == 'true' }}\n`), rel(T), 'fix-pr', 'fixer-gate', 'claude-code-action step'],
        // IN-01, IN-02 (re-review): the run-name carries the fingerprint, and the derive job reads the runs through the checked reader.
        ['run-name without the fingerprint', rtEdit("format('fix {0} {1} attempt {2} {3}', inputs.release-key, inputs.class, inputs.attempt, inputs.fingerprint)", "format('fix {0} {1} attempt {2}', inputs.release-key, inputs.class, inputs.attempt)"), rel(T), WF_LEVEL, 'fixer-spend', 'run-name does not title a fix run'],
        ['derive reading the runs without the cut-off check', rtEdit('release-train.mjs --run-titles "$GITHUB_RUN_ID"', 'release-train.mjs --ignored-titles "$GITHUB_RUN_ID"'), rel(T), 'derive', 'fixer-spend', '--run-titles'],
        // WR-07 (re-review): the fix and fix-gate jobs free disk space as rebase-upstream.yml does, before the upstream fetch.
        ['fix job without the Free disk space step', gateEdit('      - name: Free disk space\n        run: |\n          sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /opt/hostedtoolcache\n          df -h\n\n      - name: Install Nix\n        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1\n\n      # The pinned Claude Code CLI', '      - name: Install Nix\n        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1\n\n      # The pinned Claude Code CLI'), rel(T), 'fix', 'fixer-gate', 'frees disk space'],
        ['fix-gate without the Free disk space step', gateEdit("      - name: Free disk space\n        run: |\n          sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /opt/hostedtoolcache\n          df -h\n\n      - name: Install Nix\n        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1\n\n      # This run's artifact only", "      - name: Install Nix\n        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1\n\n      # This run's artifact only"), rel(T), 'fix-gate', 'fixer-gate', 'frees disk space'],
        ['fix job freeing less than rebase-upstream.yml does', gateEdit('sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /opt/hostedtoolcache', 'sudo rm -rf /usr/share/dotnet'), rel(T), 'fix', 'fixer-gate', 'frees disk space'],
        // WR-06 (re-review): the verify, apply and publish steps cannot swallow a failure, and read the one hashed path.
        ['fix-pr verify step with continue-on-error', gateEdit('      - name: Verify the diff digest and re-run the pure gate stages on it\n        if: ${{ !inputs.dry-run }}\n', '      - name: Verify the diff digest and re-run the pure gate stages on it\n        if: ${{ !inputs.dry-run }}\n        continue-on-error: true\n'), rel(T), 'fix-pr', 'fixer-gate', 'continue-on-error'],
        ['fix-pr static re-run followed by || true', gateEdit('node scripts/verify-fix-gate.mjs --static-only --diff="$FIX_DIFF"', 'node scripts/verify-fix-gate.mjs --static-only --diff="$FIX_DIFF" || true'), rel(T), 'fix-pr', 'fixer-gate', 'swallows a failure'],
        ['fix-pr static re-run after set +e', gateEdit('          set -euo pipefail\n          GOT=$(sha256sum "$FIX_DIFF"', '          set +e\n          GOT=$(sha256sum "$FIX_DIFF"'), rel(T), 'fix-pr', 'fixer-gate', 'swallows a failure'],
        ['fix-pr apply reading another file than the hashed one', gateEdit('T apply --index "$FIX_DIFF"', 'T apply --index "$GITHUB_WORKSPACE/other.diff"'), rel(T), 'fix-pr', 'fixer-gate', 'apply --index "$FIX_DIFF"'],
        ['fix-pr apply step with continue-on-error', gateEdit('      - name: Apply the gated diff in target/ and commit it (skipped in dry-run)\n        id: apply\n', '      - name: Apply the gated diff in target/ and commit it (skipped in dry-run)\n        id: apply\n        continue-on-error: true\n'), rel(T), 'fix-pr', 'fixer-gate', 'continue-on-error'],
        ['fix-pr opener rendering from another file', gateEdit('fix-open-pr.mjs --open --diff="$FIX_DIFF"', 'fix-open-pr.mjs --open --diff="$GITHUB_WORKSPACE/other.diff"'), rel(T), 'fix-pr', 'fixer-gate', '--diff="$FIX_DIFF"'],
        ['fix-pr re-gate reading a literal path', gateEdit('--static-only --diff="$FIX_DIFF"', '--static-only --diff="$RUNNER_TEMP/fix-diff/work.diff"'), rel(T), 'fix-pr', 'fixer-gate', 'work.diff'],
        ['fix-pr FIX_DIFF pointing at another file', gateEdit('      FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff', '      FIX_DIFF: ${{ runner.temp }}/other/work.diff'), rel(T), 'fix-pr', 'fixer-gate', 'job env FIX_DIFF'],
        ['fix job diff-sha256 rebound to the log step', gateEdit('diff-sha256: ${{ steps.digest.outputs.diff-sha256 }}', 'diff-sha256: ${{ steps.log.outputs.diff-sha256 }}'), rel(T), 'fix', 'fixer-gate', 'diff-sha256 output is taken from step "log"'],
        ['fix job digest step without sha256sum', gateEdit('echo "diff-sha256=$(sha256sum "$RUNNER_TEMP/work.diff" | cut -d\' \' -f1)" >> "$GITHUB_OUTPUT"', 'echo "diff-sha256=0000" >> "$GITHUB_OUTPUT"'), rel(T), 'fix', 'fixer-gate', 'diff-sha256 output'],
        ['fix job base-sha rebound to the digest step', gateEdit('base-sha: ${{ steps.base.outputs.base-sha }}', 'base-sha: ${{ steps.digest.outputs.base-sha }}'), rel(T), 'fix', 'fixer-gate', 'base-sha output is taken from step "digest"'],
        // IN-03: the apply step's git helper reads no system or global config and no attributes file.
        ['fix-pr git helper without GIT_CONFIG_NOSYSTEM', gateEdit('GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -C target', 'GIT_CONFIG_GLOBAL=/dev/null git -C target'), rel(T), 'fix-pr', 'fixer-gate', 'GIT_CONFIG_NOSYSTEM=1'],
        ['fix-pr git helper without GIT_CONFIG_GLOBAL', gateEdit('GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -C target', 'GIT_CONFIG_NOSYSTEM=1 git -C target'), rel(T), 'fix-pr', 'fixer-gate', 'GIT_CONFIG_GLOBAL=/dev/null'],
        ['fix-pr git helper without core.attributesFile', gateEdit(' -c core.attributesFile=/dev/null "$@"', ' "$@"'), rel(T), 'fix-pr', 'fixer-gate', 'core.attributesFile=/dev/null'],
        ['fix-pr download-artifact with another run-id', gateEdit('      - name: Download the gated diff\n        if: ${{ !inputs.dry-run }}\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n', '      - name: Download the gated diff\n        if: ${{ !inputs.dry-run }}\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          run-id: 777\n'), rel(T), 'fix-pr', 'fixer-gate', 'run-id'],
    );
    plants.push(
        ['wildcard git grant (Bash(git -C work diff:*))', fixerEdit('Bash(scripts/verify-platform.sh --quick)', 'Bash(git -C work diff:*)'), rel(T), 'fix', 'fixer-tools', 'Bash(git -C work diff:*)'],
        ['wildcard regenerate grant', fixerEdit('Bash(scripts/regenerate-patches.sh --upstream upstream --patches work/patches)', 'Bash(scripts/regenerate-patches.sh:*)'), rel(T), 'fix', 'fixer-tools', 'Bash(scripts/regenerate-patches.sh:*)'],
        ['Edit(work/.git/**) not denied', fixerEdit(',Edit(work/.git/**)', ''), rel(T), 'fix', 'fixer-tools', 'Edit(work/.git/**)'],
        ['Write(work/.git/**) not denied', fixerEdit(',Write(work/.git/**)', ''), rel(T), 'fix', 'fixer-tools', 'Write(work/.git/**)'],
        ['Edit(.gitattributes) not denied', fixerEdit(',Edit(work/**/.gitattributes)', ''), rel(T), 'fix', 'fixer-tools', 'Edit(work/**/.gitattributes)'],
        ['Write(.gitattributes) not denied', fixerEdit(',Write(work/**/.gitattributes)', ''), rel(T), 'fix', 'fixer-tools', 'Write(work/**/.gitattributes)'],
    );
    // FIX-12 fixer-auth: id-token on the fix job only, the federation ids in the Claude step, and the fallback key confined.
    plants.push(
        ['fix job without id-token write', fixerEdit('      id-token: write\n', ''), rel(T), 'fix', 'fixer-auth', 'id-token'],
        ['Claude step without the federation rule id', fixerEdit('          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}\n', ''), rel(T), 'fix', 'fixer-auth', 'anthropic_federation_rule_id'],
        ['Claude step without the organization id', fixerEdit('          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}\n', ''), rel(T), 'fix', 'fixer-auth', 'anthropic_organization_id'],
        ['id-token write on fix-gate', fixerEdit('      contents: read\n    if: "' + GATE_IF + '"', '      contents: read\n      id-token: write\n    if: "' + GATE_IF + '"'), rel(T), 'fix-gate', 'fixer-auth', 'id-token'],
        ['ANTHROPIC_API_KEY referenced in fix-pr (environment bot)', fixerEdit('      FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff\n    steps:', '      FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff\n      FALLBACK_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n    steps:'), rel(T), 'fix-pr', 'fixer-auth', 'fixer'],
    );
    plants.push(
        ['fix job timeout-minutes 5', fixerEdit('    timeout-minutes: 90', '    timeout-minutes: 5'), rel(T), 'fix', 'fixer-spend', 'timeout-minutes'],
        ['fix job without timeout-minutes', fixerEdit('    timeout-minutes: 90\n', ''), rel(T), 'fix', 'fixer-spend', 'timeout-minutes'],
        ['fix job on the release-train concurrency group', fixerEdit('    concurrency: claude-fixer', '    concurrency: release-train'), rel(T), 'fix', 'fixer-spend', 'claude-fixer'],
        ['fix job without a concurrency group', fixerEdit('    concurrency: claude-fixer\n', ''), rel(T), 'fix', 'fixer-spend', 'claude-fixer'],
    );

    // CR-02: a permission-* name the pinned create-github-app-token action does not declare.
    const TRAIN_TEXT = files['release-train.yml'];
    const trainEdit = (from, to) => {
        if (!TRAIN_TEXT.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${WF_DIR}/release-train.yml`);
        return { files: { ...files, 'release-train.yml': TRAIN_TEXT.replace(from, to) } };
    };
    plants.push(
        ['an undeclared permission-dependabot-alerts input', trainEdit('permission-vulnerability-alerts: read', 'permission-dependabot-alerts: read'), rel('release-train.yml'), 'maintenance-probe', 'app-token-inputs', 'permission-dependabot-alerts'],
        ['a permission input on a pin with no record entry', { appTokenInputs: { pins: {} } }, rel('release-train.yml'), 'maintenance-probe', 'app-token-inputs', 'has no entry for that commit'],
    );

    // renovate-job (AUTO-02, owner answer A4): each plant edits the real release-train.yml or renovate.json5 text in memory.
    const RJ = [rel('release-train.yml'), 'renovate-theia', 'renovate-job'];
    const RL = [rel('release-train.yml'), 'renovate-licensing', 'renovate-job'];
    const RENOVATE_TEXT = readFileSync(join(REPO_ROOT, RENOVATE_REL), 'utf8');
    const AUTHOR_LINE = '          RENOVATE_GIT_AUTHOR: release-train <${{ env.BOT_EMAIL }}>\n';
    const LIC_HEAD = '  renovate-licensing:\n    needs: [derive, renovate-theia]\n';
    const RP = [rel('release-train.yml'), 'renovate-licensing-publish', 'renovate-job'];
    const PUB_LINE = '          (cd target && bash "$GITHUB_WORKSPACE/scripts/publish-bump-branch.sh" "$BRANCH" "$BASE" "$HEAD_SHA") > "$RUNNER_TEMP/publish.txt"\n';
    const GEN_CO = '          git checkout "$HEAD_SHA" -- \':(glob)theia/**/package.json\' theia/yarn.lock configuration.toml\n';
    const GEN_CHECKOUT = '      - name: Check out the trusted ref without persisting a token (skipped in dry-run)\n        if: ${{ !inputs.dry-run }}\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n        with:\n          persist-credentials: false\n          fetch-depth: 0\n\n      - name: Install Nix';
    const PUB_CHECKOUT = '          persist-credentials: false\n          fetch-depth: 0\n\n      # This run\'s artifact only';
    const GEN_NIX = '      - name: Install Nix (skipped in dry-run)\n        if: ${{ !inputs.dry-run }}\n        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1\n\n      # Every script here';
    plants.push(
        ['renovate-job: the hook allow-list restored', trainEdit(AUTHOR_LINE, `${AUTHOR_LINE}          RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS: '["^node scripts/generate-licensing\\\\.mjs$"]'\n`), ...RJ, 'sets RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS'],
        ['renovate-job: platform commits left on auto', trainEdit('          RENOVATE_PLATFORM_COMMIT: disabled\n', ''), ...RJ, 'not disabled'],
        ['renovate-job: the config turns platform commits on', { renovateConfig: RENOVATE_TEXT.replace('"automerge": false,', '"automerge": false,\n  "platformCommit": "enabled",') }, ...RJ, 'other than disabled'],
        ['renovate-job: the licensing job no longer needs renovate-theia', trainEdit(LIC_HEAD, '  renovate-licensing:\n    needs: [derive]\n'), ...RJ, '0 jobs that need it'],
        ['renovate-job: the generator step dropped', trainEdit('          nix develop .#theia --command node scripts/generate-licensing.mjs\n', ''), ...RJ, '0 jobs that need it'],
        ['renovate-job: continue-on-error dropped', trainEdit(`${LIC_HEAD}    if: \${{ !inputs.dry-run && needs.renovate-theia.result == 'success' }}\n    continue-on-error: true\n`, `${LIC_HEAD}    if: \${{ !inputs.dry-run && needs.renovate-theia.result == 'success' }}\n`), ...RL, 'continue-on-error'],
        ['renovate-job: GITHUB_TOKEN contents write', trainEdit('    permissions: {}\n    env:\n      BRANCH: chore/theia-theia\n', '    permissions:\n      contents: write\n    env:\n      BRANCH: chore/theia-theia\n'), ...RL, 'not {}'],
        ['renovate-job: the monaco branch instead of the theia branch', trainEdit('      BRANCH: chore/theia-theia\n', '      BRANCH: chore/theia-theia-monaco-editor-core\n'), ...RL, 'not "chore/theia-theia"'],
        ['renovate-job: the config branchPrefix moved', { renovateConfig: RENOVATE_TEXT.replace('"branchPrefix": "chore/theia-"', '"branchPrefix": "chore/deps-"') }, ...RL, 'not "chore/deps-theia"'],
        ['renovate-job: no branchPrefix in the config', { renovateConfig: '{}' }, ...RL, 'cannot be derived'],
        ['renovate-job: App token gains pull-requests write', trainEdit('          permission-contents: write\n\n      # The one step that holds the token. The publish script', '          permission-contents: write\n          permission-pull-requests: write\n\n      # The one step that holds the token. The publish script'), ...RP, 'contents write only'],
        ['renovate-job: upstream/ not applied', trainEdit(" && bash scripts/apply-patches.sh'\n          git checkout", "'\n          git checkout"), ...RL, 'scripts/apply-patches.sh'],
        ['renovate-job: yarn install runs lifecycle scripts', trainEdit("cd theia && yarn install --ignore-scripts --frozen-lockfile'", "cd theia && yarn install --frozen-lockfile'"), ...RL, '--ignore-scripts --frozen-lockfile'],
        ['renovate-job: a bare git push instead of publish-bump-branch.sh', trainEdit(PUB_LINE, '          (cd target && git push origin "HEAD:refs/heads/$BRANCH") > "$RUNNER_TEMP/publish.txt"\n'), ...RP, 'publish-bump-branch.sh'],
        // Plan 51-09: the generate job holds no credential; the publish job runs nothing from the branch tree.
        ['renovate-job: the generate job mints the App token', trainEdit(GEN_NIX, `      - name: Mint the bot App token\n        id: app\n        if: \${{ !inputs.dry-run }}\n        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2\n        with:\n          app-id: \${{ vars.BOT_APP_ID }}\n          private-key: \${{ secrets.BOT_APP_PRIVATE_KEY }}\n          owner: \${{ github.repository_owner }}\n          repositories: powerbrowser\n          permission-contents: write\n\n${GEN_NIX}`), ...RL, 'mints or receives a token or secret'],
        ['renovate-job: the generate job receives a secret', trainEdit('          PUPPETEER_SKIP_DOWNLOAD: "1"\n', '          PUPPETEER_SKIP_DOWNLOAD: "1"\n          GH_TOKEN: ${{ secrets.BOT_APP_PRIVATE_KEY }}\n'), ...RL, 'mints or receives a token or secret'],
        ['renovate-job: the generate job receives github.token', trainEdit('          PUPPETEER_SKIP_DOWNLOAD: "1"\n', '          PUPPETEER_SKIP_DOWNLOAD: "1"\n          GH_TOKEN: ${{ github.token }}\n'), ...RL, 'mints or receives a token or secret'],
        ['renovate-job: the generate job enters the bot environment', trainEdit(`${LIC_HEAD}    if: \${{ !inputs.dry-run && needs.renovate-theia.result == 'success' }}\n`, `${LIC_HEAD}    if: \${{ !inputs.dry-run && needs.renovate-theia.result == 'success' }}\n    environment: bot\n`), ...RL, 'mints or receives a token or secret'],
        ['renovate-job: the generate job switches to the branch', trainEdit(GEN_CO, '          git switch -C "$BRANCH" "$HEAD_SHA"\n'), ...RL, 'moves the workspace to a branch ref'],
        ['renovate-job: the generate job resets onto the branch', trainEdit(GEN_CO, `${GEN_CO}          git reset --hard "$HEAD_SHA"\n`), ...RL, 'moves the workspace to a branch ref'],
        ['renovate-job: the generate checkout names the branch ref', trainEdit(GEN_CHECKOUT, GEN_CHECKOUT.replace('fetch-depth: 0\n', 'fetch-depth: 0\n          ref: chore/theia-theia\n')), ...RL, 'sets ref or repository'],
        ['renovate-job: the generate job takes theia/package.json only', trainEdit(GEN_CO, '          git checkout "$HEAD_SHA" -- theia/package.json theia/yarn.lock configuration.toml\n'), ...RL, 'every workspace manifest'],
        ['renovate-job: the package.json line filter dropped', trainEdit(`| grep -vE '^[-+] *"@theia/[a-z0-9-]+": "[0-9A-Za-z.+-]+",?$' || true)`, '|| true)'), ...RL, 'other than an @theia/* version string'],
        ['renovate-job: (a) the publish checkout names the branch ref', trainEdit(PUB_CHECKOUT, PUB_CHECKOUT.replace('fetch-depth: 0\n', 'fetch-depth: 0\n          ref: chore/theia-theia\n')), ...RP, 'sets ref or repository'],
        ['renovate-job: (b) the publish job resets onto the fetched branch', trainEdit(PUB_LINE, `          git fetch origin chore/theia-theia && git reset --hard FETCH_HEAD\n${PUB_LINE}`), ...RP, 'moves HEAD, the index or the workspace'],
        ['renovate-job: (b) the publish job checks a script out of the branch', trainEdit(PUB_LINE, `          git checkout "$HEAD_SHA" -- scripts/publish-bump-branch.sh\n${PUB_LINE}`), ...RP, 'moves HEAD, the index or the workspace'],
        ['renovate-job: (c) the publish script taken from $GITHUB_WORKSPACE/target', trainEdit(PUB_LINE, PUB_LINE.replace('"$GITHUB_WORKSPACE/scripts/', '"$GITHUB_WORKSPACE/target/scripts/')), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job dot-sources a branch script', trainEdit(PUB_LINE, `          (cd target && . scripts/x.sh)\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job runs yarn in target/', trainEdit(PUB_LINE, `          (cd target && yarn install)\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job runs npx in target/', trainEdit(PUB_LINE, `          (cd target && npx some-tool)\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job runs make in target/', trainEdit(PUB_LINE, `          make -C target\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job executes a relative path', trainEdit(PUB_LINE, `          (cd target && scripts/x.sh)\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: (d) the publish job runs through env', trainEdit(PUB_LINE, `          env -i bash "$GITHUB_WORKSPACE/scripts/publish-bump-branch.sh"\n${PUB_LINE}`), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: the artifact carries a third file', trainEdit('            ${{ runner.temp }}/notices/LICENSING.md\n', '            ${{ runner.temp }}/notices/LICENSING.md\n            ${{ runner.temp }}/notices/package.json\n'), ...RL, 'not exactly LICENSING.md and THIRD-PARTY-NOTICES.txt'],
        ['renovate-job: the publish job runs the branch copy of publish-bump-branch.sh', trainEdit('(cd target && bash "$GITHUB_WORKSPACE/scripts/publish-bump-branch.sh"', '(cd target && bash scripts/publish-bump-branch.sh'), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: the publish job runs a script from target/', trainEdit('          T worktree add --detach target "$HEAD_SHA"\n', '          T worktree add --detach target "$HEAD_SHA"\n          node target/scripts/generate-licensing.mjs\n'), ...RP, 'not under "$GITHUB_WORKSPACE/"'],
        ['renovate-job: the publish call drops the head-SHA pin', trainEdit('publish-bump-branch.sh" "$BRANCH" "$BASE" "$HEAD_SHA")', 'publish-bump-branch.sh" "$BRANCH" "$BASE")'), ...RP, 'pinned to the head SHA'],
        ['renovate-job: the moved-branch refusal dropped', trainEdit(`          if [ "$(T rev-parse "refs/remotes/origin/\${BRANCH}^{commit}")" != "$HEAD_SHA" ]; then\n`, `          if false; then\n`), ...RP, 'head-SHA pin'],
        ['renovate-job: HEAD_SHA not taken from the generate job', trainEdit('      HEAD_SHA: ${{ needs.renovate-licensing.outputs.head }}\n', '      HEAD_SHA: ${{ github.sha }}\n'), ...RP, 'not ${{ needs.renovate-licensing.outputs.head }}'],
        ['renovate-job: the publish job stages every change', trainEdit('          T -C target add -- THIRD-PARTY-NOTICES.txt LICENSING.md\n', '          T -C target add -A\n'), ...RP, 'not exactly -- THIRD-PARTY-NOTICES.txt LICENSING.md'],
        ['renovate-job: the publish job stages a third file', trainEdit('          T -C target add -- THIRD-PARTY-NOTICES.txt LICENSING.md\n', '          T -C target add -- THIRD-PARTY-NOTICES.txt LICENSING.md theia/yarn.lock\n'), ...RP, 'not exactly -- THIRD-PARTY-NOTICES.txt LICENSING.md'],
        ['renovate-job: the publish step keeps NODE_OPTIONS', trainEdit(`          unset NODE_OPTIONS\n          (cd target`, `          (cd target`), ...RP, 'unset NODE_OPTIONS'],
        ['renovate-job: the publish job reads the system git config', trainEdit('T() { GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git', 'T() { git'), ...RP, 'no system or global config'],
    );

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
        ['issues write on release-train.yml job report', { ...with_({ 'release-train.yml': issuesJob('Release train', 'report') }), selected: noRenovate(selected) }],
        ['issues write on triage.yml job apply', { ...with_({ 'triage.yml': issuesJob('Triage', 'apply') }), selected: withClaude }],
        ['guarded workflow_run', with_({ 'after.yml': wfRun('After verify', 'Verify static layers', true) })],
        ['claude-code-action hosted with contents read', { files: { ...base, 'assist.yml': assist('read') }, selected: withClaude }],
        ['permissions: read-all over a write repository default', { files: { ...base, 'plain.yml': plain('read-all') }, defaultPermissions: 'write' }],
        ['release-train.yml with its write steps gated by inputs.dry-run', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ !${DRY_RUN_GATE} }}`, run: 'git push origin HEAD:refs/heads/x' }))],
        ['a negated == false gate on a git commit', withRt(d => d.jobs['bump-pr'].steps.push({ if: `\${{ ${DRY_RUN_GATE} == false }}`, run: 'git commit -m "x"' }))],
        ['a read gh api GET stays ungated', withRt(d => d.jobs.report.steps.push({ run: 'gh api repos/o/r/branches/x --jq .commit.sha' }))],
        ['the unmodified release-train.yml under the new rule', { files }],
        ['good fixer triple: fix, fix-gate and fix-pr', { files: { ...base, [T]: GOOD_TRAIN }, selected: noRenovate(withClaude) }],
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
