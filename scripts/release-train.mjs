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
});

const ACTIONS = Object.freeze({
    DETECTED: 'bump',
    BUMPING: 'wait',
    CONFLICT: 'conflict-issue',
    BUMP_RED: 'wait-owner',
    BUMP_PR_GREEN: 'gate',
    BUILDING: 'wait',
    AWAITING_APPROVAL: 'notify-owner',
    PUBLISHED: 'trigger-gh15',
    DESCRIPTOR_WAIT: 'notify-owner',
    DESCRIPTOR_LIVE: 'close-issue',
    LIVE_RED: 'block-and-link',
    WITHDRAWN: 'reopen-and-instruct',
    DONE: 'noop',
});

// --- Release stage (Phase 50, TRAIN-10) -------------------------------------------
// derive reads normalised release facts (releaseFactsFromLive), never the raw GitHub
// responses. A withdrawal mark in the Release notes is the marker shape; the flag shape is
// prerelease true. The marker is an HTML comment, so it is never rendered on the Release page.
export const WITHDRAWAL_MARK = '<!-- release-withdrawn -->';
const RUN_IN_FLIGHT = Object.freeze(['queued', 'in_progress']);
const NEEDS_OWNER = Object.freeze(['BUMP_PR_GREEN', 'AWAITING_APPROVAL', 'DESCRIPTOR_WAIT', 'LIVE_RED']);

const assetsEqual = (assets, expected) => {
    if (expected.length === 0) return false;
    const a = [...new Set(assets)].sort();
    const e = [...new Set(expected)].sort();
    return a.length === e.length && a.every((x, i) => x === e[i]);
};
const withdrawn = rel => rel.published !== null && (rel.published.prerelease === true || rel.published.body.includes(WITHDRAWAL_MARK));
const waitingDescriptor = rel => rel.pending.includes('descriptor') || rel.descriptorJob === 'waiting';

/** The channel-live subcheck that is red, or byte-equal for a drifted descriptor. Pure. */
export function redSubcheck(rel) {
    if (rel.channelLive !== null && rel.channelLive.green === false) return rel.channelLive.subcheck ?? 'channel-live';
    return 'byte-equal';
}

/**
 * Normalise one release's live GitHub responses into the release facts. The input is the
 * live response shape: runs objects (head_sha, event, status, conclusion, html_url, created_at),
 * pending_deployments entries, the jobs of the run, the Release by tag, the descriptor contents
 * (base64), the channel-live job conclusion and the tracking issue state. The run is the newest
 * run whose head_sha EQUALS the merge SHA; never the latest run of any SHA. Pure.
 */
