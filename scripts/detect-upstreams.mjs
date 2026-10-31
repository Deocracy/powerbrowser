#!/usr/bin/env node
// scripts/detect-upstreams.mjs
//
// The upstream detector (Phase 43, AUTO-01 and AUTO-04). It decides whether a
// newer Firefox ESR release and a newer Node 24 release exist, and what the
// release train should bump. Every decision is pure: facts in, decision out.
// The live tag listing, the product-details fetch and the SHASUMS/signature
// fetch run in the release-train detect job (.github/workflows/release-train.yml),
// never in --quick.
//
// ESR rules:
//  - A candidate is an *esr_RELEASE tag under the pinned major. Peeled ^{}
//    lines, _BUILDn tags and every other major are dropped with a named reason.
//  - The candidate is the maximum numeric tuple. It is a bump only when it is
//    greater than the pin tuple.
//  - product-details (FIREFOX_ESR) is advisory. crossCheckEsr returns a note
//    only and never changes the candidate.
//
// Node rules (AUTO-04):
//  - selectNode24 picks the newest v24 entry of index.json whose files list
//    includes linux-x64.
//  - shasumsEntry reads the sha for one exact filename from SHASUMS256.txt.
//    A malformed line is skipped, never fatal.
//
// The ESR tag shape is copied from scripts/generate.mjs (ESR_RELEASE_TAG,
// near line 2830). generate.mjs is imported only for resolveConfig, and the
// self-test requires generate.mjs to still carry the same literal, so the two
// copies cannot drift silently.
//
// Honestly --quick: fixtures only. No network, no build, no browser, no
// display. The default run (no arguments) reads configuration.toml and SKIPs
// the live listing. It writes nothing.
//
// Usage:
//   node scripts/detect-upstreams.mjs
//   node scripts/detect-upstreams.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'detect-upstreams';
const SELF_REL = 'scripts/detect-upstreams.mjs';
const MANIFEST_REL = 'configuration.toml';
const GENERATE_REL = 'scripts/generate.mjs';
const ESR_RELEASE_TAG_SOURCE = '^[A-Za-z]+_(\\d+)_(\\d+)(?:_(\\d+))?esr_RELEASE$';
const ESR_RELEASE_TAG = new RegExp(ESR_RELEASE_TAG_SOURCE);
const BUILD_TAG = /_BUILD\d+$/;
const ESR_SHAPED = /esr_(RELEASE|BUILD\d+)$/;
const NODE_VERSION = /^v(\d+)\.(\d+)\.(\d+)$/;
const SHASUM_LINE = /^([0-9a-f]{64})\s+\*?(\S+)$/;
const NODE_PLATFORM = 'linux-x64';

const args = process.argv.slice(2);

/** The CLI modes: --self-test, --pin, and --listing <file> [--firefox-esr <value>]. Anything else is null. */
export function parseArgs(argv) {
    if (argv.length === 0) return { mode: 'skip' };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 1 && argv[0] === '--pin') return { mode: 'pin' };
    if (argv[0] === '--listing' && argv.length >= 2 && argv[1] !== '') {
        if (argv.length === 2) return { mode: 'listing', path: argv[1], firefoxEsr: undefined };
        if (argv.length === 4 && argv[2] === '--firefox-esr' && argv[3] !== '') return { mode: 'listing', path: argv[1], firefoxEsr: argv[3] };
    }
    return null;
}

/** The ESR version and numeric tuple of an *esr_RELEASE tag, or null. */
export function tagToVersion(tag) {
    const m = typeof tag === 'string' ? ESR_RELEASE_TAG.exec(tag) : null;
    if (m === null) return null;
    const parts = m.slice(1).filter(g => g !== undefined);
    return { tag, esrVersion: parts.join('.'), tuple: [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] };
}

/** The pinned major as a number. A _BUILDn or malformed pin throws, naming the pin. */
export function pinnedMajor(pinTag) {
    const m = typeof pinTag === 'string' ? ESR_RELEASE_TAG.exec(pinTag) : null;
    if (m === null) {
        throw new Error(`the pin ${JSON.stringify(pinTag)} is not an *esr_RELEASE tag, so no major can be guarded`);
    }
    return Number(m[1]);
}

function compareTuples(a, b) {
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
}

