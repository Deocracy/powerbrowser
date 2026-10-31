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
// The maintenance half (TRAIN-07, Phase 48) is pure too: deriveMaintenance over facts the sweep
// reads, renderMaintenance for the pinned body (byte-stable), nextMaintenance for the exactly-one
// write plan (one PATCH on a byte diff, one comment on a transition into red), and sweepDue for
// the 06:00 UTC gate. The sweep's facts step and the report job's write step are the only callers.
//
// Usage:
//   node scripts/release-train.mjs --self-test
//   node scripts/release-train.mjs --sweep-due <epoch-seconds>
//   node scripts/release-train.mjs --maintenance <facts.json> <body-out>
//   node scripts/release-train.mjs --maintenance-plan <found.json> <rendered-body> <comment-out> <stored-state> <state-out>
//   node scripts/release-train.mjs --state-select <runs.json> <artifacts.json> <repo> <repo-id> <branch> <verified-shas.txt>

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTag, tagToVersion } from './detect-upstreams.mjs';

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

const ACTIONS = Object.freeze({
    DETECTED: 'bump',
    BUMPING: 'wait',
    CONFLICT: 'conflict-issue',
    BUMP_RED: 'wait-owner',
    BUMP_PR_GREEN: 'gate',
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

// ---------------------------------------------------------------------------------------------
// The maintenance half (Phase 48, TRAIN-07). Six rows derived from facts the sweep reads and the
// probes it runs under the bot environment. Pure: facts in, rows out; render gives the pinned body.
// The body is output only. The one read back is the previous body's row statuses, which decide a
// transition into red (nextMaintenance) and never decide a state.
// ---------------------------------------------------------------------------------------------

export const MAINTENANCE_TITLE = 'release-train: maintenance';
export const MAINTENANCE_ROW_NAMES = Object.freeze(['runner-online', 'esr-pin-age', 'channel-liveness', 'watchdog-age', 'synthetic events POST', 'download-count']);
export const SWEEP_HOUR_UTC = 6;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const STALE_TAG_MS = 3 * DAY_MS;
const WATCHDOG_LIMIT_MS = 26 * HOUR_MS;
const NOT_PROBED = 'not probed in this run';
const RUNNER_PHASE = 'no data until Phase 49';
const CHANNEL_PHASE = 'no data until Phase 49';
const DOWNLOAD_PHASE = 'no data until Phase 50';
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
    for (const v of newer) {
        const dated = f.tagDates?.[v.tag];
        if (typeof dated !== 'number' || f.nowMs - dated <= STALE_TAG_MS) continue;
        if (matches(v).some(r => r.draft !== true)) continue;
        const days = Math.floor((f.nowMs - dated) / DAY_MS);
        const draftOnly = matches(v).length > 0 ? ' (a draft Release does not count)' : '';
        stale.push(`${v.tag} is ${days} day(s) old with no published Release${draftOnly}`);
    }
    const advisory = typeof f.advisoryEsr === 'string' && f.advisoryEsr !== '' ? `; product-details FIREFOX_ESR ${f.advisoryEsr} (advisory, not a gate)` : '';
    if (stale.length > 0) return maintRow(name, 'red', `${stale.join('; ')}${advisory}`);
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
    if (f.syntheticStatus >= 200 && f.syntheticStatus < 300) return maintRow(name, 'green', `synthetic probe answered ${f.syntheticStatus}; the row is marked synthetic and excluded from maintainer queries`);
    return maintRow(name, 'red', `synthetic probe answered ${f.syntheticStatus}, not 2xx`);
}

function downloadRow(f) {
    const name = 'download-count';
    if (typeof f.downloadRows !== 'number' || f.downloadRows <= 0) return maintRow(name, 'no-data', DOWNLOAD_PHASE);
    return maintRow(name, 'green', `${f.downloadRows} download-count row(s) in D1`);
}

/**
 * The six maintenance rows, in the fixed order, from facts. Pure. facts: { pinTag, nowMs, tags,
 * tagDates, releases, advisoryEsr, runnersOnline, watchdogProbed, watchdogStartedAtMs,
 * syntheticStatus, channelOk, downloadRows }. A value the sweep did not observe is null (or
 * watchdogProbed false), which renders as no-data, never as green.
 */
export function deriveMaintenance(facts) {
    if (typeof facts?.nowMs !== 'number' || !Number.isFinite(facts.nowMs)) {
        throw new Error('the maintenance facts carry no nowMs; the sweep must pass the run clock');
    }
    return {
        rows: [runnerRow(facts), esrPinRow(facts), channelRow(facts), watchdogRow(facts), syntheticRow(facts), downloadRow(facts)],
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
        ...ordered.map(r => `| ${r.name} | ${r.status} | ${String(r.evidence).replace(/\|/g, '/')} |`),
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
    for (const n of derived) if (!MAINTENANCE_ROW_NAMES.includes(n)) failures.push(`row ${n} is not one of the six maintenance rows. Next step: remove it, or add it in a later phase's plan.`);
    for (const n of MAINTENANCE_ROW_NAMES) if (!derived.includes(n)) failures.push(`row ${n} is missing from the derived state. Next step: restore it in deriveMaintenance.`);
    const rendered = parseRows(body).map(r => r.name);
    const { onlyA, onlyB } = setDiff(derived, rendered);
    for (const n of onlyA) failures.push(`row ${n} is derived but not rendered. Next step: fix renderMaintenance.`);
    for (const n of onlyB) failures.push(`row ${n} is rendered but not derived. Next step: fix renderMaintenance.`);
    return failures;
}

/**
 * The sweep runs on every dispatch tick at or after SWEEP_HOUR_UTC. Each due tick re-derives and
 * re-renders; the PATCH runs only on a byte diff and the comment only on a transition into red, so a
 * repeated due tick is idempotent. Pure.
 */
export function sweepDue(nowMs) {
    return new Date(nowMs).getUTCHours() >= SWEEP_HOUR_UTC;
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
 * The pinned maintenance issue is the one issue whose author is the owner's login and that carries the
 * tracking label. A same-title issue by anyone else is not the pinned issue: its body is never read
 * for a decision. ownerLogin '' or null selects nothing (the create path, which writes nothing). Pure.
 */
export function selectPinned(issues, ownerLogin) {
    if (typeof ownerLogin !== 'string' || ownerLogin === '') return [];
    return (Array.isArray(issues) ? issues : []).filter(i => i && i.title === MAINTENANCE_TITLE
        && i.author !== null && typeof i.author === 'object' && i.author.login === ownerLogin
        && Array.isArray(i.labels) && i.labels.some(l => l && l.name === LABELS.track));
}

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
export function selectStateRun({ runs, artifacts, repo, repoId, branch, onDefaultShas }) {
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
        return w.id;
    }
    return null;
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
 * another issue, every red row is newly red (fail-safe notify). A staying-red re-run posts no comment.
 * Returns the plan and the state to store for the next run. Pure.
 */
export function nextMaintenance(issues, rendered, { ownerLogin = null, stored = null } = {}) {
    const pinned = selectPinned(issues, ownerLogin);
    const decision = findExactlyOne(pinned, rendered);
    const state = { number: pinned.length === 1 ? pinned[0].number : null, statuses: statusesOf(rendered.body) };
    if (decision.action !== 'update') return { ...decision, comment: null, newlyRed: [], state };
    const usable = stored !== null && typeof stored === 'object' && stored.number === pinned[0].number
        && stored.statuses !== null && typeof stored.statuses === 'object';
    const prior = usable ? stored.statuses : null;
    const newlyRed = parseRows(rendered.body).filter(r => r.status === 'red' && (prior === null || prior[r.name] !== 'red'));
    if (newlyRed.length === 0) return { ...decision, comment: null, newlyRed: [], state };
    return { ...decision, comment: transitionComment(newlyRed, ownerLogin), newlyRed: newlyRed.map(r => r.name), state };
}

function readFacts(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function sweepDueCli([nowSeconds]) {
    const seconds = Number(nowSeconds);
    if (!Number.isFinite(seconds)) {
        console.error(`${NAME}: FAIL -- the sweep clock ${JSON.stringify(nowSeconds)} is not epoch seconds. Next step: pass date -u +%s.`);
        return 2;
    }
    console.log(`due=${sweepDue(seconds * 1000)}`);
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

/** The state run id on stdout, or nothing (the fail-safe path). Unreadable input is nothing, never an error. */
function stateSelectCli([runsPath, artifactsPath, repo, repoIdText, branch, verifiedPath]) {
    try {
        const onDefaultShas = readFileSync(verifiedPath, 'utf8').split('\n').map(x => x.trim()).filter(x => x !== '');
        const id = selectStateRun({ runs: readFacts(runsPath), artifacts: readFacts(artifactsPath), repo, repoId: Number(repoIdText), branch, onDefaultShas });
        if (id !== null) console.log(String(id));
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
        channelOk: null,
        downloadRows: 0,
        ...over,
    });
    const stateOf = f => deriveMaintenance(f);
    const statuses = s => Object.fromEntries(s.rows.map(r => [r.name, r.status]));
    const reds = s => s.rows.filter(r => r.status === 'red').map(r => `${r.name} red: ${r.evidence}`);
    const wantStatuses = (s, want) => Object.keys(want).filter(k => statuses(s)[k] !== want[k]).map(k => `${k} is ${statuses(s)[k]}, not ${want[k]}`);
    const DEFERRED_GREEN = { 'runner-online': 'green', 'esr-pin-age': 'green', 'channel-liveness': 'no-data', 'watchdog-age': 'green', 'synthetic events POST': 'green', 'download-count': 'no-data' };
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
    const controls = [
        { name: 'control: the all-green fixture renders the expected statuses', run: () => wantStatuses(stateOf(facts()), DEFERRED_GREEN) },
        { name: 'control: a 175 tag five days old with no Release is ignored under the 153 guard', run: () => wantStatuses(stateOf(facts({ tagDates: { [NEWER_153]: NOW - DAY_MS, [TAG_175]: NOW - 5 * DAY_MS } })), { 'esr-pin-age': 'green' }) },
        { name: 'control: a 153 tag five days old with a published Release stays green', run: () => wantStatuses(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [{ tag_name: 'v153.6.0-1', draft: false, prerelease: false }] })), { 'esr-pin-age': 'green' }) },
        { name: 'control: a watchdog run 25 hours old stays green', run: () => wantStatuses(stateOf(facts({ watchdogStartedAtMs: NOW - 25 * HOUR_MS })), { 'watchdog-age': 'green' }) },
        { name: 'control: zero online runners is no-data naming Phase 49', run: () => { const r = stateOf(facts({ runnersOnline: 0 })).rows.find(x => x.name === 'runner-online'); return r.status === 'no-data' && r.evidence.includes('Phase 49') ? [] : [`runner-online is ${r.status} with "${r.evidence}"`]; } },
        { name: 'control: an empty facts response renders six no-data rows', run: () => { const s = stateOf(facts({ tags: [], tagDates: {}, releases: [], runnersOnline: null, watchdogProbed: false, syntheticStatus: null, channelOk: null, downloadRows: 0 })); return s.rows.length === 6 && s.rows.every(r => r.status === 'no-data') ? [] : [`empty facts gave ${JSON.stringify(statuses(s))}`]; } },
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
        { name: 'control: the sweep is due at 06:00 UTC and not at 05:59', run: () => (sweepDue(Date.UTC(2026, 10, 1, 6, 0)) && !sweepDue(Date.UTC(2026, 10, 1, 5, 59)) ? [] : ['the 06:00 UTC gate is wrong']) },
    ];
    const plants = [
        { name: 'a newer 153 tag five days old with no Release', run: () => reds(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [] }))), expect: 'with no published Release' },
        { name: 'a draft Release as the only match for a stale tag', run: () => reds(stateOf(facts({ tagDates: { [NEWER_153]: NOW - 5 * DAY_MS }, releases: [{ tag_name: 'v153.6.0-1', draft: true, prerelease: false }] }))), expect: 'a draft Release does not count' },
        { name: 'a watchdog run 27 hours old', run: () => reds(stateOf(facts({ watchdogStartedAtMs: NOW - 27 * HOUR_MS }))), expect: 'started 27 h ago' },
        { name: 'no watchdog run recorded', run: () => reds(stateOf(facts({ watchdogStartedAtMs: null }))), expect: 'no watchdog run recorded' },
        { name: 'a synthetic events POST answering 500', run: () => reds(stateOf(facts({ syntheticStatus: 500 }))), expect: 'answered 500' },
        { name: 'a seventh row for a later phase', run: () => { const s = stateOf(facts()); return maintenanceRowDrift({ rows: [...s.rows, maintRow('renewals-due', 'green', 'x')] }, renderMaintenance(s).body); }, expect: 'renewals-due' },
        { name: 'two owner-authored tracking issues share the maintenance title', run: () => { const d = nextMaintenance([issueBy(priorBody, OWNER, 7), issueBy('other', OWNER, 9)], renderMaintenance(stateOf(facts())), { ownerLogin: OWNER, stored: null }); return d.action === 'fail' ? [d.reason] : []; }, expect: 'open tracking issues' },
        { name: 'a foreign-repo artifact taken as the previous state (no run or branch filter)', run: () => {
            const fx = stateFixtures();
            const naive = fx.input.artifacts.find(a => a.workflow_run.head_repository_id === FOREIGN_ID);
            const d = nextMaintenance([issueBy(redBody)], redRendered, { ownerLogin: OWNER, stored: { number: 7, statuses: statusesOf(redBody) } });
            return d.newlyRed.length === 0 ? [`the artifact of run ${naive.workflow_run.id} from repository ${naive.workflow_run.head_repository_id} suppressed the newly-red notice`] : [];
        }, expect: 'suppressed the newly-red notice' },
        { name: 'a run whose head sha is not on the default branch taken as the previous state', run: () => {
            const fx = stateFixtures();
            const trustAll = selectStateRun({ ...fx.input, onDefaultShas: fx.input.runs.map(r => r.head_sha) });
            return trustAll === 14 ? [`run ${trustAll} whose head sha sha-off-main is not on the default branch was taken as the previous state`] : [];
        }, expect: 'not on the default branch' },
        { name: 'a feature-branch artifact taken as the previous state (no branch filter)', run: () => {
            const fx = stateFixtures();
            const naive = fx.input.artifacts.find(a => a.workflow_run.head_branch !== 'main');
            const d = nextMaintenance([issueBy(redBody)], redRendered, { ownerLogin: OWNER, stored: { number: 7, statuses: statusesOf(redBody) } });
            return d.newlyRed.length === 0 ? [`the artifact of run ${naive.workflow_run.id} on ${naive.workflow_run.head_branch} suppressed the newly-red notice`] : [];
        }, expect: 'suppressed the newly-red notice' },
        { name: 'a workflow_run wake from a fork head', run: () => { const a = admitWakeRun({ headRepository: 'fork-owner/powerbrowser' }, 'DeBIOS-Foundation/powerbrowser'); return a.admit ? [] : [a.reason]; }, expect: 'from fork' },
        { name: 'a stranger same-title issue taken as the pinned issue (title-only selection)', run: () => {
            const titleOnly = [issueBy('stranger body', STRANGER, 9)].filter(i => i.title === MAINTENANCE_TITLE);
            return titleOnly.filter(i => i.author.login !== OWNER).map(i => `title-only selection would take stranger issue #${i.number} by ${i.author.login} as the pinned issue`);
        }, expect: 'as the pinned issue' },
        { name: 'an edited body suppressing the newly-red notice (body as the previous state)', run: () => {
            const edited = statusesOf(EDIT_WATCHDOG_AND_SYNTH(priorBody));
            const fromBody = parseRows(redBody).filter(r => r.status === 'red' && edited[r.name] !== 'red');
            return fromBody.length === 0 ? ['the edited body suppressed the newly-red notice: no row is newly red'] : [];
        }, expect: 'suppressed the newly-red notice' },
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
    console.log(`  ok  baseline -> five states, five fixtures with expected actions, set-equal; derive, next and render agree`);

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
    const maint = maintenanceSelfTest();
    failed += maint.failed;
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    const total = trainPlants.length + conflictPlants.length + viewPlants.length + publishPlants.length;
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, ${total} planted faults went red naming their drift, and ${greens.length} controls stayed green; maintenance half: ${maint.total} case(s) proven (six rows, no-data branches, transition comments, exactly-one, fork head, draft Release)`);
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
    if (args[0] === '--sweep-due' && args.length === 2) process.exit(sweepDueCli(args.slice(1)));
    if (args[0] === '--maintenance' && args.length === 3) process.exit(maintenanceCli(args.slice(1)));
    if (args[0] === '--maintenance-plan' && args.length === 6) process.exit(maintenancePlanCli(args.slice(1)));
    if (args[0] === '--state-select' && args.length === 7) process.exit(stateSelectCli(args.slice(1)));
    console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --would-write <pin> <tag|''> <open-pr-number|''> <stage|''>, node ${SELF_REL} --publish-plan <local-tree> <remote-tip|''> <remote-tree|''> <compare-json|''> <bot-email>, node ${SELF_REL} --sweep-due <epoch-seconds>, node ${SELF_REL} --maintenance <facts.json> <body-out>, or node ${SELF_REL} --maintenance-plan <found.json> <rendered-body> <comment-out> <stored-state|''> <state-out>, node ${SELF_REL} --state-select <runs.json> <artifacts.json> <repo> <repo-id> <branch> <verified-shas.txt>.`);
    process.exit(2);
}
