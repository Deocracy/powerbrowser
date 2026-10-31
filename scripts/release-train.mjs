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
// The five Phase-A states, then the eight release-stage states of Phase 50 (TRAIN-10):
//   DETECTED       a newer *esr_RELEASE tag exists and no bump PR is open.
//   BUMPING        a bump PR chore/esr-<tag> is open and not yet green.
//   CONFLICT       the replay stage FAILed in apply-patches: a patch did not apply.
//   BUMP_RED       any other replay FAIL, a red bump check, or a merged PR that
//                  left the pin unchanged.
//   BUMP_PR_GREEN  the bump PR is open, the pin moved, and the required verify
//                  check succeeded. This is the run's end: the owner merge gate.
//   BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE,
//   LIVE_RED, WITHDRAWN, DONE  the release stage, derived by deriveRelease() from the
//                  release facts. The release facts exist once a release.yml run at the
//                  merge SHA or a Release at the key exists; before that the Phase-A rules decide.
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
// The supersede rule (TRAIN-04) adds one terminal state, SUPERSEDED. An open train with a
// newer validated ESR tag (facts.newerTag) or an open same-ESR chemspill revision
// (facts.chemspillOpen) is superseded: routine, no owner page. derive() tries those two
// arms after the release-stage check and before the Phase 43 ladder, and only for a
// scheduled train (revision 1), so a chemspill revision is never superseded. Those two
// facts are transient, so SUPERSEDED is made sticky by a persisted one: supersededMark is
// true when the key's tracking issue already carries the state/SUPERSEDED label that render
// writes. supersedeCause(facts) is the one place the arm is decided, and render reads it.
// Facts shape additions: newerTag, newerKey?, newerIssueUrl?, chemspillOpen, supersededMark.
// No collector sets them yet (BLOCKED.md item 10).
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
//   node scripts/release-train.mjs --uptake-would-write <tag|''> <stage|''> <replayed true|false> <replay-result> <detect-result>
//                                       (replay-result: the uptake-replay job result; detect-result: the detect job result;
//                                        each is success|failure|cancelled|skipped)

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTag, tagToVersion, UPTAKE_MAJOR } from './detect-upstreams.mjs';

const NAME = 'release-train-logic';
const SELF_REL = 'scripts/release-train.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = Object.freeze({ track: 'release-train', blocked: 'train:blocked', state: (s) => `state/${s}` });
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
    BUILDING: Object.freeze({ desc: 'release.yml run at the merge SHA is in flight, or waiting with no release approval pending' }),
    AWAITING_APPROVAL: Object.freeze({ desc: 'release.yml run waiting on the release environment approval' }),
    PUBLISHED: Object.freeze({ desc: 'Release published with the manifest asset set; descriptor not yet engaged' }),
    DESCRIPTOR_WAIT: Object.freeze({ desc: 'Release published and the descriptor environment or its timer is engaged' }),
    DESCRIPTOR_LIVE: Object.freeze({ desc: 'served descriptor bytes equal the public update.xml and channel-live is green' }),
    LIVE_RED: Object.freeze({ desc: 'a release descriptor is present and channel-live is red, or its bytes drifted' }),
    WITHDRAWN: Object.freeze({ desc: 'the Release carries the withdrawal mark (prerelease flag or notes marker); authoritative' }),
    DONE: Object.freeze({ desc: 'DESCRIPTOR_LIVE facts with the tracking issue already closed (bookkeeping only)' }),
    SUPERSEDED: Object.freeze({ desc: 'an open older train with a newer validated ESR tag, or with an open same-ESR chemspill revision: terminal and sticky once the issue carries the state/SUPERSEDED label (supersededMark), routine, no owner page (TRAIN-04)' }),
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
    BUILDING: 'wait',
    AWAITING_APPROVAL: 'notify-owner',
    PUBLISHED: 'trigger-gh15',
    DESCRIPTOR_WAIT: 'notify-owner',
    DESCRIPTOR_LIVE: 'close-issue',
    LIVE_RED: 'block-and-link',
    WITHDRAWN: 'reopen-and-instruct',
    // UNWIRED: no executor runs this yet. For a release-stage train it cancels the run (and rejects the pending release
    // approval) named by supersedeTarget(facts); for a train with nothing in flight, supersedeTarget is null and it only
    // links the superseder. No live collector sets the supersede facts until the facts source is approved (BLOCKED.md).
    SUPERSEDED: 'cancel-pending-and-link',
    DONE: 'noop',
});

// --- Release stage (Phase 50, TRAIN-10) -------------------------------------------
// derive reads normalised release facts (releaseFactsFromLive), never the raw GitHub
// responses. A withdrawal mark in the Release notes is the marker shape; the flag shape is
// prerelease true. The marker is an HTML comment, so it is never rendered on the Release page.
export const WITHDRAWAL_MARK = '<!-- release-withdrawn -->';
const RUN_IN_FLIGHT = Object.freeze(['queued', 'in_progress', 'requested', 'pending']);
export const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
/** The display title release.yml gives its run (run-name), the key that finds the run for a SHA. Pure. */
export const releaseRunTitle = sha => `Release ${sha}`;
const NEEDS_OWNER = Object.freeze(['BUMP_PR_GREEN', 'AWAITING_APPROVAL', 'DESCRIPTOR_WAIT', 'LIVE_RED']);

const assetsEqual = (assets, expected) => {
    if (expected.length === 0) return false;
    const a = [...new Set(assets)].sort();
    const e = [...new Set(expected)].sort();
    return a.length === e.length && a.every((x, i) => x === e[i]);
};
const withdrawn = rel => rel.published !== null && (rel.published.prerelease === true || rel.published.body.includes(WITHDRAWAL_MARK));
const waitingDescriptor = rel => rel.pending.includes('descriptor') || rel.descriptorJob === 'waiting';

/** Whether a workflow run is the release.yml dispatch for live.mergeSHA. Pure. */
function runIsReleaseFor(r, live) {
    return r.event === 'workflow_dispatch'
        && r.display_title === releaseRunTitle(live.mergeSHA)
        && String(r.path ?? '').split('@')[0] === RELEASE_WORKFLOW_PATH
        && r.head_repository?.full_name === live.repository;
}

