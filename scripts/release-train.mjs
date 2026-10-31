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
//     verifyCheck, merged, pinUnchanged, evidenceUrl?, ownerLogin?, release?,
//     newerTag?, newerKey?, newerIssueUrl?, chemspillOpen?, supersederState?,
//     botLogin?, markIssues? }
//   candidateTag  a newer *esr_RELEASE tag under the pinned major, or null
//   openPr        { head, number } for chore/esr-<tag>, or null
//   stage         the first FAIL line the replay printed (the stage output of
//                 rebase-upstream.yml), or null
//   verifyCheck   'success' | 'failure' | 'pending' | null on the bump PR
//   ownerLogin    the owner's login, passed in by the workflow; never a literal here
//   release       the normalised release-stage facts (releaseFactsFromLive), or absent
//   The supersede facts are listed in the next paragraph and in BLOCKED.md item 10.
//
// The supersede rule (TRAIN-04) adds one terminal state, SUPERSEDED. A scheduled train (revision
// exactly 1, and a train must exist: an open bump PR or a release key) with a newer validated ESR tag
// (facts.newerTag) or an open same-ESR chemspill revision (facts.chemspillOpen) is superseded: routine,
// no owner page. A chemspill revision train is never superseded, whatever the flags or the mark say.
// Those two flags are transient, so SUPERSEDED can be kept by a persisted fact, the mark: the key's
// tracking issue carries the state/SUPERSEDED label that render writes. The mark counts only with
// provenance (markHolds): the issue is selected by title, tracking label and an owner-or-bot author
// exactly as selectPinned selects the maintenance issue (selectTracked), it is the only such issue, and
// the label's labeled-event actor (supersededLabelActor) is the owner or the bot. The mark also expires
// with its evidence: it holds only while the superseder (facts.newerKey, a valid release key on the same
// major strictly newer than this key) is open or published (facts.supersederState). A removed label, a
// closed-unpublished superseder or a missing newerKey clears it. The mark never outranks a failure:
// BUMP_RED and CONFLICT page whatever it says. When the superseder is published, render closes the issue.
// supersedeCause(facts) is the one place the arm is decided, and render reads it.
// No collector sets these facts yet (BLOCKED.md item 10).
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
// The tracking issue is a view, not an input, with two exceptions: its state (issueState) and the
// verified supersede mark above. The snapshot comment in the body is debugging output only; no run
// reads it back.
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
// The maintenance half (TRAIN-07, Phase 48) is pure too: deriveMaintenance over facts the sweep
// reads, renderMaintenance for the pinned body (byte-stable), nextMaintenance for the exactly-one
// write plan (one PATCH on a byte diff, one comment on a transition into red), and sweepDue for
// the 06:00 UTC gate. The sweep's facts step and the report job's write step are the only callers.
//
// Usage:
//   node scripts/release-train.mjs --self-test
//   node scripts/release-train.mjs --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>
//   node scripts/release-train.mjs --uptake-would-write <tag|''> <stage|''> <replayed true|false> <replay-result> <detect-result>
//                                       (replay-result: the uptake-replay job result; detect-result: the detect job result;
//                                        each is success|failure|cancelled|skipped)
//   node scripts/release-train.mjs --sweep-due <epoch-seconds> [<last-sweep-epoch-seconds>]
//   node scripts/release-train.mjs --maintenance <facts.json> <body-out>
//   node scripts/release-train.mjs --maintenance-plan <found.json> <rendered-body> <comment-out> <stored-state> <state-out>
//   node scripts/release-train.mjs --state-select <runs.json> <artifacts.json> <repo> <repo-id> <branch> <verified-shas.txt>

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTag, tagToVersion, UPTAKE_MAJOR } from './detect-upstreams.mjs';
import { expiryStartMs, runChecks as renewalsStructureChecks } from './verify-renewals.mjs';

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
    SUPERSEDED: Object.freeze({ desc: 'an open older train with a newer validated ESR tag, or with an open same-ESR chemspill revision: terminal; kept by a verified state/SUPERSEDED mark only while the superseder is open or published; routine, no owner page (TRAIN-04)' }),
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
    // UNWIRED: no executor runs this yet. For a train waiting on the release approval it rejects that approval
    // (and names its run), as supersedeTarget(facts) says; for every other train supersedeTarget is null and it only
    // links the superseder (a running build is never cancelled: the two sign guards fail a stale one). No live collector sets the supersede facts until the facts source is approved (BLOCKED.md).
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
const KEY_RE = /^v(\d+(?:\.\d+)*)-(\d+)$/;
const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a !== '' && a.toLowerCase() === b.toLowerCase();

/**
 * Whether release key `newer` is strictly newer than `old` on the same ESR major. Same order as
 * scripts/release-key-newer.mjs (the sign guards' comparator, which runs on import and so cannot be imported here):
 * ESR groups numerically with a missing group as 0, then the revision. A value outside the key grammar is false. Pure.
 */
function keyNewerOnLine(newer, old) {
    const [x, y] = [KEY_RE.exec(newer), KEY_RE.exec(old)];
    if (x === null || y === null) return false;
    const [p, q] = [x[1].split('.').map(Number), y[1].split('.').map(Number)];
    if (p[0] !== q[0]) return false;
    for (let i = 1; i < Math.max(p.length, q.length); i += 1) {
        if ((p[i] ?? 0) !== (q[i] ?? 0)) return (p[i] ?? 0) > (q[i] ?? 0);
    }
    return Number(x[2]) > Number(y[2]);
}

/** The release key of the train these facts describe, or null when no train exists or its key cannot be built. Pure. */
function ownKeyOf(f) {
    if (f.release) return typeof f.release.key === 'string' ? f.release.key : null;
    return f.openPr && tagToVersion(f.candidateTag) !== null ? releaseKey(f) : null;
}

/**
 * Whether the mark on this key is trusted (WR-01, WR-02). Provenance: the tracking issue is selected as selectPinned
 * selects the maintenance issue (title, tracking label, owner or bot author), is the only such issue, carries
 * state/SUPERSEDED, and that label's labeled-event actor is the owner or the bot; anyone else's mark is ignored.
 * Expiry: the superseder (newerKey, a valid newer key on this major) must still be open or published. Pure.
 */
function markHolds(f, key) {
    const trusted = [f.ownerLogin, f.botLogin];
    const found = selectTracked(f.markIssues, `release-train: ${key}`, trusted);
    return found.length === 1
        && found[0].labels.some(l => l && l.name === LABELS.state('SUPERSEDED'))
        && trusted.some(l => sameLogin(l, found[0].supersededLabelActor))
        && (f.supersederState === 'open' || f.supersederState === 'published')
        && keyNewerOnLine(f.newerKey, key);
}

/**
 * Why a train is superseded (TRAIN-04): 'chemspill' (an open same-ESR revision), 'newer-esr' (a newer
 * validated tag on the same major), 'marked' (a verified, unexpired state/SUPERSEDED mark; markHolds), or null.
 * Every arm needs an existing scheduled train: a train (open PR or release key) with a well-formed key whose
 * revision is exactly 1. A chemspill revision train, a malformed or missing key, and an empty fact set are never
 * superseded, whatever the flags or the mark say. Chemspill is tried first. derive and render both read this one
 * function, so the rendered view names the arm that fired. Pure.
 */
export function supersedeCause(f) {
    const key = ownKeyOf(f);
    // ownKeyOf is null without a train, so "a train exists" and "the key is well formed" are tested before any arm, the mark included.
    if (key === null || KEY_RE.exec(key)?.[2] !== '1') return null;
    const own = f.release ? keyTag(key) : f.candidateTag;
    if (f.chemspillOpen === true) return 'chemspill';
    if (typeof f.newerTag === 'string' && newerOnSameLine(f.newerTag, own)) return 'newer-esr';
    return markHolds(f, key) ? 'marked' : null;
}

/**
 * The state a release is in, from facts, or null with nothing to do. Pure.
 * The TRAIN-04 arms apply before publication only: a published or withdrawn release is never superseded,
 * and a release-stage train (BUILDING, AWAITING_APPROVAL) is superseded by the same arms:
 * (1) an open same-ESR chemspill revision preempts this scheduled train (chemspillOpen);
 * (2) a newer validated ESR tag preempts this open older train (newerTag);
 * (3) a verified, unexpired mark keeps it superseded once those transient facts are gone. The mark yields to
 *     BUMP_RED and CONFLICT, which still page; (1) and (2) are live facts and are decided first.
 * All apply to a scheduled train only (revision 1): a chemspill revision train is never superseded, whatever
 * the collector sets, and falls through to the Phase 43 ladder.
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
    const cause = supersedeCause(f);
    if (cause !== null && cause !== 'marked') return 'SUPERSEDED';
    if (f.merged === true && f.pinUnchanged === true) return 'BUMP_RED';
    if (typeof f.stage === 'string' && APPLY_FAIL.test(f.stage)) return 'CONFLICT';
    if (typeof f.stage === 'string' && ANY_FAIL.test(f.stage)) return 'BUMP_RED';
    if (f.openPr && f.verifyCheck === 'failure') return 'BUMP_RED';
    if (cause === 'marked') return 'SUPERSEDED';
    if (f.openPr) {
        if (f.verifyCheck === 'success' && f.pinUnchanged !== true) return 'BUMP_PR_GREEN';
        return 'BUMPING';
    }
    if (typeof f.candidateTag === 'string') return 'DETECTED';
    return null;
}

/**
 * What a cancel executor may target for a SUPERSEDED train, or null (the action is then link-only). Only a train
 * waiting on the release environment approval has a target: rejecting that pending approval stops it before anything
 * is signed. A BUILDING run may be past the approval, mid-publish, and the Release is immutable once published, so it
 * is never cancelled by run id; the two sign guards (newer_guard, newer_guard_final) fail a stale build. The ids come
 * from the old train's own release facts: its run is matched by display title to the merge SHA, so this is never the
 * newest run of another SHA and never the new train's. Pure.
 */
export function supersedeTarget(facts) {
    const rel = facts.release ?? null;
    if (rel === null || derive(facts) !== 'SUPERSEDED' || deriveRelease(rel) !== 'AWAITING_APPROVAL') return null;
    return { key: rel.key, runId: rel.run.id, environmentId: rel.releaseEnvId };
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
 * assignment happen only on the NEEDS_OWNER states (BUMP_PR_GREEN, AWAITING_APPROVAL,
 * DESCRIPTOR_WAIT, LIVE_RED); every other state renders with neither. A SUPERSEDED view
 * whose superseder is published closes the issue (superseded-done). Pure.
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
        const done = facts.supersederState === 'published';
        stateLines.push(`superseded by ${by}${facts.newerIssueUrl ? ` (${facts.newerIssueUrl})` : ''}${done ? ', which is published. This train is done and the issue is closed' : ''}. Routine: no owner action is needed on this issue.`);
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
        close: state === 'DESCRIPTOR_LIVE' || (state === 'SUPERSEDED' && facts.supersederState === 'published'),
        writes: [],
    };
}

