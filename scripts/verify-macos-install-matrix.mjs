#!/usr/bin/env node
// scripts/verify-macos-install-matrix.mjs
//
// The macos-install-matrix row (Phase 55, PKG-16). It reads the human matrix record
// .planning/workstreams/deploy/phases/55-macos-i/55-MACOS-MATRIX.md and derives, at check time, what the
// record must carry. Nothing it compares is a kept list: every expectation comes from the tree.
//
//  1. cells        The expected cell names are the column headers of the macOS row of the per-OS install
//                  matrix in docs/BUILD.md. Each of the two environment sections of the record (hosted
//                  draft-DMG matrix, real-Mac session) must carry exactly those cells, as set equality, so a
//                  missing cell and an invented one both go red. Each cell carries exactly one well-formed
//                  verdict line (strip-spike idiom: GREEN, RED or UNVERIFIED), a RED carries its cause, and
//                  a GREEN carries evidence. A hosted cell can be GREEN only when a hosted run exists.
//  2. build target The Darwin BUILD_TARGET strings observed on the running build equal, as a set, the targets
//                  the packaging step emits descriptors for (derived from the per-target mozconfigs, the same
//                  derivation the payload gate uses). An empty set is red; a placeholder is UNVERIFIED.
//  3. paths        Per-user paths the product wrote stay under the product's own namespace (the app basename
//                  and distribution id from the mozconfig) and never touch a Mozilla or Firefox root. A GREEN
//                  no-residue cell needs observed paths and nothing surviving the uninstall.
//  4. gatekeeper   The record carries the Gatekeeper block: the verbatim refusal, the path the user takes,
//                  and the user-writable-install update limit. A missing block or field is red.
//  5. identity     The two SHA256 values (build record, Mac) are equal; the signing status is a known
//                  value, and a staple without notarization is red.
//
// UNVERIFIED is never a pass. Structure problems are failures; an UNVERIFIED value is reported by name as an
// unobserved item, and the full row stays red until the owner session replaces it. An unreadable record, zero
// cells, or an empty derivation (no cells in BUILD.md, no Darwin target) is a failure naming the cause.
//
// Honestly: the full row needs the record the owner session completes, so it is full tier and red on the
// draft. --self-test is --quick: it reads the tree and builds fixtures in memory; no build, browser, network.
//
// Usage:
//   node scripts/verify-macos-install-matrix.mjs
//   node scripts/verify-macos-install-matrix.mjs --self-test

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveTargets } from './verify-macos-package-payload.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'macos-install-matrix';
const SELF_REL = 'scripts/verify-macos-install-matrix.mjs';
const RECORD_REL = '.planning/workstreams/deploy/phases/55-macos-i/55-MACOS-MATRIX.md';
const BUILD_MD_REL = 'docs/BUILD.md';
const PACKAGING_REL = 'powerbrowser/packaging';

// Scope selectors for the record's own layout (which section is which), never expectations.
export const HOSTED = 'Hosted draft-DMG matrix';
export const REAL = 'Real-Mac session';
const FIELDS = {
    'Build identity': ['Build record SHA256', 'Mac SHA256', 'Complete MAR size (bytes)', 'Locale scope', 'Hosted run'],
    'Signing status': ['Signature', 'Notarization', 'Staple'],
    'Gatekeeper observation': ['Verbatim', 'Path', 'Update limit'],
};
const MOZILLA_ROOT = /mozilla|firefox/i;

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

export const isUnverified = v => v === undefined || /^UNVERIFIED\b/.test(v);

/** Split the record into `##` sections holding fields, `###` cells, BUILD_TARGET lines and PATH lines. */
export function parseRecord(text) {
    const sections = [];
    let sec = null;
    let cell = null;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        let m;
        if ((m = /^## (.+)$/.exec(line))) {
            sec = { title: m[1].trim(), fields: {}, cells: [], targets: [], paths: [] };
            sections.push(sec);
            cell = null;
        } else if (sec === null) {
            continue;
        } else if ((m = /^### (.+)$/.exec(line))) {
            cell = { name: m[1].trim(), verdicts: [], fields: {} };
            sec.cells.push(cell);
        } else if (/^\*\*Verdict/.test(line)) {
            (cell ?? { verdicts: [] }).verdicts.push(line);
        } else if ((m = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line))) {
            (cell ? cell.fields : sec.fields)[m[1]] = m[2].trim();
        } else if ((m = /^- BUILD_TARGET:\s*(.*)$/.exec(line))) {
            sec.targets.push(m[1].trim());
        } else if ((m = /^- PATH:\s*(.*)$/.exec(line))) {
            sec.paths.push(m[1].trim());
        }
    }
    return { sections, section: t => sections.find(s => s.title === t) ?? null };
}