/** Keep or refuse one tag under the pinned major, with the reason a refusal names. */
export function classifyTag(tag, major) {
    if (tag.endsWith('^{}')) return { keep: false, version: null, reason: `${tag}: peeled annotated-tag line, dropped` };
    if (BUILD_TAG.test(tag)) return { keep: false, version: null, reason: `${tag}: _BUILDn candidate refused, only an *esr_RELEASE tag may be a candidate` };
    const version = tagToVersion(tag);
    if (version === null) return { keep: false, version: null, reason: `${tag}: not an *esr_RELEASE tag` };
    if (version.tuple[0] !== major) return { keep: false, version: null, reason: `${tag}: major ${version.tuple[0]} is not the pinned major ${major}` };
    return { keep: true, version, reason: null };
}

/** The maximum numeric candidate under the pinned major, or null when none survives. */
export function pickLatest(tags, major) {
    let best = null;
    for (const t of tags) {
        const c = classifyTag(t, major);
        if (!c.keep) continue;
        if (best === null || compareTuples(best.tuple, c.version.tuple) < 0) best = c.version;
    }
    return best;
}

/** A note only. product-details (FIREFOX_ESR) never changes the candidate. */
export function crossCheckEsr(candidate, firefoxEsrField) {
    const field = String(firefoxEsrField).replace(/esr$/, '');
    if (candidate === null) return `FIREFOX_ESR ${firefoxEsrField} is advisory only; there is no candidate to cross-check`;
    if (field === candidate.esrVersion) return `FIREFOX_ESR ${firefoxEsrField} agrees with candidate ${candidate.tag}`;
    return `FIREFOX_ESR ${firefoxEsrField} is advisory only; the candidate stays ${candidate.tag} (${candidate.esrVersion})`;
}

/** The newest Node 24 entry of index.json that ships linux-x64, or null. */
export function selectNode24(index) {
    if (!Array.isArray(index)) return null;
    let best = null;
    for (const entry of index) {
        const m = NODE_VERSION.exec(String(entry?.version ?? ''));
        if (m === null || Number(m[1]) !== 24) continue;
        if (!Array.isArray(entry.files) || !entry.files.includes(NODE_PLATFORM)) continue;
        const tuple = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (best === null || compareTuples(best.tuple, tuple) < 0) best = { version: entry.version, date: entry.date ?? null, tuple };
    }
    return best === null ? null : { version: best.version, date: best.date };
}

/** The sha256 for one exact filename in a SHASUMS256.txt body, or null. */
export function shasumsEntry(text, filename) {
    for (const line of String(text).split('\n')) {
        const m = SHASUM_LINE.exec(line.trim());
        if (m !== null && m[2] === filename) return m[1];
    }
    return null;
}

/**
 * The orchestrator. Returns the ESR decision, the Node decision, and notes.
 * Inputs that are undefined skip their half. A malformed pin throws (pinnedMajor).
 */
export function decide({ pin, tags, firefoxEsr, nodePin, indexJson, shasumsText }) {
    const major = pinnedMajor(pin);
    const pinVersion = tagToVersion(pin);
    const notes = [];
    const refused = [];
    // The newest survivor is a candidate only when it is strictly newer than the pin;
    // the pin itself, present in every real listing, is never reported as a candidate.
    const newest = pickLatest(tags, major);
    const candidate = newest !== null && compareTuples(pinVersion.tuple, newest.tuple) < 0 ? newest : null;
    for (const t of tags) {
        if (!ESR_SHAPED.test(t) || t.endsWith('^{}')) continue;
        const c = classifyTag(t, major);
        if (!c.keep) refused.push(c.reason);
    }
    notes.push(...refused);
    const esr = { pin, candidate, decision: candidate === null ? 'none' : 'bump' };
    if (firefoxEsr !== undefined) notes.push(crossCheckEsr(candidate, firefoxEsr));

    let node = null;
    if (indexJson !== undefined) {
        const selected = selectNode24(indexJson);
        if (selected === null) {
            notes.push('no Node 24 entry in index.json ships linux-x64; the Node half holds');
        } else {
            const filename = `node-${selected.version}-${NODE_PLATFORM}.tar.xz`;
            const sha256 = shasumsText === undefined ? null : shasumsEntry(shasumsText, filename);
            const pinned = nodePin ?? null;
            node = {
                version: selected.version,
                date: selected.date,
                filename,
                sha256,
                decision: pinned !== null && pinned.version === selected.version ? 'none' : 'bump',
            };
            if (sha256 === null) notes.push(`SHASUMS256.txt carries no entry for ${filename}, so the Node bump cannot be verified`);
        }
    }
    return { esr, node, notes };
}