/**
 * The exactly-one rule over the issues a label-and-title find returned. Zero
 * creates, one updates (PATCH only when the stored bytes differ from the rendered
 * bytes), two or more fail naming every number and never PATCH. Pure.
 * Wired to the maintenance writer only (nextMaintenance, called by the report job). The
 * release-train tracking writer stays UNWIRED until BLOCKED.md item 3 is approved.
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

// ---------------------------------------------------------------------------------------------
// The maintenance half (Phase 48, TRAIN-07; Phase 51, TRAIN-11). Thirteen rows derived from facts the sweep reads and the
// probes it runs under the bot environment. Pure: facts in, rows out; render gives the pinned body.
// The body is output only. The one read back is the previous body's row statuses, which decide a
// transition into red (nextMaintenance) and never decide a state.
// ---------------------------------------------------------------------------------------------

export const MAINTENANCE_TITLE = 'release-train: maintenance';
export const MAINTENANCE_ROW_NAMES = Object.freeze(['runner-online', 'esr-pin-age', 'channel-liveness', 'watchdog-age', 'synthetic events POST', 'download-count',
    'renewals-due', 'repo-controls', 'dependabot-prs', 'dependabot-alerts', 'codeql-alerts', 'codeql-push-age', 'codeberg-mirror']);
// Phase 51 (TRAIN-11): the owner-decided sweep thresholds live in .github/sweep-thresholds.json exactly once. The
// sweep reads that file (the workflow passes it as facts.thresholds); docs/RELEASING.md only quotes it, and
// sweepThresholdDocDrift fails the self-test when the quotation and the file differ. No number is kept in this script.
export const SWEEP_THRESHOLDS_REL = '.github/sweep-thresholds.json';
export const SWEEP_THRESHOLD_LEAD = 'Sweep red thresholds';
const THRESHOLD_KEYS = Object.freeze(['dependabotPrMax', 'securityPrDays', 'alertMax', 'pushAgeDays']);
const RENEWALS_WINDOW_DAYS = 30;
const RENEWALS_NAME = 'docs/RENEWALS.md';
// repo-controls has no live read yet. This is a named deferral, not an omission: the workflow's repoControls fact is null with the
// marker `deferred: repo-controls-live-read` (scripts/verify-sweep-reads.mjs asserts the pair), and the row says so every day.
const REPO_CONTROLS_DEFERRED = 'the daily live read-back is deferred: it needs the bot App to hold Administration read (owner grant) and a follow-up plan that runs scripts/verify-repo-controls.mjs in the probe; no-data until then';
const THRESHOLDS_NOT_READ = `${SWEEP_THRESHOLDS_REL} was not read in this run`;
const THRESHOLD_UNREADABLE = `the sweep thresholds are not readable in ${SWEEP_THRESHOLDS_REL}. Next step: keep its ${THRESHOLD_KEYS.length} keys (${THRESHOLD_KEYS.join(', ')}) as non-negative integers.`;
const SHA_RE = /^[0-9a-f]{40}$/;
export const SWEEP_HOUR_UTC = 6;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const STALE_TAG_MS = 3 * DAY_MS;
const WATCHDOG_LIMIT_MS = 26 * HOUR_MS;
const NOT_PROBED = 'not probed in this run';
const RUNNER_PHASE = 'no data until Phase 49';
const CHANNEL_PHASE = 'no data until Phase 49';
const DOWNLOAD_PHASE = 'no data until Phase 50';
const ADVISORY_RE = /^[0-9]+(\.[0-9]+){1,2}(esr)?$/;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const maintRow = (name, status, evidence) => ({ name, status, evidence });

function compareTuple(a, b) {
    for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

function runnerRow(f) {
    const name = 'runner-online';
    if (typeof f.runnersOnline !== 'number') return maintRow(name, 'no-data', NOT_PROBED);
    if (f.runnersOnline <= 0) return maintRow(name, 'no-data', RUNNER_PHASE);
    return maintRow(name, 'green', `${f.runnersOnline} runner(s) online`);
}

function esrPinRow(f) {
    const name = 'esr-pin-age';
    const pin = tagToVersion(f.pinTag);
    if (pin === null) return maintRow(name, 'red', `the pin ${JSON.stringify(f.pinTag)} is not an *esr_RELEASE tag`);
    if (!Array.isArray(f.tags) || f.tags.length === 0) return maintRow(name, 'no-data', 'no tag listing');
    const newer = [...new Set(f.tags)]
        .map(t => classifyTag(t, pin.tuple[0]))
        .filter(c => c.keep)
        .map(c => c.version)
        .filter(v => compareTuple(v.tuple, pin.tuple) > 0)
        .sort((a, b) => compareTuple(a.tuple, b.tuple));
    const releases = Array.isArray(f.releases) ? f.releases : [];
    const matches = v => releases.filter(r => r && typeof r.tag_name === 'string' && r.tag_name.includes(v.esrVersion));
    const stale = [];
    const undated = [];
    for (const v of newer) {
        const dated = f.tagDates?.[v.tag];
        if (typeof dated !== 'number') { undated.push(v.tag); continue; }
        if (f.nowMs - dated <= STALE_TAG_MS) continue;
        if (matches(v).some(r => r.draft !== true)) continue;
        const days = Math.floor((f.nowMs - dated) / DAY_MS);
        const draftOnly = matches(v).length > 0 ? ' (a draft Release does not count)' : '';
        stale.push(`${v.tag} is ${days} day(s) old with no published Release${draftOnly}`);
    }
    // The advisory value is untrusted text that lands in the pinned body and the comment; only a version string is kept.
    const advisory = typeof f.advisoryEsr === 'string' && ADVISORY_RE.test(f.advisoryEsr) ? `; product-details FIREFOX_ESR ${f.advisoryEsr} (advisory, not a gate)` : '';
    if (stale.length > 0) return maintRow(name, 'red', `${stale.join('; ')}${advisory}`);
    // A newer tag whose commit date was not read cannot be called fresh: the sweep did not observe it.
    if (undated.length > 0) return maintRow(name, 'no-data', `commit date of ${undated.join(', ')} unavailable${advisory}`);
    if (newer.length === 0) return maintRow(name, 'green', `pin ${f.pinTag} is the newest tag under major ${pin.tuple[0]}${advisory}`);
    return maintRow(name, 'green', `pin ${f.pinTag}; ${newer.length} newer tag(s), none older than 3 days without a published Release${advisory}`);
}

function channelRow(f) {
    const name = 'channel-liveness';
    if (typeof f.channelOk !== 'boolean') return maintRow(name, 'no-data', CHANNEL_PHASE);
    return f.channelOk
        ? maintRow(name, 'green', 'every update.xml matches its repo copy and each MAR URL answers 200')
        : maintRow(name, 'red', 'channel probe failed: an update.xml differs from its repo copy or a MAR URL is not 200');
}

function watchdogRow(f) {
    const name = 'watchdog-age';
    if (f.watchdogProbed !== true) return maintRow(name, 'no-data', NOT_PROBED);
    if (typeof f.watchdogStartedAtMs !== 'number') return maintRow(name, 'red', 'no watchdog run recorded in powerbrowser-updates');
    const ageMs = f.nowMs - f.watchdogStartedAtMs;
    const text = `last watchdog run started ${Math.floor(ageMs / HOUR_MS)} h ago`;
    return ageMs < WATCHDOG_LIMIT_MS
        ? maintRow(name, 'green', text)
        : maintRow(name, 'red', `${text}, at or past the 26 h limit`);
}

function syntheticRow(f) {
    const name = 'synthetic events POST';
    if (typeof f.syntheticStatus !== 'number') return maintRow(name, 'no-data', NOT_PROBED);
    if (f.syntheticStatus < 200 || f.syntheticStatus >= 300) return maintRow(name, 'red', `synthetic probe answered ${f.syntheticStatus}, not 2xx`);
    // A 2xx alone proves nothing: with a wrong or missing secret the Worker stores the probe as a real row and answers 200.
    if (f.syntheticAcked !== true) return maintRow(name, 'red', `synthetic probe answered ${f.syntheticStatus} without the synthetic acknowledgement: the shared secret is wrong or missing, and the probe was stored as a real row`);
    return maintRow(name, 'green', `synthetic probe answered ${f.syntheticStatus} and was acknowledged as synthetic; the row is excluded from maintainer queries`);
}

function downloadRow(f) {
    const name = 'download-count';
    if (typeof f.downloadRows !== 'number' || f.downloadRows <= 0) return maintRow(name, 'no-data', DOWNLOAD_PHASE);
    return maintRow(name, 'green', `${f.downloadRows} download-count row(s) in D1`);
}

// --- Phase 51 (TRAIN-11) rows -----------------------------------------------------------------

const cellsOf = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

/**
 * The Expiry column of docs/RENEWALS.md, read with the grammar scripts/verify-renewals.mjs defines (the one grammar for
 * both checks): a whole ISO date, a bare year, or Month YYYY. A year or a month is dated at the START of that period, the
 * earlier and fail-safe reading, so such a deadline turns the row red sooner and never later than the real one. A blank cell
 * (does not expire) and `unknown` (not recorded) are documented absences: they are counted, not dated, not red. Any other
 * cell is a bad line. Returns null when the Expiry column is absent (fail closed). Pure.
 */
export function parseRenewals(text) {
    const lines = String(text ?? '').split('\n');
    const header = lines.findIndex(l => l.trim().startsWith('|') && cellsOf(l).includes('Expiry'));
    if (header === -1) return null;
    const expiry = cellsOf(lines[header]).indexOf('Expiry');
    const dated = [];
    const bad = [];
    let unknown = 0;
    let blank = 0;
    // header + 1 is the separator row; the data rows follow it.
    for (let i = header + 2; i < lines.length; i += 1) {
        if (!lines[i].trim().startsWith('|')) continue;
        const cells = cellsOf(lines[i]);
        const item = cells[0] ?? '';
        const cell = cells[expiry] ?? '';
        if (cell === '') { blank += 1; continue; }
        if (cell === 'unknown') { unknown += 1; continue; }
        const ms = expiryStartMs(cell);
        if (ms === null) bad.push({ line: i + 1, item, cell });
        else dated.push({ line: i + 1, item, cell, ms, period: !/^\d{4}-\d{2}-\d{2}$/.test(cell) });
    }
    return { dated, bad, unknown, blank };
}

/**
 * The docs/RELEASING.md quotation of the thresholds against the data file: the failures, empty when they agree.
 * Exactly one paragraph begins with SWEEP_THRESHOLD_LEAD (a second paragraph quoting the phrase cannot win by position),
 * it cites the data file, and each of the four numbers it quotes equals the file's. Pure.
 */
export function sweepThresholdDocDrift(docText, data) {
    const paras = String(docText ?? '').split(/\n\s*\n/).filter(p => p.startsWith(SWEEP_THRESHOLD_LEAD));
    if (paras.length !== 1) return [`docs/RELEASING.md has ${paras.length} paragraphs beginning "${SWEEP_THRESHOLD_LEAD}", not exactly one. Next step: keep one paragraph that quotes ${SWEEP_THRESHOLDS_REL}.`];
    const para = paras[0];
    const failures = [];
    if (!para.includes(SWEEP_THRESHOLDS_REL)) failures.push(`docs/RELEASING.md's threshold paragraph does not cite ${SWEEP_THRESHOLDS_REL}. Next step: name the file that holds the numbers.`);
    const pick = re => { const m = re.exec(para); return m === null ? null : Number(m[1]); };
    const quoted = {
        dependabotPrMax: pick(/`dependabot-prs` is red when more than (\d+) Dependabot PRs/),
        securityPrDays: pick(/any security PR is older than (\d+) days/),
        alertMax: pick(/`dependabot-alerts` and `codeql-alerts` are red when more than (\d+) are open/),
        pushAgeDays: pick(/`codeql-push-age` warns when the last push to the default branch is older than (\d+) days/),
    };
    for (const k of THRESHOLD_KEYS) {
        if (quoted[k] === null) failures.push(`docs/RELEASING.md's threshold paragraph quotes no number for ${k}. Next step: restore the sentence for it.`);
        else if (quoted[k] !== data?.[k]) failures.push(`docs/RELEASING.md quotes ${k} ${quoted[k]}, but ${SWEEP_THRESHOLDS_REL} holds ${JSON.stringify(data?.[k] ?? null)}. Next step: make the paragraph quote the file (the file is the one place the number lives).`);
    }
    return failures;
}

/** undefined when the thresholds fact was not read, null when it is not four non-negative integers, else the thresholds. */
function thresholdsOf(f) {
    const t = f.thresholds;
    if (t === undefined || t === null) return undefined;
    return typeof t === 'object' && THRESHOLD_KEYS.every(k => Number.isInteger(t[k]) && t[k] >= 0) ? t : null;
}

function renewalsRow(f) {
    const name = 'renewals-due';
    if (typeof f.renewalsText !== 'string') return maintRow(name, 'no-data', `${RENEWALS_NAME} was not read in this run`);
    const parsed = parseRenewals(f.renewalsText);
    if (parsed === null) return maintRow(name, 'red', `${RENEWALS_NAME} has no Expiry column, so the ${RENEWALS_WINDOW_DAYS}-day check cannot read it. Next step: restore the Expiry column.`);
    const today = Math.floor(f.nowMs / DAY_MS) * DAY_MS;
    const reds = [
        ...parsed.bad.map(b => `${RENEWALS_NAME} line ${b.line}: ${b.item} expiry ${JSON.stringify(b.cell)} is not a date the register accepts (YYYY-MM-DD, a bare year, Month YYYY, blank or unknown)`),
        ...parsed.dated.flatMap(d => {
            const days = Math.round((d.ms - today) / DAY_MS);
            if (days > RENEWALS_WINDOW_DAYS) return [];
            return [`${RENEWALS_NAME} line ${d.line}: ${d.item} ${d.cell} ${days < 0 ? `is ${-days} day(s) overdue` : `is ${days} day(s) away`}${d.period ? ' (a year or month is dated at its start)' : ''}`];
        }),
    ];
    if (reds.length > 0) return maintRow(name, 'red', reds.join('; '));
    const periods = parsed.dated.filter(d => d.period).length;
    return maintRow(name, 'green', `${parsed.dated.length} dated item(s) (${periods} known to a year or month only, dated at its start), none within ${RENEWALS_WINDOW_DAYS} days or overdue; ${parsed.unknown} unknown (not date-checked); ${parsed.blank} with no expiry`);
}