/** The channel-live subcheck that is red, or byte-equal for a drifted descriptor. Pure. */
export function redSubcheck(rel) {
    if (rel.channelLive !== null && rel.channelLive.green === false) return rel.channelLive.subcheck ?? 'channel-live';
    return 'byte-equal';
}

/**
 * Normalise one release's live GitHub responses into the release facts. The input is the
 * live response shape: runs objects (display_title, path, head_repository, event, status, conclusion,
 * html_url, created_at),
 * pending_deployments entries, the jobs of the run, the Release by tag, the descriptor contents
 * (base64), the channel-live job conclusion and the tracking issue state. The run is the newest
 * workflow_dispatch run of release.yml in this repository whose display title is `Release <mergeSHA>`;
 * never the latest run of any SHA, and never keyed on head_sha: a dispatched run's head_sha is the tip
 * of the dispatched ref (main), not the sha input. live.repository is this repository's full name.
 * The matcher is injectable for the self-test's planted head_sha matcher only. Pure.
 */
export function releaseFactsFromLive(live, { matches = runIsReleaseFor } = {}) {
    const matching = live.runs.filter(r => matches(r, live));
    const newest = [...matching].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0] ?? null;
    const job = (live.jobs ?? []).find(j => j.name === 'descriptor') ?? null;
    const bytes = live.contents ? Buffer.from(live.contents.content, 'base64').toString('utf8') : null;
    return {
        key: live.key,
        mergeSHA: live.mergeSHA,
        run: newest === null ? null : { id: newest.id, status: newest.status, conclusion: newest.conclusion ?? null, htmlUrl: newest.html_url },
        pending: live.pending.map(p => p.environment.name),
        // The pending_deployments entry's environment id: what a reject of the pending approval targets (TRAIN-04 cancel).
        releaseEnvId: live.pending.find(p => p.environment.name === 'release')?.environment.id ?? null,
        descriptorJob: job === null ? null : job.status,
        published: live.release ? { draft: live.release.draft, prerelease: live.release.prerelease, assets: live.release.assets.map(a => a.name), body: live.release.body ?? '' } : null,
        expectedAssets: live.expectedAssets,
        descriptor: { present: bytes !== null, matchesServed: bytes !== null && bytes === live.servedBytes, noUpdate: bytes !== null && bytes === live.noUpdateBytes },
        channelLive: live.channelLive ? { green: live.channelLive.conclusion === 'success', subcheck: live.channelLive.subcheck ?? null } : null,
        issueState: live.issue ? live.issue.state : null,
    };
}

/** The release-stage state from the release facts, or null when none applies. Pure. */
function deriveRelease(rel) {
    const pub = rel.published;
    const d = rel.descriptor;
    if (withdrawn(rel)) return 'WITHDRAWN';
    if (pub !== null && !pub.draft) {
        const green = rel.channelLive !== null && rel.channelLive.green === true;
        const channelRed = rel.channelLive !== null && rel.channelLive.green === false;
        const drift = d.present && !d.matchesServed && !d.noUpdate && !waitingDescriptor(rel);
        if (d.matchesServed && green) return rel.issueState === 'closed' ? 'DONE' : 'DESCRIPTOR_LIVE';
        if (d.present && (channelRed || drift)) return 'LIVE_RED';
        if (waitingDescriptor(rel)) return 'DESCRIPTOR_WAIT';
        if (!pub.prerelease && assetsEqual(pub.assets, rel.expectedAssets) && (!d.present || d.noUpdate)) return 'PUBLISHED';
        return null;
    }
    if (rel.run !== null && (pub === null || pub.draft)) {
        if (rel.run.status === 'waiting' && rel.pending.includes('release')) return 'AWAITING_APPROVAL';
        if (RUN_IN_FLIGHT.includes(rel.run.status) || rel.run.status === 'waiting') return 'BUILDING';
    }
    return null;
}

// TRAIN-04 helpers. esrAfter compares the numeric ESR tuples of two *esr_RELEASE tags.
const esrAfter = (a, b) => {
    const [x, y] = [tagToVersion(a), tagToVersion(b)];
    if (x === null || y === null) return false;
    const i = x.tuple.findIndex((n, k) => n !== y.tuple[k]);
    return i !== -1 && x.tuple[i] > y.tuple[i];
};
// A newer tag supersedes an older train only when it is a valid tag under the same major.
const newerOnSameLine = (newer, old) => {
    const o = tagToVersion(old);
    return o !== null && classifyTag(newer, o.tuple[0]).keep && esrAfter(newer, old);
};

// The ESR tag a release key v<esr groups>-<revision> was made from (keys are built from tagToVersion's esrVersion).
const keyTag = key => `FIREFOX_${key.slice(1, key.lastIndexOf('-')).replaceAll('.', '_')}esr_RELEASE`;

/**
 * Why a train is superseded (TRAIN-04): 'chemspill' (an open same-ESR revision), 'newer-esr' (a newer
 * validated tag on the same major), 'marked' (supersededMark: the issue already carries the state), or null.
 * Chemspill is tried first. derive and render both read this one function, so the rendered view names the arm that fired. Both arms apply to a scheduled train
 * only (revision exactly 1): a chemspill revision train is never preempted, whatever flags the
 * collector sets. Fail-safe: a missing or odd revision counts as a revision, so nothing irreversible
 * follows from it. Pure.
 */
