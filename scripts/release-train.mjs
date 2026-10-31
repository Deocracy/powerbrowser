#!/usr/bin/env node
// scripts/release-train.mjs
//
// The release train's pure core (Phase 43, TRAIN-02, TRAIN-03, TRAIN-09 and
// AUTO-07). The reconciler in .github/workflows/release-train.yml wakes,
// re-derives the state of each release from GitHub facts, makes at most one
// transition per release per run, re-renders the tracking issue, and exits.
// Nothing here touches the network, the filesystem or gh: facts in, state /
// action / issue decision out. Every gh call stays in the workflow YAML.
//
// The five Phase-A states (the release-stage states BUILDING onward land with
// Phase 50 and are absent here by design):
//   DETECTED       a newer *esr_RELEASE tag exists and no bump PR is open.
//   BUMPING        a bump PR chore/esr-<tag> is open and not yet green.
//   CONFLICT       the replay stage FAILed in apply-patches: a patch did not apply.
//   BUMP_RED       any other replay FAIL, a red bump check, or a merged PR that
//                  left the pin unchanged.
//   BUMP_PR_GREEN  the bump PR is open, the pin moved, and the required verify
//                  check succeeded. This is the run's end: the owner merge gate.
//   NEEDS_OWNER    (Phase 52, FIX-05) a fixable red state whose fix budget is spent.
//
// Phase 52 adds the fixer contract below the state machine: NEEDS_OWNER, the FIX-01
// dispatch derivation (fixerDispatch), the fixer input check the fix job runs
// (fixerInputsCheck), attempt counting from fix run-names (fixAttempts) and the
// TRAIN-06 routing render. It is pure: the fix job and the report job own every write.
// Phase 43 owns the skeleton and may reshape this file; the fixer functions keep their
// names and the 7-input dispatch shape when it does.
//
// Facts shape (plain values the workflow reads from GitHub):
//   { candidateTag, pinTag, revision, openPr, bumpConclusion, stage,
//     verifyCheck, merged, pinUnchanged, evidenceUrl?, ownerLogin? }
//   candidateTag  a newer *esr_RELEASE tag under the pinned major, or null
//   openPr        { head, number } for chore/esr-<tag>, or null
//   stage         the first FAIL line the replay printed (the stage output of
//                 rebase-upstream.yml), or null
//   verifyCheck   'success' | 'failure' | 'pending' | null on the bump PR
//   ownerLogin    the owner's login, passed in by the workflow; never a literal here
//
// Pure contract: derive(facts) -> state name or null; next(state) -> action;
// render(state, facts) -> { title, body, labels, mention, assign, lock, close, writes };
// findExactlyOne(found, rendered) -> the create, update or fail decision and whether
// to PATCH; renderConflict(...) -> the conflict issue decision.
//
// The tracking issue is a view, never an input. The snapshot comment in the body
// is debugging output only; no run reads it back.
//
// Labels. release-train is declared in .github/settings/labels.json (Phase 42).
// state/<STATE> is not declared there yet, so the workflow applies only the
// declared label until Phase 42 declares the state labels. The constants below
// move with any rename.
//
// This module never writes under the patch directory: the conflict path opens an
// issue, and regenerate-patches.sh is the only patch writer. The self-test asserts
// that no conflict decision carries such a write.
//
// Honestly --quick: fixtures only. No network, no build, no browser, no display,
// no gh. It writes nothing.
//
// Usage:
//   node scripts/release-train.mjs --self-test

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTag, tagToVersion } from './detect-upstreams.mjs';

const NAME = 'release-train-logic';
const SELF_REL = 'scripts/release-train.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = Object.freeze({ track: 'release-train', state: (s) => `state/${s}`, blocked: 'train:blocked' });
const PATCH_DIR = 'patches';
const APPLY_FAIL = /FAIL -- (apply-patches\.sh|\S+\.patch did not apply)/;
const ANY_FAIL = /FAIL --/;
const PATCH_NUMBER = /FAIL -- (\d+)-\S*\.patch did not apply/;
const EXCERPT_MAX = 2000;

export const STATES = Object.freeze({
    DETECTED: Object.freeze({ desc: 'a newer *esr_RELEASE tag exists and no bump PR is open' }),
    BUMPING: Object.freeze({ desc: 'bump PR chore/esr-<tag> is open and not yet green' }),
    CONFLICT: Object.freeze({ desc: 'the replay stage FAILed in apply-patches: a patch did not apply' }),
    BUMP_RED: Object.freeze({ desc: 'another replay FAIL, a red bump check, or a merged PR with the pin unchanged' }),
    BUMP_PR_GREEN: Object.freeze({ desc: 'bump PR open, pin moved, required verify check success' }),
    NEEDS_OWNER: Object.freeze({ desc: 'a fixable red stage (CONFLICT, or a red open bump PR) whose fix budget is spent; the owner clears it by a manual fix or a dispatch with a new fingerprint' }),
});

const ACTIONS = Object.freeze({
    DETECTED: 'bump',
    BUMPING: 'wait',
    CONFLICT: 'conflict-issue',
    BUMP_RED: 'wait-owner',
    BUMP_PR_GREEN: 'gate',
    NEEDS_OWNER: 'wait-owner',
});

/** Fix runs per (release key, class) before a fixable red moves to NEEDS_OWNER (FIX-05). */
export const FIX_BUDGET = 2;
const RED_STATES = new Set(['CONFLICT', 'BUMP_RED', 'NEEDS_OWNER']);

// The state before the fix budget is applied. Pure.
function deriveBase(f) {
    if (f.merged === true && f.pinUnchanged === true) return 'BUMP_RED';
    if (typeof f.stage === 'string' && APPLY_FAIL.test(f.stage)) return 'CONFLICT';
    if (typeof f.stage === 'string' && ANY_FAIL.test(f.stage)) return 'BUMP_RED';
    if (f.openPr) {
        if (f.verifyCheck === 'failure') return 'BUMP_RED';
        if (f.verifyCheck === 'success' && f.pinUnchanged !== true) return 'BUMP_PR_GREEN';
        return 'BUMPING';
    }
    if (typeof f.candidateTag === 'string') return 'DETECTED';
    return null;
}

/** The state a release is in, from facts, or null with nothing to do. Pure.
 *  fixAttempts (optional, FIX-05) is the count of fix runs for this key and class: at
 *  FIX_BUDGET, a fixable red becomes NEEDS_OWNER. Absent means no fix runs. */