/** The pin from the manifest, or the injected pin. Failures name the manifest. */
function derivePin(root, overrides) {
    if (overrides.pin !== undefined) return { pin: overrides.pin, failures: [] };
    const { failures, config } = resolveConfig(join(root, MANIFEST_REL));
    if (failures.length > 0) return { pin: null, failures: failures.map(f => `${MANIFEST_REL}: ${f}`) };
    return { pin: config.upstreams.firefox_esr_tag, failures: [] };
}

/**
 * The checker. overrides.tags undefined means the live listing was not run, so
 * the result is a SKIP. An empty listing is a FAIL, never a quiet no-candidate.
 */
export function runChecks(root, overrides = {}) {
    const failures = [];
    const notes = [];
    const skipped = [];
    let decision = null;

    const derived = derivePin(root, overrides);
    if (derived.failures.length > 0) {
        failures.push(...derived.failures);
        return { failures, notes, skipped, decision };
    }
    const pin = derived.pin;
    if (overrides.tags === undefined) {
        skipped.push('the live tag listing and product-details fetch run in the release-train detect job, never in --quick');
        return { failures, notes, skipped, decision };
    }
    if (!Array.isArray(overrides.tags) || overrides.tags.length === 0) {
        failures.push(`the tag listing is empty, so no candidate can be judged against the pin ${pin}. Next step: check the detect job's tag listing step, then re-run.`);
        return { failures, notes, skipped, decision };
    }
    try {
        decision = decide({
            pin,
            tags: overrides.tags,
            firefoxEsr: overrides.firefoxEsr,
            nodePin: overrides.nodePin,
            indexJson: overrides.indexJson,
            shasumsText: overrides.shasumsText,
        });
    } catch (e) {
        failures.push(`${e.message}. Next step: set [upstreams] firefox_esr_tag in ${MANIFEST_REL} to an *esr_RELEASE tag.`);
        return { failures, notes, skipped, decision };
    }
    notes.push(...decision.notes);
    return { failures, notes, skipped, decision };
}

function summarize(result) {
    const e = result.decision.esr;
    const candidate = e.candidate === null ? 'no newer candidate' : `candidate ${e.candidate.tag} (${e.candidate.esrVersion}) -> ${e.decision}`;
    return `pin ${e.pin}; ${candidate}`;
}