export function supersedeCause(f) {
    // A release-stage train (merged, so no open PR) is identified by its release key; a pre-release one by its PR and candidate.
    const rel = f.release ?? null;
    const revision = rel === null ? f.revision : Number(rel.key.slice(rel.key.lastIndexOf('-') + 1));
    const own = rel === null ? f.candidateTag : keyTag(rel.key);
    if ((f.openPr || rel !== null) && revision === 1) {
        if (f.chemspillOpen === true) return 'chemspill';
        if (typeof f.newerTag === 'string' && newerOnSameLine(f.newerTag, own)) return 'newer-esr';
    }
    // Sticky (WR-01): the superseding facts are transient (the chemspill train publishes, a PR closes), but the
    // tracking issue keeps its state/SUPERSEDED label. supersededMark is that persisted fact, read by the collector;
    // without it a superseded key reverts to BUMP_PR_GREEN and pages the owner.
    return f.supersededMark === true ? 'marked' : null;
}

/**
 * The state a release is in, from facts, or null with nothing to do. Pure.
 * The TRAIN-04 arms apply before publication only: a published or withdrawn release is never superseded,
 * and a release-stage train (BUILDING, AWAITING_APPROVAL) is superseded by the same arms:
 * (1) an open same-ESR chemspill revision preempts this scheduled train (chemspillOpen);
 * (2) a newer validated ESR tag preempts this open older train (newerTag). Both arms apply to a
 *     scheduled train only (revision 1): a chemspill revision train is never superseded, whatever
 *     flags the collector sets, and falls through to the Phase 43 ladder.
 */
