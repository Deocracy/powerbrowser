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
// The uptake lane (TRAIN-05, UPS-01) keeps its own keys and states beside the five
// above. A 175 candidate derives UPTAKE_* states: UPTAKE_DETECTED (replay due),
// UPTAKE_CONFLICT (a patch did not apply), UPTAKE_RED (another replay FAIL) and
// UPTAKE_REPLAYED (replay PASS, NOTE counts only). Its action is replay-only, note
// or conflict-issue; no uptake state ever maps to a bump, a branch or a PR. Its
// tracking issue is keyed by its own release key (release-train: v175.<x>-<rev>).
// deriveUptake and uptakeGuard refuse any candidate that is not a uptake-major tag.
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
//   node scripts/release-train.mjs --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>
//   node scripts/release-train.mjs --uptake-would-write <tag|''> <stage|''> <replayed true|false> <replay-result>
//                                       (replay-result: the uptake-replay job result, success|failure|cancelled|skipped)

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTag, tagToVersion, UPTAKE_MAJOR } from './detect-upstreams.mjs';

const NAME = 'release-train-logic';
const SELF_REL = 'scripts/release-train.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = Object.freeze({ track: 'release-train', state: (s) => `state/${s}` });
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
});

// The uptake lane (TRAIN-05). Replay-only: no state here opens a branch, a PR or a dispatch.
export const UPTAKE_STATES = Object.freeze({
    UPTAKE_DETECTED: Object.freeze({ desc: 'a uptake-major *esr_RELEASE tag exists and its replay has not run: replay-only, no branch, no PR' }),
    UPTAKE_CONFLICT: Object.freeze({ desc: 'the uptake replay FAILed in apply-patches: a patch did not apply' }),
    UPTAKE_RED: Object.freeze({ desc: 'another uptake replay FAIL: a check or the brand scan, not a patch conflict' }),
    UPTAKE_REPLAYED: Object.freeze({ desc: 'the uptake replay PASSed: NOTE counts only, nothing written' }),
});
export const ALL_STATES = Object.freeze({ ...STATES, ...UPTAKE_STATES });

const ACTIONS = Object.freeze({
    DETECTED: 'bump',
    BUMPING: 'wait',
    CONFLICT: 'conflict-issue',
    BUMP_RED: 'wait-owner',
    BUMP_PR_GREEN: 'gate',
    UPTAKE_DETECTED: 'replay-only',
    UPTAKE_CONFLICT: 'conflict-issue',
    UPTAKE_RED: 'wait-owner',
    UPTAKE_REPLAYED: 'note',
});

