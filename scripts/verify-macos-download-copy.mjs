#!/usr/bin/env node
// scripts/verify-macos-download-copy.mjs
//
// The macos-download-copy row (Phase 55, PKG-16, SEC-04). The download page states what the matrix record
// observed about the macOS build, no more and no less. Both sides are DERIVED at check time and compared as
// SET EQUALITY, so a claim the page adds and a claim the page drops both go red, each named:
//
//   from the record (55-MACOS-MATRIX.md, parsed by verify-macos-install-matrix.mjs):
//     signing        Developer ID signed when the record observed it, otherwise ad-hoc signed
//     notarization   notarized when observed, otherwise not notarized
//     staple         stapled only when observed
//     scope          the locale scope the record states
//     size           the complete-MAR size in MB when the record holds a byte count, otherwise pending
//     gatekeeper     the observed Gatekeeper path, when there is one
//   from the page (website-staging/download.html):
//     the same six kinds, read from the macOS signing line, the "(xx-XX) only" scope line, the Update file
//     size section and the sentences that name Gatekeeper or Open Anyway.
//
// An UNVERIFIED record value maps to the conservative claim (ad-hoc, not notarized, pending, no Gatekeeper
// sentence), so the page can never get ahead of the observation: copy that claims more than was observed is
// an overclaim, and a page that stays behind an observation is an unstated claim. The Gatekeeper path is
// compared by containment (the record's verbatim text must appear in a page sentence); a page sentence about
// Gatekeeper with no observed path behind it is red.
//
// No internal identifier may appear in the macOS copy: a SHAPE test (all-caps underscored token, dotted key
// of three segments, ten-character Team ID, port or localhost, millisecond timeout, raw exception text) runs
// over every macOS string the page paints and over the record's Gatekeeper text that flows into it. The
// page must name the product as PowerBrowser and must not spell it another way.
//
// shortcut: the size is compared as megabytes (10^6 bytes) to one decimal, read from a sentence naming macOS
// inside the size section; the page has one size section for all platforms. Upgrade to a per-platform size
// table when the Linux measurement lands in the same section.
//
// Honestly: it reads two text files, so it is cheap, but the claims it checks only mean something once the
// record is observed, so it is registered with the full tier next to the matrix row; --self-test is --quick.
//
// Usage:
//   node scripts/verify-macos-download-copy.mjs
//   node scripts/verify-macos-download-copy.mjs --self-test

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRecord, isUnverified, loadContext, parseRecord } from './verify-macos-install-matrix.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'macos-download-copy';
const SELF_REL = 'scripts/verify-macos-download-copy.mjs';
const RECORD_REL = '.planning/workstreams/deploy/phases/55-macos-i/55-MACOS-MATRIX.md';
const PAGE_REL = 'website-staging/download.html';

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

const SHAPES = [
    ['all-caps token', /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/],
    ['dotted key', /\b[a-z][\w-]*\.[a-z][\w-]*\.[a-z][\w-]*/],
    ['Team ID', /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b/],
    ['port or localhost', /\blocalhost\b|\b127\.0\.0\.1\b|:\d{2,5}\b/],
    ['timeout', /\b\d{3,}\s?ms\b/],
    ['raw exception text', /\b\w*(?:Error|Exception):/],
];

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The text segments of the page: every paragraph and list item. */
const segments = page => [...page.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => plain(m[2]));
const sizeSection = page => /<h2>Update file size<\/h2>([\s\S]*?)(?=<h2>|<\/main>)/.exec(page)?.[1] ?? null;