function repoControlsRow(f) {
    const name = 'repo-controls';
    const r = f.repoControls;
    if (r === null || typeof r !== 'object') return maintRow(name, 'no-data', REPO_CONTROLS_DEFERRED);
    if (r.ok === true) return maintRow(name, 'green', 'the full read-back matches every declared control');
    const drift = Array.isArray(r.drift) ? r.drift.map(String) : [];
    return maintRow(name, 'red', drift.length > 0 ? `read-back drift: ${drift.join('; ')}` : 'the full read-back failed without naming a control');
}

function dependabotPrsRow(f) {
    const name = 'dependabot-prs';
    if (!Array.isArray(f.dependabotPrs)) return maintRow(name, 'no-data', NOT_PROBED);
    const t = thresholdsOf(f);
    if (t === undefined) return maintRow(name, 'no-data', THRESHOLDS_NOT_READ);
    if (t === null) return maintRow(name, 'red', THRESHOLD_UNREADABLE);
    if (f.dependabotPrs.some(p => !p || typeof p.createdMs !== 'number' || typeof p.security !== 'boolean')) {
        return maintRow(name, 'no-data', 'a Dependabot PR was read without its open date or security flag');
    }
    const open = f.dependabotPrs.length;
    const stale = f.dependabotPrs.filter(p => p.security && f.nowMs - p.createdMs > t.securityPrDays * DAY_MS).length;
    if (open > t.dependabotPrMax || stale > 0) {
        return maintRow(name, 'red', `${open} open Dependabot PR(s) against a limit of ${t.dependabotPrMax}; ${stale} security PR(s) older than ${t.securityPrDays} days`);
    }
    return maintRow(name, 'green', `${open} open Dependabot PR(s); no security PR older than ${t.securityPrDays} days`);
}

function alertCountRow(name, label, count, f) {
    if (typeof count !== 'number') return maintRow(name, 'no-data', NOT_PROBED);
    const t = thresholdsOf(f);
    if (t === undefined) return maintRow(name, 'no-data', THRESHOLDS_NOT_READ);
    if (t === null) return maintRow(name, 'red', THRESHOLD_UNREADABLE);
    return count > t.alertMax
        ? maintRow(name, 'red', `${count} open ${label} alert(s) against a limit of ${t.alertMax}`)
        : maintRow(name, 'green', `${count} open ${label} alert(s)`);
}

function codeqlPushAgeRow(f) {
    const name = 'codeql-push-age';
    if (typeof f.codeqlLastPushMs !== 'number') return maintRow(name, 'no-data', NOT_PROBED);
    const t = thresholdsOf(f);
    if (t === undefined) return maintRow(name, 'no-data', THRESHOLDS_NOT_READ);
    if (t === null) return maintRow(name, 'red', THRESHOLD_UNREADABLE);
    const days = Math.floor((f.nowMs - f.codeqlLastPushMs) / DAY_MS);
    return f.nowMs - f.codeqlLastPushMs > t.pushAgeDays * DAY_MS
        ? maintRow(name, 'red', `the last push to the default branch is ${days} day(s) old, past the ${t.pushAgeDays}-day warning before the CodeQL default-setup auto-disable`)
        : maintRow(name, 'green', `the last push to the default branch is ${days} day(s) old`);
}

/**
 * Codeberg main against GitHub's default branch. The probe writes nothing when no mirror is declared (the
 * vars.CODEBERG_MIRROR slug is unset): that is no-data naming the Phase 53 mirror. When a mirror is declared it
 * always writes { configured: true, codeberg, github }, each side a full 40-hex lowercase SHA or null for a side
 * that could not be read. A declared mirror that did not answer with a SHA is red (a deleted or renamed mirror
 * must not hide forever); a GitHub side that could not be read is no-data (not the mirror's fault). Pure.
 */
function codebergRow(f) {
    const name = 'codeberg-mirror';
    const c = f.codeberg;
    if (c === null || typeof c !== 'object' || c.configured !== true) {
        return maintRow(name, 'no-data', 'no Codeberg mirror is declared (vars.CODEBERG_MIRROR is unset); the row renders no-data until the Phase 53 mirror exists');
    }
    if (!SHA_RE.test(c.github ?? '')) return maintRow(name, 'no-data', 'a Codeberg mirror is declared, but GitHub main could not be read as a full SHA this run');
    if (!SHA_RE.test(c.codeberg ?? '')) return maintRow(name, 'red', 'a Codeberg mirror is declared, but it did not answer with a full main SHA (unreachable, renamed or deleted)');
    return c.codeberg === c.github
        ? maintRow(name, 'green', `Codeberg main ${c.codeberg.slice(0, 12)} matches GitHub main`)
        : maintRow(name, 'red', `Codeberg main ${c.codeberg.slice(0, 12)} differs from GitHub main ${c.github.slice(0, 12)}`);
}

/**
 * The thirteen maintenance rows, in the fixed order, from facts. Pure. facts: { pinTag, nowMs, tags,
 * tagDates, releases, advisoryEsr, runnersOnline, watchdogProbed, watchdogStartedAtMs,
 * syntheticStatus, syntheticAcked, channelOk, downloadRows } for the Phase 48 six, and { renewalsText,
 * thresholds, repoControls, dependabotPrs, dependabotAlerts, codeqlAlerts, codeqlLastPushMs, codeberg } for
 * the Phase 51 seven. A value the sweep did not observe is null (or undefined, or watchdogProbed false), which
 * renders as no-data, never as green.
 */
export function deriveMaintenance(facts) {
    if (typeof facts?.nowMs !== 'number' || !Number.isFinite(facts.nowMs)) {
        throw new Error('the maintenance facts carry no nowMs; the sweep must pass the run clock');
    }
    return {
        rows: [
            runnerRow(facts), esrPinRow(facts), channelRow(facts), watchdogRow(facts), syntheticRow(facts), downloadRow(facts),
            renewalsRow(facts), repoControlsRow(facts), dependabotPrsRow(facts),
            alertCountRow('dependabot-alerts', 'Dependabot', facts.dependabotAlerts, facts),
            alertCountRow('codeql-alerts', 'CodeQL', facts.codeqlAlerts, facts),
            codeqlPushAgeRow(facts), codebergRow(facts),
        ],
    };
}

/** The pinned body: the title, the six rows in the fixed order, and the debug snapshot. Pure and byte-stable. */
export function renderMaintenance(state) {
    const rank = name => { const i = MAINTENANCE_ROW_NAMES.indexOf(name); return i === -1 ? MAINTENANCE_ROW_NAMES.length : i; };
    const ordered = [...state.rows].sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const snapshot = JSON.stringify(Object.fromEntries(ordered.map(r => [r.name, r.status])));
    const body = [
        MAINTENANCE_TITLE,
        '',
        '| Row | Status | Evidence |',
        '| --- | --- | --- |',
        ...ordered.map(r => `| ${r.name} | ${r.status} | ${String(r.evidence).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/')} |`),
        '',
        `<!-- release-train:maintenance-v1 ${snapshot} -->`,
        '',
    ].join('\n');
    return { title: MAINTENANCE_TITLE, body };
}

/** The rows a rendered body carries, as { name, status, evidence }. Pure. */
export function parseRows(body) {
    const out = [];
    for (const line of String(body ?? '').split('\n')) {
        const m = /^\| (.+?) \| (green|red|no-data) \| (.*) \|$/.exec(line);
        if (m) out.push(maintRow(m[1], m[2], m[3]));
    }
    return out;
}

/**
 * The row-list set-equality assert: the derived rows and the rendered body's rows are the same
 * six names, and no seventh row (a Phase 51 row, say) is present. Returns the drift. Pure.
 */
export function maintenanceRowDrift(state, body) {
    const failures = [];
    const derived = state.rows.map(r => r.name);
    for (const n of derived) if (!MAINTENANCE_ROW_NAMES.includes(n)) failures.push(`row ${n} is not one of the thirteen maintenance rows. Next step: remove it, or add it in a later phase's plan.`);
    for (const n of MAINTENANCE_ROW_NAMES) if (!derived.includes(n)) failures.push(`row ${n} is missing from the derived state. Next step: restore it in deriveMaintenance.`);
    const rendered = parseRows(body).map(r => r.name);
    const { onlyA, onlyB } = setDiff(derived, rendered);
    for (const n of onlyA) failures.push(`row ${n} is derived but not rendered. Next step: fix renderMaintenance.`);
    for (const n of onlyB) failures.push(`row ${n} is rendered but not derived. Next step: fix renderMaintenance.`);
    return failures;
}

/**
 * The sweep runs once per UTC day: on the first dispatch tick at or after SWEEP_HOUR_UTC that has no
 * sweep of today. lastSweepMs is the creation time of the previous accepted sweep state (the same
 * provenance as the state lookup), or null when none is known, which leaves the sweep due (a failed
 * lookup repeats a sweep, which is idempotent, rather than skipping it). Pure.
 */
export function sweepDue(nowMs, lastSweepMs = null) {
    if (new Date(nowMs).getUTCHours() < SWEEP_HOUR_UTC) return false;
    if (typeof lastSweepMs !== 'number' || !Number.isFinite(lastSweepMs)) return true;
    return Math.floor(lastSweepMs / DAY_MS) !== Math.floor(nowMs / DAY_MS);
}

/** The comment text for a transition into red: one comment naming every newly red row. Pure. */
function transitionComment(newlyRed, ownerLogin) {
    const lines = newlyRed.map(r => `- ${r.name}: ${r.evidence}`);
    const mention = ownerLogin !== null ? `@${ownerLogin} ` : '';
    return [
        `${mention}release-train: maintenance turned red for ${newlyRed.length} row(s):`,
        ...lines,
        '',
        'Next step: fix the cause named in each row, then the next due tick re-renders the pinned issue.',
        '',
    ].join('\n');
}

/**
 * The tracking issues for one title: those that carry the tracking label and whose author is one of `authors`
 * (logins compare case-insensitively on GitHub; an unset login selects nothing). A same-title issue by anyone else
 * is not selected: its body, labels and events are never read for a decision. Pure.
 */
export function selectTracked(issues, title, authors) {
    const logins = authors.filter(l => typeof l === 'string' && l !== '');
    return (Array.isArray(issues) ? issues : []).filter(i => i && i.title === title
        && i.author !== null && typeof i.author === 'object' && logins.some(l => sameLogin(l, i.author.login))
        && Array.isArray(i.labels) && i.labels.some(l => l && l.name === LABELS.track));
}

/**
 * The pinned maintenance issue is the one issue whose author is the owner's login and that carries the
 * tracking label. ownerLogin '' or null selects nothing (the create path, which writes nothing). Pure.
 */
export function selectPinned(issues, ownerLogin) {
    return selectTracked(issues, MAINTENANCE_TITLE, [ownerLogin]);
}

const normBody = text => String(text ?? '').replace(/\r\n/g, '\n').trimEnd();

export const STATE_ARTIFACT = 'release-train-maintenance-state';
export const TRAIN_WORKFLOW_PATH = '.github/workflows/release-train.yml';
const TRAIN_EVENTS = Object.freeze(['workflow_dispatch', 'schedule']);

/**
 * The run whose maintenance-state artifact is the previous state, or null. A run counts only when it is a run of
 * exactly the train workflow file (path), on one of the events the train uses, that succeeded on the repository's
 * default branch in this repository, and whose head sha is on that branch (onDefaultShas: the shas the workflow
 * verified with the compare endpoint as identical or ahead of the default branch). The artifact must be unexpired,
 * named for the state, uploaded from the same branch, repository id and head sha as its run. A branch name alone
 * is not enough: a tag named like the branch is refused by the event and sha checks. Newest first; the first match
 * wins. Any mismatch is ignored; no match is null, which the plan treats as fail-safe notify. Pure.
 */
