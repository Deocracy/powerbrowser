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
// Two majors (TRAIN-05, UPS-01):
//  - The pinned major keeps the bump path above. classifyTag(tag, pinned) refuses
//    every other major, so a 175 tag can never become a 153 candidate.
//  - The uptake major (UPTAKE_MAJOR, 175) is a replay-only lane. decideUptake
//    names the newest *esr_RELEASE tag under 175 and nothing else. It opens no
//    branch and no PR; the workflow replays the tag and writes nothing. A 153 tag
//    is refused by the same guard, with the role 'uptake' in its reason.
//  - Both lanes read one tag listing. FIREFOX_ESR is advisory for both lanes.
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
//   node scripts/detect-upstreams.mjs --pin
//   node scripts/detect-upstreams.mjs --listing <tags> [--firefox-esr <value>]
//   node scripts/detect-upstreams.mjs --node-select <index.json> <node-runtime.json>
//   node scripts/detect-upstreams.mjs --node-shasum <SHASUMS256.txt> <filename>
//   node scripts/detect-upstreams.mjs --uptake-major

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
// The second major, the uptake lane (TRAIN-05). Replay-only: no branch, no PR, no dispatch.
// A number, not a tag literal: the tag is always derived from the listing (verify-upstream-pins).
export const UPTAKE_MAJOR = 175;
// The bump branches the release train publishes. A branch with an open PR is a PR-open state, not a new candidate.
export const NODE_BRANCH = 'chore/node-v24.x';
export const esrBranch = tag => `chore/esr-${tag}`;

const args = process.argv.slice(2);

/**
 * The CLI modes. --self-test and --pin stand alone. --listing <file>, --node-select <index> <runtime>
 * and --node-shasum <file> <filename> take positional values. --firefox-esr and --open-prs <file>
 * are optional and may follow any mode. Anything else is null.
 */
export function parseArgs(argv) {
    if (argv.length === 0) return { mode: 'skip' };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 1 && argv[0] === '--pin') return { mode: 'pin' };
    if (argv.length === 1 && argv[0] === '--uptake-major') return { mode: 'uptake-major' };
    const [mode, ...rest] = argv;
    const opts = {};
    const pos = [];
    for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === '--firefox-esr' || rest[i] === '--open-prs') {
            if (i + 1 >= rest.length || rest[i + 1] === '') return null;
            opts[rest[i]] = rest[i + 1];
            i += 1;
        } else {
            pos.push(rest[i]);
        }
    }
    if (pos.some(p => p === '')) return null;
    if (mode === '--node-select' && pos.length === 2) return { mode: 'node-select', path: pos[0], runtimePath: pos[1], openPrsPath: opts['--open-prs'] };
    if (mode === '--node-shasum' && pos.length === 2 && opts['--firefox-esr'] === undefined && opts['--open-prs'] === undefined) return { mode: 'node-shasum', path: pos[0], filename: pos[1] };
    if (mode === '--listing' && pos.length === 1) return { mode: 'listing', path: pos[0], firefoxEsr: opts['--firefox-esr'], openPrsPath: opts['--open-prs'] };
    return null;
}

/** The open PR whose head branch is `head`, or null. Pure. */
export function openPrFor(openPrs, head) {
    return (openPrs ?? []).find(p => p.head === head) ?? null;
}

