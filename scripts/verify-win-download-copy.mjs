#!/usr/bin/env node
// scripts/verify-win-download-copy.mjs
//
// The win-download-copy row (Phase 54, SEC-03). The unsigned-first Windows warning must reach the user word
// for word. The expectation is DERIVED at check time, never typed here:
//
//   canonical   the quoted block on the SEC-03 line of .planning/workstreams/deploy/REQUIREMENTS.md
//   posture     the "Azure Artifact Signing identity validation:" line of docs/RELEASING.md, pending or a date
//   title       the dialog title the block quotes, compared with the launch cell's smartscreen field of the
//               matrix record scripts/matrix/win-matrix-record.json (what the pkg-win11 guest observed)
//
// Every block found in each source is compared with the canonical block (whitespace collapsed, markup and
// blockquote markers removed), so the set of blocks across the sources must be exactly {canonical}:
//
//   docs/WINDOWS-DISTRIBUTION.md, docs/RELEASING.md   at least one block, every block canonical
//   website-staging/download.html, the published page while pending: at least one block, every block canonical;
//                                                     once signed: no block (it says "not yet code-signed")
//
// A reworded word is red naming the file and the first word that drifted; a source with no block (the empty
// set), an unreadable source, an absent record and an unreachable published page are red, never green.
//
// The published page is <origin of configuration.toml [urls] homepage>/download.html, read with one GET.
// That network read is why the row is full tier; --self-test runs over in-memory copies of the real files plus
// a fixture record and writes nothing.
//
// Usage:
//   node scripts/verify-win-download-copy.mjs
//   node scripts/verify-win-download-copy.mjs --self-test

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-download-copy';
const SELF_REL = 'scripts/verify-win-download-copy.mjs';
export const REQ_REL = '.planning/workstreams/deploy/REQUIREMENTS.md';
export const DOC_REL = 'docs/WINDOWS-DISTRIBUTION.md';
export const RELEASING_REL = 'docs/RELEASING.md';
export const PAGE_REL = 'website-staging/download.html';
export const RECORD_REL = 'scripts/matrix/win-matrix-record.json';
const MANIFEST_REL = 'configuration.toml';

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
const args = DIRECT_RUN ? process.argv.slice(2) : [];
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const BLOCK_RE = /Windows may show\b[\s\S]*?\bRun anyway\./g;
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

/** Every SEC-03 block in a text, normalized: markup and blockquote markers removed, whitespace collapsed. */
export function blocksOf(text, { html = false } = {}) {
    const flat = html ? decode(text.replace(/<[^>]*>/g, ' ')) : text.replace(/^\s*>\s?/gm, '');
    return [...flat.matchAll(BLOCK_RE)].map(m => m[0].replace(/\s+/g, ' ').trim());
}

/** The canonical block: the one block on the SEC-03 requirement line, or null. */
export function canonicalOf(reqText) {
    const line = (reqText ?? '').split('\n').find(l => l.includes('**SEC-03**'));
    const blocks = line === undefined ? [] : blocksOf(line);
    return blocks.length === 1 ? blocks[0] : null;
}

/** The Windows signing posture docs/RELEASING.md records: { state: 'unsigned' | 'signed', date } or null. */
export function signingPosture(releasingText) {
    const m = /^- Azure Artifact Signing identity validation: (pending|\d{4}-\d{2}-\d{2})\b/m.exec(releasingText ?? '');
    if (m === null) return null;
    return m[1] === 'pending' ? { state: 'unsigned', date: null } : { state: 'signed', date: m[1] };
}

const titleOf = block => /'([^']+)'/.exec(block)?.[1] ?? null;

/** The first word where a block leaves the canonical one, for the failure text. */
function drift(block, canonical) {
    const a = block.split(' ');
    const b = canonical.split(' ');
    const i = a.findIndex((w, k) => w !== b[k]);
    const at = i < 0 ? b.length : i;
    return `${JSON.stringify(a[at] ?? '(end of block)')} where the requirement has ${JSON.stringify(b[at] ?? '(end of block)')}`;
}

export function liveUrlOf(config) {
    return `${new URL(config.urls.homepage).origin}/download.html`;
}

/**
 * sources: { req, doc, releasing, page, record, live } -- each a text or null (unreadable); live also needs
 * liveUrl. Returns { failures: [{ file, rule, msg }], blocks } where blocks counts the blocks compared.
 */