export function selectStateArtifact({ runs, artifacts, repo, repoId, branch, onDefaultShas }) {
    if (!Array.isArray(runs) || !Array.isArray(artifacts) || !Array.isArray(onDefaultShas)) return null;
    if (typeof repo !== 'string' || repo === '' || typeof branch !== 'string' || branch === '') return null;
    if (!Number.isSafeInteger(repoId) || repoId <= 0) return null;
    const verified = new Set(onDefaultShas);
    const allowed = new Map();
    for (const r of runs) {
        if (!r || r.path !== TRAIN_WORKFLOW_PATH || !TRAIN_EVENTS.includes(r.event)) continue;
        if (r.status !== 'completed' || r.conclusion !== 'success') continue;
        if (r.head_branch !== branch || !r.head_repository || r.head_repository.full_name !== repo) continue;
        if (typeof r.head_sha !== 'string' || !verified.has(r.head_sha)) continue;
        allowed.set(r.id, r.head_sha);
    }
    for (const a of artifacts) {
        if (!a || a.name !== STATE_ARTIFACT || a.expired !== false) continue;
        const w = a.workflow_run;
        if (!w || w.head_branch !== branch || w.head_repository_id !== repoId) continue;
        if (!allowed.has(w.id) || w.head_sha !== allowed.get(w.id)) continue;
        return a;
    }
    return null;
}

/** The id of the run selectStateArtifact accepts, or null. Pure. */
export function selectStateRun(input) {
    return selectStateArtifact(input)?.workflow_run.id ?? null;
}

/** The row statuses a rendered body carries, keyed by row name. Pure. */
export function statusesOf(body) {
    return Object.fromEntries(parseRows(body).map(r => [r.name, r.status]));
}

/**
 * The write plan for the pinned maintenance issue. issues: every open issue the find returned (any
 * author); the pinned one is selected by selectPinned. rendered: renderMaintenance output. stored: the
 * previous run's { number, statuses } from the maintenance-state artifact, or null. The exactly-one
 * decision (create, update with a patch flag, or fail) comes from findExactlyOne over the pinned issues.
 * A comment is posted only for a row red now that was not red in the stored previous state. The body
 * of the issue is never the source of the previous statuses: when the stored state is missing or names
 * another issue, every red row is newly red (fail-safe notify). A staying-red re-run posts no comment, and neither
 * does a red that returns after a no-data day (the stored state carries the red through no-data).
 * Returns the plan and the state to store for the next run. Pure.
 */
export function nextMaintenance(issues, rendered, { ownerLogin = null, stored = null } = {}) {
    const pinned = selectPinned(issues, ownerLogin);
    // The owner creates the issue in the web UI (CRLF), and the API may trim the final newline: compare the
    // normalised bytes so the PATCH runs on a real difference only.
    const decision = findExactlyOne(pinned.map(i => ({ ...i, body: normBody(i.body) })), { ...rendered, body: normBody(rendered.body) });
    const usable = pinned.length === 1 && stored !== null && typeof stored === 'object' && stored.number === pinned[0].number
        && stored.statuses !== null && typeof stored.statuses === 'object';
    const prior = usable ? stored.statuses : null;
    // A row that reads no-data between two reds is the same unresolved condition, not a recovery: the stored state keeps the
    // last red through a no-data day, so red, no-data, red posts one comment. Only a green day (an observed recovery) resets it.
    const carried = Object.fromEntries(Object.entries(statusesOf(rendered.body)).map(([n, st]) => [n, st === 'no-data' && prior?.[n] === 'red' ? 'red' : st]));
    const state = { number: pinned.length === 1 ? pinned[0].number : null, statuses: carried };
    if (decision.action !== 'update') return { ...decision, comment: null, newlyRed: [], state };
    const newlyRed = parseRows(rendered.body).filter(r => r.status === 'red' && (prior === null || prior[r.name] !== 'red'));
    if (newlyRed.length === 0) return { ...decision, comment: null, newlyRed: [], state };
    return { ...decision, comment: transitionComment(newlyRed, ownerLogin), newlyRed: newlyRed.map(r => r.name), state };
}