/** The claims the record licenses. */
function recordClaims(rec) {
    const f = t => rec.section(t)?.fields ?? {};
    const ob = v => (isUnverified(v) ? null : v);
    const claims = new Set();
    claims.add(`signing:${ob(f('Signing status').Signature) === 'Developer ID' ? 'Developer ID signed' : 'ad-hoc signed'}`);
    const notarized = ob(f('Signing status').Notarization) === 'notarized';
    claims.add(`notarization:${notarized ? 'notarized' : 'not notarized'}`);
    if (ob(f('Signing status').Staple) === 'stapled') claims.add('staple:stapled');
    const scope = ob(f('Build identity')['Locale scope']);
    if (scope) claims.add(`scope:${scope}`);
    const size = ob(f('Build identity')['Complete MAR size (bytes)']);
    claims.add(`size:${size && /^\d+$/.test(size) ? `${(Number(size) / 1e6).toFixed(1)} MB` : 'pending'}`);
    return { claims, gatekeeper: ob(f('Gatekeeper observation').Path) ?? null, verbatim: ob(f('Gatekeeper observation').Verbatim) ?? null };
}

/** The claims the page makes, plus the macOS strings it paints. */
function pageClaims(page) {
    const segs = segments(page);
    const macLine = /<li><strong>macOS:<\/strong>([^<]*)<\/li>/.exec(page)?.[1] ?? null;
    const claims = new Set();
    if (macLine !== null) {
        if (/\bad-hoc signed\b/.test(macLine)) claims.add('signing:ad-hoc signed');
        if (/\bDeveloper ID\b/.test(macLine)) claims.add('signing:Developer ID signed');
        if (/\bnot notarized\b/.test(macLine)) claims.add('notarization:not notarized');
        if (/(?<!not )\bnotarized\b/.test(macLine)) claims.add('notarization:notarized');
        if (/(?<!not )\bstapled\b/.test(macLine)) claims.add('staple:stapled');
    }
    for (const s of segs) {
        const sc = /\(([a-z]{2}-[A-Z]{2})\)\s+only/.exec(s)?.[1];
        if (sc) claims.add(`scope:${sc}`);
    }
    const size = sizeSection(page);
    if (size !== null) {
        if (/class="pending"/.test(size)) claims.add('size:pending');
        const mb = /macOS[^.]*?(\d+(?:\.\d+)?)\s*MB\b/.exec(plain(size))?.[1];
        if (mb) claims.add(`size:${Number(mb).toFixed(1)} MB`);
    }
    const gatekeeper = segs.filter(s => /Gatekeeper|Open Anyway/.test(s));
    const strings = [...new Set([...(macLine === null ? [] : [plain(macLine)]), ...gatekeeper, ...segs.filter(s => /\(en-US\)|\(([a-z]{2}-[A-Z]{2})\)\s+only/.test(s)), ...(size === null ? [] : segments(size))])];
    return { claims, macLine, gatekeeper, strings, hasSize: size !== null };
}