export function derive(facts) {
    const base = deriveBase(facts);
    const fixable = base === 'CONFLICT' || (base === 'BUMP_RED' && facts.openPr != null);
    if (fixable && (facts.fixAttempts ?? 0) >= FIX_BUDGET) return 'NEEDS_OWNER';
    return base;
}

/** The one action a state maps to. A null state is idle. Pure. */
export function next(state) {
    if (state === null) return 'idle';
    if (!Object.hasOwn(ACTIONS, state)) throw new Error(`no action for unknown state ${JSON.stringify(state)}`);
    return ACTIONS[state];
}

/** The patch number named by a conflict stage line, or null when the line names none. Pure. */
export function conflictPatchNumber(stage) {
    const m = typeof stage === 'string' ? PATCH_NUMBER.exec(stage) : null;
    return m === null ? null : m[1];
}

/** The release key for a candidate or the pin. Pure. */
function releaseKey(facts) {
    const version = tagToVersion(facts.candidateTag ?? facts.pinTag);
    return `v${version.esrVersion}-${facts.revision}`;
}

/**
 * The tracking-issue view for a state, rendered from facts. Mention and
 * assignment happen only on entering BUMP_PR_GREEN, the Phase-A gate; every
 * other state renders with neither. Pure.
 */
export function render(state, facts) {
    const title = `release-train: ${releaseKey(facts)}`;
    const evidence = facts.evidenceUrl ?? 'pending';
    const snapshot = JSON.stringify({ state, pin: facts.pinTag, candidate: facts.candidateTag ?? null });
    const owner = typeof facts.ownerLogin === 'string' && facts.ownerLogin !== '' ? facts.ownerLogin : null;
    const gate = state === 'BUMP_PR_GREEN' && owner !== null;
    // TRAIN-06: a red stage carries the blocked label, the owner and the failing-log link.
    const red = RED_STATES.has(state);
    const body = [
        title,
        '',
        '| Step | State | Evidence |',
        '| --- | --- | --- |',
        `| ${state} | ${state} | ${evidence} |`,
        '',
        ...(red ? [`Failing log: ${facts.logUrl ?? 'pending'}`, ''] : []),
        `<!-- release-train:v1 ${snapshot} -->`,
        '',
    ].join('\n');
    return {
        title,
        body,
        labels: [LABELS.track, LABELS.state(state), ...(red ? [LABELS.blocked] : [])],
        mention: gate ? owner : null,
        assign: (gate || red) && owner !== null ? [owner] : [],
        lock: true,
        close: false,
        writes: [],
    };
}

/**
 * The issue for a failed release.yml run (TRAIN-06). The fixer is never started for it, so the body
 * carries no dispatch instruction; the report job opens the issue, and this renders its bytes. Pure.
 */
export function renderReleaseRed(facts) {
    const owner = typeof facts.ownerLogin === 'string' && facts.ownerLogin !== '' ? facts.ownerLogin : null;
    const title = `release-train: release.yml failed for ${facts.releaseKey}`;
    const body = [
        title,
        '',
        `release.yml failed on ${facts.releaseKey}. A release.yml failure is not fixable by the automated fixer, so no fix is started.`,
        '',
        `Failing log: ${facts.logUrl ?? 'pending'}`,
        '',
        'Next step: the owner reads the failing log and decides the release.',
        '',
    ].join('\n');
    return { title, body, labels: [LABELS.track, LABELS.blocked], assign: owner === null ? [] : [owner], writes: [] };
}

/**
 * The exactly-one rule over the issues a label-and-title find returned. Zero
 * creates, one updates (PATCH only when the stored bytes differ from the rendered
 * bytes), two or more fail naming every number and never PATCH. Pure.
 * UNWIRED: no workflow caller and no self-test plant until the live tracking writer
 * is approved (BLOCKED.md item 3).
 */
export function findExactlyOne(found, rendered) {
    if (found.length === 0) return { action: 'create', numbers: [], patch: false };
    if (found.length === 1) {
        const differs = rendered !== undefined && found[0].body !== rendered.body;
        return { action: 'update', numbers: [found[0].number], patch: differs };
    }
    const numbers = found.map(i => i.number).sort((a, b) => a - b);
    return {
        action: 'fail',
        numbers,
        patch: false,
        reason: `${found.length} open tracking issues (#${numbers.join(', #')}) match one release key; the exactly-one rule is violated. Next step: close all but one and re-run.`,
    };
}

function excerpt(text) {
    const s = String(text ?? '');
    if (s.length <= EXCERPT_MAX) return s;
    return `${s.slice(0, EXCERPT_MAX)}\n[truncated ${s.length - EXCERPT_MAX} characters]`;
}

/**
 * The conflict issue for one failed patch: titled with the tag and the patch
 * number, carrying the apply log and the upstream diff, assigned to the owner.
 * It writes no patch: regenerate-patches.sh is the only patch writer. Pure.
 */
export function renderConflict(tag, nnn, logExcerpt, diffExcerpt) {
    const title = `ESR ${tag}: patch ${nnn} did not apply`;
    const body = [
        title,
        '',
        'The replay stopped at this patch. Automation does not edit patches.',
        '',
        '### Apply log',
        '```',
        excerpt(logExcerpt),
        '```',
        '',
        '### Upstream diff',
        '```diff',
        excerpt(diffExcerpt),
        '```',
        '',
        'Next step: regenerate the patch from a patched tree with regenerate-patches.sh, then re-run the train.',
        '',
    ].join('\n');
    return { title, body, assignOwner: true, writes: [] };
}

// ---- Fixer contract (Phase 52). Pure: facts in, decision out. ----------------------------

// The release key is v<ESR>-<revision>, for example v153.7.0-1. The tag shape is the one the
// bump job already checks; it is built here without a literal Firefox tag (pin-carrier sweep).
const KEY_RE = /^v(\d+)\.(\d+)\.(\d+)-(\d+)$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const CHECK_LABEL_RE = /^[a-z][a-z0-9-]*$/;
const ATTEMPT_RE = /^[1-9][0-9]*$/;
const TAG_SHAPE_RE = /^[A-Za-z]+_[0-9]+_[0-9]+(_[0-9]+)?esr_(RELEASE|BUILD[0-9]+)$/;
const FIX_RUN_ATTEMPT_RE = /^[0-9]+$/;