/** Parse a `gh pr list` listing, one `<number> <head>` pair per line. A malformed line throws. */
export function parseOpenPrs(text) {
    return String(text).split('\n').map(l => l.trim()).filter(l => l !== '').map(l => {
        const m = /^(\d+) (\S+)$/.exec(l);
        if (m === null) throw new Error(`open PR line ${JSON.stringify(l)} is not '<number> <head>'`);
        return { number: Number(m[1]), head: m[2] };
    });
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

/** Keep or refuse one tag under the guarded major, with the reason a refusal names. role labels the lane in that reason. */
export function classifyTag(tag, major, role = 'pinned') {
    if (tag.endsWith('^{}')) return { keep: false, version: null, reason: `${tag}: peeled annotated-tag line, dropped` };
    if (BUILD_TAG.test(tag)) return { keep: false, version: null, reason: `${tag}: _BUILDn candidate refused, only an *esr_RELEASE tag may be a candidate` };
    const version = tagToVersion(tag);
    if (version === null) return { keep: false, version: null, reason: `${tag}: not an *esr_RELEASE tag` };
    if (version.tuple[0] !== major) return { keep: false, version: null, reason: `${tag}: major ${version.tuple[0]} is not the ${role} major ${major}` };
    return { keep: true, version, reason: null };
}

/**
 * The uptake lane (TRAIN-05): the newest *esr_RELEASE tag under the uptake major, or null.
 * It has no pin of its own, so every 175 tag is a candidate; the replay runs against the
 * newest. decision is replay-only or none, and nothing else: the lane never opens a branch
 * or a PR. refused lists every ESR-shaped tag the 175 guard drops, with its reason (data only:
 * the pinned-major notes already cover the 175 tags on the 153 line). Pure.
 */
export function decideUptake(tags, uptakeMajor = UPTAKE_MAJOR) {
    const refused = [];
    for (const t of tags) {
        if (!ESR_SHAPED.test(t) || t.endsWith('^{}')) continue;
        const c = classifyTag(t, uptakeMajor, 'uptake');
        if (!c.keep) refused.push(c.reason);
    }
    const candidate = pickLatest(tags, uptakeMajor);
    return { major: uptakeMajor, candidate, decision: candidate === null ? 'none' : 'replay-only', refused };
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

/**
 * bump when the selected Node line is strictly newer than the pinned line, none when it is
 * the same or older (a registry that lists a lower v24 as newest must not cause a downgrade).
 * No pin at all is a bump. Pure.
 */
export function nodeDecision(selected, pinVersion) {
    if (pinVersion === null || pinVersion === undefined) return 'bump';
    const pinTuple = nodeTuple(pinVersion);
    if (pinTuple === null) throw new Error(`the Node pin ${JSON.stringify(pinVersion)} is not a vN.N.N version`);
    return compareTuples(pinTuple, nodeTuple(selected.version)) < 0 ? 'bump' : 'none';
}

/** The numeric tuple of a vN.N.N Node version, or null. */
function nodeTuple(version) {
    const m = NODE_VERSION.exec(String(version ?? ''));
    return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The linux-x64 version in a node-runtime.json manifest, or null when none is pinned. Throws on a malformed file. */
export function readNodePin(path) {
    const v = JSON.parse(readFileSync(path, 'utf8'))?.[NODE_PLATFORM]?.version;
    return typeof v === 'string' ? v : null;
}

/** The open PRs from a listing file, or none when no file is given. Throws on a malformed listing. */
export function readOpenPrs(path) {
    return path === undefined ? [] : parseOpenPrs(readFileSync(path, 'utf8'));
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
export function decide({ pin, tags, firefoxEsr, nodePin, indexJson, shasumsText, openPrs }) {
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
    // A candidate whose bump branch already has an open PR is PR-open: the PR is the state, and no replay runs.
    const heldPr = candidate === null ? null : openPrFor(openPrs, esrBranch(candidate.tag));
    const esr = { pin, candidate, decision: candidate === null ? 'none' : heldPr === null ? 'bump' : 'pr-open', openPr: heldPr };
    if (heldPr !== null) notes.push(`${esrBranch(candidate.tag)} PR #${heldPr.number} is open; the candidate ${candidate.tag} is held until that PR merges or closes, so no bump is replayed`);
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
            const decision = nodeDecision(selected, pinned?.version ?? null);
            const heldNode = decision === 'bump' ? openPrFor(openPrs, NODE_BRANCH) : null;
            node = { version: selected.version, date: selected.date, filename, sha256, decision: heldNode === null ? decision : 'pr-open' };
            if (decision === 'none') notes.push(`the Node pin ${pinned.version} is not older than ${selected.version}, so no Node bump`);
            if (heldNode !== null) notes.push(`${NODE_BRANCH} PR #${heldNode.number} is open; the Node line ${selected.version} is held until that PR merges or closes`);
            if (sha256 === null) notes.push(`SHASUMS256.txt carries no entry for ${filename}, so the Node bump cannot be verified`);
        }
    }
    // The uptake lane (TRAIN-05) reads the same listing. It is replay-only: a note, never a branch.
    const uptake = decideUptake(tags);
    if (uptake.candidate !== null) notes.push(`${uptake.candidate.tag} (uptake major ${uptake.major}) is replay-only: the workflow replays it and writes nothing, and the 153 line is unaffected`);
    return { esr, node, notes, uptake };
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
            openPrs: overrides.openPrs,
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
    const u = result.decision.uptake;
    const uptake = u.candidate === null ? `no uptake ${u.major} candidate` : `uptake ${u.candidate.tag} -> ${u.decision}`;
    return `pin ${e.pin}; ${candidate}; ${uptake}`;
}

function main(parsed) {
    if (parsed.mode === 'self-test') return selfTest();
    if (parsed.mode === 'uptake-major') {
        console.log(String(UPTAKE_MAJOR));
        return 0;
    }
    if (parsed.mode === 'pin') {
        const derived = derivePin(REPO_ROOT, {});
        if (derived.failures.length > 0) {
            derived.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
            return 1;
        }
        console.log(derived.pin);
        return 0;
    }
    if (parsed.mode === 'node-select' || parsed.mode === 'node-shasum') {
        let text;
        try {
            text = readFileSync(parsed.path, 'utf8');
        } catch (e) {
            console.error(`${NAME}: FAIL -- the Node file ${parsed.path} could not be read (${e.code ?? e.message}). Next step: check the detect job's download step, then re-run.`);
            return 1;
        }
        if (parsed.mode === 'node-select') {
            // A hold is not a failure: the empty values are the answer, and the reason goes to stderr.
            let index;
            let pinVersion;
            let openPrs;
            try {
                index = JSON.parse(text);
                pinVersion = readNodePin(parsed.runtimePath);
                openPrs = readOpenPrs(parsed.openPrsPath);
            } catch (e) {
                console.error(`${NAME}: FAIL -- the Node index or the pin manifest could not be read (${e.message}). Next step: check the detect job's download and the pin manifest, then re-run.`);
                return 1;
            }
            const selected = selectNode24(index);
            let version = '';
            let file = '';
            if (selected === null) {
                console.error(`${NAME}: NOTE -- no Node 24 entry in the index ships ${NODE_PLATFORM}; the Node half holds`);
            } else if (nodeDecision(selected, pinVersion) === 'none') {
                console.error(`${NAME}: NOTE -- the newest Node 24 line ${selected.version} is not newer than the pin ${pinVersion}; the Node half holds`);
            } else if (openPrFor(openPrs, NODE_BRANCH) !== null) {
                console.error(`${NAME}: NOTE -- ${NODE_BRANCH} PR #${openPrFor(openPrs, NODE_BRANCH).number} is open; the Node line ${selected.version} is held until it merges or closes`);
            } else {
                version = selected.version;
                file = `node-${selected.version}-${NODE_PLATFORM}.tar.xz`;
            }
            console.log(`node-version=${version}`);
            console.log(`node-file=${file}`);
            return 0;
        }
        const sha = shasumsEntry(text, parsed.filename);
        console.log(`node-sha256=${sha ?? ''}`);
        return sha === null ? 1 : 0;
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
        let openPrs;
        try {
            openPrs = readOpenPrs(parsed.openPrsPath);
        } catch (e) {
            console.error(`${NAME}: FAIL -- ${e.message}. Next step: check the detect job's open-PR listing, then re-run.`);
            return 1;
        }
        const result = runChecks(REPO_ROOT, { tags, firefoxEsr: parsed.firefoxEsr, openPrs });
        result.failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}`));
        if (result.failures.length > 0) return 1;
        result.notes.forEach(n => console.log(`${NAME}: NOTE -- ${n}`));
        console.log(`${NAME}: PASS -- ${summarize(result)}`);
        // Only a bump is a candidate. A PR-open candidate is reported on its own lines, so the
        // workflow never replays a candidate whose PR is already open.
        const esr = result.decision.esr;
        console.log(`candidate=${esr.decision === 'bump' ? esr.candidate.tag : ''}`);
        console.log(`pr-open-tag=${esr.decision === 'pr-open' ? esr.candidate.tag : ''}`);
        console.log(`pr-open-number=${esr.openPr?.number ?? ''}`);
        // The uptake lane's replay target. The workflow replays it and never opens a PR for it.
        console.log(`uptake-candidate=${result.decision.uptake.candidate?.tag ?? ''}`);
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
    const FIXTURE_TAGS = [PIN, GOOD, tag(153, 5, 1, 'BUILD1'), tag(UPTAKE_MAJOR, 0, 0), `${GOOD}^{}`];
    const UPTAKE_FIX = tag(UPTAKE_MAJOR, 0, 0);
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

    // Node half (AUTO-04): index and SHASUMS fixtures, built at run time, never fetched.
    const NODE_NEW = 'v24.22.1';
    const NODE_FILE = `node-${NODE_NEW}-${NODE_PLATFORM}.tar.xz`;
    const NODE_INDEX = [
        { version: 'v24.19.0', date: '2026-09-01', files: ['linux-x64', 'osx-arm64-tar'] },
        { version: NODE_NEW, date: '2026-10-20', files: ['linux-x64', 'osx-arm64-tar'] },
        { version: 'v23.11.0', date: '2026-08-01', files: ['linux-x64'] },
        { version: 'v24.23.0', date: '2026-10-30', files: ['osx-arm64-tar'] },
    ];
    const SHA_NEW = 'a'.repeat(64);
    const SHA_OTHER = 'b'.repeat(64);
    const SHASUMS = [`${SHA_OTHER}  node-v24.19.0-linux-x64.tar.xz`, `${SHA_NEW}  ${NODE_FILE}`, 'not-a-sha-line', ''].join('\n');
    const nodeBaseline = decide({ pin: PIN, tags: FIXTURE_TAGS, firefoxEsr: '175.0esr', nodePin: { version: 'v24.19.0' }, indexJson: NODE_INDEX, shasumsText: SHASUMS });
    const nodeOk = selectNode24(NODE_INDEX)?.version === NODE_NEW
        && shasumsEntry(SHASUMS, NODE_FILE) === SHA_NEW
        && shasumsEntry(SHASUMS, 'node-v24.99.0-linux-x64.tar.xz') === null
        && nodeBaseline.node?.decision === 'bump' && nodeBaseline.node.sha256 === SHA_NEW;
    if (!nodeOk) {
        console.error(`${NAME}: --self-test FAIL -- the Node fixtures are already red: selection, exact-filename lookup or the Node decision drifted`);
        return 1;
    }
    console.log(`  ok  node baseline -> ${NODE_NEW} selected (linux-x64 only, v24 only); ${NODE_FILE} sha matched exactly; decision bump`);

    const plants = [
        {
            name: 'an open bump PR for the candidate branch: the candidate is held, not replayed',
            overrides: { pin: PIN, tags: [PIN, GOOD], openPrs: [{ number: 41, head: esrBranch(GOOD) }] },
            expect: 'PR #41 is open',
            held: r => r.decision.esr.decision === 'pr-open' && r.decision.esr.candidate?.tag === GOOD,
        },
        {
            name: 'an open Node bump PR for the Node line: the line is held, not published',
            overrides: { pin: PIN, tags: [PIN], nodePin: { version: 'v24.19.0' }, indexJson: NODE_INDEX, shasumsText: SHASUMS, openPrs: [{ number: 42, head: NODE_BRANCH }] },
            expect: `${NODE_BRANCH} PR #42 is open`,
            held: r => r.decision.node?.decision === 'pr-open',
        },
        {
            name: 'a Node pin newer than the newest linux-x64 v24 line (a downgrade)',
            overrides: { pin: PIN, tags: [PIN], nodePin: { version: 'v24.30.0' }, indexJson: NODE_INDEX, shasumsText: SHASUMS },
            expect: `is not older than ${NODE_NEW}, so no Node bump`,
            held: r => r.decision.node?.decision === 'none',
        },
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
            name: 'a Node index with no v24 line that ships linux-x64',
            overrides: { pin: PIN, tags: [PIN], indexJson: [{ version: 'v23.11.0', files: ['linux-x64'] }] },
            expect: 'no Node 24 entry',
            held: r => r.decision.node === null,
        },
        {
            name: 'a SHASUMS body missing the selected filename',
            overrides: { pin: PIN, tags: [PIN], nodePin: { version: 'v24.19.0' }, indexJson: NODE_INDEX, shasumsText: `${SHA_OTHER}  node-v24.19.0-linux-x64.tar.xz` },
            expect: `carries no entry for ${NODE_FILE}`,
            held: r => r.decision.node?.sha256 === null,
        },
        {
            name: 'an empty tag listing',
            overrides: { pin: PIN, tags: [] },
            expect: 'the tag listing is empty',
            held: () => true,
        },
    ];

    // Controls: an open PR that does not match the candidate or the Node line must not hold anything.
    const controls = [
        {
            name: 'control: an open PR for the pinned tag does not hold a newer candidate',
            overrides: { pin: PIN, tags: [PIN, GOOD], openPrs: [{ number: 40, head: esrBranch(PIN) }] },
            ok: r => r.decision.esr.decision === 'bump' && r.decision.esr.candidate?.tag === GOOD,
        },
        {
            name: 'control: an open PR on an unrelated branch holds nothing',
            overrides: { pin: PIN, tags: [PIN, GOOD], openPrs: [{ number: 9, head: 'feature/unrelated' }] },
            ok: r => r.decision.esr.decision === 'bump',
        },
        {
            name: 'control: the 153 pin with a 175 tag is a replay-only 175 uptake and no 153 bump (the mirror)',
            overrides: { pin: PIN, tags: [PIN, UPTAKE_FIX] },
            ok: r => r.decision.esr.candidate === null && r.decision.esr.decision === 'none'
                && r.decision.uptake.decision === 'replay-only' && r.decision.uptake.candidate?.tag === UPTAKE_FIX,
        },
        {
            name: 'control: a 153-only listing has no uptake candidate',
            overrides: { pin: PIN, tags: [PIN, GOOD] },
            ok: r => r.decision.uptake.decision === 'none' && r.decision.uptake.candidate === null,
        },
    ];

    let failed = 0;
    for (const c of controls) {
        const r = runChecks(REPO_ROOT, c.overrides);
        if (r.failures.length === 0 && c.ok(r)) {
            console.log(`  ok  ${c.name} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red: ${[...r.failures, ...r.notes].join(' | ') || '(no decision)'}`);
            failed += 1;
        }
    }
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
    // The uptake lane's own faults: each guard refuses its foreign major and names it, so a 153 tag can
    // never reach the 175 replay, and a _BUILDn tag can never be the replay target.
    const uptakePlants = [
        {
            name: 'a 153.x tag offered to the 175 uptake lane',
            lines: () => decideUptake([PIN, GOOD]).refused,
            held: () => decideUptake([PIN, GOOD]).candidate === null,
            expect: `major 153 is not the uptake major ${UPTAKE_MAJOR}`,
        },
        {
            name: 'a _BUILDn 175 tag offered as the only uptake candidate',
            lines: () => decideUptake([tag(UPTAKE_MAJOR, 0, 0, 'BUILD1')]).refused,
            held: () => decideUptake([tag(UPTAKE_MAJOR, 0, 0, 'BUILD1')]).candidate === null,
            expect: '_BUILDn candidate refused',
        },
    ];
    for (const p of uptakePlants) {
        const lines = p.lines();
        const named = lines.find(l => l.includes(p.expect));
        if (lines.some(l => l.includes(REPO_ROOT))) {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' leaked the checkout path into its output`);
            failed += 1;
        } else if (named !== undefined && p.held()) {
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
    console.log(`${NAME}: --self-test PASS -- the 175.0esr fixture yields ${GOOD} as a bump, ${plants.length + uptakePlants.length} planted faults went red naming their drift, and ${controls.length} controls stayed green (the 153 line and the ${UPTAKE_MAJOR} uptake lane each guard the other)`);
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