function readFacts(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function sweepDueCli([nowSeconds, lastSeconds]) {
    const seconds = Number(nowSeconds);
    if (!Number.isFinite(seconds)) {
        console.error(`${NAME}: FAIL -- the sweep clock ${JSON.stringify(nowSeconds)} is not epoch seconds. Next step: pass date -u +%s.`);
        return 2;
    }
    // An absent, empty or unreadable last-sweep time leaves the sweep due (never a skipped sweep).
    const last = lastSeconds === undefined || lastSeconds === '' ? null : Number(lastSeconds) * 1000;
    console.log(`due=${sweepDue(seconds * 1000, last)}`);
    return 0;
}

function maintenanceCli([factsPath, bodyPath]) {
    let state;
    let rendered;
    try {
        state = deriveMaintenance(readFacts(factsPath));
        rendered = renderMaintenance(state);
    } catch (e) {
        console.error(`${NAME}: FAIL -- the maintenance facts did not derive (${e.message}). Next step: re-run the maintenance facts step.`);
        return 1;
    }
    const drift = maintenanceRowDrift(state, rendered.body);
    if (drift.length > 0) {
        drift.forEach(d => console.error(`${NAME}: FAIL -- ${d}`));
        return 1;
    }
    writeFileSync(bodyPath, rendered.body);
    state.rows.forEach(r => console.log(`maintenance: ${r.name}=${r.status}`));
    return 0;
}

/** "<run id> <artifact created_at>" on stdout, or nothing (the fail-safe path). Unreadable input is nothing, never an error. */
function stateSelectCli([runsPath, artifactsPath, repo, repoIdText, branch, verifiedPath]) {
    try {
        const onDefaultShas = readFileSync(verifiedPath, 'utf8').split('\n').map(x => x.trim()).filter(x => x !== '');
        const a = selectStateArtifact({ runs: readFacts(runsPath), artifacts: readFacts(artifactsPath), repo, repoId: Number(repoIdText), branch, onDefaultShas });
        if (a !== null) console.log(`${a.workflow_run.id} ${typeof a.created_at === 'string' ? a.created_at : ''}`.trim());
    } catch {
        // No output: the workflow treats an empty run id as absent, so the notice fires.
    }
    return 0;
}

/** The stored previous state, or null when it is missing or unreadable (the fail-safe notify path). */
function readStored(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

function maintenancePlanCli([foundPath, bodyPath, commentPath, storedPath, statePath]) {
    let found;
    let rendered;
    try {
        found = readFacts(foundPath);
        rendered = { title: MAINTENANCE_TITLE, body: readFileSync(bodyPath, 'utf8') };
    } catch (e) {
        console.error(`${NAME}: FAIL -- the pinned-issue read or the rendered body did not load (${e.message}). Next step: re-run the report job.`);
        return 1;
    }
    const raw = process.env.OWNER_LOGIN ?? '';
    const ownerLogin = OWNER_RE.test(raw) ? raw : null;
    if (ownerLogin === null) console.log('maintenance: OWNER_LOGIN is unset or not a valid login, so no issue can be selected as the pinned issue (nothing is written)');
    const stored = readStored(storedPath);
    if (stored === null) console.log('maintenance: no usable previous state; every red row is treated as newly red (fail-safe notify)');
    const decision = nextMaintenance(found, rendered, { ownerLogin, stored });
    if (decision.action === 'fail') {
        console.error(`${NAME}: FAIL -- ${decision.reason}`);
        return 1;
    }
    if (decision.comment !== null) writeFileSync(commentPath, decision.comment);
    writeFileSync(statePath, JSON.stringify(decision.state));
    console.log(`action=${decision.action}`);
    console.log(`number=${decision.numbers[0] ?? ''}`);
    console.log(`patch=${decision.patch}`);
    console.log(`comment=${decision.comment !== null}`);
    return 0;
}

/** The maintenance self-test half: fixtures, controls green first, then each plant red naming its drift. */
function maintenanceSelfTest() {
    const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
    const NEWER_153 = esrTag(153, 6, 0);
    const TAG_175 = esrTag(175, 0, 0);
    const OWNER = 'owner-login-fixture';
    const STRANGER = 'stranger-login-fixture';
    const REPO_FIXTURE = 'DeBIOS-Foundation/powerbrowser';
    // Phase 51 fixtures: a RENEWALS table with the given Expiry cells (line 3 is the first data row), the RELEASING
    // threshold paragraph as the owner wrote it, and the day of an instant as the strict ISO text the table holds.
    const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
    const renewalsOf = (...expiries) => ['| Item | Expiry | Last checked | Owner action | Source |', '| --- | --- | --- | --- | --- |',
        ...expiries.map((e, i) => `| Item ${i} | ${e} | 2026-10-29 | act | X |`)].join('\n');
    // The thresholds the rows run on are the tracked file's: every boundary below is derived from it, never hand-kept.
    const T = JSON.parse(readFileSync(join(REPO_ROOT, SWEEP_THRESHOLDS_REL), 'utf8'));
    const RELEASING_TEXT = readFileSync(join(REPO_ROOT, 'docs', 'RELEASING.md'), 'utf8');
    const WORKFLOW_TEXT = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'release-train.yml'), 'utf8');
    const prs = (n, over = {}) => Array.from({ length: n }, () => ({ createdMs: NOW - DAY_MS, security: false, ...over }));
    const facts = (over = {}) => ({
        pinTag: BASE_PIN,
        nowMs: NOW,
        tags: [BASE_PIN, NEWER_153, TAG_175],
        tagDates: { [NEWER_153]: NOW - DAY_MS, [TAG_175]: NOW - 30 * DAY_MS },
        releases: [{ tag_name: 'v153.5.1-1', draft: false, prerelease: false }],
        advisoryEsr: null,
        runnersOnline: 1,
        watchdogProbed: true,
        watchdogStartedAtMs: NOW - 3 * HOUR_MS,
        syntheticStatus: 200,
        syntheticAcked: true,
        channelOk: null,
        downloadRows: 0,
        renewalsText: renewalsOf(isoOf(NOW + 400 * DAY_MS), '', 'unknown'),
        thresholds: T,
        repoControls: null,
        dependabotPrs: [],
        dependabotAlerts: 0,
        codeqlAlerts: 0,
        codeqlLastPushMs: NOW - 10 * DAY_MS,
        codeberg: null,
        ...over,
    });
    const stateOf = f => deriveMaintenance(f);
    const statuses = s => Object.fromEntries(s.rows.map(r => [r.name, r.status]));
    const reds = s => s.rows.filter(r => r.status === 'red').map(r => `${r.name} red: ${r.evidence}`);
    const wantStatuses = (s, want) => Object.keys(want).filter(k => statuses(s)[k] !== want[k]).map(k => `${k} is ${statuses(s)[k]}, not ${want[k]}`);
    const DEFERRED_GREEN = { 'runner-online': 'green', 'esr-pin-age': 'green', 'channel-liveness': 'no-data', 'watchdog-age': 'green', 'synthetic events POST': 'green', 'download-count': 'no-data',
        'renewals-due': 'green', 'repo-controls': 'no-data', 'dependabot-prs': 'green', 'dependabot-alerts': 'green', 'codeql-alerts': 'green', 'codeql-push-age': 'green', 'codeberg-mirror': 'no-data' };
    // The Phase 51 rows of one fixture, read by the boundary controls and plants below.
    const rowOf = (s, name) => s.rows.find(r => r.name === name);
    const NO_PHASE51 = { renewalsText: null, thresholds: null, repoControls: null, dependabotPrs: null, dependabotAlerts: null, codeqlAlerts: null, codeqlLastPushMs: null, codeberg: null };
    const SHA_A = 'a'.repeat(40);
    const SHA_B = 'b'.repeat(40);
    const REN_ROW = (...e) => renewalsOf(...e);
    const day = n => isoOf(NOW + n * DAY_MS);
    const priorBody = renderMaintenance(stateOf(facts())).body;
    const issueBy = (body, login = OWNER, number = 7) => ({ number, title: MAINTENANCE_TITLE, body, author: { login }, labels: [{ name: 'release-train' }] });
    const TWO_RED = facts({ watchdogStartedAtMs: NOW - 27 * HOUR_MS, syntheticStatus: 500 });
    const redRendered = renderMaintenance(stateOf(TWO_RED));
    const redBody = redRendered.body;
    const storedOf = body => ({ number: 7, statuses: statusesOf(body) });
    const FOREIGN_ID = 2002;
    const stateFixtures = () => ({
        input: {
            repo: REPO_FIXTURE,
            repoId: 1001,
            branch: 'main',
            onDefaultShas: ['sha-main-11', 'sha-main-12', 'sha-main-13'],
            runs: [
                { id: 11, path: '.github/workflows/release-train.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'sha-main-11', head_repository: { full_name: REPO_FIXTURE } },
                { id: 12, path: '.github/workflows/release-train.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'feature/x', head_sha: 'sha-main-12', head_repository: { full_name: REPO_FIXTURE } },
                { id: 13, path: '.github/workflows/release-train.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'sha-main-13', head_repository: { full_name: 'fork-owner/powerbrowser' } },
                { id: 14, path: '.github/workflows/release-train.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'sha-off-main', head_repository: { full_name: REPO_FIXTURE } },
                { id: 15, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'sha-main-11', head_repository: { full_name: REPO_FIXTURE } },
            ],
            artifacts: [
                { name: STATE_ARTIFACT, expired: false, workflow_run: { id: 14, head_branch: 'main', head_repository_id: 1001, head_sha: 'sha-off-main' } },
                { name: STATE_ARTIFACT, expired: false, workflow_run: { id: 15, head_branch: 'main', head_repository_id: 1001, head_sha: 'sha-main-11' } },
                { name: STATE_ARTIFACT, expired: false, workflow_run: { id: 12, head_branch: 'feature/x', head_repository_id: 1001, head_sha: 'sha-main-12' } },
                { name: STATE_ARTIFACT, expired: false, workflow_run: { id: 13, head_branch: 'main', head_repository_id: FOREIGN_ID, head_sha: 'sha-main-13' } },
                { name: STATE_ARTIFACT, expired: false, workflow_run: { id: 11, head_branch: 'main', head_repository_id: 1001, head_sha: 'sha-main-11' } },
            ],
        },
    });
    const EDIT_WATCHDOG_AND_SYNTH = body => body.replace('| watchdog-age | green |', '| watchdog-age | red |').replace('| synthetic events POST | green |', '| synthetic events POST | red |');
    const baseState = () => ({
        repo: REPO_FIXTURE,
        repoId: 1001,
        branch: 'main',
        onDefaultShas: ['sha-11'],
        runs: [{ id: 11, path: TRAIN_WORKFLOW_PATH, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'sha-11', head_repository: { full_name: REPO_FIXTURE } }],
        artifacts: [{ name: STATE_ARTIFACT, expired: false, created_at: '2026-11-01T06:05:00Z', workflow_run: { id: 11, head_branch: 'main', head_repository_id: 1001, head_sha: 'sha-11' } }],
    });
    const withState = mutate => { const input = baseState(); mutate(input); return input; };
    // The workflow's CLI glue, run as the workflow runs it: a child node, files in a scratch directory, the owner in the environment.
    const cli = (cliArgs, { env = {}, files = {} } = {}) => {
        const dir = mkdtempSync(join(tmpdir(), 'release-train-cli-'));
        try {
            for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
            const { OWNER_LOGIN: _unset, ...clean } = process.env;
            const r = spawnSync(process.execPath, [join(REPO_ROOT, SELF_REL), ...cliArgs.map(a => a.replace('@DIR@', dir))], { env: { ...clean, ...env }, encoding: 'utf8' });
            return { status: r.status, out: r.stdout, err: r.stderr };
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };
    const planCli = env => cli(['--maintenance-plan', '@DIR@/found.json', '@DIR@/body.md', '@DIR@/comment.md', '@DIR@/none.json', '@DIR@/state.json'], { env, files: { 'found.json': JSON.stringify([issueBy(priorBody)]), 'body.md': priorBody } });
    const planLines = r => r.out.split('\n').filter(l => /^(action|patch|comment)=/.test(l)).join(' ');
    const owned = planLines({ out: 'action=update\npatch=false\ncomment=false\n' });
    const controls = [
        { name: 'control: the all-green fixture renders the expected statuses', run: () => wantStatuses(stateOf(facts()), DEFERRED_GREEN) },
        { name: 'control: a 175 tag five days old with no Release is ignored under the 153 guard', run: () => wantStatuses(stateOf(facts({ tagDates: { [NEWER_153]: NOW - DAY_MS, [TAG_175]: NOW - 5 * DAY_MS } })), { 'esr-pin-age': 'green' }) },
        { name: 'control: a 153 tag five days old with a published Release stays green', run: () => wantStatuses(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [{ tag_name: 'v153.6.0-1', draft: false, prerelease: false }] })), { 'esr-pin-age': 'green' }) },
        { name: 'control: a watchdog run 25 hours old stays green', run: () => wantStatuses(stateOf(facts({ watchdogStartedAtMs: NOW - 25 * HOUR_MS })), { 'watchdog-age': 'green' }) },
        { name: 'control: zero online runners is no-data naming Phase 49', run: () => { const r = stateOf(facts({ runnersOnline: 0 })).rows.find(x => x.name === 'runner-online'); return r.status === 'no-data' && r.evidence.includes('Phase 49') ? [] : [`runner-online is ${r.status} with "${r.evidence}"`]; } },
        { name: 'control: an empty facts response renders thirteen no-data rows', run: () => { const s = stateOf(facts({ tags: [], tagDates: {}, releases: [], runnersOnline: null, watchdogProbed: false, syntheticStatus: null, channelOk: null, downloadRows: 0, ...NO_PHASE51 })); return s.rows.length === 13 && s.rows.every(r => r.status === 'no-data') ? [] : [`empty facts gave ${JSON.stringify(statuses(s))}`]; } },
        // TRAIN-11 boundaries. renewals-due is red for 0 <= days-until <= 30 (exactly 30 red, 31 green), overdue red, unparseable red naming the line.
        { name: 'control: a renewals date 31 days away stays green', run: () => (rowOf(stateOf(facts({ renewalsText: REN_ROW(day(31)) })), 'renewals-due').status === 'green' ? [] : ['a date 31 days away is not green']) },
        { name: 'control: blank and unknown expiry cells are documented absences, not red', run: () => (rowOf(stateOf(facts({ renewalsText: REN_ROW('', 'unknown') })), 'renewals-due').status === 'green' ? [] : ['a blank or unknown expiry turned renewals-due red']) },
        { name: 'control: the tracked RENEWALS.md has no bad cell, agrees with the register check, and its Node 24 row is 2028-04-30', run: () => {
            const text = readFileSync(join(REPO_ROOT, 'docs', 'RENEWALS.md'), 'utf8');
            const parsed = parseRenewals(text);
            if (parsed === null) return ['docs/RENEWALS.md has no Expiry column'];
            const failures = parsed.bad.map(b => `docs/RENEWALS.md line ${b.line}: ${b.item} expiry ${JSON.stringify(b.cell)} is bad for the sweep`);
            // The commit gate and the sweep must call the same cells valid: the register check finds no Expiry problem either.
            failures.push(...renewalsStructureChecks(REPO_ROOT, { text }).failures.filter(f => f.includes('Expiry cell')));
            if (!parsed.dated.some(d => d.item === 'Node 24 end of life' && d.cell === '2028-04-30')) failures.push('the Node 24 row is not a dated 2028-04-30 item');
            return failures;
        } },
        { name: 'control: a bare year and Month YYYY are dated at the start of the period, and the evidence counts unknown and blank items', run: () => {
            const r = rowOf(stateOf(facts({ renewalsText: REN_ROW('2046', 'April 2030', 'unknown', 'unknown', '') })), 'renewals-due');
            return r.status === 'green' && r.evidence.includes('2 dated item(s) (2 known to a year or month only') && r.evidence.includes('2 unknown (not date-checked)') && r.evidence.includes('1 with no expiry') ? [] : [`renewals-due gave ${r.status}: ${r.evidence}`];
        } },
        // The thresholds are read from the data file; the RELEASING paragraph only quotes it, and the quotation is compared to the file.
        { name: 'control: the tracked thresholds file is valid and the RELEASING.md paragraph quotes exactly its numbers', run: () => {
            const failures = [];
            if (!THRESHOLD_KEYS.every(k => Number.isInteger(T[k]) && T[k] >= 0) || Object.keys(T).length !== THRESHOLD_KEYS.length) failures.push(`${SWEEP_THRESHOLDS_REL} is not exactly ${THRESHOLD_KEYS.join(', ')} as non-negative integers: ${JSON.stringify(T)}`);
            return [...failures, ...sweepThresholdDocDrift(RELEASING_TEXT, T)];
        } },
        { name: 'control: the workflow render step reads the thresholds file the rows run on', run: () => (WORKFLOW_TEXT.includes(SWEEP_THRESHOLDS_REL) ? [] : [`.github/workflows/release-train.yml never reads ${SWEEP_THRESHOLDS_REL}, so the sweep would run on no thresholds`]) },
        { name: 'control: the file thresholds are what the rows judge by', run: () => {
            const f = { dependabotPrs: prs(T.dependabotPrMax), dependabotAlerts: T.alertMax, codeqlAlerts: T.alertMax };
            const s = stateOf(facts(f));
            return wantStatuses(s, { 'dependabot-prs': 'green', 'dependabot-alerts': 'green', 'codeql-alerts': 'green' });
        } },
        { name: 'control: a security Dependabot PR exactly at the file day limit is not red', run: () => (rowOf(stateOf(facts({ dependabotPrs: [{ createdMs: NOW - T.securityPrDays * DAY_MS, security: true }] })), 'dependabot-prs').status === 'green' ? [] : ['a security PR at the day limit is not green']) },
        { name: 'control: a non-security Dependabot PR far older than the security limit stays green', run: () => (rowOf(stateOf(facts({ dependabotPrs: [{ createdMs: NOW - (T.securityPrDays + 30) * DAY_MS, security: false }] })), 'dependabot-prs').status === 'green' ? [] : ['an old non-security PR turned the row red']) },
        { name: 'control: PR and alert facts with the thresholds not read are no-data naming the file, not not-probed', run: () => {
            const s = stateOf(facts({ thresholds: null }));
            const names = ['dependabot-prs', 'dependabot-alerts', 'codeql-alerts', 'codeql-push-age'];
            const bad = names.filter(n => { const r = rowOf(s, n); return r.status !== 'no-data' || !r.evidence.includes(SWEEP_THRESHOLDS_REL); });
            return bad.length === 0 ? [] : [`${bad.join(', ')} did not render no-data naming ${SWEEP_THRESHOLDS_REL}`];
        } },
        { name: 'control: the file push-age limit exactly is not red', run: () => (rowOf(stateOf(facts({ codeqlLastPushMs: NOW - T.pushAgeDays * DAY_MS })), 'codeql-push-age').status === 'green' ? [] : ['a push at the age limit is not green']) },
        { name: 'control: the repo-controls no-data row names its deferral and the workflow carries the marker', run: () => {
            const r = rowOf(stateOf(facts({ repoControls: null })), 'repo-controls');
            const marked = /^\s*repoControls:\s*null\s*,/m.test(WORKFLOW_TEXT) === WORKFLOW_TEXT.includes('deferred: repo-controls-live-read');
            return r.status === 'no-data' && r.evidence.includes('deferred') && marked ? [] : [`repo-controls gave ${r.status}: ${r.evidence}; marker consistent: ${marked}`];
        } },
        { name: 'control: a Codeberg no-data row is green-with-note and writes no comment', run: () => {
            const s = stateOf(facts({ codeberg: null }));
            const d = nextMaintenance([issueBy(renderMaintenance(s).body)], renderMaintenance(s), { ownerLogin: OWNER, stored: null });
            const r = rowOf(s, 'codeberg-mirror');
            return r.status === 'no-data' && r.evidence.includes('Phase 53') && d.comment === null && s.rows.every(x => x.status !== 'red') ? [] : [`codeberg no-data gave ${r.status} and a comment=${d.comment !== null}`];
        } },
        { name: 'control: a planted red row produces exactly one comment naming it', run: () => {
            const prior = renderMaintenance(stateOf(facts())).body;
            const d = nextMaintenance([issueBy(prior)], renderMaintenance(stateOf(facts({ renewalsText: REN_ROW(day(5)) }))), { ownerLogin: OWNER, stored: storedOf(prior) });
            const lines = (d.comment ?? '').split('\n').filter(l => l.startsWith('- '));
            return d.newlyRed.join(',') === 'renewals-due' && lines.length === 1 && lines[0].startsWith('- renewals-due:') ? [] : [`the planted red row gave ${JSON.stringify(d.newlyRed)} with ${lines.length} comment line(s)`];
        } },
        { name: 'control: two identical full SHAs render green, an unset mirror and an unreadable GitHub side are no-data', run: () => {
            const row = c => rowOf(stateOf(facts({ codeberg: c })), 'codeberg-mirror').status;
            const got = [row({ configured: true, codeberg: SHA_A, github: SHA_A }), row(null), row({ configured: true, codeberg: SHA_A, github: null }), row({ codeberg: SHA_A, github: SHA_A })];
            return got.join(',') === 'green,no-data,no-data,no-data' ? [] : [`equal SHAs, an unset mirror, an unreadable GitHub side and an undeclared pair gave ${got.join(',')}`];
        } },
        { name: 'control: two sweep renders over unchanged facts print byte-identical bodies', run: () => {
            const f = () => facts({ renewalsText: REN_ROW(day(12)), dependabotAlerts: 2, codeberg: { configured: true, codeberg: SHA_A, github: SHA_B } });
            const one = renderMaintenance(stateOf(f())).body;
            const two = renderMaintenance(stateOf(f())).body;
            return one === two ? [] : ['two renders over the same facts differ'];
        } },
        { name: 'control: red, no-data, red posts exactly one comment, and red, green, red posts two', run: () => {
            const redNow = renderMaintenance(stateOf(facts({ dependabotAlerts: T.alertMax + 1 })));
            const noData = renderMaintenance(stateOf(facts({ dependabotAlerts: null })));
            const green = renderMaintenance(stateOf(facts()));
            const step = (prevState, rendered) => nextMaintenance([issueBy(rendered.body)], rendered, { ownerLogin: OWNER, stored: prevState });
            const first = step(storedOf(priorBody), redNow);
            const mid = step(first.state, noData);
            const again = step(mid.state, redNow);
            const afterGreen = step(step(first.state, green).state, redNow);
            const failures = [];
            if (first.comment === null) failures.push('the first red posted no comment');
            if (mid.state.statuses['dependabot-alerts'] !== 'red') failures.push(`the no-data day stored ${mid.state.statuses['dependabot-alerts']}, not the carried red`);
            if (again.comment !== null) failures.push('a red after one no-data day posted a second comment for one unresolved condition');
            if (afterGreen.comment === null) failures.push('a red after an observed green posted no comment');
            return failures;
        } },
        { name: 'control: two rows turn red together and the transition posts one comment naming both', run: () => {
            const d = nextMaintenance([issueBy(priorBody)], redRendered, { ownerLogin: OWNER, stored: storedOf(priorBody) });
            const named = ['watchdog-age', 'synthetic events POST'].every(n => d.comment?.includes(n));
            return d.action === 'update' && d.patch === true && d.newlyRed.join(',') === 'watchdog-age,synthetic events POST' && named ? [] : [`transition gave ${JSON.stringify({ action: d.action, patch: d.patch, newlyRed: d.newlyRed })}`];
        } },
        { name: 'control: a staying-red re-run posts zero new comments', run: () => {
            const d = nextMaintenance([issueBy(redBody)], renderMaintenance(stateOf(TWO_RED)), { ownerLogin: OWNER, stored: storedOf(redBody) });
            return d.comment === null && d.patch === false ? [] : [`a staying-red re-run gave comment=${d.comment !== null} patch=${d.patch}`];
        } },
        { name: 'control: a same-title issue by a stranger is ignored', run: () => {
            const d = nextMaintenance([issueBy('stranger body', STRANGER, 9), issueBy(priorBody)], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: storedOf(priorBody) });
            return d.action === 'update' && d.numbers.join(',') === '7' ? [] : [`the stranger issue changed the selection: ${d.action} ${d.numbers.join(',')}`];
        } },
        { name: 'control: an edited body that marks a red row as previously red still notifies on a transition', run: () => {
            const d = nextMaintenance([issueBy(EDIT_WATCHDOG_AND_SYNTH(priorBody))], redRendered, { ownerLogin: OWNER, stored: storedOf(priorBody) });
            return d.newlyRed.join(',') === 'watchdog-age,synthetic events POST' ? [] : [`an edited body suppressed the notice: newlyRed ${JSON.stringify(d.newlyRed)}`];
        } },
        { name: 'control: a missing stored state treats every red row as newly red', run: () => {
            const d = nextMaintenance([issueBy(redBody)], redRendered, { ownerLogin: OWNER, stored: null });
            return d.comment !== null && d.newlyRed.join(',') === 'watchdog-age,synthetic events POST' ? [] : [`missing state gave newlyRed ${JSON.stringify(d.newlyRed)}`];
        } },
        { name: 'control: a foreign-repo, non-main, off-main-sha or other-workflow artifact is ignored and the state run is run 11', run: () => {
            const fx = stateFixtures();
            const id = selectStateRun(fx.input);
            return id === 11 ? [] : [`state selection picked ${id}, not run 11`];
        } },
        { name: 'control: with no admissible state the notice still fires for every red row', run: () => {
            const fx = stateFixtures();
            const id = selectStateRun({ ...fx.input, artifacts: fx.input.artifacts.slice(0, 2) });
            const d = nextMaintenance([issueBy(redBody)], redRendered, { ownerLogin: OWNER, stored: id === null ? null : storedOf(redBody) });
            return id === null && d.newlyRed.join(',') === 'watchdog-age,synthetic events POST' ? [] : [`no admissible state gave run ${id} and newlyRed ${JSON.stringify(d.newlyRed)}`];
        } },
        { name: 'control: one tracking issue is patched only when its bytes differ', run: () => {
            const same = nextMaintenance([issueBy(priorBody)], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: storedOf(priorBody) });
            const diff = nextMaintenance([issueBy('stale body')], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: storedOf(priorBody) });
            return same.patch === false && diff.patch === true ? [] : [`same bytes patch=${same.patch}, differing bytes patch=${diff.patch}`];
        } },
        { name: 'control: the rendered body is byte-stable under shuffled facts order', run: () => {
            const shuffled = facts({ tags: [TAG_175, NEWER_153, BASE_PIN], releases: [...facts().releases].reverse() });
            return renderMaintenance(stateOf(facts())).body === renderMaintenance(stateOf(shuffled)).body ? [] : ['shuffled facts rendered different bytes'];
        } },
        { name: 'control: the derived rows and the rendered rows are the same six', run: () => maintenanceRowDrift(stateOf(facts()), renderMaintenance(stateOf(facts())).body) },
        { name: 'control: the one admissible run is the previous state, and an older invalid one before it is skipped', run: () => {
            const input = withState(i => { i.runs.unshift({ ...i.runs[0], id: 10, head_branch: 'feature/x' }); i.artifacts.unshift({ ...i.artifacts[0], workflow_run: { ...i.artifacts[0].workflow_run, id: 10 } }); });
            const id = selectStateRun(input);
            return id === 11 ? [] : [`state selection picked ${id}, not run 11`];
        } },
        { name: 'control: a different-case owner login still selects the owner issue', run: () => {
            const picked = selectPinned([issueBy(priorBody, OWNER.toUpperCase())], OWNER);
            return picked.length === 1 ? [] : [`a login differing only in case selected ${picked.length} issue(s)`];
        } },
        { name: 'control: a CRLF body with no final newline is not a byte diff', run: () => {
            const crlf = priorBody.replace(/\n/g, '\r\n').trimEnd();
            const d = nextMaintenance([issueBy(crlf)], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: storedOf(priorBody) });
            return d.patch === false ? [] : ['a CRLF body with a trimmed final newline planned a PATCH'];
        } },
        { name: 'control: a real body change is still a PATCH after normalisation', run: () => {
            const d = nextMaintenance([issueBy(priorBody.replace('| runner-online | green |', '| runner-online | red |'))], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: storedOf(priorBody) });
            return d.patch === true ? [] : ['a changed row planned no PATCH'];
        } },
        { name: 'control: a newer tag with no commit date is no-data, not green', run: () => wantStatuses(stateOf(facts({ tagDates: {} })), { 'esr-pin-age': 'no-data' }) },
        { name: 'control: an untrusted advisory value is dropped from the evidence', run: () => {
            const r = stateOf(facts({ advisoryEsr: '153.5.2esr\n@everyone | x' })).rows.find(x => x.name === 'esr-pin-age');
            return r.evidence.includes('@everyone') || r.evidence.includes('\n') ? [`the advisory text reached the evidence: ${JSON.stringify(r.evidence)}`] : [];
        } },
        { name: 'control: a valid advisory value is shown', run: () => (stateOf(facts({ advisoryEsr: '153.5.2esr' })).rows.find(x => x.name === 'esr-pin-age').evidence.includes('FIREFOX_ESR 153.5.2esr') ? [] : ['a valid advisory value was dropped']) },
        { name: 'control: evidence newlines never split a rendered row', run: () => {
            const s = stateOf(facts());
            const bad = { rows: s.rows.map((r, i) => (i === 1 ? { ...r, evidence: 'line one\nline two\r\n| x' } : r)) };
            const body = renderMaintenance(bad).body;
            return maintenanceRowDrift(bad, body).length === 0 && !body.includes('line one\nline two') ? [] : ['an evidence newline split a rendered row'];
        } },
        { name: 'control: a second tick on the same UTC day is not due, the next day is', run: () => {
            const failures = [];
            if (sweepDue(Date.UTC(2026, 10, 1, 7, 0), Date.UTC(2026, 10, 1, 6, 5))) failures.push('a second tick the same day is due');
            if (!sweepDue(Date.UTC(2026, 10, 2, 6, 0), Date.UTC(2026, 10, 1, 6, 5))) failures.push('the first tick the next day is not due');
            if (!sweepDue(Date.UTC(2026, 10, 1, 7, 0), null)) failures.push('an unknown last sweep is not due');
            if (!sweepDue(Date.UTC(2026, 10, 1, 7, 0), Number.NaN)) failures.push('an unreadable last sweep is not due');
            if (sweepDue(Date.UTC(2026, 10, 1, 5, 59), Date.UTC(2026, 9, 31, 6, 5))) failures.push('a tick before 06:00 is due');
            return failures;
        } },
        { name: 'control: the CLI plan with the owner set selects the owner issue', run: () => {
            const r = planCli({ OWNER_LOGIN: OWNER });
            return planLines(r) === owned ? [] : [`the plan with the owner set gave ${JSON.stringify(planLines(r))} (${r.err.trim()})`];
        } },
        { name: 'control: the CLI plan with a different-case owner selects the owner issue', run: () => {
            const r = planCli({ OWNER_LOGIN: OWNER.toUpperCase() });
            return planLines(r) === owned ? [] : [`the plan with a different-case owner gave ${JSON.stringify(planLines(r))}`];
        } },
        { name: 'control: the CLI plan refuses a login that is not shaped like a login, even when an issue carries it', run: () => {
            const odd = 'bad login!';
            const r = cli(['--maintenance-plan', '@DIR@/found.json', '@DIR@/body.md', '@DIR@/comment.md', '@DIR@/none.json', '@DIR@/state.json'], { env: { OWNER_LOGIN: odd }, files: { 'found.json': JSON.stringify([issueBy(priorBody, odd)]), 'body.md': priorBody } });
            return planLines(r) === 'action=create patch=false comment=false' ? [] : [`a malformed owner login gave ${JSON.stringify(planLines(r))}`];
        } },
        ...[['unset', {}], ['empty', { OWNER_LOGIN: '' }], ['carrying a newline', { OWNER_LOGIN: `${OWNER}\nx` }], ['another login', { OWNER_LOGIN: STRANGER }]].map(([label, env]) => ({
            name: `control: the CLI plan with the owner ${label} writes nothing (the create path)`,
            run: () => {
                const r = planCli(env);
                return planLines(r) === 'action=create patch=false comment=false' ? [] : [`the plan with the owner ${label} gave ${JSON.stringify(planLines(r))}`];
            },
        })),
        { name: 'control: the CLI state selection prints the run id and the artifact time, and prints nothing on garbage', run: () => {
            const input = baseState();
            const files = { 'runs.json': JSON.stringify(input.runs), 'artifacts.json': JSON.stringify(input.artifacts), 'verified.txt': 'sha-11\n', 'garbage.json': 'not json' };
            const argv = (runs, shas) => ['--state-select', `@DIR@/${runs}`, '@DIR@/artifacts.json', REPO_FIXTURE, '1001', 'main', `@DIR@/${shas}`];
            const good = cli(argv('runs.json', 'verified.txt'), { files });
            const bad = cli(argv('garbage.json', 'verified.txt'), { files });
            const none = cli(argv('runs.json', 'missing.txt'), { files });
            const failures = [];
            if (good.out.trim() !== '11 2026-11-01T06:05:00Z') failures.push(`the selection printed ${JSON.stringify(good.out.trim())}`);
            if (bad.out.trim() !== '' || bad.status !== 0) failures.push(`garbage input printed ${JSON.stringify(bad.out.trim())} with status ${bad.status}`);
            if (none.out.trim() !== '') failures.push(`an unreadable verified list selected ${JSON.stringify(none.out.trim())}`);
            return failures;
        } },
        { name: 'control: the CLI sweep clock honours the last sweep', run: () => {
            const at = h => String(Date.UTC(2026, 10, 1, h, 0) / 1000);
            const sameDay = cli(['--sweep-due', at(9), at(6)]).out.trim();
            const none = cli(['--sweep-due', at(9), '']).out.trim();
            const noArg = cli(['--sweep-due', at(9)]).out.trim();
            return sameDay === 'due=false' && none === 'due=true' && noArg === 'due=true' ? [] : [`the CLI sweep clock gave ${sameDay}, ${none}, ${noArg}`];
        } },
        { name: 'control: the sweep is due at 06:00 UTC and not at 05:59', run: () => (sweepDue(Date.UTC(2026, 10, 1, 6, 0)) && !sweepDue(Date.UTC(2026, 10, 1, 5, 59)) ? [] : ['the 06:00 UTC gate is wrong']) },
    ];
    const plants = [
        { name: 'a newer 153 tag five days old with no Release', run: () => reds(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [] }))), expect: 'with no published Release' },
        { name: 'a draft Release as the only match for a stale tag', run: () => reds(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [{ tag_name: 'v153.6.0-1', draft: true, prerelease: false }] }))), expect: 'a draft Release does not count' },
        { name: 'a watchdog run 27 hours old', run: () => reds(stateOf(facts({ watchdogStartedAtMs: NOW - 27 * HOUR_MS }))), expect: 'started 27 h ago' },
        { name: 'no watchdog run recorded', run: () => reds(stateOf(facts({ watchdogStartedAtMs: null }))), expect: 'no watchdog run recorded' },
        { name: 'a synthetic events POST answering 500', run: () => reds(stateOf(facts({ syntheticStatus: 500 }))), expect: 'answered 500' },
        { name: 'a fourteenth row outside the thirteen', run: () => { const s = stateOf(facts()); return maintenanceRowDrift({ rows: [...s.rows, maintRow('future-row', 'green', 'x')] }, renderMaintenance(s).body); }, expect: 'future-row' },
        // TRAIN-11 red plants: each boundary and threshold must go red naming its drift.
        { name: 'a renewals date exactly 30 days away', run: () => reds(stateOf(facts({ renewalsText: REN_ROW(day(30)) }))), expect: 'is 30 day(s) away' },
        { name: 'a renewals date overdue', run: () => reds(stateOf(facts({ renewalsText: REN_ROW(day(-3)) }))), expect: 'is 3 day(s) overdue' },
        { name: 'an unparseable renewals date names its line', run: () => reds(stateOf(facts({ renewalsText: REN_ROW('2027/01/05') }))), expect: 'docs/RENEWALS.md line 3: Item 0 expiry "2027/01/05" is not a date the register accepts' },
        { name: 'an impossible renewals date (2027-02-30) is refused', run: () => reds(stateOf(facts({ renewalsText: REN_ROW('2027-02-30') }))), expect: 'is not a date the register accepts' },
        { name: 'a bare year already begun is dated at its start and overdue', run: () => reds(stateOf(facts({ renewalsText: REN_ROW('2026') }))), expect: 'Item 0 2026 is 304 day(s) overdue (a year or month is dated at its start)' },
        { name: 'a Month YYYY exactly 30 days away', run: () => reds(stateOf(facts({ renewalsText: REN_ROW('December 2026') }))), expect: 'December 2026 is 30 day(s) away' },
        { name: 'a RENEWALS.md without an Expiry column', run: () => reds(stateOf(facts({ renewalsText: '| Item | Due |\n| --- | --- |\n| x | 2027-01-01 |' }))), expect: 'has no Expiry column' },
        { name: 'a thresholds fact with a missing number', run: () => reds(stateOf(facts({ thresholds: { ...T, pushAgeDays: undefined } }))), expect: `are not readable in ${SWEEP_THRESHOLDS_REL}` },
        { name: 'a thresholds fact with a negative number', run: () => reds(stateOf(facts({ thresholds: { ...T, alertMax: -1 } }))), expect: `are not readable in ${SWEEP_THRESHOLDS_REL}` },
        { name: 'one more Dependabot PR open than the file limit', run: () => reds(stateOf(facts({ dependabotPrs: prs(T.dependabotPrMax + 1) }))), expect: `${T.dependabotPrMax + 1} open Dependabot PR(s) against a limit of ${T.dependabotPrMax}` },
        { name: 'a security Dependabot PR one day past the file limit', run: () => reds(stateOf(facts({ dependabotPrs: [{ createdMs: NOW - (T.securityPrDays + 1) * DAY_MS, security: true }] }))), expect: `1 security PR(s) older than ${T.securityPrDays} days` },
        { name: 'one more Dependabot alert than the file limit', run: () => reds(stateOf(facts({ dependabotAlerts: T.alertMax + 1 }))), expect: `${T.alertMax + 1} open Dependabot alert(s) against a limit of ${T.alertMax}` },
        { name: 'one more CodeQL alert than the file limit', run: () => reds(stateOf(facts({ codeqlAlerts: T.alertMax + 1 }))), expect: `${T.alertMax + 1} open CodeQL alert(s) against a limit of ${T.alertMax}` },
        { name: 'a last push one day past the file age limit', run: () => reds(stateOf(facts({ codeqlLastPushMs: NOW - (T.pushAgeDays + 1) * DAY_MS }))), expect: `past the ${T.pushAgeDays}-day warning` },
        { name: 'a RELEASING.md paragraph quoting a different number than the file', run: () => sweepThresholdDocDrift(RELEASING_TEXT.replace(`more than ${T.dependabotPrMax} Dependabot PRs`, `more than ${T.dependabotPrMax + 45} Dependabot PRs`), T), expect: `quotes dependabotPrMax ${T.dependabotPrMax + 45}, but ${SWEEP_THRESHOLDS_REL} holds ${T.dependabotPrMax}` },
        { name: 'a RELEASING.md paragraph that no longer cites the file', run: () => sweepThresholdDocDrift(RELEASING_TEXT.replace(SWEEP_THRESHOLDS_REL, 'a file'), T), expect: 'does not cite' },
        { name: 'a RELEASING.md second paragraph quoting the lead phrase', run: () => sweepThresholdDocDrift(`${SWEEP_THRESHOLD_LEAD}: an earlier paragraph.\n\n${RELEASING_TEXT}`, T), expect: 'not exactly one' },
        { name: 'a RELEASING.md threshold sentence deleted', run: () => sweepThresholdDocDrift(RELEASING_TEXT.replace(/`codeql-push-age` warns when[^\n]*older than \d+ days/, '`codeql-push-age` is not described'), T), expect: 'quotes no number for pushAgeDays' },
        { name: 'Codeberg main lagging GitHub main by full SHA', run: () => reds(stateOf(facts({ codeberg: { configured: true, codeberg: SHA_A, github: SHA_B } }))), expect: 'differs from GitHub main' },
        { name: 'a declared Codeberg mirror that did not answer', run: () => reds(stateOf(facts({ codeberg: { configured: true, codeberg: null, github: SHA_B } }))), expect: 'did not answer with a full main SHA' },
        { name: 'a declared Codeberg mirror that answered a short SHA', run: () => reds(stateOf(facts({ codeberg: { configured: true, codeberg: 'abc1234', github: SHA_B } }))), expect: 'did not answer with a full main SHA' },
        { name: 'two owner-authored tracking issues share the maintenance title', run: () => { const d = nextMaintenance([issueBy(priorBody, OWNER, 7), issueBy('other', OWNER, 9)], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: null }); return d.action === 'fail' ? [d.reason] : []; }, expect: 'open tracking issues' },
        // Each state plant breaks exactly one rule of the one admissible run and calls the real selector, so deleting
        // that rule from selectStateArtifact turns exactly that plant green and the self-test red.
        ...[
            ['a run of another workflow', i => { i.runs[0].path = '.github/workflows/verify.yml'; }],
            ['a run from a pull_request event', i => { i.runs[0].event = 'pull_request'; }],
            ['a run from a push event', i => { i.runs[0].event = 'push'; }],
            ['a failed run', i => { i.runs[0].conclusion = 'failure'; }],
            ['a run still in progress', i => { i.runs[0].status = 'in_progress'; }],
            ['a run on a feature branch', i => { i.runs[0].head_branch = 'feature/x'; }],
            ['a run from a fork head', i => { i.runs[0].head_repository = { full_name: 'fork-owner/powerbrowser' }; }],
            ['a run whose head sha is not on the default branch', i => { i.onDefaultShas = []; }],
            ['an artifact with another name', i => { i.artifacts[0].name = 'other-artifact'; }],
            ['an expired artifact', i => { i.artifacts[0].expired = true; }],
            ['an artifact uploaded from a feature branch', i => { i.artifacts[0].workflow_run.head_branch = 'feature/x'; }],
            ['an artifact uploaded from a foreign repository id', i => { i.artifacts[0].workflow_run.head_repository_id = 2002; }],
            ['an artifact whose head sha differs from its run', i => { i.artifacts[0].workflow_run.head_sha = 'sha-other'; }],
            ['an artifact of a run that is not in the admitted runs', i => { i.artifacts[0].workflow_run.id = 99; delete i.artifacts[0].workflow_run.head_sha; }],
            ['an unusable repository id', i => { i.repoId = 0; i.artifacts[0].workflow_run.head_repository_id = 0; }],
        ].map(([label, mutate]) => ({
            name: `${label} taken as the previous state`,
            run: () => (selectStateRun(withState(mutate)) === null ? [`${label} was refused as the previous state`] : []),
            expect: 'was refused as the previous state',
        })),
        { name: 'a stored state that recorded no-data over a red (the carry lost)', run: () => {
            const redNow = renderMaintenance(stateOf(facts({ dependabotAlerts: T.alertMax + 1 })));
            const stored = { number: 7, statuses: { ...statusesOf(redNow.body), 'dependabot-alerts': 'no-data' } };
            const d = nextMaintenance([issueBy(redNow.body)], redNow, { ownerLogin: OWNER, stored });
            return d.comment === null ? [] : ['a red after a no-data day was re-commented for one unresolved condition'];
        }, expect: 'was re-commented for one unresolved condition' },
        { name: 'a stored state that names another issue', run: () => {
            const d = nextMaintenance([issueBy(redBody)], redRendered, { ownerLogin: OWNER, stored: { number: 99, statuses: statusesOf(redBody) } });
            return d.newlyRed.length > 0 ? ['a stored state of another issue was ignored, so every red row is newly red'] : [];
        }, expect: 'was ignored, so every red row is newly red' },
        { name: 'a synthetic probe 200 without the synthetic acknowledgement', run: () => reds(stateOf(facts({ syntheticAcked: false }))), expect: 'without the synthetic acknowledgement' },
        { name: 'a newer tag whose commit date was not read', run: () => stateOf(facts({ tagDates: {} })).rows.filter(r => r.status === 'no-data' && r.name === 'esr-pin-age').map(r => `${r.name} no-data: ${r.evidence}`), expect: 'unavailable' },
        { name: 'a workflow_run wake from a fork head', run: () => { const a = admitWakeRun({ headRepository: 'fork-owner/powerbrowser' }, 'DeBIOS-Foundation/powerbrowser'); return a.admit ? [] : [a.reason]; }, expect: 'from fork' },
        ...[
            ['an owner issue without the release-train label', [{ ...issueBy(priorBody), labels: [] }], OWNER],
            ['a same-title issue by a stranger', [issueBy(priorBody, STRANGER)], OWNER],
            ['an owner issue with another title', [{ ...issueBy(priorBody), title: 'release-train: other' }], OWNER],
            ['an issue with an unset owner login', [issueBy(priorBody)], null],
            ['an issue with an empty owner login', [issueBy(priorBody)], ''],
            ['an issue with a null author', [{ ...issueBy(priorBody), author: null }], OWNER],
        ].map(([label, issues, login]) => ({
            name: `${label} taken as the pinned issue`,
            run: () => (selectPinned(issues, login).length === 0 ? [`${label} was refused as the pinned issue`] : []),
            expect: 'was refused as the pinned issue',
        })),
    ];
    let failed = 0;
    for (const c of controls) {
        const failures = c.run();
        if (failures.length === 0) console.log(`  ok  ${c.name} -> green`);
        else { console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red: ${failures.join(' | ')}`); failed += 1; }
    }
    for (const p of plants) {
        const failures = p.run();
        if (failures.some(f => f.includes(REPO_ROOT))) { console.error(`${NAME}: --self-test FAIL -- '${p.name}' leaked the checkout path`); failed += 1; continue; }
        if (failures.some(f => f.includes(p.expect))) console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`); failed += 1; }
    }
    return { failed, total: controls.length + plants.length };
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
    const BOT = 'bot-login-fixture[bot]';
    // A tracking issue the collector would pass for the mark, and the facts that make the mark hold for `key`:
    // bot-authored issue, label applied by the bot, a newer superseder that is still open.
    const markIssue = (key, over = {}) => ({ title: `release-train: ${key}`, author: { login: BOT }, labels: [{ name: 'release-train' }, { name: 'state/SUPERSEDED' }], supersededLabelActor: BOT, ...over });
    const markFacts = (key, over = {}) => ({ ownerLogin: OWNER, botLogin: BOT, supersederState: 'open', newerKey: 'v153.24.0-1', markIssues: [markIssue(key)], ...over });
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
            name: 'supersede-release-stage-ids: only a train waiting on approval is a cancel target; a building one is link-only',
            // The target is the old train's run (matched by display title), never the newest run of another SHA. A building run may be mid-publish.
            run: () => ['AWAITING_APPROVAL', 'BUILDING'].flatMap(name => {
                const f = { ...factsOf(FIXTURES[name]), newerTag: esrTag(153, 24, 0) };
                const got = derive(f);
                if (got !== 'SUPERSEDED') return [`a ${name} train with a newer ESR tag derives ${got}, not SUPERSEDED`];
                const t = supersedeTarget(f);
                return [t === null ? `${name} superseded: link only, no cancel target` : `${name} superseded: cancel run ${t.runId} and reject approval environment ${t.environmentId} of ${t.key}`];
            }),
            expect: 'BUILDING superseded: link only, no cancel target',
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
                const got = derive({ ...factsOf(fx), openPr: { head: `chore/esr-${OLDER}`, number: 45 }, newerTag: esrTag(153, 24, 0), chemspillOpen: true, ...markFacts(RELEASE_KEY) });
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
                const cancelled = { ...BASE, ...markFacts(RELEASE_KEY), release: releaseFactsFromLive({ ...FIXTURES.AWAITING_APPROVAL.live, runs: [liveRun(102, MERGE_SHA, 'completed', 'cancelled', '2026-10-31T10:00:00Z')], pending: [] }) };
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
            name: 'control: SUPERSEDED is kept by a verified mark after the superseding fact is gone, and does not page the owner; unmarked it reverts',
            run: () => {
                const gone = { ...FIXTURES.BUMP_PR_GREEN.facts, chemspillOpen: false };
                const marked = { ...gone, ...markFacts(RELEASE_KEY) };
                const view = render(derive(marked), marked);
                const failures = [];
                if (derive(gone) !== 'BUMP_PR_GREEN') failures.push(`an unmarked key with no superseding fact derives ${derive(gone)}, not BUMP_PR_GREEN`);
                if (derive(marked) !== 'SUPERSEDED') failures.push(`a marked key derives ${derive(marked)}, not SUPERSEDED`);
                if (view.mention !== null || view.assign.length > 0) failures.push('a marked key paged the owner');
                return failures;
            },
        },
        {
            name: 'control: BL-01 a mark never supersedes a chemspill revision, a malformed key, a missing revision or a key with no train',
            run: () => {
                const m = key => markFacts(key, { newerKey: 'v153.24.0-1' });
                const cases = [
                    ['chemspill revision 2 with an open PR', { ...BASE, candidateTag: NEWER, revision: 2, openPr: { head: `chore/esr-${NEWER}`, number: 44 }, verifyCheck: 'success', ...m('v153.23.0-2') }, 'BUMP_PR_GREEN'],
                    ['no revision', { ...BASE, candidateTag: NEWER, revision: undefined, openPr: { head: `chore/esr-${NEWER}`, number: 44 }, verifyCheck: 'success', ...m('v153.23.0-undefined') }, 'BUMP_PR_GREEN'],
                    ['release key v153.23.0-2 (BUILDING)', { ...BASE, ...m('v153.23.0-2'), release: releaseFactsFromLive({ ...FIXTURES.BUILDING.live, key: 'v153.23.0-2' }) }, 'BUILDING'],
                    ['malformed release key v153.23.0 (BUILDING)', { ...BASE, ...m('v153.23.0'), release: releaseFactsFromLive({ ...FIXTURES.BUILDING.live, key: 'v153.23.0' }) }, 'BUILDING'],
                    ['no train at all (empty facts plus a mark)', { ...BASE, ...m('v153.5.1-1') }, null],
                    ['a candidate but no open PR', { ...BASE, candidateTag: NEWER, ...m('v153.23.0-1') }, 'DETECTED'],
                ];
                return cases.flatMap(([name, f, want]) => {
                    const got = derive(f);
                    const target = supersedeTarget(f);
                    return got === want && target === null ? [] : [`${name} derives ${got} (want ${want}) with target ${JSON.stringify(target)}`];
                });
            },
        },
        {
            name: 'control: WR-01 a mark without provenance is ignored (stranger issue author, stranger label actor, duplicate issues, no label, no owner or bot login)',
            run: () => {
                const base = { ...FIXTURES.BUMP_PR_GREEN.facts };
                const K = RELEASE_KEY;
                const cases = [
                    ['issue authored by a stranger', markFacts(K, { markIssues: [markIssue(K, { author: { login: 'stranger' } })] })],
                    ['label applied by a stranger', markFacts(K, { markIssues: [markIssue(K, { supersededLabelActor: 'stranger' })] })],
                    ['no label actor recorded', markFacts(K, { markIssues: [markIssue(K, { supersededLabelActor: undefined })] })],
                    ['two trusted issues for the key', markFacts(K, { markIssues: [markIssue(K), markIssue(K)] })],
                    ['issue without the state label', markFacts(K, { markIssues: [markIssue(K, { labels: [{ name: 'release-train' }] })] })],
                    ['issue without the tracking label', markFacts(K, { markIssues: [markIssue(K, { labels: [{ name: 'state/SUPERSEDED' }] })] })],
                    ['issue titled for another key', markFacts(K, { markIssues: [markIssue('v153.9.0-1')] })],
                    ['no owner or bot login passed', markFacts(K, { ownerLogin: undefined, botLogin: undefined })],
                ];
                return cases.flatMap(([name, extra]) => {
                    const got = derive({ ...base, ...extra });
                    return got === 'BUMP_PR_GREEN' ? [] : [`a mark with ${name} derives ${got}, not BUMP_PR_GREEN`];
                });
            },
        },
        {
            name: 'control: WR-01 a mark does not outrank BUMP_RED or CONFLICT; live superseding facts still do',
            run: () => {
                const m = markFacts(RELEASE_KEY);
                const open = { ...FIXTURES.BUMP_PR_GREEN.facts };
                const cases = [
                    ['a red check', { ...open, verifyCheck: 'failure', ...m }, 'BUMP_RED'],
                    ['a merged PR with the pin unchanged', { ...open, openPr: null, merged: true, pinUnchanged: true, ...m }, 'BUMP_RED'],
                    ['a replay FAIL', { ...open, stage: 'rebase-upstream: FAIL -- scan-brand-residue.mjs found residual brand strings', ...m }, 'BUMP_RED'],
                    ['a patch conflict', { ...open, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply', ...m }, 'CONFLICT'],
                    ['a patch conflict under a live newer tag', { ...open, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply', newerTag: esrTag(153, 24, 0) }, 'SUPERSEDED'],
                ];
                return cases.flatMap(([name, f, want]) => (derive(f) === want ? [] : [`${name} with a mark derives ${derive(f)}, not ${want}`]));
            },
        },
        {
            name: 'control: WR-02 the mark expires with its evidence and a superseder must be a valid newer key on the same major',
            run: () => {
                const base = { ...FIXTURES.BUMP_PR_GREEN.facts };
                const K = RELEASE_KEY;
                const failures = [];
                for (const [name, extra, want] of [
                    ['an open newer ESR superseder', {}, 'SUPERSEDED'],
                    ['an open chemspill revision superseder', { newerKey: 'v153.23.0-2' }, 'SUPERSEDED'],
                    ['a published superseder', { supersederState: 'published' }, 'SUPERSEDED'],
                    ['a superseder closed unpublished', { supersederState: 'closed' }, 'BUMP_PR_GREEN'],
                    ['no superseder state', { supersederState: undefined }, 'BUMP_PR_GREEN'],
                    ['no superseder key', { newerKey: undefined }, 'BUMP_PR_GREEN'],
                    ['an older superseder key', { newerKey: 'v153.5.1-1' }, 'BUMP_PR_GREEN'],
                    ['the same key', { newerKey: K }, 'BUMP_PR_GREEN'],
                    ['a superseder on another major', { newerKey: 'v175.0.0-1' }, 'BUMP_PR_GREEN'],
                    ['a malformed superseder key', { newerKey: 'v153.24.0' }, 'BUMP_PR_GREEN'],
                ]) {
                    const got = derive({ ...base, ...markFacts(K, extra) });
                    if (got !== want) failures.push(`${name} derives ${got}, not ${want}`);
                }
                return failures;
            },
        },
        {
            name: 'control: WR-02 a published superseder renders the issue closed and not silent; an open one leaves it open',
            run: () => {
                const f = { ...FIXTURES.BUMP_PR_GREEN.facts, ...markFacts(RELEASE_KEY, { supersederState: 'published', newerIssueUrl: 'https://example.invalid/issues/9' }) };
                const done = render(derive(f), f);
                const open = render(derive({ ...f, supersederState: 'open' }), { ...f, supersederState: 'open' });
                const ok = done.close === true && done.body.includes('which is published') && done.body.includes('https://example.invalid/issues/9') && done.mention === null && open.close === false;
                return ok ? [] : [`published superseder: close ${done.close}, open superseder: close ${open.close}`];
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
    const maint = maintenanceSelfTest();
    failed += maint.failed;
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    const total = trainPlants.length + conflictPlants.length + viewPlants.length + publishPlants.length + uptakePlants.length;
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(ALL_STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, ${total} planted faults went red naming their drift, and ${greens.length + uptakeGreens.length} controls stayed green; maintenance half: ${maint.total} case(s) proven (thirteen rows, no-data branches, transition comments, exactly-one, fork head, draft Release)`);
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
    if (args[0] === '--sweep-due' && (args.length === 2 || args.length === 3)) process.exit(sweepDueCli(args.slice(1)));
    if (args[0] === '--maintenance' && args.length === 3) process.exit(maintenanceCli(args.slice(1)));
    if (args[0] === '--maintenance-plan' && args.length === 6) process.exit(maintenancePlanCli(args.slice(1)));
    if (args[0] === '--state-select' && args.length === 7) process.exit(stateSelectCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>, node ${SELF_REL} --sweep-due <epoch-seconds> [<last-sweep-epoch-seconds>], node ${SELF_REL} --maintenance <facts.json> <body-out>, or node ${SELF_REL} --maintenance-plan <found.json> <rendered-body> <comment-out> <stored-state|''> <state-out>, node ${SELF_REL} --state-select <runs.json> <artifacts.json> <repo> <repo-id> <branch> <verified-shas.txt>.`);
    process.exit(2);
}