/** The fixer class a red state belongs to (FIX-01). MAIN_RED is red main, from the verify run on main. */
export const FIXER_CLASS_OF = Object.freeze({ CONFLICT: 'F1', BUMP_RED: 'F2', MAIN_RED: 'F3' });
/** The target branches each class may be fixed on. */
const CLASS_BRANCH = Object.freeze({
    F1: /^chore\/esr-/,
    F2: /^(chore\/esr-|chore\/node-|renovate\/)/,
    F3: /^main$/,
});
/** The seven workflow_dispatch inputs of a fixer dispatch. Nothing else crosses into the fix job. */
export const DISPATCH_INPUTS = Object.freeze(['reason', 'release-key', 'class', 'target-branch', 'target-tag', 'fingerprint', 'attempt']);
/** Authors whose red changes may be fixed: the owner, the bot App and Renovate. */
const PERMITTED_AUTHORS = Object.freeze(['renovate[bot]', 'powerbrowser-bot[bot]']);

/** The release key's numeric parts, or null when the text is not a release key. Pure. */
export function parseKey(key) {
    const m = KEY_RE.exec(typeof key === 'string' ? key : '');
    return m === null ? null : m.slice(1).map(Number);
}

/** True when key is strictly greater than the latest Release tag; no Release yet (empty) is always greater. Pure. */
export function keyGreater(key, latestTag) {
    const a = parseKey(key);
    if (a === null) return false;
    if (latestTag === undefined || latestTag === null || latestTag === '') return true;
    const b = parseKey(latestTag);
    if (b === null) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

/** A bot actor never starts the fixer: the App, Claude, and any *[bot] login. Pure. */
export function isBotActor(login) {
    return login === 'powerbrowser-bot[bot]' || login === 'claude[bot]' || /\[bot\]$/.test(typeof login === 'string' ? login : '');
}

/**
 * The fix attempts spent for one release key and class. Counts the fix workflow runs whose
 * run-name is exactly `fix <key> <class> attempt <n>`, whatever fix-gate decided: a rejected
 * attempt still spends the budget. A run with the claude-fix label and no matching run-name
 * is not counted. runs: [{ name, verdict, labels }]. Pure.
 */
export function fixAttempts(runs, key, cls) {
    const prefix = `fix ${key} ${cls} attempt `;
    return runs.filter(r => typeof r.name === 'string' && r.name.startsWith(prefix) && FIX_RUN_ATTEMPT_RE.test(r.name.slice(prefix.length))).length;
}

/**
 * The fixer inputs the fix job re-checks before it does anything, so a dispatch with a bad key,
 * class, branch, tag, fingerprint or attempt fails closed. Returns [{ guard, msg }], empty when all
 * hold. Pure.
 */
export function fixerInputsCheck(i) {
    const out = [];
    const bad = (guard, msg) => out.push({ guard, msg });
    if (!KEY_RE.test(i.releaseKey ?? '')) bad('release-key', `release key ${JSON.stringify(i.releaseKey)} is not v<ESR>-<revision>`);
    if (!Object.hasOwn(CLASS_BRANCH, i.cls)) bad('class', `class ${JSON.stringify(i.cls)} is not F1, F2 or F3`);
    else if (!CLASS_BRANCH[i.cls].test(i.branch ?? '')) bad('target-branch', `branch ${JSON.stringify(i.branch)} does not match ${i.cls}'s branch rule`);
    if (typeof i.branch === 'string' && i.branch.startsWith('claude-fix/')) bad('claude-fix/', 'a claude-fix/ branch is never fixed');
    if (!TAG_SHAPE_RE.test(i.targetTag ?? '')) bad('target-tag', 'the target tag is not an ESR tag');
    const [checkLabel, baseSha] = typeof i.fingerprint === 'string' ? i.fingerprint.split('@') : ['', ''];
    if (!CHECK_LABEL_RE.test(checkLabel ?? '') || !SHA_RE.test(baseSha ?? '')) bad('fingerprint', 'the fingerprint is not <check-label>@<40-hex base sha>');
    if (!ATTEMPT_RE.test(String(i.attempt ?? ''))) bad('attempt', `attempt ${JSON.stringify(i.attempt)} is not a positive integer`);
    if (!keyGreater(i.releaseKey, i.latestTag)) bad('key-not-greater', `release key ${i.releaseKey} is not strictly greater than the latest Release ${i.latestTag ?? '(none)'}`);
    return out;
}

/**
 * The FIX-01 dispatch decision for one red stage. Facts (plain values the workflow reads):
 *   { source, state, branch, headRepository, repository, actor, author, ownerLogin, releaseKey,
 *     latestTag, targetTag, checkLabel, baseSha, attempt, fixAttempts }
 *   source  'release.yml' | 'bump' | 'verify' (the workflow whose run was red)
 *   state   'CONFLICT' | 'BUMP_RED' | 'MAIN_RED'
 * Returns { dispatch, guard, route, reason }. dispatch is the exact 7-input map or null.
 * route is 'dispatch', 'openIssueOnly' (release.yml) or 'NEEDS_OWNER' (budget spent), else 'none'.
 * Every refusal names its guard. Pure.
 */
export function fixerDispatch(f) {
    const refuse = (guard, route, reason) => ({ dispatch: null, guard, route, reason: `${guard}: ${reason}` });
    if (f.source === 'release.yml') return refuse('release.yml', 'openIssueOnly', 'a release.yml failure opens an issue only and never starts the fixer (FIX-01)');
    if (f.headRepository !== f.repository) return refuse('fork', 'none', `head repository ${f.headRepository} is not ${f.repository}; fork heads never start the fixer`);
    if (typeof f.branch === 'string' && f.branch.startsWith('claude-fix/')) return refuse('claude-fix/', 'none', 'a claude-fix/ head is never fixed by the fixer');
    if (isBotActor(f.actor)) return refuse('bot-actor', 'none', `actor ${f.actor} is a bot; no bot starts the fixer`);
    if (!PERMITTED_AUTHORS.includes(f.author) && f.author !== f.ownerLogin) return refuse('external-author', 'none', `author ${f.author} is neither the owner nor a permitted bot`);
    const cls = FIXER_CLASS_OF[f.state];
    if (cls === undefined) return refuse('class', 'none', `state ${f.state} is not a fixer class (F1 CONFLICT, F2 BUMP_RED, F3 MAIN_RED)`);
    if (!CLASS_BRANCH[cls].test(f.branch ?? '')) return refuse('target-branch', 'none', `branch ${f.branch} does not match the ${cls} branch rule`);
    if ((f.fixAttempts ?? 0) >= FIX_BUDGET) return refuse('budget', 'NEEDS_OWNER', `${f.fixAttempts} fix run(s) already spent the budget for ${f.releaseKey} ${cls}`);
    if (!keyGreater(f.releaseKey, f.latestTag)) return refuse('key-not-greater', 'none', `release key ${f.releaseKey} is not strictly greater than the latest Release ${f.latestTag ?? '(none)'}`);
    if (!SHA_RE.test(f.baseSha ?? '') || !CHECK_LABEL_RE.test(f.checkLabel ?? '')) return refuse('fingerprint', 'none', 'the fingerprint needs a check label and a 40-hex base sha');
    const dispatch = {
        reason: 'fix',
        'release-key': f.releaseKey,
        class: cls,
        'target-branch': f.branch,
        'target-tag': f.targetTag,
        fingerprint: `${f.checkLabel}@${f.baseSha}`,
        attempt: String(f.attempt),
    };
    return { dispatch, guard: null, route: 'dispatch', reason: `${cls} dispatch for ${f.releaseKey} on ${f.branch}` };
}

/**
 * A workflow_run wake is admitted only from a same-repository source. Pure.
 * UNWIRED: the workflow_run trigger is held out (BLOCKED.md item 1); no plant covers it.
 */
export function admitWakeRun(run, repository) {
    if (run.headRepository !== repository) {
        return { admit: false, reason: `workflow_run from fork ${run.headRepository} is ignored; only ${repository} may wake the train` };
    }
    return { admit: true, reason: null };
}

/**
 * A release is published only when it is neither a draft nor a prerelease. Pure.
 * UNWIRED: needs the live Release list (Phase 50); no plant covers it.
 */
export function classifyRelease(release) {
    if (release.draft === true) return { published: false, reason: `draft Release ${release.tag} is not published, so it never moves the train` };
    if (release.prerelease === true) return { published: false, reason: `prerelease ${release.tag} is not published` };
    return { published: true, reason: null };
}

/** A conflict stage line must name its patch number, or the train refuses to guess one. Pure. */
export function conflictStageReason(stage) {
    if (conflictPatchNumber(stage) !== null) return null;
    return `the conflict stage line ${JSON.stringify(stage)} names no patch number, so no issue can be titled. Next step: read the apply log and name the patch.`;
}

/**
 * The would-write view for one run: derive, next and render over the facts the run's jobs
 * produced, and the conflict issue when the state is CONFLICT. Pure. The run's facts are not
 * live GitHub facts: verifyCheck, merged and pinUnchanged are null or false, and the revision is
 * fixed at 1. shortcut: the view reads job outputs only, not check runs or the Release list; upgrade when the live facts source is approved (BLOCKED.md item 3) and Releases are keyed (Phase 50).
 */
export function wouldWrite({ pinTag, tag, openPrNumber, stage }) {
    const candidateTag = tag === '' ? null : tag;
    if (openPrNumber !== '' && candidateTag === null) {
        return { lines: [], failures: [`an open PR (#${openPrNumber}) names no candidate tag, so its bump branch cannot be named. Next step: pass the tag the PR was opened for.`] };
    }
    const openPr = openPrNumber === '' ? null : { head: `chore/esr-${candidateTag}`, number: Number(openPrNumber) };
    const facts = { pinTag, candidateTag, revision: 1, openPr, stage: stage === '' ? null : stage, verifyCheck: null, merged: false, pinUnchanged: false };
    const state = derive(facts);
    if (state === null) return { lines: ['release-train: would-write: idle; no candidate and no open bump PR, so nothing is written'], failures: [] };
    const action = next(state);
    if (state === 'CONFLICT') {
        const reason = conflictStageReason(facts.stage);
        if (reason !== null) return { lines: [`release-train: would-write: refused -- ${reason}`], failures: [] };
        const decision = renderConflict(candidateTag, conflictPatchNumber(facts.stage), facts.stage, '');
        return {
            lines: [`release-train: would-write: state=${state} action=${action}`, `would-write: conflict issue "${decision.title}", assigned to the owner; no patch is written`],
            failures: conflictWriteFailures(decision),
        };
    }
    const rendered = render(state, facts);
    return {
        lines: [`release-train: would-write: state=${state} action=${action}`, `would-write: tracking issue "${rendered.title}" labels=${rendered.labels.join(',')}; the writer is not wired`, rendered.body],
        failures: [],
    };
}

/** The fix job re-checks its dispatch inputs before it reads anything else. Exit 0 when all hold. */
function fixerInputsCli([releaseKey, cls, branch, targetTag, fingerprint, attempt, latestTag]) {
    const [checkLabel = '', baseSha = ''] = fingerprint.split('@');
    const failures = fixerInputsCheck({ releaseKey, cls, branch, targetTag, fingerprint, attempt, latestTag: latestTag === '' ? null : latestTag });
    if (failures.length === 0) {
        console.log(`${NAME}: fixer-inputs PASS -- ${releaseKey} ${cls} on ${branch} (check ${checkLabel}, base ${baseSha.slice(0, 10)}) carries valid inputs`);
        return 0;
    }
    failures.forEach(f => console.error(`${NAME}: FAIL -- [${f.guard}] ${f.msg}. Next step: re-dispatch the fixer with valid inputs, or leave the release to the owner.`));
    return 1;
}

function wouldWriteCli([pinTag, tag, openPrNumber, stage]) {
    if (tagToVersion(pinTag) === null) {
        console.error(`${NAME}: FAIL -- the pin ${JSON.stringify(pinTag)} is not an *esr_RELEASE tag. Next step: check the pin in configuration.toml.`);
        return 2;
    }
    const view = wouldWrite({ pinTag, tag, openPrNumber, stage });
    view.lines.forEach(l => console.log(l));
    if (view.failures.length > 0) {
        view.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        return 1;
    }
    return 0;
}

/**
 * What a publish of a bump branch may do, given the remote branch as the GitHub API reports it.
 *   create            the remote branch is absent: a plain push creates it.
 *   skip              the remote already carries this tree: nothing to push (the PR step still runs).
 *   force-with-lease  the remote holds only bot-authored commits and a different tree: replace them,
 *                     pinned to the tip that was read, so a concurrent change makes the push fail.
 *   refuse            the remote holds a commit the bot App did not author, or its history cannot be
 *                     listed in full: never overwrite it; the owner is working on the branch.
 * remote: { tip, tree, compare: { total, emails } } or null when the branch is absent. Pure.
 */
export function publishPlan({ localTree, remote, botEmail }) {
    if (remote === null) return { action: 'create', expect: null, reason: null };
    if (remote.tree === localTree) return { action: 'skip', expect: null, reason: `the remote branch already carries tree ${localTree}` };
    if (remote.compare === null || remote.compare.total > remote.compare.emails.length) {
        return { action: 'refuse', expect: null, reason: 'the remote branch history cannot be listed in full, so no commit can be proven bot-authored. Next step: inspect the branch by hand.' };
    }
    const foreign = remote.compare.emails.filter(e => e !== botEmail);
    if (foreign.length > 0) {
        return { action: 'refuse', expect: null, reason: `${foreign.length} commit(s) on the remote branch are not authored by the bot App, so someone is working on it; not pushing. Next step: merge or close that work, or delete the branch.` };
    }
    return { action: 'force-with-lease', expect: remote.tip, reason: null };
}

/** The remote facts as the CLI receives them: empty strings mean absent. Throws on malformed JSON. */
function remoteFromArgs(tip, tree, compareJson) {
    if (tip === '') return null;
    return { tip, tree, compare: compareJson === '' ? null : JSON.parse(compareJson) };
}

function publishPlanCli([localTree, tip, tree, compareJson, botEmail]) {
    if (localTree === '' || botEmail === '') {
        console.error(`${NAME}: FAIL -- the publish plan needs the local tree and the bot author email. Next step: pass both.`);
        return 2;
    }
    let remote;
    try {
        remote = remoteFromArgs(tip, tree, compareJson);
    } catch (e) {
        console.error(`${NAME}: FAIL -- the remote compare is not JSON (${e.message}). Next step: re-read the branch; the publish script passes the API output.`);
        return 1;
    }
    const plan = publishPlan({ localTree, remote, botEmail });
    if (plan.reason !== null) console.error(`${NAME}: NOTE -- ${plan.reason}`);
    console.log(`publish=${plan.action}`);
    console.log(`expect=${plan.expect ?? ''}`);
    return 0;
}

function setDiff(a, b) {
    const sa = new Set(a);
    const sb = new Set(b);
    return {
        onlyA: [...sa].filter(x => !sb.has(x)).sort(),
        onlyB: [...sb].filter(x => !sa.has(x)).sort(),
    };
}

// Fixture tags are built from parts at run time: a tag literal in source would trip the
// pin-carrier sweep (verify-upstream-pins), which allows the manifest alone to carry one.
const esrTag = (major, minor, patch, kind = 'RELEASE') => `FIREFOX_${major}_${minor}_${patch}esr_${kind}`;
// Fixture author emails. The bot's address is passed in by the workflow, never a literal here.
const BOT_EMAIL_FIXTURE = 'bot-fixture@example.invalid';
const OWNER_EMAIL = 'owner-fixture@example.invalid';
const BASE_PIN = esrTag(153, 5, 1);
const NEWER = esrTag(153, 23, 0);
const BASE = Object.freeze({ pinTag: BASE_PIN, revision: 1, candidateTag: null, openPr: null, bumpConclusion: null, stage: null, verifyCheck: null, merged: false, pinUnchanged: false });
// Each fixture carries its expected action as a literal. next() is checked against that
// literal, never against ACTIONS, so a wrong entry in ACTIONS cannot agree with itself.
const FIXTURES = Object.freeze({
    DETECTED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER }, action: 'bump' }),
    BUMPING: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 41 }, bumpConclusion: null }, action: 'wait' }),
    CONFLICT: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply (real conflict, not silent)' }, action: 'conflict-issue' }),
    BUMP_RED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 42 }, verifyCheck: 'failure' }, action: 'wait-owner' }),
    BUMP_PR_GREEN: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 43 }, verifyCheck: 'success', pinUnchanged: false }, action: 'gate' }),
    NEEDS_OWNER: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 44 }, verifyCheck: 'failure', fixAttempts: 2 }, action: 'wait-owner' }),
});