export function runChecks(recordText, pageText) {
    const failures = [];
    const fail = (rule, msg) => failures.push({ rule, msg });
    if (recordText === null) fail('vacuity', `${RECORD_REL} is unreadable, so nothing the page claims can be checked. Next step: restore the record.`);
    if (pageText === null) fail('vacuity', `${PAGE_REL} is unreadable, so the copy is unproven. Next step: restore the page.`);
    if (failures.length) return { failures, claims: 0 };
    const rec = recordClaims(parseRecord(recordText));
    const page = pageClaims(pageText);
    if (page.macLine === null) {
        fail('vacuity', `${PAGE_REL} carries no "macOS:" signing-status line, so the macOS claims are unproven. Next step: restore the Signing status list.`);
        return { failures, claims: 0 };
    }
    // Set equality over the derived claims, by kind.
    // A page with no size section states no size; that is truthful while the record has none (size:pending).
    for (const c of rec.claims) if (!page.claims.has(c) && !(c === 'size:pending' && !page.hasSize)) fail(c.split(':')[0], `unstated: the record observed ${JSON.stringify(c)} but ${PAGE_REL} does not state it. Next step: state it on the page, in plain words.`);
    for (const c of page.claims) if (!rec.claims.has(c)) fail(c.split(':')[0], `overclaim: ${PAGE_REL} states ${JSON.stringify(c)} but the record does not observe it. Next step: state only what the record observed.`);
    // The Gatekeeper path, by containment.
    if (rec.gatekeeper !== null && !page.gatekeeper.some(s => s.includes(rec.gatekeeper))) fail('gatekeeper', `dropped consequence: the record observed the Gatekeeper path ${JSON.stringify(rec.gatekeeper)} but no sentence on ${PAGE_REL} states it. Next step: tell the user that path on the page.`);
    if (rec.gatekeeper === null && page.gatekeeper.length) fail('gatekeeper', `unobserved consequence: ${PAGE_REL} describes Gatekeeper ("${page.gatekeeper[0].slice(0, 60)}") but the record has no observed path. Next step: observe it on a real Mac first, or remove the sentence.`);
    // Product name.
    if (!/<h1>[^<]*PowerBrowser[^<]*<\/h1>/.test(pageText)) fail('name', `${PAGE_REL} heading does not name PowerBrowser. Next step: name the product in the heading.`);
    const bad = pageText.match(/\bPower Browser\b|\bPowerbrowser\b|\bPOWERBROWSER\b/);
    if (bad) fail('name', `${PAGE_REL} spells the product ${JSON.stringify(bad[0])}. Next step: spell it PowerBrowser.`);
    // No internal identifier in any macOS string, including the record text that flows into the page.
    for (const s of [...page.strings, ...[rec.gatekeeper, rec.verbatim].filter(Boolean)]) {
        for (const [shape, re] of SHAPES) {
            const hit = re.exec(s);
            if (hit) fail('internal', `internal identifier (${shape}) ${JSON.stringify(hit[0])} in the macOS copy ${JSON.stringify(s.slice(0, 80))}. Next step: rewrite it in plain words with a next step on screen.`);
        }
    }
    return { failures, claims: rec.claims.size };
}

// --- self-test ---------------------------------------------------------------------------------------