export function derive(facts) {
    const f = facts;
    if (f.release) {
        const rel = deriveRelease(f.release);
        // Release-stage supersede: only a train with nothing published yet, in flight, waiting on approval, or whose
        // run was already cancelled. A published or withdrawn release is never superseded.
        const unpublished = f.release.published === null || f.release.published.draft;
        if (unpublished && (rel === null || rel === 'BUILDING' || rel === 'AWAITING_APPROVAL') && supersedeCause(f) !== null) return 'SUPERSEDED';
        return rel;
    }
    if (supersedeCause(f) !== null) return 'SUPERSEDED';
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

/**
 * What a cancel executor may target for a SUPERSEDED train, or null when nothing is in flight (the action is then
 * link-only). The ids come from the old train's own release facts: its run is matched by display title to the merge
 * SHA, so this is never the newest run of another SHA and never the new train's. environmentId is the pending
 * `release` approval's environment id; it is null for a run that is building with no approval pending. Pure.
 */
export function supersedeTarget(facts) {
    const run = facts.release?.run ?? null;
    if (derive(facts) !== 'SUPERSEDED' || run === null || run.status === 'completed') return null;
    return { key: facts.release.key, runId: run.id, environmentId: facts.release.releaseEnvId };
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
    const rel = facts.release ?? null;
    const title = `release-train: ${rel !== null ? rel.key : releaseKey(facts)}`;
    const runUrl = rel !== null && rel.run !== null ? rel.run.htmlUrl : null;
    const evidence = facts.evidenceUrl ?? runUrl ?? 'pending';
    const snapshot = JSON.stringify({ state, pin: facts.pinTag, candidate: facts.candidateTag ?? null });
    const stateLines = [];
    // The exact run for this merge SHA, linked by its display title (never recency across SHAs).
    if (runUrl !== null) stateLines.push(`Release run (${runUrl}) SHA ${rel.mergeSHA}`);
    if (state === 'LIVE_RED') stateLines.push(`channel-live red on ${redSubcheck(rel)}. Next step: read the failing log linked from the run.`);
    if (state === 'WITHDRAWN') stateLines.push('Withdrawn. The fix is a new revision with a new tag; a Release is never deleted and no tag is reused.');
    if (state === 'SUPERSEDED') {
        // Routine and informational: no assign or mention below (SUPERSEDED is not in NEEDS_OWNER).
        // The cause is the arm derive() fired; a SUPERSEDED view without one is a caller bug, not a view to guess.
        const cause = supersedeCause(facts);
        if (cause === null) throw new Error('render(SUPERSEDED) over facts that supersede nothing. Next step: render the state derive() returned for these facts.');
        const named = { chemspill: 'the open chemspill revision', marked: 'a newer train (recorded earlier on this issue)' };
        const by = facts.newerKey ?? named[cause] ?? `v${tagToVersion(facts.newerTag).esrVersion}-1`;
        stateLines.push(`superseded by ${by}${facts.newerIssueUrl ? ` (${facts.newerIssueUrl})` : ''}. Routine: no owner action is needed on this issue.`);
    }
    const body = [
        title,
        '',
        '| Step | State | Evidence |',
        '| --- | --- | --- |',
        `| ${state} | ${state} | ${evidence} |`,
        '',
        ...stateLines.flatMap(l => [l, '']),
        `<!-- release-train:v1 ${snapshot} -->`,
        '',
    ].join('\n');
    const gate = NEEDS_OWNER.includes(state) && typeof facts.ownerLogin === 'string' && facts.ownerLogin !== '';
    return {
        title,
        body,
        labels: [LABELS.track, LABELS.state(state), ...(state === 'LIVE_RED' ? [LABELS.blocked] : [])],
        mention: gate ? facts.ownerLogin : null,
        assign: gate ? [facts.ownerLogin] : [],
        lock: true,
        close: state === 'DESCRIPTOR_LIVE',
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
 * printed, because a late step can fail after the stage already reads replayed. detectResult is the
 * detect job result: when detection did not succeed, no candidate is known, so the view reports the
 * failure and never reads the empty candidate as idle (IN-03). Pure.
 */
export function uptakeWouldWrite({ tag, stage, replayed, replayResult, detectResult }) {
    if (detectResult !== 'success') {
        return {
            lines: [`release-train: would-write: uptake detection failed (the detect job ended ${detectResult}), so the uptake lane was not judged`],
            failures: [`the detect job ended ${detectResult}, so the uptake candidate is unknown and the lane was not judged. Next step: fix the detect job, then re-run.`],
        };
    }
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

function uptakeWouldWriteCli([tag, stage, replayed, replayResult, detectResult]) {
    const view = uptakeWouldWrite({ tag, stage, replayed: replayed === 'true', replayResult, detectResult });
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
const OLDER = esrTag(153, 6, 0);
const BASE = Object.freeze({ pinTag: BASE_PIN, revision: 1, candidateTag: null, openPr: null, bumpConclusion: null, stage: null, verifyCheck: null, merged: false, pinUnchanged: false });
// Each fixture carries its expected action as a literal. next() is checked against that
// literal, never against ACTIONS, so a wrong entry in ACTIONS cannot agree with itself.
// Release-stage fixtures are in the live response shape (runs, pending_deployments, Release,
// contents base64, check conclusion, issue state) and pass through releaseFactsFromLive, so the
// normaliser is exercised by the same rows as derive. The SHA and URL literals are fixture-only.
const MERGE_SHA = '1'.repeat(40);
const OTHER_SHA = '2'.repeat(40);
// The tip of main when the run was dispatched. It is never the merge SHA: main advanced past the bump
// merge, which is the normal shape (release.yml accepts a configuration.toml ancestor of the tip).
const TIP_SHA = '3'.repeat(40);
const REPO_FIXTURE = 'owner-fixture/repo-fixture';
const RELEASE_KEY = 'v153.23.0-1';
const SERVED_BYTES = 'served-public-descriptor-bytes';
const NO_UPDATE_BYTES = 'no-update-descriptor-bytes';
const EXPECTED_ASSETS = Object.freeze(['powerbrowser-153.23.0.tar.xz', 'powerbrowser-153.23.0.complete.mar', 'SHA256SUMS']);
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const runUrl = id => `https://example.invalid/actions/runs/${id}`;
// A dispatched run carries head_sha = the tip of main and display_title = `Release <inputs.sha>` (run-name).
const liveRun = (id, forSha, status, conclusion, createdAt, over = {}) => ({
    id, head_sha: TIP_SHA, display_title: releaseRunTitle(forSha), path: RELEASE_WORKFLOW_PATH, head_repository: { full_name: REPO_FIXTURE },
    event: 'workflow_dispatch', status, conclusion, created_at: createdAt, html_url: runUrl(id), ...over,
});
const liveRelease = (over = {}) => ({ draft: false, prerelease: false, assets: EXPECTED_ASSETS.map(name => ({ name })), body: 'PowerBrowser release notes', ...over });
const liveBase = (over = {}) => ({
    key: RELEASE_KEY, mergeSHA: MERGE_SHA, repository: REPO_FIXTURE, expectedAssets: EXPECTED_ASSETS, servedBytes: SERVED_BYTES, noUpdateBytes: NO_UPDATE_BYTES,
    runs: [], pending: [], jobs: [], release: null, contents: null, channelLive: null, issue: { state: 'open' }, ...over,
});
const LIVE_DONE_RUN = [liveRun(103, MERGE_SHA, 'completed', 'success', '2026-10-31T11:00:00Z')];
const factsOf = fx => (fx.live !== undefined ? { ...BASE, release: releaseFactsFromLive(fx.live) } : fx.facts);

const FIXTURES_153 = Object.freeze({
    DETECTED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER }, action: 'bump' }),
    BUMPING: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 41 }, bumpConclusion: null }, action: 'wait' }),
    CONFLICT: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply (real conflict, not silent)' }, action: 'conflict-issue' }),
    BUMP_RED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 42 }, verifyCheck: 'failure' }, action: 'wait-owner' }),
    BUMP_PR_GREEN: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 43 }, verifyCheck: 'success', pinUnchanged: false }, action: 'gate' }),
    // An open older train (OLDER) with a newer validated ESR tag (NEWER) on the same major: superseded.
    SUPERSEDED: Object.freeze({ facts: { ...BASE, candidateTag: OLDER, openPr: { head: `chore/esr-${OLDER}`, number: 40 }, newerTag: NEWER }, action: 'cancel-pending-and-link' }),
    // Main has advanced past the merge SHA (every run's head_sha is TIP_SHA). The other SHA's run is the newest and must not be linked: the link is by display title.
    BUILDING: Object.freeze({ live: liveBase({ runs: [liveRun(100, OTHER_SHA, 'completed', 'success', '2026-10-31T12:00:00Z'), liveRun(101, MERGE_SHA, 'in_progress', null, '2026-10-31T10:00:00Z')] }), action: 'wait' }),
    AWAITING_APPROVAL: Object.freeze({ live: liveBase({ runs: [liveRun(102, MERGE_SHA, 'waiting', null, '2026-10-31T10:00:00Z')], pending: [{ environment: { id: 7, name: 'release' } }], release: liveRelease({ draft: true, assets: [], body: '' }) }), action: 'notify-owner' }),
    PUBLISHED: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease() }), action: 'trigger-gh15' }),
    DESCRIPTOR_WAIT: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, pending: [{ environment: { name: 'descriptor' } }], release: liveRelease(), contents: { content: b64(NO_UPDATE_BYTES) } }), action: 'notify-owner' }),
    DESCRIPTOR_LIVE: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(SERVED_BYTES) }, channelLive: { conclusion: 'success', subcheck: null } }), action: 'close-issue' }),
    LIVE_RED: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(`${SERVED_BYTES} stale`) }, channelLive: { conclusion: 'failure', subcheck: 'byte-equal' } }), action: 'block-and-link' }),
    WITHDRAWN: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease({ prerelease: true }), contents: { content: b64(NO_UPDATE_BYTES) } }), action: 'reopen-and-instruct' }),
    DONE: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(SERVED_BYTES) }, channelLive: { conclusion: 'success', subcheck: null }, issue: { state: 'closed' } }), action: 'noop' }),
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