/** The macOS row's column headers after the first, from the per-OS install matrix in docs/BUILD.md. */
export function deriveCells(buildMd) {
    const lines = (buildMd ?? '').split('\n');
    const row = lines.findIndex(l => /^\| macOS \/ /.test(l));
    let head = -1;
    for (let i = row - 1; i >= 0 && row >= 0; i--) {
        if (/^\| OS \/ host \|/.test(lines[i])) { head = i; break; }
    }
    if (head < 0) return [];
    return lines[head].split('|').slice(1, -1).map(c => c.trim()).slice(1);
}

/** Everything the gate derives from the tree. */
export function loadContext(root) {
    const read = rel => { try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; } };
    const targets = deriveTargets(root, read);
    const mozconfigs = targets.map(t => read(t.mozconfig) ?? '').join('\n');
    return {
        cells: deriveCells(read(BUILD_MD_REL)),
        targets: targets.map(t => t.token).filter(Boolean),
        namespace: [/--with-app-basename=(\S+)/.exec(mozconfigs)?.[1], /--with-distribution-id=(\S+)/.exec(mozconfigs)?.[1]].filter(Boolean).map(s => s.toLowerCase()),
    };
}

const VERDICT = /^\*\*Verdict:\s*(GREEN|RED|UNVERIFIED)\*\*(.*)$/;

