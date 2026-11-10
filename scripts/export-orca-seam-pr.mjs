#!/usr/bin/env node
// scripts/export-orca-seam-pr.mjs
//
// Upstream PR preparation for the Orca overlay's seams (Phase 68, OVL-06,
// D-27; P68-18, P68-36, P62-20, P63-29). It prepares and never opens: no push,
// no fork, no gh, no issue or PR. Opening them is an owner action.
//
//   node scripts/export-orca-seam-pr.mjs <seam-id>      one seam, one PR
//   node scripts/export-orca-seam-pr.mjs --class CLASS  every seam of a class as one PR
//   node scripts/export-orca-seam-pr.mjs --self-test    hermetic fixture (file:// remote)
//
// A seam id is a patch file name under orca-overlay/patches/ without .patch.
// Inputs: the seams.json rows; orca-overlay/upstream/<seam-id>/upstream.json
// (title, problem, change, testing; generic text) and the test files beside it
// at Orca-relative paths; Orca's main, shallow-fetched from the REMOTE= line of
// scripts/fetch-orca.sh into .mozbuild/orca-upstream/.main.
// Steps: each seam patch applied to main with git apply --3way (patch-number
// order); every orca-overlay/files/<path> an added line of a seam imports is
// copied at its path, with its one pb-overlay:<path> module-constant literal
// rewritten to the bare path and every other byte kept; the upstream test files
// copied as new files.
// Outputs in .mozbuild/orca-upstream/<seam-id or CLASS>/: seam.patch (git diff
// of the result, new files included), issue.md, pr.md (exactly the "## "
// headings of the pinned orca/.github/pull_request_template.md, derived at run
// time, in template order), test-command.txt (the Test line of orca/AGENTS.md).
// Red on: an unknown seam id (exit 2), no upstream.json, a seam that does not
// apply to main, an upstream test path main already has, an overlay file
// without exactly one pb-overlay: constant line, a pr.md heading set unequal
// to the template's, and a PB, PowerBrowser/powerbrowser or pb-overlay: token
// left in an added or header line of seam.patch or anywhere in issue.md or
// pr.md. Context and removed lines of seam.patch are Orca's own text and are
// not scanned. A generic ORCA_* switch name carries none of these tokens.

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRemote, regexExtract, resolveSpec } from './verify-orca-mobile-protocol.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'export-orca-seam-pr';
const SELF_REL = 'scripts/export-orca-seam-pr.mjs';
const TEMPLATE_REL = '.github/pull_request_template.md';
const AGENTS_REL = 'AGENTS.md';
const TOKEN_PB = /(^|[^A-Za-z])PB([^A-Za-z]|$)/;
const TOKEN_REST = /powerbrowser|pb-overlay:/i;
const GIT_ID = ['-c', 'user.name=export', '-c', 'user.email=export@invalid'];

class Usage extends Error {}
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
const put = (root, rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
const hasToken = (line) => TOKEN_PB.test(line) || TOKEN_REST.test(line);
const listRel = (root) => readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath ?? e.path, e.name)).split(sep).join('/')).sort();

export const seamIdOf = (row) => row.patch.slice('patches/'.length, -'.patch'.length);

// Shallow main of <remote> into <dir>, fresh each run.
export function fetchMain(remote, dir) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dirname(dir), { recursive: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'main', remote, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
}

export function templateHeadings(text) {
    return text.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
}

// The body's "## " headings must equal the template's, in order; red names the first drift.
export function checkHeadings(body, headings) {
    const got = templateHeadings(body);
    for (const h of headings) if (!got.includes(h)) throw new Error(`pr.md is missing the template heading '## ${h}'`);
    if (got.join('\n') !== headings.join('\n')) throw new Error(`pr.md headings are not the template's in order: ${got.join(', ')}`);
}

