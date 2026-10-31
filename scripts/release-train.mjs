#!/usr/bin/env node
// scripts/release-train.mjs
//
// The release train's pure core (Phase 43, TRAIN-03 and TRAIN-09). The
// reconciler in .github/workflows/release-train.yml wakes, re-derives the state
// of each release from GitHub facts, makes at most one transition per release
// per run, re-renders the tracking issue, and exits. Nothing here touches the
// network, the filesystem or gh: facts in, state / action / issue body out.
// Every gh call stays in the workflow YAML.
//
// The five Phase-A states (the release-stage states BUILDING onward land with
// Phase 50 and are absent here by design):
//   DETECTED      a newer *esr_RELEASE tag exists and no bump PR is open.
//   BUMPING       a bump PR chore/esr-<tag> is open and not yet green.
//   CONFLICT      the replay stage FAILed in apply-patches (a patch did not apply).
//   BUMP_RED      any other replay FAIL, a red bump check, or a merged PR that
//                 left the pin unchanged.
//   BUMP_PR_GREEN the bump PR is open, the pin moved, and the required verify
//                 check succeeded. This is the run's end: the owner merge gate.
//
// Facts shape (every field is a plain value the workflow reads from GitHub):
//   { candidateTag, pinTag, revision, openPr, bumpConclusion, stage,
//     verifyCheck, merged, pinUnchanged }
//   candidateTag  a newer *esr_RELEASE tag under the pinned major, or null
//   openPr        { head, number } for chore/esr-<tag>, or null
//   stage         the FAIL line the replay stage artifact carries, or null
//   verifyCheck   'success' | 'failure' | 'pending' | null on the bump PR
//
// Pure trio contract: derive(facts) -> state name or null; next(state) -> action;
// render(state, facts) -> { title, body }. The snapshot comment in the body is
// debugging output only; it is never read as input.
//
// Tracking-issue labels release-train and state/<STATE> are declared by Phase 42
// in .github/settings/labels.json. This module names them verbatim and creates
// no second label source; if Phase 42 renames one, the constant below moves.
//
// At most one transition per release per run is a workflow property that this
// trio enables: next() names one action per state, and the workflow runs it once.
//
// Honestly --quick: fixtures only. No network, no build, no browser, no display,
// no gh. It writes nothing.
//
// Usage:
//   node scripts/release-train.mjs --self-test

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tagToVersion } from './detect-upstreams.mjs';

const NAME = 'release-train-logic';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_REL = 'scripts/release-train.mjs';
const LABELS = Object.freeze({ track: 'release-train', state: (s) => `state/${s}` });
const APPLY_FAIL = /FAIL -- apply-patches\.sh/;
const ANY_FAIL = /FAIL --/;

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

/** The tracking-issue title and body for a state, rendered from facts. Pure. */
export function render(state, facts) {
    const ref = facts.candidateTag ?? facts.pinTag;
    const version = tagToVersion(ref);
    const key = `v${version.esrVersion}-${facts.revision}`;
    const title = `release-train: ${key}`;
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
    return { title, body, labels: [LABELS.track, LABELS.state(state)] };
}

function setDiff(a, b) {
    const sa = new Set(a);
    const sb = new Set(b);
    return {
        onlyA: [...sa].filter(x => !sb.has(x)).sort(),
        onlyB: [...sb].filter(x => !sa.has(x)).sort(),
    };
}

// Fixture tags are built from parts at run time (see detect-upstreams.mjs for why).
const esrTag = (major, minor, patch, kind = 'RELEASE') => `FIREFOX_${major}_${minor}_${patch}esr_${kind}`;
const BASE_PIN = esrTag(153, 5, 1);
const NEWER = esrTag(153, 23, 0);
const BASE = Object.freeze({ pinTag: BASE_PIN, revision: 1, candidateTag: null, openPr: null, bumpConclusion: null, stage: null, verifyCheck: null, merged: false, pinUnchanged: false });
const FIXTURES = Object.freeze({
    DETECTED: { ...BASE, candidateTag: NEWER },
    BUMPING: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 41 }, bumpConclusion: null },
    CONFLICT: { ...BASE, candidateTag: NEWER, stage: `FAIL -- apply-patches.sh failed replaying patches/*.patch onto ${NEWER}` },
    BUMP_RED: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 42 }, verifyCheck: 'failure' },
    BUMP_PR_GREEN: { ...BASE, candidateTag: NEWER, openPr: { head: `chore/esr-${NEWER}`, number: 43 }, verifyCheck: 'success', pinUnchanged: false },
});

function runChecks(overrides = {}) {
    const states = overrides.states ?? Object.keys(STATES);
    const fixtures = overrides.fixtures ?? FIXTURES;
    const failures = [];
    const { onlyA: missingFixtures, onlyB: missingStates } = setDiff(states, Object.keys(fixtures));
    for (const s of missingFixtures) failures.push(`state ${s} has no fixture. Next step: add a fixture for ${s} beside the other states.`);
    for (const f of missingStates) failures.push(`fixture ${f} names no state in STATES. Next step: add ${f} to STATES, or delete the fixture.`);
    for (const name of Object.keys(fixtures)) {
        if (!states.includes(name)) continue;
        const facts = fixtures[name];
        const got = derive(facts);
        if (got !== name) failures.push(`fixture ${name} derives ${got} instead of ${name}. Next step: fix derive() or the fixture facts.`);
        const action = next(got);
        if (action !== ACTIONS[name]) failures.push(`fixture ${name} maps to action ${action}. Next step: fix next().`);
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
    console.log(`  ok  baseline -> five states, five fixtures, set-equal; derive, next and render agree`);

    const plants = [
        {
            name: 'a sixth state with no fixture',
            run: () => runChecks({ states: [...Object.keys(STATES), 'BUILDING'] }),
            expect: 'BUILDING',
        },
        {
            name: 'a sixth fixture with no state',
            run: () => runChecks({ fixtures: { ...FIXTURES, BUILT: { ...BASE, candidateTag: NEWER } } }),
            expect: 'fixture BUILT names no state',
        },
        {
            name: 'a merged PR with the pin unchanged',
            run: () => {
                const facts = { ...FIXTURES.BUMP_PR_GREEN, openPr: null, merged: true, pinUnchanged: true };
                const got = derive(facts);
                if (got === 'BUMP_RED') return { failures: [`BUMP_RED: merged PR left the pin at ${facts.pinTag} unchanged`] };
                return { failures: [`merged PR derives ${got} with the pin unchanged, never a green state`] };
            },
            expect: `left the pin at ${BASE_PIN} unchanged`,
        },
    ];

    let failed = 0;
    for (const p of plants) {
        const { failures } = p.run();
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
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not go red`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${Object.keys(STATES).length} states set-equal to ${Object.keys(FIXTURES).length} fixtures, and ${plants.length} planted faults went red naming their drift`);
    return 0;
}

const args = process.argv.slice(2);
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Run only as the entry point, so the exports stay importable without side effects.
if (isEntry) {
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error(`  Next step: run: node ${SELF_REL} --self-test.`);
            process.exit(2);
        }
    }
    if (args.length === 0) {
        console.log(`${NAME}: SKIP -- no mode given; run: node ${SELF_REL} --self-test`);
        process.exit(0);
    }
    process.exit(selfTest());
}