export function runChecks(sources) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });
    const liveName = sources.liveUrl ?? 'the published download page';
    let blocks = 0;

    if (sources.req === null) fail(REQ_REL, 'vacuity', `is unreadable, so there is no canonical SEC-03 text to compare with. Next step: restore the file.`);
    const canonical = sources.req === null ? null : canonicalOf(sources.req);
    if (sources.req !== null && canonical === null) fail(REQ_REL, 'canonical', `has no single quoted SEC-03 block on its SEC-03 line, so nothing can be compared. Next step: restore the requirement text.`);
    if (sources.releasing === null) fail(RELEASING_REL, 'vacuity', `is unreadable, so the signing posture is unknown. Next step: restore the file.`);
    const posture = sources.releasing === null ? null : signingPosture(sources.releasing);
    if (sources.releasing !== null && posture === null) fail(RELEASING_REL, 'posture', `has no "- Azure Artifact Signing identity validation: pending" (or a date) line in its Windows posture, so the row cannot tell whether the page must carry the warning. Next step: restore the line.`);
    if (canonical === null || posture === null) return { failures, blocks };

    const compare = (file, text, { html, required }) => {
        if (text === null) {
            fail(file, 'vacuity', `is unreadable, so the warning there is unproven. Next step: restore it${file === liveName ? ' (publish the site, or check the network)' : ''}.`);
            return;
        }
        const found = blocksOf(text, { html });
        blocks += found.length;
        if (required && found.length === 0) fail(file, 'empty', `carries no SEC-03 block (no "Windows may show ... Run anyway." sentence), so a Windows user is not told how to open the unsigned installer. Next step: copy the block from ${DOC_REL} word for word.`);
        if (!required && found.length > 0) fail(file, 'stale', `still carries the SEC-03 block, which says the release is not yet code-signed, while ${RELEASING_REL} records the signing validation on ${posture.date}. Next step: remove the block and state the signed status.`);
        if (!required) return;
        for (const b of found) {
            if (b !== canonical) fail(file, 'copy', `carries a reworded SEC-03 block: ${drift(b, canonical)}. Next step: copy the block from ${DOC_REL} word for word; never paraphrase it.`);
        }
    };
    compare(DOC_REL, sources.doc, { html: false, required: true });
    compare(RELEASING_REL, sources.releasing, { html: false, required: true });
    const onPage = posture.state === 'unsigned';
    compare(PAGE_REL, sources.page, { html: true, required: onPage });
    compare(liveName, sources.live, { html: true, required: onPage });

    // The quoted dialog title is what the guest observed, never what this tree typed.
    const title = titleOf(canonical);
    if (sources.record === null) {
        fail(RECORD_REL, 'record', `is absent, so the dialog title the block quotes was never observed on a Windows guest. Next step: run the pkg-win11 matrix at the 54-04 checkpoint (scripts/matrix/win-matrix-run.sh).`);
    } else {
        let observed;
        try {
            observed = JSON.parse(sources.record)?.cells?.launch?.smartscreen;
        } catch (e) {
            fail(RECORD_REL, 'record', `does not parse (${e.message}). Next step: re-run the matrix; never edit the record by hand.`);
        }
        if (observed !== undefined && String(observed).trim() !== title) {
            fail(RECORD_REL, 'title', `observed the dialog title ${JSON.stringify(observed)}, but the SEC-03 block quotes ${JSON.stringify(title)}. Next step: change the requirement to what Windows shows, then recopy the block.`);
        }
    }
    return { failures, blocks };
}

async function fetchLive(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.status !== 200) return { text: null, why: `HTTP ${res.status}` };
        return { text: await res.text(), why: null };
    } catch (e) {
        return { text: null, why: e.message };
    }
}

const readRel = rel => {
    try {
        return readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
        return null;
    }
};
const fmt = f => `[${f.rule}] ${f.file}: ${f.msg}`;

// --- self-test ---------------------------------------------------------------------------------------