export function runChecks(recordText, ctx) {
    const failures = [];
    const unverified = [];
    const fail = (rule, msg) => failures.push({ rule, msg });
    const unv = what => unverified.push(what);
    if (ctx.cells.length === 0) fail('instrument', `${BUILD_MD_REL} has no macOS row under a per-OS install matrix header, so the expected cells cannot be derived. Next step: restore the matrix table, or fix this row's derivation.`);
    if (ctx.targets.length === 0) fail('instrument', `no Darwin target is derivable from ${PACKAGING_REL}/mozconfig-macos-*, so the descriptor set is unknown. Next step: restore the per-target mozconfigs.`);
    if (recordText === null) {
        fail('vacuity', `${RECORD_REL} is unreadable, so nothing is verified. Next step: restore the record.`);
        return { failures, unverified, cells: 0 };
    }
    const rec = parseRecord(recordText);
    const cellCount = [HOSTED, REAL].reduce((n, t) => n + (rec.section(t)?.cells.length ?? 0), 0);
    if (cellCount === 0) {
        fail('vacuity', `${RECORD_REL} carries zero cells, so nothing is verified. Next step: restore the cell sections.`);
        return { failures, unverified, cells: 0 };
    }

    // Field sections: present, and each field present.
    const field = (title, key) => {
        const s = rec.section(title);
        if (s === null) { fail(title === 'Gatekeeper observation' ? 'gatekeeper' : 'shape', `the record has no "${title}" section. Next step: restore it from the draft.`); return undefined; }
        if (!(key in s.fields)) { fail(title === 'Gatekeeper observation' ? 'gatekeeper' : 'shape', `the "${title}" section has no "${key}" field. Next step: restore the field.`); return undefined; }
        return s.fields[key];
    };
    const val = {};
    for (const [title, keys] of Object.entries(FIELDS)) {
        for (const k of keys) {
            val[`${title}/${k}`] = field(title, k);
            if (title !== 'Build identity' || k !== 'Locale scope') {
                const v = val[`${title}/${k}`];
                if (v !== undefined && isUnverified(v)) unv(`${title}: ${k}`);
            }
        }
    }
    const hw = rec.section(REAL)?.fields.Hardware;
    if (hw === undefined) fail('shape', `the "${REAL}" section has no "Hardware" field. Next step: restore it.`);
    else if (isUnverified(hw)) unv(`${REAL}: Hardware`);

    // 5. identity
    const shaA = val['Build identity/Build record SHA256'];
    const shaB = val['Build identity/Mac SHA256'];
    const hex = v => v !== undefined && !isUnverified(v);
    for (const [k, v] of [['Build record SHA256', shaA], ['Mac SHA256', shaB]]) {
        if (hex(v) && !/^[0-9a-f]{64}$/i.test(v)) fail('identity', `${k} is not a 64-digit hex digest. Next step: record the value shasum printed.`);
    }
    if (hex(shaA) && hex(shaB) && shaA.toLowerCase() !== shaB.toLowerCase()) fail('identity', 'the SHA256 on the Mac does not equal the build record SHA256, so the DMG was not the one built. Next step: transfer the DMG again and recheck.');
    const size = val['Build identity/Complete MAR size (bytes)'];
    if (hex(size) && !/^\d+$/.test(size)) fail('identity', `the complete MAR size ${JSON.stringify(size)} is not a byte count. Next step: record the bytes of the shipped MAR.`);
    const sig = val['Signing status/Signature'];
    const notar = val['Signing status/Notarization'];
    const staple = val['Signing status/Staple'];
    if (hex(sig) && !['ad-hoc', 'Developer ID'].includes(sig)) fail('identity', `the signature ${JSON.stringify(sig)} is not ad-hoc or Developer ID. Next step: record what codesign reported.`);
    if (hex(notar) && !['notarized', 'not notarized'].includes(notar)) fail('identity', `the notarization ${JSON.stringify(notar)} is not notarized or not notarized. Next step: record what the notary service reported.`);
    if (hex(staple) && !['stapled', 'not stapled'].includes(staple)) fail('identity', `the staple ${JSON.stringify(staple)} is not stapled or not stapled. Next step: record what the stapler reported.`);
    if (staple === 'stapled' && notar !== 'notarized') fail('identity', 'the record claims a stapled ticket without a notarization. Next step: correct the signing status.');
    const hostedRun = val['Build identity/Hosted run'];

    // 1. cells
    for (const envTitle of [HOSTED, REAL]) {
        const env = rec.section(envTitle);
        if (env === null) { fail('cells', `the record has no "${envTitle}" section. Next step: restore it from the draft.`); continue; }
        const have = env.cells.map(c => c.name);
        const missing = ctx.cells.filter(c => !have.includes(c));
        const extra = have.filter(c => !ctx.cells.includes(c));
        for (const c of missing) fail('cells', `${envTitle}: cell "${c}" is missing; the macOS row of ${BUILD_MD_REL} names it. Next step: add the cell with its verdict line.`);
        for (const c of extra) fail('cells', `${envTitle}: cell "${c}" is not a column of the macOS row in ${BUILD_MD_REL}. Next step: remove it, or add the column there first.`);
        for (const cell of env.cells) {
            const where = `${envTitle} / ${cell.name}`;
            if (cell.verdicts.length !== 1) { fail('verdict', `${where} has ${cell.verdicts.length} verdict line(s); exactly one is required. Next step: keep one verdict line.`); continue; }
            const m = VERDICT.exec(cell.verdicts[0]);
            if (m === null) { fail('verdict', `${where} verdict line ${JSON.stringify(cell.verdicts[0])} is not GREEN, RED or UNVERIFIED in the record's shape. Next step: rewrite it.`); continue; }
            const cause = /^\s*[—–-]\s*(.+)$/.exec(m[2])?.[1]?.trim() ?? '';
            if (m[1] === 'RED') {
                if (cause === '') fail('cause', `${where} is RED with no cause on the verdict line. Next step: add " — <cause>" after the verdict.`);
                else fail('red', `${where} is RED: ${cause}. Next step: fix the cause and rerun the cell.`);
            } else if (m[1] === 'UNVERIFIED') {
                unv(where);
            } else {
                if (isUnverified(cell.fields.Evidence) || cell.fields.Evidence === '') fail('evidence', `${where} is GREEN without evidence. Next step: record what was observed.`);
                if (envTitle === HOSTED && (hostedRun === undefined || isUnverified(hostedRun))) fail('hosted', `${where} is GREEN but no hosted run is recorded. Next step: record the run that produced it.`);
            }
        }
    }

    // 2. build target
    const bt = rec.section('Observed BUILD_TARGET');
    if (bt === null || bt.targets.length === 0) {
        fail('build-target', 'the record carries no BUILD_TARGET lines, so the observed set is empty. Next step: record one BUILD_TARGET line per emitted descriptor target.');
    } else {
        const observed = bt.targets.filter(t => !isUnverified(t));
        const pending = bt.targets.length - observed.length;
        for (const t of observed) if (!/^Darwin_[a-z0-9_]+-gcc3$/.test(t)) fail('build-target', `${JSON.stringify(t)} is not a Darwin BUILD_TARGET string. Next step: copy the string the running build reports.`);
        const extra = observed.filter(t => !ctx.targets.includes(t));
        const absent = ctx.targets.filter(t => !observed.includes(t));
        if (extra.length) fail('build-target', `observed BUILD_TARGET ${extra.join(', ')} is not in the emitted descriptor set (${ctx.targets.join(', ')}). Next step: the descriptors and the running build disagree; fix the one that is wrong.`);
        if (absent.length && pending === 0) fail('build-target', `the emitted descriptor set includes ${absent.join(', ')}, which the record never observed. Next step: run the build for that target and record its string.`);
        for (let i = 0; i < pending; i++) unv('Observed BUILD_TARGET');
    }

    // 3. paths
    const pp = rec.section('Per-user paths');
    if (pp === null) {
        fail('paths', 'the record has no "Per-user paths" section. Next step: restore it from the draft.');
    } else {
        const observed = pp.paths.filter(p => !isUnverified(p));
        for (const p of observed) {
            if (MOZILLA_ROOT.test(p)) fail('residue', `path ${p} touches a Mozilla or Firefox root; the product must write only under its own namespace. Next step: move the write under the product's own directory.`);
            else if (ctx.namespace.length && !ctx.namespace.some(n => p.toLowerCase().includes(n))) fail('residue', `path ${p} is outside the product namespace (${ctx.namespace.join(' or ')}). Next step: record only paths the product wrote, or fix where it writes.`);
        }
        if (pp.paths.length === 0) fail('paths', 'the "Per-user paths" section lists no PATH line. Next step: record the paths the install wrote.');
        if (observed.length < pp.paths.length) unv('Per-user paths');
        const surviving = pp.fields['Surviving after uninstall'];
        if (surviving === undefined) fail('paths', 'the "Per-user paths" section has no "Surviving after uninstall" field. Next step: restore it.');
        else if (isUnverified(surviving)) unv('Per-user paths: Surviving after uninstall');
        else if (surviving !== 'none') fail('residue', `paths survive the uninstall: ${surviving}. Next step: remove them in the uninstall path.`);
        const nr = rec.section(REAL)?.cells.find(c => /no-residue/.test(c.name));
        if (nr && VERDICT.exec(nr.verdicts[0] ?? '')?.[1] === 'GREEN' && (observed.length === 0 || surviving !== 'none')) fail('residue', `${REAL} / ${nr.name} is GREEN without observed paths and an empty survivor list. Next step: record both.`);
    }

    // 4. gatekeeper: the update limit names the user-writable-install condition once observed
    const limit = val['Gatekeeper observation/Update limit'];
    if (hex(limit) && !/user-writable/i.test(limit)) fail('gatekeeper', 'the update limit does not state the user-writable-install condition. Next step: record what the updater did from a user-writable folder and from Applications.');

    return { failures, unverified, cells: cellCount };
}