export function testCommand(agentsText) {
    const line = agentsText.split('\n').find((l) => /\*\*Test\*\*/.test(l));
    const m = line?.match(/`([^`]+)`/);
    if (!m) throw new Error(`orca/${AGENTS_REL} names no **Test** command (the source moved)`);
    return m[1];
}

// The overlay file with its one pb-overlay:<path> module-constant literal replaced by the bare path.
export function genericOverlayText(path, text) {
    const lines = text.split('\n');
    const lit = `pb-overlay:${path}`;
    const hits = lines.map((l, i) => (new RegExp(`^\\s*(export\\s+)?const\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(['"\`])${lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\2`).test(l) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) throw new Error(`expected exactly one pb-overlay: constant line in ${path} (found ${hits.length})`);
    lines[hits[0]] = lines[hits[0]].replace(lit, path);
    return lines.join('\n');
}

// Relative specifiers on added lines, resolved from the patched file's directory inside files/.
function importedOverlayFiles(patchText, rowPath, filesDir) {
    const added = patchText.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
    const out = new Set();
    for (const spec of regexExtract(added)) {
        if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
        const hit = resolveSpec(join(filesDir, rowPath), spec);
        if (hit) out.add(relative(filesDir, hit).split(sep).join('/'));
    }
    return [...out];
}

export function refuseTokens(name, text, { patch = false } = {}) {
    text.split('\n').forEach((l, i) => {
        if (patch && (l.startsWith(' ') || (l.startsWith('-') && !l.startsWith('---')))) return;
        if (hasToken(l)) throw new Error(`a PB, PowerBrowser or pb-overlay: token is left in ${name} line ${i + 1}: ${l.trim().slice(0, 120)}`);
    });
}

// Select rows: by seam id, or every row of a class. Unknown is a usage error (exit 2).
export function selectRows(rows, { id, cls }) {
    const ids = rows.map(seamIdOf);
    const picked = cls ? rows.filter((r) => r.upstream?.class === cls) : rows.filter((r) => seamIdOf(r) === id);
    if (!picked.length) throw new Usage(cls ? `no seam of class ${cls} (classes present: ${[...new Set(rows.map((r) => r.upstream?.class))].join(', ') || 'none'})` : `unknown seam id ${id} (seam ids: ${ids.join(', ') || 'none'})`);
    return picked.sort((a, b) => seamIdOf(a).localeCompare(seamIdOf(b), 'en', { numeric: true }));
}

export function exportSeams({ overlayDir, orcaDir, remote, outRoot, id, cls }) {
    const rows = JSON.parse(readFileSync(join(overlayDir, 'seams.json'), 'utf8')).seams;
    const picked = selectRows(rows, { id, cls });
    const docs = picked.map((r) => {
        const sid = seamIdOf(r);
        const f = join(overlayDir, 'upstream', sid, 'upstream.json');
        if (!existsSync(f)) throw new Error(`no upstream description for ${sid}; 68-05 writes orca-overlay/upstream/${sid}/upstream.json`);
        return { sid, row: r, doc: JSON.parse(readFileSync(f, 'utf8')) };
    });
    const headings = templateHeadings(readFileSync(join(orcaDir, TEMPLATE_REL), 'utf8'));
    if (!headings.length) throw new Error(`orca/${TEMPLATE_REL} has no "## " heading (the source moved)`);
    const cmd = testCommand(readFileSync(join(orcaDir, AGENTS_REL), 'utf8'));

    const main = join(outRoot, '.main');
    fetchMain(remote, main);
    const tracked = new Set(git(main, 'ls-files').split('\n').filter(Boolean));
    const filesDir = join(overlayDir, 'files');
    const carried = {};
    for (const { sid, row } of docs) {
        const patchFile = join(overlayDir, row.patch);
        const ap = spawnSync('git', ['-C', main, 'apply', '--3way', patchFile], { encoding: 'utf8' });
        if (ap.status !== 0 || git(main, 'diff', '--name-only', '--diff-filter=U').trim()) {
            throw new Error(`seam ${sid} does not apply to Orca main: ${row.path} (${(ap.stderr || '').trim().split('\n').pop()})`);
        }
        for (const p of importedOverlayFiles(readFileSync(patchFile, 'utf8'), row.path, filesDir)) {
            carried[p] = genericOverlayText(p, readFileSync(join(filesDir, p), 'utf8'));
            put(main, p, carried[p]);
        }
        const upDir = join(overlayDir, 'upstream', sid);
        for (const p of listRel(upDir).filter((p) => p !== 'upstream.json')) {
            if (tracked.has(p)) throw new Error(`upstream test would replace ${p} (upstream tests are new files)`);
            cpSync(join(upDir, p), join(main, p));
        }
    }
    git(main, 'add', '-A');
    const patch = git(main, '-c', 'core.abbrev=10', 'diff', '--cached', '--no-color', '--no-ext-diff');

    const first = docs[0].doc;
    const changes = docs.map(({ sid, doc }) => (docs.length > 1 ? `${doc.change} (${sid.replace(/^\d+-/, '')})` : doc.change)).join('\n\n');
    const testing = docs.map(({ doc }) => doc.testing).join('\n\n');
    const issue = `# ${first.title}\n\n## Problem\n\n${first.problem}\n\n## Proposed change\n\n${changes}\n`;
    const fill = {
        ELI5: first.problem,
        'What Changed': changes,
        Why: first.problem,
        'Linked Issue': 'The issue in issue.md is opened first; replace this line with "Fixes #<issue number>".',
        'Visual Proof': 'N/A: no visual or interaction change; the change is behind an environment switch that is off by default.',
        Testing: `${testing}\n\nCommand: \`${cmd}\``,
    };
    const pr = `${headings.map((h) => `## ${h}\n\n${fill[h] ?? 'To be completed by the person opening this PR.'}\n`).join('\n')}`;
    checkHeadings(pr, headings);
    refuseTokens('seam.patch', patch, { patch: true });
    refuseTokens('issue.md', issue);
    refuseTokens('pr.md', pr);

    const out = join(outRoot, cls ?? id);
    rmSync(out, { recursive: true, force: true });
    put(out, 'seam.patch', patch);
    put(out, 'issue.md', issue);
    put(out, 'pr.md', pr);
    put(out, 'test-command.txt', `${cmd}\n`);
    return { out, seams: docs.map((d) => d.sid), headings, carried, patch, pr };
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const up = join(tmp, 'upstream-main');
    const overlay = join(tmp, 'orca-overlay');
    const HELPER = 'src/extra/helper.ts';
    const HELPER_TEXT = `// helper for the example switch\nexport const HELPER_ID = 'pb-overlay:${HELPER}'\nexport const enabled = process.env.ORCA_EXAMPLE_SWITCH === '1'\n`;
    const A = 'export function a() {\n  return 1\n}\n';
    const B = 'export function b() {\n  return 2\n}\n';
    try {
        mkdirSync(up, { recursive: true });
        git(up, 'init', '-q', '-b', 'main');
        put(up, 'src/a.ts', A);
        put(up, 'src/b.ts', B);
        put(up, 'src/existing.test.ts', 'export {}\n');
        put(up, TEMPLATE_REL, '## Summary\n\n<!-- x -->\n\n## Linked Issue\n\nFixes #\n\n## Visual Proof\n\n## Testing\n\n- [ ] tested\n');
        put(up, AGENTS_REL, '# Commands\n\n- **Test**: `pnpm test [file] --maxWorkers=2`; more\n');
        git(up, 'add', '-A');
        git(up, ...GIT_ID, 'commit', '-q', '-m', 'fixture main');
        // A patch is git's own diff of an edited fixture tree, never typed.
        const makePatch = (rel, body) => {
            const before = readFileSync(join(up, rel), 'utf8');
            put(up, rel, body);
            const p = git(up, '-c', 'core.abbrev=10', 'diff', '--no-color', '--', rel);
            put(up, rel, before);
            return p;
        };
        const P = {
            a: makePatch('src/a.ts', A.replace('  return 1', "  if (enabled) return 0\n  return 1").replace(/^/, "import { enabled } from './extra/helper'\n")),
            b: makePatch('src/b.ts', B.replace('  return 2', '  return 3')),
            aBrand: makePatch('src/a.ts', A.replace('  return 1', '  return 1 // for PowerBrowser')),
            aNoPre: makePatch('src/a.ts', A.replace('  return 1', '  return 5')).replace(/return 1/g, 'return 9'),
        };
        const doc = (t) => `${JSON.stringify({ title: `Example ${t}`, problem: `The ${t} cannot be turned off.`, change: `Add a switch for ${t}.`, testing: `Unit test for ${t}.` })}\n`;
        const base = () => ({
            seams: [
                { patch: 'patches/010-a.patch', path: 'src/a.ts', upstream: { class: 'browser-provider', pr: null } },
                { patch: 'patches/020-b.patch', path: 'src/b.ts', upstream: { class: 'browser-provider', pr: null } },
            ],
            patches: { '010-a.patch': P.a, '020-b.patch': P.b },
            files: { [HELPER]: HELPER_TEXT },
            upstream: { '010-a/upstream.json': doc('a'), '010-a/src/a.test.ts': 'export {}\n', '020-b/upstream.json': doc('b') },
        });
        const run = (spec, sel) => {
            rmSync(overlay, { recursive: true, force: true });
            put(overlay, 'seams.json', JSON.stringify({ seams: spec.seams }));
            for (const [f, b] of Object.entries(spec.patches)) put(overlay, `patches/${f}`, b);
            for (const [f, b] of Object.entries(spec.files)) put(overlay, `files/${f}`, b);
            for (const [f, b] of Object.entries(spec.upstream)) put(overlay, `upstream/${f}`, b);
            return exportSeams({ overlayDir: overlay, orcaDir: up, remote: `file://${up}`, outRoot: join(tmp, 'out'), ...sel });
        };
        const fail = (m) => { console.error(`${NAME} self-test: FAIL -- ${m}`); return 1; };

        const one = run(base(), { id: '010-a' });
        const wrote = ['seam.patch', 'issue.md', 'pr.md', 'test-command.txt'].filter((f) => existsSync(join(one.out, f)));
        if (wrote.length !== 4 || one.headings.join() !== 'Summary,Linked Issue,Visual Proof,Testing' || !one.patch.includes('b/src/a.test.ts')) {
            return fail(`control 010-a wrote ${wrote.join(', ')}; headings ${one.headings.join(', ')}; test file in patch: ${one.patch.includes('b/src/a.test.ts')}`);
        }
        console.log(`${NAME} self-test: control green -- 010-a wrote ${wrote.join(', ')} with every template heading and its new test file`);
        const src = HELPER_TEXT.split('\n');
        const got = (one.carried[HELPER] ?? '').split('\n');
        const diffs = src.map((l, i) => (l === got[i] ? -1 : i)).filter((i) => i >= 0);
        if (diffs.length !== 1 || got[diffs[0]] !== `export const HELPER_ID = '${HELPER}'` || got.length !== src.length
            || /pb-overlay:/.test(one.patch) || !one.patch.includes('ORCA_EXAMPLE_SWITCH') || !one.patch.includes(`b/${HELPER}`)) {
            return fail(`pb-overlay control: changed lines ${diffs.join(',')}, patch carries helper ${one.patch.includes(`b/${HELPER}`)}, pb-overlay: in patch ${/pb-overlay:/.test(one.patch)}`);
        }
        console.log("  ok pb-overlay-control -> the imported overlay file travels with its one constant literal replaced, every other line byte-equal, ORCA_EXAMPLE_SWITCH kept");
        const cls = run(base(), { cls: 'browser-provider' });
        if (!cls.patch.includes('a/src/a.ts') || !cls.patch.includes('a/src/b.ts') || cls.seams.join() !== '010-a,020-b' || !existsSync(join(tmp, 'out', 'browser-provider', 'pr.md'))) {
            return fail(`--class control: seams ${cls.seams.join(', ')}; both files in one patch: ${cls.patch.includes('a/src/b.ts')}`);
        }
        console.log(`${NAME} self-test: control green -- --class browser-provider wrote one patch holding 010-a and 020-b`);
        try { run(base(), { id: '099-none' }); return fail('an unknown seam id did not refuse'); } catch (e) { if (!(e instanceof Usage)) return fail(`unknown id: ${e.message}`); }

        const plants = [
            { name: 'template-heading-missing-from-body', naming: "missing the template heading '## Visual Proof'", run: () => checkHeadings(one.pr.replace('## Visual Proof', 'Visual Proof'), one.headings) },
            { name: 'powerbrowser-token-in-patch', naming: 'token is left in seam.patch', apply: (s) => { s.patches['010-a.patch'] = P.aBrand; } },
            { name: 'pre-image-absent-from-main', naming: 'seam 010-a does not apply to Orca main: src/a.ts', apply: (s) => { s.patches['010-a.patch'] = P.aNoPre; } },
            { name: 'pb-overlay-two-constant-lines', naming: `expected exactly one pb-overlay: constant line in ${HELPER}`, apply: (s) => { s.files[HELPER] = `${HELPER_TEXT}export const AGAIN = 'pb-overlay:${HELPER}'\n`; } },
            { name: 'pb-overlay-token-in-comment', naming: 'token is left in seam.patch line', apply: (s) => { s.files[HELPER] = `${HELPER_TEXT}// see pb-overlay:${HELPER}\n`; } },
            { name: 'upstream-test-replaces-main-file', naming: 'upstream test would replace src/existing.test.ts', apply: (s) => { s.upstream['010-a/src/existing.test.ts'] = 'export {}\n'; } },
        ];
        let failures = 0;
        for (const p of plants) {
            let err = null;
            try {
                if (p.run) p.run(); else { const s = base(); p.apply(s); run(s, { id: '010-a' }); }
            } catch (e) { err = e.message; }
            if (!err) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!err.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${err}`); failures++;
            } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        if (failures) return fail(`${failures} of ${plants.length} plant(s) did not go red naming the drift`);
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } catch (e) {
        console.error(`${NAME} self-test: FAIL -- ${e.message.split('\n')[0]}`);
        return 1;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const usage = (m) => {
        console.error(`${NAME}: ${m} (usage: node ${SELF_REL} <seam-id> | --class CLASS | --self-test)`);
        console.error(`  Next step: run node ${SELF_REL} with a seam id from orca-overlay/seams.json (a patch name without .patch).`);
        process.exit(2);
    };
    if (args[0] === '--self-test' && args.length === 1) process.exit(runSelfTest());
    const sel = args[0] === '--class' && args.length === 2 ? { cls: args[1] } : args.length === 1 && !args[0].startsWith('-') ? { id: args[0] } : null;
    if (!sel) usage(`unknown argument ${args.join(' ') || '(none)'}`);
    try {
        const r = exportSeams({ overlayDir: join(REPO_ROOT, 'orca-overlay'), orcaDir: join(REPO_ROOT, 'orca'), remote: readRemote(REPO_ROOT), outRoot: join(REPO_ROOT, '.mozbuild', 'orca-upstream'), ...sel });
        console.log(`${NAME}: PASS -- ${r.seams.join(', ')} exported to ${relative(REPO_ROOT, r.out)}/ (seam.patch, issue.md, pr.md with ${r.headings.length} template headings, test-command.txt); nothing was opened upstream`);
    } catch (e) {
        if (e instanceof Usage) usage(e.message);
        console.error(`${NAME}: FAIL -- ${e.message.split('\n')[0]}`);
        process.exit(1);
    }
}