function selfTest() {
    const real = { req: readRel(REQ_REL), doc: readRel(DOC_REL), releasing: readRel(RELEASING_REL), page: readRel(PAGE_REL) };
    for (const [k, v] of Object.entries(real)) {
        if (v === null) {
            console.error(`${NAME}: --self-test FAIL -- the real ${k} file is unreadable, so no fixture can be built`);
            return 1;
        }
    }
    const canonical = canonicalOf(real.req);
    if (canonical === null) {
        console.error(`${NAME}: --self-test FAIL -- ${REQ_REL} carries no SEC-03 block, so no fixture can be built`);
        return 1;
    }
    const liveUrl = 'https://download-page.invalid/download.html';
    const record = JSON.stringify({ cells: { launch: { smartscreen: titleOf(canonical) } } });
    const base = { ...real, record, live: real.page, liveUrl };
    const swap = (text, from, to) => {
        if (!text.includes(from)) throw new Error(`self-test fixture: ${JSON.stringify(from.slice(0, 60))} is not in the text, so the plant would test nothing`);
        return text.split(from).join(to);
    };

    const control = runChecks(base);
    if (control.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the green control is already red: ${control.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    const again = runChecks(base);
    if (JSON.stringify(again) !== JSON.stringify(control)) {
        console.error(`${NAME}: --self-test FAIL -- two runs over the same sources gave different verdicts`);
        return 1;
    }
    console.log(`  ok  control: the real files, a fixture record and a published page equal to the source -> green (${control.blocks} block(s)), identical on re-run`);
    const signedReleasing = swap(real.releasing, 'identity validation: pending.', 'identity validation: 2027-01-15.');
    const unblocked = swap(real.page, /<p id="windows-smartscreen">[^<]*<\/p>/.exec(real.page)?.[0] ?? '(no block paragraph)', '');
    const signedControl = runChecks({ ...base, releasing: signedReleasing, page: unblocked, live: unblocked });
    if (signedControl.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the signed control (validation dated, block removed from the page) is red: ${signedControl.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    console.log('  ok  signed control: validation dated and the block removed from the page -> green');

    const plants = [
        ['reworded word in the tracked document', { doc: swap(real.doc, 'warning when you open', 'alert when you open') }, DOC_REL, 'copy', '"alert"'],
        ['reworded label in docs/RELEASING.md', { releasing: swap(real.releasing, 'choose More info and Run anyway.', 'choose More details and Run anyway.') }, RELEASING_REL, 'copy', '"details"'],
        ['paraphrase on the page source', { page: swap(real.page, 'is not yet code-signed', 'is unsigned for now') }, PAGE_REL, 'copy', '"unsigned"'],
        ['paraphrase on the published page', { live: swap(real.page, 'Check the download against SHA256SUMS', 'Verify the download against SHA256SUMS') }, liveUrl, 'copy', '"Verify"'],
        ['empty set: the page source carries no block', { page: unblocked }, PAGE_REL, 'empty', 'no SEC-03 block'],
        ['empty set: the tracked document carries no block', { doc: '# Windows distribution\n' }, DOC_REL, 'empty', 'no SEC-03 block'],
        ['unreadable tracked document', { doc: null }, DOC_REL, 'vacuity', 'unreadable'],
        ['unreachable published page', { live: null }, liveUrl, 'vacuity', 'unreadable'],
        ['matrix record absent', { record: null }, RECORD_REL, 'record', 'absent'],
        ['matrix record observed another title', { record: JSON.stringify({ cells: { launch: { smartscreen: 'Windows protected this PC' } } }) }, RECORD_REL, 'title', 'Windows protected this PC'],
        ['requirement line without the block', { req: swap(real.req, 'Windows may show', 'Windows can show') }, REQ_REL, 'canonical', 'SEC-03'],
        ['posture line removed', { releasing: swap(real.releasing, '- Azure Artifact Signing identity validation: pending.', '- Azure validation: unknown.') }, RELEASING_REL, 'posture', 'identity validation'],
        ['signed posture with the block still on the page', { releasing: signedReleasing }, PAGE_REL, 'stale', '2027-01-15'],
    ];
    let failed = 0;
    for (const [name, change, file, rule, value] of plants) {
        const { failures } = runChecks({ ...base, ...change });
        if (failures.some(f => f.file === file && f.rule === rule && f.msg.includes(value))) {
            console.log(`  ok  ${name} -> red, naming ${file} [${rule}] ${value}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${file} [${rule}] ${value}; got: ${failures.map(fmt).join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- two controls green and ${plants.length} planted faults went red naming their file and drift`);
    return 0;
}

async function main() {
    if (args.includes('--self-test')) return selfTest();
    let liveUrl;
    try {
        const { config, failures } = resolveConfig(join(REPO_ROOT, MANIFEST_REL));
        if (failures.length > 0 || config === undefined) throw new Error(failures.join('; '));
        liveUrl = liveUrlOf(config);
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${MANIFEST_REL} [urls] homepage does not resolve (${e.message}), so the published page has no address. Next step: run node scripts/generate.mjs; it names the faulty key.`);
        return 1;
    }
    const live = await fetchLive(liveUrl);
    const { failures, blocks } = runChecks({
        req: readRel(REQ_REL), doc: readRel(DOC_REL), releasing: readRel(RELEASING_REL), page: readRel(PAGE_REL),
        record: readRel(RECORD_REL), live: live.text, liveUrl,
    });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the Windows download warning${live.why ? ` (${liveUrl}: ${live.why})` : ''}.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${blocks} SEC-03 block(s) in ${DOC_REL}, ${RELEASING_REL}, ${PAGE_REL} and ${liveUrl} equal the requirement text word for word, and the quoted dialog title is the one the matrix record observed.`);
    return 0;
}

if (DIRECT_RUN) process.exit(await main());