// --- self-test ---------------------------------------------------------------------------------------

/** A fully observed record built from the derived cells and targets, so a plant edits one fact. */
export function fixtureRecord(ctx, over = {}) {
    const f = { sha: 'ab'.repeat(32), size: '130551024', gk: 'In System Settings, Privacy and Security, choose Open Anyway for PowerBrowser.', ...over };
    const cell = (c, v = '**Verdict: GREEN**') => `### ${c}\n\n${v}\n\n- **Evidence:** observed on the session\n`;
    const env = (title, extra = '') => `## ${title}\n\n${extra}${ctx.cells.map(c => cell(c)).join('\n')}`;
    return [
        '# fixture', '',
        '## Build identity', '', `- **Build record SHA256:** ${f.sha}`, `- **Mac SHA256:** ${f.sha}`, `- **Complete MAR size (bytes):** ${f.size}`, '- **Locale scope:** en-US', '- **Hosted run:** run 1', '',
        '## Signing status', '', '- **Signature:** Developer ID', '- **Notarization:** notarized', '- **Staple:** stapled', '',
        env(HOSTED), env(REAL, '- **Hardware:** Apple Silicon, macOS 15\n\n'),
        '## Observed BUILD_TARGET', '', ...ctx.targets.map(t => `- BUILD_TARGET: ${t}`), '',
        '## Per-user paths', '', ...ctx.namespace.slice(0, 1).map(n => `- PATH: ~/Library/Application Support/${n}`), '- **Surviving after uninstall:** none', '',
        '## Gatekeeper observation', '', `- **Verbatim:** "PowerBrowser cannot be opened"`, `- **Path:** ${f.gk}`, '- **Update limit:** updates work only for user-writable install locations', '',
    ].join('\n');
}