// Fixer fixtures (Phase 52). Every key, tag and sha is built here, never a literal in a changed run.
const FIX_REPO = 'fixture-owner/powerbrowser';
const FIX_OWNER = 'fixture-owner';
const FIX_KEY = 'v153.23.0-1';
const FIX_OLD_KEY = 'v153.22.0-1';
const FIX_SHA = 'a'.repeat(40);
const FIX_TAG = esrTag(153, 23, 0);
const FIX_BASE = Object.freeze({
    source: 'bump', state: 'CONFLICT', branch: `chore/esr-${FIX_TAG}`, headRepository: FIX_REPO, repository: FIX_REPO,
    actor: FIX_OWNER, author: FIX_OWNER, ownerLogin: FIX_OWNER, releaseKey: FIX_KEY, latestTag: FIX_OLD_KEY,
    targetTag: FIX_TAG, checkLabel: 'verify', baseSha: FIX_SHA, attempt: 1, fixAttempts: 0,
});
const DISPATCH_FIXTURES = Object.freeze({
    F1_conflict: Object.freeze({ facts: FIX_BASE, route: 'dispatch', cls: 'F1' }),
    F2_red_esr: Object.freeze({ facts: { ...FIX_BASE, state: 'BUMP_RED', branch: `chore/esr-${FIX_TAG}` }, route: 'dispatch', cls: 'F2' }),
    F2_red_renovate: Object.freeze({ facts: { ...FIX_BASE, state: 'BUMP_RED', branch: 'renovate/theia-monorepo', author: 'renovate[bot]', actor: FIX_OWNER }, route: 'dispatch', cls: 'F2' }),
    F3_red_main: Object.freeze({ facts: { ...FIX_BASE, source: 'verify', state: 'MAIN_RED', branch: 'main', attempt: 1 }, route: 'dispatch', cls: 'F3' }),
});