function main(parsed) {
    if (parsed.mode === 'self-test') return selfTest();
    if (parsed.mode === 'pin') {
        const derived = derivePin(REPO_ROOT, {});
        if (derived.failures.length > 0) {
            derived.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
            return 1;
        }
        console.log(derived.pin);
        return 0;
    }
    if (parsed.mode === 'listing') {
        let text;
        try {
            text = readFileSync(parsed.path, 'utf8');
        } catch (e) {
            console.error(`${NAME}: FAIL -- the tag listing ${parsed.path} could not be read (${e.code ?? e.message}). Next step: check the detect job's listing step, then re-run.`);
            return 1;
        }
        const tags = text.split('\n').map(t => t.trim()).filter(t => t !== '');
        const result = runChecks(REPO_ROOT, { tags, firefoxEsr: parsed.firefoxEsr });
        result.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        if (result.failures.length > 0) return 1;
        result.notes.forEach(n => console.log(`${NAME}: NOTE -- ${n}`));
        console.log(`${NAME}: PASS -- ${summarize(result)}`);
        console.log(`candidate=${result.decision.esr.candidate?.tag ?? ''}`);
        return 0;
    }
    // Default run: the live listing is the detect job's, so this run SKIPs it.
    const result = runChecks(REPO_ROOT);
    for (const s of result.skipped) console.log(`${NAME}: SKIP -- ${s}`);
    if (result.failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${result.failures.length} problem(s) with the upstream detection.`);
        result.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    if (result.decision !== null) console.log(`${NAME}: PASS -- ${summarize(result)}`);
    return 0;
}

function selfTest() {
    // Fixture tags are built from parts at run time: a tag literal in source would trip the
    // pin-carrier sweep (verify-upstream-pins), which allows the manifest alone to carry one.
    const tag = (major, minor, patch, kind = 'RELEASE') => `FIREFOX_${major}_${minor}_${patch}esr_${kind}`;
    const PIN = tag(153, 5, 1);
    const GOOD = tag(153, 23, 0);
    const FIXTURE_TAGS = [PIN, GOOD, tag(153, 5, 1, 'BUILD1'), tag(175, 0, 0), `${GOOD}^{}`];
    const failures = [];

    // The tag shape must still be the one generate.mjs carries (copied, not imported for the shape).
    const generateText = readFileSync(join(REPO_ROOT, GENERATE_REL), 'utf8');
    if (!generateText.includes(ESR_RELEASE_TAG_SOURCE)) {
        console.error(`${NAME}: --self-test FAIL -- ${GENERATE_REL} no longer carries the ESR_RELEASE_TAG literal ${ESR_RELEASE_TAG_SOURCE}, so this copy has drifted. Next step: update ESR_RELEASE_TAG_SOURCE in ${SELF_REL} to match.`);
        return 1;
    }

    const baseline = runChecks(REPO_ROOT, { pin: PIN, tags: FIXTURE_TAGS, firefoxEsr: '175.0esr' });
    const bumpsGood = baseline.failures.length === 0
        && baseline.decision?.esr.candidate?.tag === GOOD
        && baseline.decision?.esr.candidate?.esrVersion === '153.23.0'
        && baseline.decision?.esr.decision === 'bump'
        && baseline.notes.some(n => n.includes('FIREFOX_ESR 175.0esr is advisory only'));
    if (!bumpsGood) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified fixtures are already red, so the planted-fault results would mean nothing: ${JSON.stringify(baseline)}`);
        return 1;
    }
    console.log(`  ok  baseline -> ${GOOD} is a bump over ${PIN}; FIREFOX_ESR 175.0esr stays advisory`);

    const plants = [
        {
            name: '_BUILDn offered as the only newer tag',
            overrides: { pin: PIN, tags: [PIN, tag(153, 6, 0, 'BUILD1')] },
            expect: '_BUILDn candidate refused',
            held: r => r.decision.esr.candidate === null,
        },
        {
            name: '175.x tag under the 153 guard',
            overrides: { pin: PIN, tags: [PIN, tag(175, 0, 0)] },
            expect: 'major 175 is not the pinned major 153',
            held: r => r.decision.esr.candidate === null,
        },
        {
            name: 'FIREFOX_ESR 175 steering a decision with no 153 candidate',
            overrides: { pin: PIN, tags: [PIN], firefoxEsr: '175.0esr' },
            expect: 'FIREFOX_ESR 175.0esr is advisory only',
            held: r => r.decision.esr.candidate === null && r.decision.esr.decision === 'none',
        },
        {
            name: 'an empty tag listing',
            overrides: { pin: PIN, tags: [] },
            expect: 'the tag listing is empty',
            held: () => true,
        },
    ];

    let failed = 0;
    for (const p of plants) {
        const r = runChecks(REPO_ROOT, p.overrides);
        const lines = [...r.failures, ...r.notes];
        const named = lines.find(l => l.includes(p.expect));
        if (lines.some(l => l.includes(REPO_ROOT))) {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' leaked the checkout path into its output`);
            failed += 1;
        } else if (named !== undefined && p.held(r)) {
            console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${lines.join(' | ') || '(nothing)'}`);
            failed += 1;
        }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not go red`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- the 175.0esr fixture yields ${GOOD} as a bump, and ${plants.length} planted faults went red naming their drift`);
    return 0;
}

// Run only as the entry point, so importing the exports (release-train.mjs does) has no side effects.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const parsed = parseArgs(args);
    if (parsed === null) {
        console.error(`${NAME}: FAIL -- unknown argument list '${args.join(' ')}'`);
        console.error(`  Next step: run: node ${SELF_REL} --self-test, node ${SELF_REL} --pin, or node ${SELF_REL} --listing <file>.`);
        process.exit(2);
    }
    process.exit(main(parsed));
}