// The sign-publish stale-approval predicate: the same comparator release.yml calls (exit 0 = the key is
// newer than the latest Release and may sign). Run as a child process, so the predicate is the shipped one.
// Exact exit codes: 0 sign, 1 equal or older, 2 not a release key. A spawn failure or a signal is neither (status null), so
// it can never pass for a refusal: signGuardExit returns the code or throws.
const signGuardExit = (key, latest) => {
    const r = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/release-key-newer.mjs'), key, latest], { encoding: 'utf8' });
    if (r.error !== undefined || r.status === null) throw new Error(`the comparator did not run to an exit code (${r.error?.message ?? `signal ${r.signal}`}). Next step: check scripts/release-key-newer.mjs.`);
    return r.status;
};

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
        const facts = factsOf(fixtures[name]);
        const expected = fixtures[name].action;
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
    console.log(`  ok  baseline -> ${Object.keys(ALL_STATES).length} states (${Object.keys(STATES).length} bump-lane: 5 Phase-A, 8 release-stage and SUPERSEDED; ${Object.keys(UPTAKE_STATES).length} uptake-lane), each with a fixture and an action, set-equal; derive, next and render agree`);

    const OWNER = 'owner-login-fixture';
    const trainPlants = [
        {
            name: 'a sixth state with no fixture',
            run: () => runChecks({ states: [...Object.keys(ALL_STATES), 'UNBUILT'] }).failures,
            expect: 'state UNBUILT has no fixture',
        },
        {
            name: 'a release-stage state whose fixture is removed',
            run: () => {
                const { DONE: _removed, ...rest } = FIXTURES;
                return runChecks({ fixtures: rest }).failures;
            },
            expect: 'state DONE has no fixture',
        },
        {
            name: 'a sixth fixture with no state',
            run: () => runChecks({ fixtures: { ...FIXTURES, BUILT: { facts: { ...BASE, candidateTag: NEWER }, action: 'bump' } } }).failures,
            expect: 'fixture BUILT names no state',
        },
        {
            name: 'a sixth action with no state',
            run: () => runChecks({ actionKeys: [...Object.keys(ACTIONS), 'UNBUILT'] }).failures,
            expect: 'action UNBUILT names no state',
        },
        {
            name: 'a release descriptor whose bytes drifted under a green channel-live',
            // Drift must go red naming the byte-equal subcheck, never derive DESCRIPTOR_LIVE on a green flag alone.
            run: () => {
                const live = { ...FIXTURES.DESCRIPTOR_LIVE.live, contents: { content: b64(`${SERVED_BYTES} drifted`) } };
                const facts = factsOf({ live });
                const got = derive(facts);
                return got === 'LIVE_RED' ? [`LIVE_RED: channel-live red on ${redSubcheck(facts.release)}`] : [`drifted descriptor derived ${got}`];
            },
            expect: 'channel-live red on byte-equal',
        },
        {
            name: 'a run matcher keyed on head_sha, with main advanced past the merge SHA',
            // The pre-fix key. A dispatched run carries head_sha = the tip of main, so this matcher finds no run,
            // BUILDING and AWAITING_APPROVAL never derive, and the train would dispatch again every tick.
            run: () => {
                const byHeadSha = (r, live) => r.head_sha === live.mergeSHA && r.event === 'workflow_dispatch';
                return ['BUILDING', 'AWAITING_APPROVAL'].flatMap(name => {
                    const got = derive({ ...BASE, release: releaseFactsFromLive(FIXTURES[name].live, { matches: byHeadSha }) });
                    return got === name ? [] : [`fixture ${name} derives ${got} instead of ${name} with a head_sha matcher`];
                });
            },
            expect: 'derives null instead of BUILDING',
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
            name: 'supersede-newer-esr-while-open: an open older train with a newer ESR tag',
            // A correct derive names SUPERSEDED, and the rendered view names the new key. Any other state drifts.
            run: () => {
                const f = FIXTURES.SUPERSEDED.facts;
                const got = derive(f);
                if (got !== 'SUPERSEDED') return [`an open older train with a newer ESR tag derives ${got}, not SUPERSEDED`];
                return [render('SUPERSEDED', f).body.split('\n').find(l => l.includes('superseded by')) ?? 'SUPERSEDED view lacks the new key'];
            },
            expect: 'superseded by v153.23.0-1',
        },
        {
            name: 'chemspill-beats-scheduled: a scheduled train with an open same-ESR chemspill revision',
            // The revision preempts the scheduled train: its derive must be SUPERSEDED, whatever order the trains were seen in.
            run: () => {
                const f = { ...FIXTURES.BUMPING.facts, chemspillOpen: true };
                const got = derive(f);
                if (got !== 'SUPERSEDED') return [`a scheduled train with an open chemspill derives ${got}, not SUPERSEDED`];
                return [render(got, f).body.split('\n').find(l => l.includes('superseded by')) ?? 'SUPERSEDED view lacks the chemspill revision'];
            },
            expect: 'superseded by the open chemspill revision',
        },
        {
            name: 'supersede-release-stage-approval: the pending release approval environment is carried for the cancel',
            run: () => {
                const t = supersedeTarget({ ...factsOf(FIXTURES.AWAITING_APPROVAL), newerTag: esrTag(153, 24, 0) });
                return t === null ? ['no cancel target for a train waiting on approval'] : [`cancel run ${t.runId} and reject approval environment ${t.environmentId} of ${t.key}`];
            },
            expect: 'cancel run 102 and reject approval environment 7 of v153.23.0-1',
        },
        {
            name: 'supersede-release-stage-ids: a train waiting on approval or building, with a newer ESR tag, names its own run and approval',
            // The cancel target is the old train's run (matched by display title), never the newest run of another SHA.
            run: () => ['AWAITING_APPROVAL', 'BUILDING'].flatMap(name => {
                const f = { ...factsOf(FIXTURES[name]), newerTag: esrTag(153, 24, 0) };
                const got = derive(f);
                if (got !== 'SUPERSEDED') return [`a ${name} train with a newer ESR tag derives ${got}, not SUPERSEDED`];
                const t = supersedeTarget(f);
                return [`${name} superseded: cancel run ${t?.runId} and reject approval environment ${t?.environmentId} of ${t?.key}`];
            }),
            expect: 'cancel run 101 and reject approval environment null of v153.23.0-1',
        },
        {
            name: 'sign-job-newer-release-exit: a stale approval whose key is not newer than the latest published Release',
            // release.yml's newer_guard and newer_guard_final call the same comparator; a refusal must not be a proceed.
            run: () => {
                const code = signGuardExit('v153.23.0-1', 'v153.23.0-2');
                if (code !== 1) return [`the comparator exited ${code}, not 1 (older), for v153.23.0-1 under latest v153.23.0-2`];
                return [`the latest published Release v153.23.0-2 is not older than v153.23.0-1 (comparator exit ${code}); nothing is signed`];
            },
            expect: 'is not older than v153.23.0-1',
        },
        {
            name: 'sign-job-malformed-latest: a latest tag that is not a release key is never a proceed',
            run: () => {
                const code = signGuardExit('v153.23.0-2', 'latest');
                if (code !== 2) return [`the comparator exited ${code}, not 2 (malformed), for latest tag 'latest'`];
                return [`the release key or the latest Release tag could not be compared (exit ${code}); nothing is signed`];
            },
            expect: 'could not be compared',
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

    // TRAIN-04 controls: the supersede arms are narrow, a published release is never superseded, and the render is routine.
    const supersedeGreens = [
        {
            name: 'control: a chemspill revision train proceeds on the Phase 43 ladder, not superseded by its scheduled sibling',
            run: () => {
                const revision = { ...BASE, candidateTag: BASE_PIN, revision: 2, openPr: { head: `chore/esr-${BASE_PIN}`, number: 44 }, verifyCheck: null };
                const got = derive(revision);
                return got === 'BUMPING' ? [] : [`the chemspill revision train derives ${got}, not BUMPING`];
            },
        },
        {
            name: 'control: a chemspill revision train stays its own train and ships under a newer ESR tag and an open-chemspill flag; the scheduled train beside it is superseded',
            run: () => {
                const revision = { ...BASE, candidateTag: BASE_PIN, revision: 2, openPr: { head: `chore/esr-${BASE_PIN}`, number: 44 }, verifyCheck: 'success', newerTag: NEWER, chemspillOpen: true };
                const scheduled = { ...FIXTURES.BUMPING.facts, newerTag: NEWER, chemspillOpen: true };
                const got = [derive(revision), derive(scheduled)];
                return got[0] === 'BUMP_PR_GREEN' && got[1] === 'SUPERSEDED' ? [] : [`revision derives ${got[0]} (want BUMP_PR_GREEN), scheduled derives ${got[1]} (want SUPERSEDED)`];
            },
        },
        {
            name: 'control: a 175 tag never supersedes a 153 train (the newer tag must be on the same major)',
            run: () => {
                const got = derive({ ...FIXTURES.SUPERSEDED.facts, newerTag: UPTAKE_TAG });
                return got === 'BUMPING' ? [] : [`a 175 tag superseded a 153 train (derived ${got})`];
            },
        },
        {
            name: 'control: a published, withdrawn or live release is never superseded, even marked, with a newer tag and a chemspill',
            run: () => [...['PUBLISHED', 'DESCRIPTOR_WAIT', 'DESCRIPTOR_LIVE', 'LIVE_RED', 'WITHDRAWN', 'DONE'].map(name => [name, FIXTURES[name]]),
                // A published Release whose assets do not match derives no state (null); it is still published, so never superseded.
                ['a published Release with the wrong assets', { live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease({ assets: [] }) }) }]].flatMap(([name, fx]) => {
                const want = fx.live === undefined || name.startsWith('a published') ? derive(factsOf(fx)) : name;
                const got = derive({ ...factsOf(fx), openPr: { head: `chore/esr-${OLDER}`, number: 45 }, newerTag: esrTag(153, 24, 0), chemspillOpen: true, supersededMark: true });
                return got === want && got !== 'SUPERSEDED' ? [] : [`a ${name} release derived ${got} under supersede facts`];
            }),
        },
        {
            name: 'control: a chemspill revision release (key revision 2) waiting on approval is not superseded by a newer ESR tag or a chemspill flag',
            run: () => {
                const f = { ...BASE, newerTag: esrTag(153, 24, 0), chemspillOpen: true, release: releaseFactsFromLive({ ...FIXTURES.AWAITING_APPROVAL.live, key: 'v153.23.0-2' }) };
                return derive(f) === 'AWAITING_APPROVAL' ? [] : [`a revision train waiting on approval derives ${derive(f)}`];
            },
        },
        {
            name: 'control: an equal or older newer-tag, or one on another major, never supersedes a release-stage train',
            run: () => [NEWER, esrTag(153, 5, 0), UPTAKE_TAG].flatMap(newerTag => {
                const got = derive({ ...factsOf(FIXTURES.AWAITING_APPROVAL), newerTag });
                return got === 'AWAITING_APPROVAL' ? [] : [`newerTag ${newerTag} superseded a v153.23.0 release-stage train (derived ${got})`];
            }),
        },
        {
            name: 'control: a marked train whose run was already cancelled stays SUPERSEDED with no cancel target (link only); a pre-release one has none either',
            run: () => {
                const cancelled = { ...BASE, supersededMark: true, release: releaseFactsFromLive({ ...FIXTURES.AWAITING_APPROVAL.live, runs: [liveRun(102, MERGE_SHA, 'completed', 'cancelled', '2026-10-31T10:00:00Z')], pending: [] }) };
                const failures = [];
                if (derive(cancelled) !== 'SUPERSEDED' || supersedeTarget(cancelled) !== null) failures.push(`a cancelled marked train derives ${derive(cancelled)} with target ${JSON.stringify(supersedeTarget(cancelled))}`);
                if (supersedeTarget(FIXTURES.SUPERSEDED.facts) !== null) failures.push('a pre-release SUPERSEDED train carries a cancel target');
                return failures;
            },
        },
        {
            name: 'control: the SUPERSEDED render names the new key and link, and neither assigns nor mentions the owner',
            run: () => {
                const view = render('SUPERSEDED', { ...FIXTURES.SUPERSEDED.facts, ownerLogin: OWNER, newerIssueUrl: 'https://example.invalid/issues/9' });
                const ok = view.body.includes('superseded by v153.23.0-1') && view.body.includes('https://example.invalid/issues/9') && view.mention === null && view.assign.length === 0 && view.lock === true;
                return ok ? [] : [`SUPERSEDED view had mention ${view.mention}, assign ${view.assign.join(',')}, or lacked the key or link`];
            },
        },
        {
            name: 'control: with a chemspill and a newer ESR tag both present, the view names the chemspill arm that fired, not the ESR key',
            run: () => {
                const f = { ...FIXTURES.SUPERSEDED.facts, chemspillOpen: true };
                const line = render(derive(f), f).body.split('\n').find(l => l.includes('superseded by')) ?? '';
                return line.includes('superseded by the open chemspill revision') && !line.includes('v153.23.0-1') ? [] : [`the view said: ${line}`];
            },
        },
        {
            name: 'control: rendering SUPERSEDED over facts that supersede nothing is refused, not guessed',
            run: () => {
                try {
                    render('SUPERSEDED', FIXTURES.BUMPING.facts);
                    return ['a SUPERSEDED view rendered over facts with no supersede cause'];
                } catch (e) {
                    return /supersede nothing/.test(e.message) ? [] : [`unexpected error: ${e.message}`];
                }
            },
        },
        {
            name: 'control: SUPERSEDED is sticky: a marked key stays SUPERSEDED after the superseding fact is gone, and does not page the owner; unmarked it reverts',
            run: () => {
                const gone = { ...FIXTURES.BUMP_PR_GREEN.facts, chemspillOpen: false };
                const marked = { ...gone, supersededMark: true, ownerLogin: OWNER };
                const view = render(derive(marked), marked);
                const failures = [];
                if (derive(gone) !== 'BUMP_PR_GREEN') failures.push(`an unmarked key with no superseding fact derives ${derive(gone)}, not BUMP_PR_GREEN`);
                if (derive(marked) !== 'SUPERSEDED') failures.push(`a marked key derives ${derive(marked)}, not SUPERSEDED`);
                if (view.mention !== null || view.assign.length > 0) failures.push('a marked key paged the owner');
                return failures;
            },
        },
        {
            name: 'control: the sign guard proceeds on the newest key and refuses an equal key',
            run: () => {
                const proceeds = signGuardExit('v153.23.0-2', 'v153.23.0-1') === 0;
                const refusesEqual = signGuardExit('v153.23.0-1', 'v153.23.0-1') === 1;
                return proceeds && refusesEqual ? [] : ['the sign guard did not proceed on the newest key, or proceeded on an equal key'];
            },
        },
    ];

    const greens = [
        ...supersedeGreens,
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
            name: 'control: the owner is mentioned on needs-owner states and not on progress states',
            run: () => {
                const gate = render('BUMP_PR_GREEN', { ...FIXTURES.BUMP_PR_GREEN.facts, ownerLogin: OWNER });
                const bumping = render('BUMPING', { ...FIXTURES.BUMPING.facts, ownerLogin: OWNER });
                const approval = render('AWAITING_APPROVAL', { ...factsOf(FIXTURES.AWAITING_APPROVAL), ownerLogin: OWNER });
                const building = render('BUILDING', { ...factsOf(FIXTURES.BUILDING), ownerLogin: OWNER });
                return gate.mention === OWNER && approval.mention === OWNER && bumping.mention === null && building.mention === null ? [] : ['owner mention drifted from the needs-owner states'];
            },
        },
        {
            name: 'control: with main advanced past the merge SHA, BUILDING and AWAITING_APPROVAL derive and link the run titled for the merge SHA, never a newer run for another SHA',
            run: () => {
                const live = FIXTURES.BUILDING.live;
                if (live.runs.some(r => r.head_sha === MERGE_SHA)) return ['the BUILDING fixture does not model main having advanced (a run carries head_sha = the merge SHA)'];
                const body = render('BUILDING', { ...factsOf(FIXTURES.BUILDING), ownerLogin: OWNER }).body;
                const approval = render('AWAITING_APPROVAL', factsOf(FIXTURES.AWAITING_APPROVAL)).body;
                const linked = body.includes(`Release run (${runUrl(101)}) SHA ${MERGE_SHA}`) && !body.includes(runUrl(100)) && approval.includes(runUrl(102));
                return linked ? [] : ['the run titled for the merge SHA was not linked'];
            },
        },
        {
            name: 'control: a dispatch at the tip of main (head_sha equals the merge SHA) still derives BUILDING',
            run: () => {
                const live = liveBase({ runs: [liveRun(104, MERGE_SHA, 'in_progress', null, '2026-10-31T10:00:00Z', { head_sha: MERGE_SHA })] });
                return derive(factsOf({ live })) === 'BUILDING' ? [] : ['a tip-of-main dispatch did not derive BUILDING'];
            },
        },
        {
            name: 'control: a run from another repository, another workflow path, another event or another title is never linked',
            run: () => {
                const at = '2026-10-31T10:00:00Z';
                const foreign = [
                    liveRun(110, MERGE_SHA, 'in_progress', null, at, { head_repository: { full_name: 'fork-fixture/repo-fixture' } }),
                    liveRun(111, MERGE_SHA, 'in_progress', null, at, { path: '.github/workflows/verify.yml' }),
                    liveRun(112, MERGE_SHA, 'in_progress', null, at, { event: 'push' }),
                    liveRun(113, MERGE_SHA, 'in_progress', null, at, { display_title: 'Release' }),
                    liveRun(114, OTHER_SHA, 'in_progress', null, at, { head_sha: MERGE_SHA }),
                ];
                const rel = releaseFactsFromLive(liveBase({ runs: foreign }));
                const ref = releaseFactsFromLive(liveBase({ runs: [liveRun(115, MERGE_SHA, 'in_progress', null, at, { path: `${RELEASE_WORKFLOW_PATH}@refs/heads/main` })] }));
                return rel.run === null && ref.run !== null ? [] : ['a foreign run was linked, or a path with a ref suffix was refused'];
            },
        },
        {
            name: 'control: requested and pending release runs derive BUILDING',
            run: () => ['requested', 'pending'].flatMap(status => (derive(factsOf({ live: liveBase({ runs: [liveRun(120, MERGE_SHA, status, null, '2026-10-31T10:00:00Z')] }) })) === 'BUILDING' ? [] : [`a ${status} run did not derive BUILDING`])),
        },
        {
            name: 'control: the notes marker alone derives WITHDRAWN, as does the prerelease flag',
            run: () => {
                const marked = { ...FIXTURES.DESCRIPTOR_LIVE.live, release: liveRelease({ body: `notes ${WITHDRAWAL_MARK}` }) };
                const flagged = FIXTURES.WITHDRAWN.live;
                return derive(factsOf({ live: marked })) === 'WITHDRAWN' && derive(factsOf({ live: flagged })) === 'WITHDRAWN' ? [] : ['a withdrawal mark did not derive WITHDRAWN'];
            },
        },
        {
            name: 'control: a fact set that could advance twice derives one state (waiting outranks PUBLISHED)',
            run: () => (derive(factsOf(FIXTURES.DESCRIPTOR_WAIT)) === 'DESCRIPTOR_WAIT' ? [] : ['a double-advance fact set did not derive one state']),
        },
        {
            name: 'control: LIVE_RED names the red subcheck in its body',
            run: () => (render('LIVE_RED', factsOf(FIXTURES.LIVE_RED)).body.includes('channel-live red on byte-equal') ? [] : ['LIVE_RED body does not name byte-equal']),
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
            run: () => uptakeWouldWrite({ tag: NEWER, stage: '', replayed: false, replayResult: 'success', detectResult: 'success' }).failures,
            expect: `not the uptake major ${UPTAKE_MAJOR}`,
        },
        {
            name: 'a uptake conflict stage line naming no patch number',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'FAIL -- apply-patches.sh failed replaying', replayed: false, replayResult: 'failure', detectResult: 'success' }).lines.filter(l => l.includes('refused')),
            expect: 'names no patch number',
        },
        {
            // The review's reproduction (WR-02): the replay printed stage replayed, then a later step failed.
            name: 'a uptake replay that printed stage replayed and then ended failure is red, not replay due',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'replayed', replayed: false, replayResult: 'failure', detectResult: 'success' }).failures,
            expect: 'the uptake replay job ended failure',
        },
        {
            name: 'a uptake replay cancelled at its timeout with no stage line is red',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: false, replayResult: 'cancelled', detectResult: 'success' }).failures,
            expect: 'the uptake replay job ended cancelled',
        },
        {
            // IN-03: a failed detect leaves the candidate empty, which must not read as idle.
            name: 'a failed detect job with an empty uptake candidate reads as detection failed, not idle',
            run: () => uptakeWouldWrite({ tag: '', stage: '', replayed: false, replayResult: 'skipped', detectResult: 'failure' }).failures,
            expect: 'the detect job ended failure',
        },
        {
            name: 'a 175 candidate whose replay job was skipped is red, never idle',
            run: () => uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: false, replayResult: 'skipped', detectResult: 'success' }).failures,
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
                const view = uptakeWouldWrite({ tag: UPTAKE_TAG, stage: '', replayed: true, replayResult: 'success', detectResult: 'success' });
                const ok = view.lines[0].includes('state=UPTAKE_REPLAYED action=note') && view.failures.length === 0;
                return ok ? [] : [`uptake PASS view said ${view.lines[0]} with ${view.failures.length} failure(s)`];
            },
        },
        {
            // IN-02: the real uptake conflict view, the path a live 175 patch conflict takes, writes nothing under
            // the patch directory. Its only failure is the replay's red result, which the view must still report.
            name: 'control: the real uptake conflict view writes nothing under the patch directory',
            run: () => {
                const view = uptakeWouldWrite({ tag: UPTAKE_TAG, stage: 'apply-patches: FAIL -- 030-powerbrowser-mar-certificates.patch did not apply (real conflict, not silent)', replayed: false, replayResult: 'failure', detectResult: 'success' });
                const writes = view.failures.filter(f => f.includes(`${PATCH_DIR}/`));
                const onlyResult = view.failures.length === 1 && view.failures[0].includes('the uptake replay job ended failure');
                const conflict = view.lines.some(l => l.includes('state=UPTAKE_CONFLICT'));
                return writes.length === 0 && onlyResult && conflict ? [] : [`conflict view failures were: ${view.failures.join(' | ') || '(none)'}`];
            },
        },
        {
            name: 'control: a candidate-less uptake run is idle and green when its job was skipped',
            run: () => {
                const view = uptakeWouldWrite({ tag: '', stage: '', replayed: false, replayResult: 'skipped', detectResult: 'success' });
                return view.lines[0].includes('idle') && view.failures.length === 0 ? [] : [`idle view said ${view.lines[0]}`];
            },
        },
        {
            // Lane precedence: the withdrawal mark outranks every other fact in derive(), and the two lanes never
            // share a derive: the uptake function refuses a 153 candidate and ignores release facts.
            name: 'control: a withdrawn release outranks a fresh candidate and an open bump PR, and the uptake lane never derives from a 153 tag or a release',
            run: () => {
                const release = factsOf(FIXTURES.WITHDRAWN).release;
                const crowded = { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 44 }, verifyCheck: 'success', release };
                const viaTrain = derive(crowded);
                const viaUptake153 = deriveUptake({ ...UPTAKE_BASE, candidateTag: NEWER });
                const viaUptakeRelease = deriveUptake({ ...UPTAKE_BASE, release });
                const ok = viaTrain === 'WITHDRAWN' && viaUptake153 === null && viaUptakeRelease === 'UPTAKE_DETECTED';
                return ok ? [] : [`crowded facts derived ${viaTrain}; uptake over a 153 tag ${viaUptake153}; uptake over release facts ${viaUptakeRelease}`];
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
    if (args[0] === '--uptake-would-write' && args.length === 6) process.exit(uptakeWouldWriteCli(args.slice(1)));
    if (args[0] === '--publish-plan' && args.length === 6) process.exit(publishPlanCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, or node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>.`);
    process.exit(2);
}