function selfTest() {
    const ctx = loadContext(REPO_ROOT);
    const fmt = f => `[${f.rule}] ${f.msg}`;
    const draftText = (() => { try { return readFileSync(join(REPO_ROOT, RECORD_REL), 'utf8'); } catch { return null; } })();
    const draft = runChecks(draftText, ctx);
    if (draft.failures.length > 0 || draft.unverified.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- the draft record must be structurally clean with unobserved items; failures: ${draft.failures.map(fmt).join(' | ') || '(none)'}, unverified: ${draft.unverified.length}`);
        return 1;
    }
    console.log(`  ok  draft record -> structure clean, ${draft.unverified.length} item(s) unobserved (the full row stays red until the session)`);
    const base = fixtureRecord(ctx);
    const control = runChecks(base, ctx);
    if (control.failures.length > 0 || control.unverified.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the observed fixture is already red or unobserved, so the plants would mean nothing: ${control.failures.map(fmt).join(' | ')} ${control.unverified.join(', ')}`);
        return 1;
    }
    console.log(`  ok  observed fixture over ${ctx.cells.length} cell(s) x 2 environments and ${ctx.targets.length} target(s) -> green`);
    const firstCell = ctx.cells[0];
    const dropSection = (text, title, heading = '##') => text.replace(new RegExp(`${heading} ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n#{2,3} |$)`), '');
    const plants = [
        ['missing cell', base.replace(new RegExp(`### ${firstCell}\\n[\\s\\S]*?(?=\\n### |\\n## )`), ''), 'cells', `"${firstCell}" is missing`],
        ['invented cell', base.replace('## Observed BUILD_TARGET', '### hover\n\n**Verdict: GREEN**\n\n- **Evidence:** x\n\n## Observed BUILD_TARGET'), 'cells', 'is not a column'],
        ['bare RED with no cause', base.replace('**Verdict: GREEN**', '**Verdict: RED**'), 'cause', 'no cause'],
        ['RED with a cause still fails the gate', base.replace('**Verdict: GREEN**', '**Verdict: RED** — updater refused the hop'), 'red', 'updater refused the hop'],
        ['two verdict lines in one cell', base.replace('**Verdict: GREEN**', '**Verdict: GREEN**\n**Verdict: RED** — x'), 'verdict', 'exactly one'],
        ['malformed verdict line', base.replace('**Verdict: GREEN**', '**Verdict: PASS**'), 'verdict', 'not GREEN, RED or UNVERIFIED'],
        ['GREEN without evidence', base.replace('- **Evidence:** observed on the session', '- **Evidence:** UNVERIFIED'), 'evidence', 'without evidence'],
        ['hosted GREEN with no hosted run', base.replace('- **Hosted run:** run 1', '- **Hosted run:** UNVERIFIED'), 'hosted', 'no hosted run'],
        ['empty BUILD_TARGET set', dropSection(base, 'Observed BUILD_TARGET') , 'build-target', 'no BUILD_TARGET lines'],
        ['BUILD_TARGET not in the descriptor set', base.replace(ctx.targets[0], 'Darwin_riscv64-gcc3'), 'build-target', 'Darwin_riscv64-gcc3'],
        ['an emitted target never observed', base.replace(`- BUILD_TARGET: ${ctx.targets[0]}\n`, ''), 'build-target', ctx.targets[0]],
        ['residue claim under a Mozilla root', base.replace('- **Surviving after uninstall:** none', '- PATH: ~/Library/Application Support/Mozilla/Profiles\n- **Surviving after uninstall:** none'), 'residue', 'Mozilla or Firefox root'],
        ['path outside the product namespace', base.replace('- **Surviving after uninstall:** none', '- PATH: ~/Library/Application Support/Other\n- **Surviving after uninstall:** none'), 'residue', 'outside the product namespace'],
        ['paths survive the uninstall', base.replace('- **Surviving after uninstall:** none', '- **Surviving after uninstall:** ~/Library/Caches/leftover'), 'residue', 'survive the uninstall'],
        ['absent Gatekeeper block', dropSection(base, 'Gatekeeper observation'), 'gatekeeper', 'no "Gatekeeper observation" section'],
        ['Gatekeeper update limit dropped', base.replace('- **Update limit:** updates work only for user-writable install locations', '- **Update limit:** works'), 'gatekeeper', 'user-writable'],
        ['SHA256 mismatch', base.replace(`- **Mac SHA256:** ${'ab'.repeat(32)}`, `- **Mac SHA256:** ${'cd'.repeat(32)}`), 'identity', 'does not equal'],
        ['stapled without notarization', base.replace('- **Notarization:** notarized', '- **Notarization:** not notarized'), 'identity', 'stapled ticket without'],
        ['a cell left UNVERIFIED', base.replace('**Verdict: GREEN**', '**Verdict: UNVERIFIED**'), null, `${HOSTED} / ${firstCell}`],
    ];
    let failed = 0;
    for (const [name, text, rule, value] of plants) {
        const r = runChecks(text, ctx);
        const hit = rule === null ? r.unverified.some(u => u.includes(value)) : r.failures.some(f => f.rule === rule && f.msg.includes(value));
        if (hit) console.log(`  ok  ${name} -> ${rule === null ? 'unobserved' : 'red'}, naming '${value}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] '${value}'; got: ${r.failures.map(fmt).join(' | ') || '(no failures)'}`); failed += 1; }
    }
    for (const [name, text, ok] of [['unreadable record', null, 'vacuity'], ['zero cells', '# empty\n', 'vacuity']]) {
        if (runChecks(text, ctx).failures.some(f => f.rule === ok)) console.log(`  ok  ${name} -> red, naming [${ok}]`);
        else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red as ${ok}`); failed += 1; }
    }
    if (runChecks(base, { ...ctx, cells: [] }).failures.some(f => f.rule === 'instrument')) console.log('  ok  no derivable cells -> red, naming [instrument]');
    else { console.error(`${NAME}: --self-test FAIL -- an empty cell derivation did not go red`); failed += 1; }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the draft is structurally clean and unobserved, the observed fixture is green, and ${plants.length + 3} planted faults went red naming their drift`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    let text = null;
    try { text = readFileSync(join(REPO_ROOT, RECORD_REL), 'utf8'); } catch { /* reported as vacuity */ }
    const { failures, unverified, cells } = runChecks(text, loadContext(REPO_ROOT));
    if (failures.length > 0 || unverified.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) and ${unverified.length} unobserved item(s) in the matrix record.`);
        failures.forEach(f => console.error(`  [${f.rule}] ${f.msg}`));
        unverified.forEach(u => console.error(`  [unobserved] ${u} is UNVERIFIED. Next step: run the owner session (docs/RELEASING.md, macOS) and record what was observed.`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${RECORD_REL} carries ${cells} cell(s), each with one verdict line and no UNVERIFIED value; the observed BUILD_TARGET set equals the emitted descriptor set; the per-user paths stay in the product namespace with nothing surviving; the Gatekeeper block is complete.`);
    return 0;
}

if (DIRECT_RUN) process.exit(main());