function selfTest() {
    const read = rel => { try { return readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; } };
    const fmt = f => `[${f.rule}] ${f.msg}`;
    const realRecord = read(RECORD_REL);
    const realPage = read(PAGE_REL);
    const draft = runChecks(realRecord, realPage);
    if (draft.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the real record and page are already red: ${draft.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    console.log(`  ok  real record and page -> green (${draft.claims} derived claim(s), the conservative posture)`);
    // The observed pair: a record that observed a Developer ID build, and a page that says so.
    const ctx = loadContext(REPO_ROOT);
    const gk = 'In System Settings, Privacy and Security, choose Open Anyway for PowerBrowser.';
    const rec = fixtureRecord(ctx, { gk });
    const swap = (text, from, to) => {
        if (!text.includes(from)) throw new Error(`self-test fixture: ${JSON.stringify(from.slice(0, 60))} is not in the text, so a plant would test nothing`);
        return text.split(from).join(to);
    };
    const macLine = '<li><strong>macOS:</strong> the disk image is signed with a Developer ID, notarized and stapled.</li>';
    const gkLine = `<li>If macOS asks for confirmation: ${gk}</li>`;
    let page = swap(realPage, '<li><strong>macOS:</strong> no build is published yet. The planned build is ad-hoc signed and not notarized.</li>', `${macLine}\n    ${gkLine}`);
    const sizeBlock = '\n  <h2>Update file size</h2>\n  <p>The complete update file for macOS is 130.6 MB.</p>\n';
    page = swap(page, '</main>', `${sizeBlock}</main>`);
    const control = runChecks(rec, page);
    if (control.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the observed pair is already red, so the plants would mean nothing: ${control.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    console.log(`  ok  observed pair (Developer ID, notarized, stapled, 130.6 MB, Gatekeeper path) -> green (${control.claims} derived claim(s))`);
    const plants = [
        ['dropped consequence (Gatekeeper path off the page)', rec, swap(page, `\n    ${gkLine}`, ''), 'gatekeeper', 'dropped consequence'],
        ['added internal identifier (dotted key)', rec, swap(page, macLine, macLine.replace('</li>', ' See app.update.url.manual.</li>')), 'internal', 'dotted key'],
        ['added internal identifier (Team ID)', rec, swap(page, macLine, macLine.replace('</li>', ' Team 43AQ936H96.</li>')), 'internal', 'Team ID'],
        ['added internal identifier (all-caps token)', rec, swap(page, macLine, macLine.replace('</li>', ' Wait for BACKEND_READY.</li>')), 'internal', 'all-caps token'],
        ['notarization overclaim', swap(swap(rec, '- **Notarization:** notarized', '- **Notarization:** not notarized'), '- **Staple:** stapled', '- **Staple:** not stapled'), page, 'notarization', 'overclaim'],
        ['staple overclaim', swap(rec, '- **Staple:** stapled', '- **Staple:** not stapled'), page, 'staple', 'overclaim'],
        ['Developer ID overclaim against an ad-hoc record', swap(rec, '- **Signature:** Developer ID', '- **Signature:** ad-hoc'), page, 'signing', 'overclaim'],
        ['signing status dropped from the page', rec, swap(page, 'signed with a Developer ID, notarized and stapled', 'published'), 'signing', 'unstated'],
        ['dropped en-US scope line', rec, swap(page, '(en-US) only', 'only'), 'scope', 'unstated'],
        ['dropped complete-MAR size line', rec, swap(page, '<p>The complete update file for macOS is 130.6 MB.</p>', ''), 'size', 'unstated'],
        ['size differs from the record', rec, swap(page, '130.6 MB', '99.0 MB'), 'size', 'overclaim'],
        ['stale pending size beside an observed size', rec, swap(page, '<p>The complete update file for macOS is 130.6 MB.</p>', '<p>The complete update file for macOS is 130.6 MB.</p><p class="pending">Pending.</p>'), 'size', 'overclaim'],
        ['unobserved Gatekeeper sentence on a draft record', realRecord, swap(realPage, '<li><strong>macOS:</strong>', `${gkLine}\n    <li><strong>macOS:</strong>`), 'gatekeeper', 'unobserved consequence'],
        ['notarization overclaim on the real page', realRecord, swap(realPage, 'ad-hoc signed and not notarized', 'ad-hoc signed and notarized'), 'notarization', 'overclaim'],
        ['size section without the pending line on the real page', realRecord, swap(realPage, '</main>', '\n  <h2>Update file size</h2>\n  <p>Measured on the release build.</p>\n</main>'), 'size', 'unstated'],
        ['size section removed against an observed size', rec, swap(page, sizeBlock, '\n'), 'size', 'unstated'],
        ['product spelled Power Browser', rec, swap(page, '<h1>Download PowerBrowser</h1>', '<h1>Download Power Browser</h1>'), 'name', 'Power Browser'],
        ['macOS signing line missing', rec, swap(page, macLine, ''), 'vacuity', 'macOS:'],
        ['unreadable record', null, page, 'vacuity', 'record'],
    ];
    let failed = 0;
    for (const [name, r, p, rule, value] of plants) {
        const { failures } = runChecks(r, p);
        const hit = failures.some(f => f.rule === rule && f.msg.includes(value));
        if (hit) console.log(`  ok  ${name} -> red, naming [${rule}] '${value}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures)'}`); failed += 1; }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the real pair and the observed pair are green and ${plants.length} planted faults went red naming their drift`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const read = rel => { try { return readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; } };
    const { failures, claims } = runChecks(read(RECORD_REL), read(PAGE_REL));
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the macOS download copy.`);
        failures.forEach(f => console.error(`  [${f.rule}] ${f.msg}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${PAGE_REL} names PowerBrowser, states exactly the ${claims} claim(s) the record observed (signing, notarization, staple, scope, size) with no internal identifier, and any Gatekeeper path it gives is the observed one.`);
    return 0;
}

if (DIRECT_RUN) process.exit(main());