/** The state a release is in, from facts, or null with nothing to do. Pure. */
export function derive(facts) {
    const f = facts;
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

/** The one action a state maps to. A null state is idle. Pure. */
export function next(state) {
    if (state === null) return 'idle';
    if (!Object.hasOwn(ACTIONS, state)) throw new Error(`no action for unknown state ${JSON.stringify(state)}`);
    return ACTIONS[state];
}

/**
 * Null when the tag may be replayed on the uptake lane, else the named refusal. A 153 tag and
 * a _BUILDn tag are both refused here. Pure.
 */
export function uptakeGuard(tag) {
    const c = classifyTag(tag, UPTAKE_MAJOR, 'uptake');
    return c.keep ? null : c.reason;
}

/**
 * The uptake state for one candidate, or null when there is no candidate or the candidate is not
 * a uptake-major tag (uptakeGuard names that refusal). Facts: candidateTag, stage (the first FAIL
 * line the replay printed, or null) and replayed (true when the replay job ended success). Pure.
 */
export function deriveUptake(facts) {
    const f = facts;
    if (typeof f.candidateTag !== 'string' || uptakeGuard(f.candidateTag) !== null) return null;
    if (typeof f.stage === 'string' && APPLY_FAIL.test(f.stage)) return 'UPTAKE_CONFLICT';
    if (typeof f.stage === 'string' && ANY_FAIL.test(f.stage)) return 'UPTAKE_RED';
    if (f.replayed === true) return 'UPTAKE_REPLAYED';
    return 'UPTAKE_DETECTED';
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
    const body = [
        title,
        '',
        '| Step | State | Evidence |',
        '| --- | --- | --- |',
        `| ${state} | ${state} | ${evidence} |`,
        '',
        `<!-- release-train:v1 ${snapshot} -->`,
        '',
    ].join('\n');
    const gate = state === 'BUMP_PR_GREEN' && typeof facts.ownerLogin === 'string' && facts.ownerLogin !== '';
    return {
        title,
        body,
        labels: [LABELS.track, LABELS.state(state)],
        mention: gate ? facts.ownerLogin : null,
        assign: gate ? [facts.ownerLogin] : [],
        lock: true,
        close: false,
        writes: [],
    };
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

/**
 * The would-write view for the uptake lane: the 175 candidate's state and action, and the conflict
 * issue when the replay FAILed on a patch. Replay-only: it names what a live run would do and writes
 * nothing. The tracking writer is unwired (BLOCKED.md item 3 of Phase 43), so the view prints the
 * rendered body and does not PATCH. replayResult is the uptake-replay job result: a candidate needs
 * success, and an empty candidate needs skipped. Any other result is red whatever stage line the job
 * printed, because a late step can fail after the stage already reads replayed. Pure.
 */
export function uptakeWouldWrite({ tag, stage, replayed, replayResult }) {
    const expected = tag === '' ? 'skipped' : 'success';
    const resultFailures = replayResult === expected ? [] : [`the uptake replay job ended ${replayResult} (expected ${expected}) after stage ${stage || 'none'}. Next step: read the uptake replay log, fix the step it names, and re-run.`];
    if (tag === '') return { lines: ['release-train: would-write: uptake idle; no uptake-major tag is listed, so nothing is replayed'], failures: resultFailures };
    const guard = uptakeGuard(tag);
    if (guard !== null) return { lines: [], failures: [`${guard}. Next step: pass only a uptake-major *esr_RELEASE tag to the replay lane.`, ...resultFailures] };
    // A job that did not succeed derives red from its own result: a FAIL stage line keeps its
    // conflict or red state, and any other stage (replayed, or none) becomes a synthetic FAIL line.
    const stageLine = stage === '' ? null : stage;
    const judged = resultFailures.length > 0 && !(typeof stageLine === 'string' && ANY_FAIL.test(stageLine))
        ? `FAIL -- the uptake replay job ended ${replayResult} after stage ${stage || 'none'}`
        : stageLine;
    const facts = { candidateTag: tag, revision: 1, stage: judged, replayed: replayed === true };
    const state = deriveUptake(facts);
    const action = next(state);
    if (state === 'UPTAKE_CONFLICT') {
        const reason = conflictStageReason(facts.stage);
        if (reason !== null) return { lines: [`release-train: would-write: refused -- ${reason}`], failures: resultFailures };
        const decision = renderConflict(tag, conflictPatchNumber(facts.stage), facts.stage, '');
        return {
            lines: [`release-train: would-write: state=${state} action=${action}`, `would-write: conflict issue "${decision.title}", assigned to the owner; no patch is written`],
            failures: [...conflictWriteFailures(decision), ...resultFailures],
        };
    }
    const rendered = render(state, facts);
    return {
        lines: [`release-train: would-write: state=${state} action=${action}`, `would-write: uptake tracking issue "${rendered.title}" labels=${rendered.labels.join(',')}; the writer is not wired`, rendered.body],
        failures: resultFailures,
    };
}

function uptakeWouldWriteCli([tag, stage, replayed, replayResult]) {
    const view = uptakeWouldWrite({ tag, stage, replayed: replayed === 'true', replayResult });
    view.lines.forEach(l => console.log(l));
    if (view.failures.length > 0) {
        view.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        return 1;
    }
    return 0;
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
const FIXTURES_153 = Object.freeze({
    DETECTED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER }, action: 'bump' }),
    BUMPING: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 41 }, bumpConclusion: null }, action: 'wait' }),
    CONFLICT: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply (real conflict, not silent)' }, action: 'conflict-issue' }),
    BUMP_RED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 42 }, verifyCheck: 'failure' }, action: 'wait-owner' }),
    BUMP_PR_GREEN: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 43 }, verifyCheck: 'success', pinUnchanged: false }, action: 'gate' }),
});
// The uptake lane's fixtures, one per UPTAKE_* state. The candidate is a 175 tag, built from parts.
const UPTAKE_TAG = esrTag(UPTAKE_MAJOR, 0, 0);
const UPTAKE_BASE = Object.freeze({ candidateTag: UPTAKE_TAG, stage: null, replayed: false });
const UPTAKE_FIXTURES = Object.freeze({
    UPTAKE_DETECTED: Object.freeze({ facts: { ...UPTAKE_BASE }, action: 'replay-only' }),
    UPTAKE_CONFLICT: Object.freeze({ facts: { ...UPTAKE_BASE, stage: 'apply-patches: FAIL -- 030-powerbrowser-mar-certificates.patch did not apply (real conflict, not silent)' }, action: 'conflict-issue' }),
    UPTAKE_RED: Object.freeze({ facts: { ...UPTAKE_BASE, stage: 'rebase-upstream: FAIL -- scan-brand-residue.mjs found residual brand strings after the replay' }, action: 'wait-owner' }),
    UPTAKE_REPLAYED: Object.freeze({ facts: { ...UPTAKE_BASE, replayed: true }, action: 'note' }),
});
const FIXTURES = Object.freeze({ ...FIXTURES_153, ...UPTAKE_FIXTURES });