/** Failures for a conflict decision that writes anything under the patch directory. Pure. */
export function conflictWriteFailures(decision) {
    return (decision.writes ?? [])
        .filter(w => w.startsWith(`${PATCH_DIR}/`))
        .map(w => `conflict decision writes ${w} under the patch directory. Next step: the conflict path opens an issue only; regenerate-patches.sh is the one patch writer.`);
}

function runChecks(overrides = {}) {
    const states = overrides.states ?? Object.keys(STATES);
    const fixtures = overrides.fixtures ?? FIXTURES;
    const actionKeys = overrides.actionKeys ?? Object.keys(ACTIONS);
    const failures = [];
    const { onlyA: missingFixtures, onlyB: missingStates } = setDiff(states, Object.keys(fixtures));
    for (const s of missingFixtures) failures.push(`state ${s} has no fixture. Next step: add a fixture for ${s} beside the other states.`);
    for (const f of missingStates) failures.push(`fixture ${f} names no state in STATES. Next step: add ${f} to STATES, or delete the fixture.`);
    const { onlyA: extraActions, onlyB: missingActions } = setDiff(actionKeys, Object.keys(STATES));
    for (const a of extraActions) failures.push(`action ${a} names no state in STATES. Next step: delete it from ACTIONS, or add the state to STATES.`);
    for (const s of missingActions) failures.push(`state ${s} has no action in ACTIONS. Next step: map ${s} to its action in ACTIONS.`);
    for (const name of Object.keys(fixtures)) {
        if (!states.includes(name)) continue;
        const { facts, action: expected } = fixtures[name];
        const got = derive(facts);
        if (got !== name) failures.push(`fixture ${name} derives ${got} instead of ${name}. Next step: fix derive() or the fixture facts.`);
        const action = next(got);
        if (action !== expected) failures.push(`fixture ${name} maps to action ${action}, not the expected ${expected}. Next step: fix next() or the expected action beside the fixture.`);
        const rendered = render(name, facts);
        if (!rendered.title.startsWith('release-train: v') || !rendered.body.includes(name)) failures.push(`fixture ${name} renders without its release key or state. Next step: fix render().`);
    }
    return { failures: failures.sort() };
}