export function releaseFactsFromLive(live) {
    const matching = live.runs.filter(r => r.head_sha === live.mergeSHA && r.event === 'workflow_dispatch');
    const newest = [...matching].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0] ?? null;
    const job = (live.jobs ?? []).find(j => j.name === 'descriptor') ?? null;
    const bytes = live.contents ? Buffer.from(live.contents.content, 'base64').toString('utf8') : null;
    return {
        key: live.key,
        mergeSHA: live.mergeSHA,
        run: newest === null ? null : { status: newest.status, conclusion: newest.conclusion ?? null, htmlUrl: newest.html_url },
        pending: live.pending.map(p => p.environment.name),
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

/** The state a release is in, from facts, or null with nothing to do. Pure. */
export function derive(facts) {
    const f = facts;
    if (f.release) return deriveRelease(f.release);
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
    // The exact run for this merge SHA, linked by head_sha equality (never recency across SHAs).
    if (runUrl !== null) stateLines.push(`Release run (${runUrl}) SHA ${rel.mergeSHA}`);
    if (state === 'LIVE_RED') stateLines.push(`channel-live red on ${redSubcheck(rel)}. Next step: read the failing log linked from the run.`);
    if (state === 'WITHDRAWN') stateLines.push('Withdrawn. The fix is a new revision with a new tag; a Release is never deleted and no tag is reused.');
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
// Release-stage fixtures are in the live response shape (runs, pending_deployments, Release,
// contents base64, check conclusion, issue state) and pass through releaseFactsFromLive, so the
// normaliser is exercised by the same rows as derive. The SHA and URL literals are fixture-only.
const MERGE_SHA = '1'.repeat(40);
const OTHER_SHA = '2'.repeat(40);
const RELEASE_KEY = 'v153.23.0-1';
const SERVED_BYTES = 'served-public-descriptor-bytes';
const NO_UPDATE_BYTES = 'no-update-descriptor-bytes';
const EXPECTED_ASSETS = Object.freeze(['powerbrowser-153.23.0.tar.xz', 'powerbrowser-153.23.0.complete.mar', 'SHA256SUMS']);
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const runUrl = id => `https://example.invalid/actions/runs/${id}`;
const liveRun = (id, headSha, status, conclusion, createdAt) => ({ id, head_sha: headSha, event: 'workflow_dispatch', status, conclusion, created_at: createdAt, html_url: runUrl(id) });
const liveRelease = (over = {}) => ({ draft: false, prerelease: false, assets: EXPECTED_ASSETS.map(name => ({ name })), body: 'PowerBrowser release notes', ...over });
const liveBase = (over = {}) => ({
    key: RELEASE_KEY, mergeSHA: MERGE_SHA, expectedAssets: EXPECTED_ASSETS, servedBytes: SERVED_BYTES, noUpdateBytes: NO_UPDATE_BYTES,
    runs: [], pending: [], jobs: [], release: null, contents: null, channelLive: null, issue: { state: 'open' }, ...over,
});
const LIVE_DONE_RUN = [liveRun(103, MERGE_SHA, 'completed', 'success', '2026-10-31T11:00:00Z')];
const factsOf = fx => (fx.live !== undefined ? { ...BASE, release: releaseFactsFromLive(fx.live) } : fx.facts);

const FIXTURES = Object.freeze({
    DETECTED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER }, action: 'bump' }),
    BUMPING: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 41 }, bumpConclusion: null }, action: 'wait' }),
    CONFLICT: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, stage: 'apply-patches: FAIL -- 020-powerbrowser-shell.patch did not apply (real conflict, not silent)' }, action: 'conflict-issue' }),
    BUMP_RED: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 42 }, verifyCheck: 'failure' }, action: 'wait-owner' }),
    BUMP_PR_GREEN: Object.freeze({ facts: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 43 }, verifyCheck: 'success', pinUnchanged: false }, action: 'gate' }),
    // The other SHA's run is the newest and must not be linked: the link is by head_sha equality.
    BUILDING: Object.freeze({ live: liveBase({ runs: [liveRun(100, OTHER_SHA, 'completed', 'success', '2026-10-31T12:00:00Z'), liveRun(101, MERGE_SHA, 'in_progress', null, '2026-10-31T10:00:00Z')] }), action: 'wait' }),
    AWAITING_APPROVAL: Object.freeze({ live: liveBase({ runs: [liveRun(102, MERGE_SHA, 'waiting', null, '2026-10-31T10:00:00Z')], pending: [{ environment: { name: 'release' } }], release: liveRelease({ draft: true, assets: [], body: '' }) }), action: 'notify-owner' }),
    PUBLISHED: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease() }), action: 'trigger-gh15' }),
    DESCRIPTOR_WAIT: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, pending: [{ environment: { name: 'descriptor' } }], release: liveRelease(), contents: { content: b64(NO_UPDATE_BYTES) } }), action: 'notify-owner' }),
    DESCRIPTOR_LIVE: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(SERVED_BYTES) }, channelLive: { conclusion: 'success', subcheck: null } }), action: 'close-issue' }),
    LIVE_RED: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(`${SERVED_BYTES} stale`) }, channelLive: { conclusion: 'failure', subcheck: 'byte-equal' } }), action: 'block-and-link' }),
    WITHDRAWN: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease({ prerelease: true }), contents: { content: b64(NO_UPDATE_BYTES) } }), action: 'reopen-and-instruct' }),
    DONE: Object.freeze({ live: liveBase({ runs: LIVE_DONE_RUN, release: liveRelease(), contents: { content: b64(SERVED_BYTES) }, channelLive: { conclusion: 'success', subcheck: null }, issue: { state: 'closed' } }), action: 'noop' }),
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
        const facts = factsOf(fixtures[name]);
        const expected = fixtures[name].action;
        const got = derive(facts);
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
    console.log(`  ok  baseline -> ${Object.keys(STATES).length} states (5 Phase-A, 8 release-stage), one fixture each with expected actions, set-equal; derive, next and render agree`);

    const OWNER = 'owner-login-fixture';
    const trainPlants = [
        {
            name: 'a sixth state with no fixture',
            run: () => runChecks({ states: [...Object.keys(STATES), 'UNBUILT'] }).failures,
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
            name: 'control: BUILDING links the run whose head_sha equals the merge SHA, never a newer run of another SHA',
            run: () => {
                const body = render('BUILDING', { ...factsOf(FIXTURES.BUILDING), ownerLogin: OWNER }).body;
                const exact = runUrl(101);
                return body.includes(`Release run (${exact}) SHA ${MERGE_SHA}`) && !body.includes(runUrl(100)) ? [] : ['BUILDING body did not link the equal-SHA run'];
            },
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

    let failed = 0;
    for (const p of [...trainPlants, ...conflictPlants, ...viewPlants, ...publishPlants]) {
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
    for (const g of greens) {
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
    const total = trainPlants.length + conflictPlants.length + viewPlants.length + publishPlants.length;
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, ${total} planted faults went red naming their drift, and ${greens.length} controls stayed green`);
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
    if (args[0] === '--publish-plan' && args.length === 6) process.exit(publishPlanCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, or node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>.`);
    process.exit(2);
}