/** Failures for a conflict decision that writes anything under the patch directory. Pure. */
export function conflictWriteFailures(decision) {
    return (decision.writes ?? [])
        .filter(w => w.startsWith(`${PATCH_DIR}/`))
        .map(w => `conflict decision writes ${w} under the patch directory. Next step: the conflict path opens an issue only; regenerate-patches.sh is the one patch writer.`);
}

function runChecks(overrides = {}) {
    const states = overrides.states ?? Object.keys(ALL_STATES);
    const fixtures = overrides.fixtures ?? FIXTURES;
    const actionKeys = overrides.actionKeys ?? Object.keys(ACTIONS);
    const failures = [];
    const { onlyA: missingFixtures, onlyB: missingStates } = setDiff(states, Object.keys(fixtures));
    for (const s of missingFixtures) failures.push(`state ${s} has no fixture. Next step: add a fixture for ${s} beside the other states.`);
    for (const f of missingStates) failures.push(`fixture ${f} names no state in STATES. Next step: add ${f} to STATES, or delete the fixture.`);
    const { onlyA: extraActions, onlyB: missingActions } = setDiff(actionKeys, Object.keys(ALL_STATES));
    for (const a of extraActions) failures.push(`action ${a} names no state in STATES. Next step: delete it from ACTIONS, or add the state to STATES.`);
    for (const s of missingActions) failures.push(`state ${s} has no action in ACTIONS. Next step: map ${s} to its action in ACTIONS.`);
    for (const name of Object.keys(fixtures)) {
        if (!states.includes(name)) continue;
        const { facts, action: expected } = fixtures[name];
        // The uptake lane derives with its own function, so a 175 fixture is never judged by the 153 table.
        const got = name.startsWith('UPTAKE_') ? deriveUptake(facts) : derive(facts);
        if (got !== name) failures.push(`fixture ${name} derives ${got} instead of ${name}. Next step: fix derive() or the fixture facts.`);
        const action = next(got);
        if (action !== expected) failures.push(`fixture ${name} maps to action ${action}, not the expected ${expected}. Next step: fix next() or the expected action beside the fixture.`);
        const rendered = render(name, facts);
        if (!rendered.title.startsWith('release-train: v') || !rendered.body.includes(name)) failures.push(`fixture ${name} renders without its release key or state. Next step: fix render().`);
    }
    return { failures: failures.sort() };
}