function selfTest(mode = 'all') {
    const baseline = runChecks();
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified fixtures are already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> ${Object.keys(STATES).length} states, ${Object.keys(FIXTURES).length} fixtures with expected actions, set-equal; derive, next and render agree`);

    const OWNER = 'owner-login-fixture';
    const trainPlants = [
        {
            name: 'a sixth state with no fixture',
            run: () => runChecks({ states: [...Object.keys(STATES), 'BUILDING'] }).failures,
            expect: 'BUILDING',
        },
        {
            name: 'a sixth fixture with no state',
            run: () => runChecks({ fixtures: { ...FIXTURES, BUILT: { facts: { ...BASE, candidateTag: NEWER }, action: 'bump' } } }).failures,
            expect: 'fixture BUILT names no state',
        },
        {
            name: 'a sixth action with no state',
            run: () => runChecks({ actionKeys: [...Object.keys(ACTIONS), 'BUILDING'] }).failures,
            expect: 'action BUILDING names no state',
        },
        {
            name: 'a state with no action',
            run: () => runChecks({ actionKeys: Object.keys(ACTIONS).filter(k => k !== 'BUMPING') }).failures,
            expect: 'state BUMPING has no action',
        },
        {
            name: 'a merged PR with the pin unchanged',
            run: () => {
                const facts = { ...FIXTURES.BUMP_PR_GREEN.facts, openPr: null, merged: true, pinUnchanged: true };
                const got = derive(facts);
                if (got === 'BUMP_RED') return [`BUMP_RED: merged PR left the pin at ${facts.pinTag} unchanged`];
                return [`merged PR derives ${got} with the pin unchanged, never a green state`];
            },
            expect: `left the pin at ${BASE_PIN} unchanged`,
        },
        {
            name: 'a 175.x ESR under the 153 guard',
            run: () => {
                const verdict = classifyTag(esrTag(175, 0, 0), 153);
                return verdict.keep ? ['175.x tag kept under the 153 guard'] : [verdict.reason];
            },
            expect: 'major 175 is not the pinned major 153',
        },
    ];

    const conflictPlants = [
        {
            name: 'a conflict stage line naming no patch number',
            run: () => {
                const reason = conflictStageReason('apply-patches: FAIL -- the patch did not apply');
                return reason === null ? [] : [reason];
            },
            expect: 'names no patch number',
        },
        {
            name: 'a conflict decision that writes under the patch directory',
            // The real rule (conflictWriteFailures) reads the real decision shape, with one planted write.
            run: () => conflictWriteFailures({ ...renderConflict(NEWER, '020', 'log', 'diff'), writes: [`${PATCH_DIR}/020-powerbrowser-shell.patch`] }),
            expect: 'writes patches/020-powerbrowser-shell.patch under the patch directory',
        },
    ];

    // The publish plan: a remote branch with a commit the bot did not author is never overwritten.
    const publishPlants = [
        {
            name: 'a remote bump branch carrying a commit the bot App did not author',
            run: () => {
                const plan = publishPlan({ localTree: 'T-LOCAL', remote: { tip: 'R-TIP', tree: 'T-REMOTE', compare: { total: 2, emails: [OWNER_EMAIL, BOT_EMAIL_FIXTURE] } }, botEmail: BOT_EMAIL_FIXTURE });
                return plan.action === 'refuse' ? [plan.reason] : [`owner-authored remote branch planned as ${plan.action}`];
            },
            expect: 'not authored by the bot App',
        },
        {
            name: 'a remote compare too long to list in full',
            run: () => {
                const plan = publishPlan({ localTree: 'T-LOCAL', remote: { tip: 'R-TIP', tree: 'T-REMOTE', compare: { total: 300, emails: Array(250).fill(BOT_EMAIL_FIXTURE) } }, botEmail: BOT_EMAIL_FIXTURE });
                return plan.action === 'refuse' ? [plan.reason] : [`an unlisted history planned as ${plan.action}`];
            },
            expect: 'cannot be listed in full',
        },
    ];

    const viewPlants = [
        {
            name: 'an open PR number with no candidate tag is refused, not named chore/esr-null',
            run: () => wouldWrite({ pinTag: BASE_PIN, tag: '', openPrNumber: '41', stage: '' }).failures,
            expect: 'names no candidate tag',
        },
        {
            name: 'a conflict stage line naming no patch number is refused by the would-write view',
            run: () => wouldWrite({ pinTag: BASE_PIN, tag: NEWER, openPrNumber: '', stage: 'FAIL -- apply-patches.sh failed replaying' }).lines.filter(l => l.includes('refused')),
            expect: 'names no patch number',
        },
    ];
    const publishGreens = [
        {
            name: 'control: an absent remote branch is created',
            run: () => (publishPlan({ localTree: 'T-LOCAL', remote: null, botEmail: BOT_EMAIL_FIXTURE }).action === 'create' ? [] : ['absent branch not created']),
        },
        {
            name: 'control: a remote branch already carrying the tree is skipped, even with owner commits',
            run: () => (publishPlan({ localTree: 'T-LOCAL', remote: { tip: 'R', tree: 'T-LOCAL', compare: { total: 1, emails: [OWNER_EMAIL] } }, botEmail: BOT_EMAIL_FIXTURE }).action === 'skip' ? [] : ['same-tree remote not skipped']),
        },
        {
            name: 'control: bot-only divergent history is replaced, pinned to the observed tip',
            run: () => {
                const plan = publishPlan({ localTree: 'T-LOCAL', remote: { tip: 'R-TIP', tree: 'T-REMOTE', compare: { total: 1, emails: [BOT_EMAIL_FIXTURE] } }, botEmail: BOT_EMAIL_FIXTURE });
                return plan.action === 'force-with-lease' && plan.expect === 'R-TIP' ? [] : [`bot-only branch planned as ${plan.action} expect ${plan.expect}`];
            },
        },
    ];

    const greens = [
        ...publishGreens,
        {
            name: 'control: a fresh candidate is would-written as a bump and carries the tracking title',
            run: () => {
                const view = wouldWrite({ pinTag: BASE_PIN, tag: NEWER, openPrNumber: '', stage: '' });
                return view.lines[0].includes('state=DETECTED action=bump') && view.lines[1].includes('release-train: v153.23.0-1') ? [] : [`would-write said ${view.lines[0]}`];
            },
        },
        {
            name: 'control: no candidate and no open PR is idle, with nothing written',
            run: () => (wouldWrite({ pinTag: BASE_PIN, tag: '', openPrNumber: '', stage: '' }).lines[0].includes('idle') ? [] : ['no-candidate run was not idle']),
        },
        {
            name: 'control: the owner is mentioned only on the gate state',
            run: () => {
                const gate = render('BUMP_PR_GREEN', { ...FIXTURES.BUMP_PR_GREEN.facts, ownerLogin: OWNER });
                const bumping = render('BUMPING', { ...FIXTURES.BUMPING.facts, ownerLogin: OWNER });
                return gate.mention === OWNER && bumping.mention === null ? [] : ['owner mention drifted from the gate'];
            },
        },
        {
            name: 'control: the real conflict decision writes nothing under the patch directory',
            run: () => conflictWriteFailures(renderConflict(NEWER, '020', 'log', 'diff')),
        },
    ];

    // Phase 52 fixer cases. Each refusal reason begins with its guard name, so a plant names the guard it trips.
    const refused = (overrides) => {
        const r = fixerDispatch({ ...FIX_BASE, ...overrides });
        return r.dispatch === null ? [r.reason] : [];
    };
    const dispatchPlants = [
        { name: 'a release.yml red run starts the fixer', run: () => refused({ source: 'release.yml', state: 'BUMP_RED', branch: 'main' }), expect: 'release.yml' },
        { name: 'a fork head starts the fixer', run: () => refused({ headRepository: 'fixture-fork/powerbrowser' }), expect: 'fork' },
        { name: 'an external author starts the fixer', run: () => refused({ author: 'outside-contributor' }), expect: 'external-author' },
        { name: 'a bot actor starts the fixer', run: () => refused({ actor: 'powerbrowser-bot[bot]' }), expect: 'bot-actor' },
        { name: 'a claude-fix/ head starts the fixer', run: () => refused({ branch: `claude-fix/${FIX_KEY}-F1-1` }), expect: 'claude-fix/' },
        { name: 'a release key equal to the latest Release starts the fixer', run: () => refused({ latestTag: FIX_KEY }), expect: 'key-not-greater' },
        { name: 'a renovate branch on the F1 conflict class starts the fixer', run: () => refused({ branch: 'renovate/theia-monorepo' }), expect: 'target-branch' },
        { name: 'a third dispatch after two fix runs is planned', run: () => { const r = fixerDispatch({ ...FIX_BASE, fixAttempts: 2 }); return r.dispatch === null && r.route === 'NEEDS_OWNER' ? [r.reason] : ['a dispatch was planned past the budget']; }, expect: 'budget' },
        { name: 'a dispatch input check that accepts a claude-fix/ branch', run: () => fixerInputsCheck({ releaseKey: FIX_KEY, cls: 'F1', branch: `claude-fix/${FIX_KEY}-F1-1`, targetTag: FIX_TAG, fingerprint: `verify@${FIX_SHA}`, attempt: '1', latestTag: FIX_OLD_KEY }).map(x => x.msg), expect: 'claude-fix/' },
        { name: 'a dispatch input check that accepts a non-hex fingerprint', run: () => fixerInputsCheck({ releaseKey: FIX_KEY, cls: 'F1', branch: `chore/esr-${FIX_TAG}`, targetTag: FIX_TAG, fingerprint: 'verify@short', attempt: '1', latestTag: FIX_OLD_KEY }).map(x => x.msg), expect: 'fingerprint' },
    ];
    const dispatchGreens = [
        ...Object.entries(DISPATCH_FIXTURES).map(([name, fx]) => ({
            name: `control: ${name} dispatches exactly the seven inputs for class ${fx.cls}`,
            run: () => {
                const r = fixerDispatch(fx.facts);
                if (r.dispatch === null) return [`${name} refused: ${r.reason}`];
                const keys = Object.keys(r.dispatch).sort();
                if (keys.join(',') !== [...DISPATCH_INPUTS].sort().join(',')) return [`${name} dispatched keys ${keys.join(',')}`];
                return r.dispatch.class === fx.cls && r.dispatch.reason === 'fix' && r.dispatch.fingerprint === `verify@${FIX_SHA}` ? [] : [`${name} dispatched ${JSON.stringify(r.dispatch)}`];
            },
        })),
        {
            name: 'control: the input check accepts the F1 dispatch inputs',
            run: () => (fixerInputsCheck({ releaseKey: FIX_KEY, cls: 'F1', branch: `chore/esr-${FIX_TAG}`, targetTag: FIX_TAG, fingerprint: `verify@${FIX_SHA}`, attempt: '1', latestTag: FIX_OLD_KEY }).length === 0 ? [] : ['the F1 inputs were refused']),
        },
        {
            name: 'control: keyGreater orders the key above the older Release and not equal to it',
            run: () => (keyGreater(FIX_KEY, FIX_OLD_KEY) && !keyGreater(FIX_KEY, FIX_KEY) && keyGreater(FIX_KEY, '') ? [] : ['keyGreater ordering drifted']),
        },
    ];
    const attemptPlants = [];
    const attemptGreens = [
        { name: 'control: a fix run of another release key is not counted against this key', run: () => (fixAttempts([{ name: `fix ${FIX_OLD_KEY} F1 attempt 1`, verdict: 'pass', labels: [] }], FIX_KEY, 'F1') === 0 ? [] : [`attempt for ${FIX_OLD_KEY} counted against ${FIX_KEY}`]) },
        { name: 'control: a fix run whose gate rejected it still spends the budget', run: () => (fixAttempts([{ name: `fix ${FIX_KEY} F1 attempt 1`, verdict: 'reject', labels: [] }], FIX_KEY, 'F1') === 1 ? [] : ['a rejected attempt was not counted']) },
        { name: 'control: a claude-fix label with no fix run-name is not counted', run: () => (fixAttempts([{ name: 'release-train', verdict: null, labels: ['claude-fix'] }], FIX_KEY, 'F1') === 0 ? [] : ['a label was counted as an attempt']) },
        { name: 'control: attempts for another class are not counted', run: () => (fixAttempts([{ name: `fix ${FIX_KEY} F2 attempt 1`, verdict: 'pass', labels: [] }], FIX_KEY, 'F1') === 0 ? [] : ['another class was counted']) },
        { name: 'control: a non-numeric attempt suffix is not counted', run: () => (fixAttempts([{ name: `fix ${FIX_KEY} F1 attempt x`, verdict: null, labels: [] }], FIX_KEY, 'F1') === 0 ? [] : ['a non-numeric attempt was counted']) },
        { name: 'control: one prior fix run leaves a red stage fixable', run: () => (derive({ ...FIXTURES.CONFLICT.facts, fixAttempts: 1 }) === 'CONFLICT' ? [] : ['one prior run moved the stage']) },
        { name: 'control: two prior fix runs move a further red to NEEDS_OWNER', run: () => (derive({ ...FIXTURES.CONFLICT.facts, fixAttempts: 2 }) === 'NEEDS_OWNER' ? [] : ['two prior runs did not move the stage']) },
        { name: 'control: a red open bump PR with two prior runs moves to NEEDS_OWNER', run: () => (derive({ ...FIXTURES.BUMP_RED.facts, fixAttempts: 2 }) === 'NEEDS_OWNER' ? [] : ['a red bump PR did not move']) },
    ];
    const renderPlants = [
        { name: 'a release.yml issue body that names a dispatch', run: () => { const body = `${renderReleaseRed({ releaseKey: FIX_KEY, logUrl: 'https://example.invalid/run/1' }).body}\nDispatch the fixer.`; return /dispatch/i.test(body) ? ['release.yml body carries a dispatch instruction'] : []; }, expect: 'dispatch instruction' },
        { name: 'a red stage rendered with no owner assignee', run: () => (render('NEEDS_OWNER', { ...FIXTURES.NEEDS_OWNER.facts, ownerLogin: '' }).assign.length === 0 ? ['NEEDS_OWNER rendered with no owner assignee'] : []), expect: 'no owner assignee' },
    ];
    const renderGreens = [
        {
            name: 'control: NEEDS_OWNER renders train:blocked, the owner and the failing log',
            run: () => {
                const r = render('NEEDS_OWNER', { ...FIXTURES.NEEDS_OWNER.facts, ownerLogin: FIX_OWNER, logUrl: 'https://example.invalid/run/2' });
                const ok = r.labels.includes('train:blocked') && r.assign.includes(FIX_OWNER) && r.body.includes('https://example.invalid/run/2');
                return ok ? [] : [`NEEDS_OWNER render labels=${r.labels.join(',')} assign=${r.assign.join(',')}`];
            },
        },
        {
            name: 'control: a release.yml red renders its issue with no dispatch instruction',
            run: () => {
                const r = renderReleaseRed({ releaseKey: FIX_KEY, logUrl: 'https://example.invalid/run/3', ownerLogin: FIX_OWNER });
                return !/dispatch/i.test(r.body) && r.labels.includes('train:blocked') && r.assign.includes(FIX_OWNER) ? [] : ['release.yml render carried a dispatch or lost its labels'];
            },
        },
        {
            name: 'control: BUMPING does not carry train:blocked',
            run: () => (render('BUMPING', { ...FIXTURES.BUMPING.facts, ownerLogin: OWNER }).labels.includes('train:blocked') ? ['BUMPING carried train:blocked'] : []),
        },
    ];

    const want = (section) => mode === 'all' || mode === section;
    const plants = [
        ...(want('derive') ? [...trainPlants, ...conflictPlants, ...viewPlants, ...publishPlants, ...dispatchPlants] : []),
        ...(want('next') ? attemptPlants : []),
        ...(want('render') ? renderPlants : []),
    ];
    const allGreens = [
        ...(want('derive') ? [...greens, ...dispatchGreens] : []),
        ...(want('next') ? attemptGreens : []),
        ...(want('render') ? renderGreens : []),
    ];

    let failed = 0;
    for (const p of plants) {
        const failures = p.run();
        const named = failures.find(f => f.includes(p.expect));
        if (failures.some(f => f.includes(REPO_ROOT))) {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' leaked the checkout path into its output`);
            failed += 1;
        } else if (named !== undefined) {
            console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`);
            failed += 1;
        }
    }
    for (const g of allGreens) {
        const failures = g.run();
        if (failures.length === 0) {
            console.log(`  ok  ${g.name} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${g.name}' went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, ${plants.length} planted faults went red naming their drift, and ${allGreens.length} controls stayed green (section: ${mode})`);
    return 0;
}

const args = process.argv.slice(2);
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Run only as the entry point, so the exports stay importable without side effects.
if (isEntry) {
    if (args.length === 0) {
        console.log(`${NAME}: SKIP -- no mode given; run: node ${SELF_REL} --self-test`);
        process.exit(0);
    }
    if (args.length === 1 && args[0] === '--self-test') process.exit(selfTest('all'));
    if (args.length === 2 && ['derive', 'next', 'render'].includes(args[0]) && args[1] === '--self-test') process.exit(selfTest(args[0]));
    if (args[0] === '--would-write' && args.length === 5) process.exit(wouldWriteCli(args.slice(1)));
    if (args[0] === '--fixer-inputs' && args.length === 8) process.exit(fixerInputsCli(args.slice(1)));
    if (args[0] === '--publish-plan' && args.length === 6) process.exit(publishPlanCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} [derive|next|render] --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>, or node ${SELF_REL} --fixer-inputs <release-key> <class> <branch> <target-tag> <check@sha> <attempt> <latest-tag|''>.`);
    process.exit(2);
}