function selfTest() {
    const baseline = runChecks();
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified fixtures are already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> ${Object.keys(ALL_STATES).length} states (${Object.keys(STATES).length} bump-lane, ${Object.keys(UPTAKE_STATES).length} uptake-lane), each with a fixture and an action, set-equal; derive, next and render agree`);

    const OWNER = 'owner-login-fixture';
    const trainPlants = [
        {
            name: 'a sixth state with no fixture',
            run: () => runChecks({ states: [...Object.keys(ALL_STATES), 'BUILDING'] }).failures,
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

    // The uptake lane's faults (TRAIN-05, UPS-01): a 153 tag never reaches the 175 replay, a conflict
    // names its patch, a conflict writes nothing under patches/, and a branch never names another tag.
    const uptakePlants = [
        {
            name: 'a 153.x tag offered to the 175 uptake guard',
            run: () => { const reason = uptakeGuard(NEWER); return reason === null ? [] : [reason]; },
            expect: `major 153 is not the uptake major ${UPTAKE_MAJOR}`,
        },
        {
            name: 'a 153.x tag offered as the uptake replay candidate',
            run: () => uptakeWouldWrite({ tag: NEWER, stage: '', replayed: false, replayResult: 'success' }).failures,
            expect: `not the uptake major ${UPTAKE_MAJOR}`,
        },
        {
            name: 'a uptake conflict stage line naming no patch number',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'FAIL -- apply-patches.sh failed replaying', replayed: false, replayResult: 'failure' }).lines.filter(l => l.includes('refused')),
            expect: 'names no patch number',
        },
        {
            // The review's reproduction (WR-02): the replay printed stage replayed, then a later step failed.
            name: 'a uptake replay that printed stage replayed and then ended failure is red, not replay due',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'replayed', replayed: false, replayResult: 'failure' }).failures,
            expect: 'the uptake replay job ended failure',
        },
        {
            name: 'a uptake replay cancelled at its timeout with no stage line is red',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: false, replayResult: 'cancelled' }).failures,
            expect: 'the uptake replay job ended cancelled',
        },
        {
            name: 'a 175 candidate whose replay job was skipped is red, never idle',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: false, replayResult: 'skipped' }).failures,
            expect: 'the uptake replay job ended skipped',
        },
        {
            name: 'a uptake conflict decision that writes under the patch directory',
            run: () => conflictWriteFailures({ ...renderConflict(UPTAKE_TAG, '030', 'log', 'diff'), writes: [`${PATCH_DIR}/030-powerbrowser-mar-certificates.patch`] }),
            expect: `writes patches/030-powerbrowser-mar-certificates.patch under the patch directory`,
        },
    ];

    let failed = 0;
    for (const p of [...trainPlants, ...conflictPlants, ...viewPlants, ...publishPlants, ...uptakePlants]) {
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
    const uptakeGreens = [
        {
            name: 'control: a 175 candidate is accepted by the uptake guard and, before its replay, derives UPTAKE_DETECTED',
            run: () => {
                const got = deriveUptake(UPTAKE_FIXTURES.UPTAKE_DETECTED.facts);
                const ok = uptakeGuard(UPTAKE_TAG) === null && got === 'UPTAKE_DETECTED';
                return ok ? [] : [`a 175 candidate before its replay derived ${got}`];
            },
        },
        {
            name: 'control: a 175 replay PASS derives UPTAKE_REPLAYED with the note action and no failure',
            run: () => {
                const view = uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: true, replayResult: 'success' });
                const ok = view.lines[0].includes('state=UPTAKE_REPLAYED action=note') && view.failures.length === 0;
                return ok ? [] : [`uptake PASS view said ${view.lines[0]} with ${view.failures.length} failure(s)`];
            },
        },
        {
            // IN-02: the real uptake conflict view, the path a live 175 patch conflict takes, writes nothing under
            // the patch directory. Its only failure is the replay's red result, which the view must still report.
            name: 'control: the real uptake conflict view writes nothing under the patch directory',
            run: () => {
                const view = uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'apply-patches: FAIL -- 030-powerbrowser-mar-certificates.patch did not apply (real conflict, not silent)', replayed: false, replayResult: 'failure' });
                const writes = view.failures.filter(f => f.includes(`${PATCH_DIR}/`));
                const onlyResult = view.failures.length === 1 && view.failures[0].includes('the uptake replay job ended failure');
                const conflict = view.lines.some(l => l.includes('state=UPTAKE_CONFLICT'));
                return writes.length === 0 && onlyResult && conflict ? [] : [`conflict view failures were: ${view.failures.join(' | ') || '(none)'}`];
            },
        },
        {
            name: 'control: a candidate-less uptake run is idle and green when its job was skipped',
            run: () => {
                const view = uptakeWouldWrite({ tag: '', stage: '', replayed: false, replayResult: 'skipped' });
                return view.lines[0].includes('idle') && view.failures.length === 0 ? [] : [`idle view said ${view.lines[0]}`];
            },
        },
        {
            name: 'control: the 153 and 175 keys differ, so their tracking issues never collide',
            run: () => {
                const bump = render('DETECTED', { ...FIXTURES.DETECTED.facts });
                const uptake = render('UPTAKE_DETECTED', { ...UPTAKE_BASE });
                return bump.title !== uptake.title && uptake.title.startsWith('release-train: v175.') ? [] : [`titles ${bump.title} and ${uptake.title} are not distinct per key`];
            },
        },
    ];
    for (const g of [...greens, ...uptakeGreens]) {
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
    const total = trainPlants.length + conflictPlants.length + viewPlants.length + publishPlants.length + uptakePlants.length;
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(ALL_STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, ${total} planted faults went red naming their drift, and ${greens.length + uptakeGreens.length} controls stayed green`);
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
    if (args.length === 1 && args[0] === '--self-test') process.exit(selfTest());
    if (args[0] === '--would-write' && args.length === 5) process.exit(wouldWriteCli(args.slice(1)));
    if (args[0] === '--uptake-would-write' && args.length === 5) process.exit(uptakeWouldWriteCli(args.slice(1)));
    if (args[0] === '--publish-plan' && args.length === 6) process.exit(publishPlanCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, or node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>.`);
    process.exit(2);
}
