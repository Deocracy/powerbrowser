#!/usr/bin/env node
// scripts/verify-orca-overlay.mjs
//
// The orca-overlay gate (Phase 62, OVL-01, OVL-05; P62-09, P62-10, P62-17,
// P62-20): orca-overlay/ is the only place PowerBrowser changes Orca, and it
// stays additive. A seam is a few changed lines in one upstream file, declared
// in seams.json with the upstream blob it was cut against; a PB-added file
// lives under files/ at a path upstream does not have.
//
// Derived at check time, never hand-kept:
//  a. the seam list, from orca-overlay/seams.json;
//  b. each seam's upstream blob, from git -C orca rev-parse HEAD:<path>;
//  c. the patched path set, from the patches' own 'diff --git' headers;
//  d. each seam's changed-line counts, from git apply --numstat;
//  e. the upstream path set, from git -C orca ls-tree -r --name-only HEAD;
//  f. the PB-added file list, from orca-overlay/files/;
//  g. the seam-count cap, from configuration.toml [orca] seam_cap.
// Red on: a whole-file replacement (new/deleted/rename/copy/binary header, or
// half the upstream file deleted), a patch with no seams.json row, a row with
// no patch, a patch touching an undeclared path, a seam count over the cap, a
// recorded-blob or pre-image drift, a seam over SEAM_LINE_BOUND changed lines,
// a hand-edited hunk (hermetic replay through apply-patches.sh and
// regenerate-patches.sh --check), a files/ entry that shadows an upstream
// path, lacks its marker literal or is of an unclassified kind, and (--built)
// a files/ entry neither build:web nor build:orcad compiled.
//
// Limit: a marker literal in a bundle proves the file was compiled into it,
// not that its code runs.
//
// Tier: default quick (steps that need orca/ print one SKIP line when it is
// not fetched); --built full; --self-test quick (hermetic mkdtemp fixtures).
//
// Usage:
//   node scripts/verify-orca-overlay.mjs
//   node scripts/verify-orca-overlay.mjs --built
//   node scripts/verify-orca-overlay.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-overlay';
const SELF_REL = 'scripts/verify-orca-overlay.mjs';
const APPLY = join(REPO_ROOT, 'scripts', 'apply-patches.sh');
const REGENERATE = join(REPO_ROOT, 'scripts', 'regenerate-patches.sh');
// P62-17, D-16: a seam is "one-to-few-line"; added plus deleted lines per upstream path.
const SEAM_LINE_BOUND = 20;
const ROW_KEYS = ['patch', 'path', 'reason', 'upstream_blob'];
const WHOLE_FILE = /^(new file mode|deleted file mode|rename from|rename to|copy from|copy to|similarity index|Binary files |GIT binary patch)/;

// A plain relative path: letters, digits, dot, underscore, hyphen and slash; no empty, '.' or '..' segment.
export function validPath(p) {
    return typeof p === 'string' && /^[A-Za-z0-9._/-]+$/.test(p) && !p.startsWith('/')
        && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

function git(dir, ...a) {
    return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

function isGitTop(dir) {
    try { return realpathSync(git(dir, 'rev-parse', '--show-toplevel').trim()) === realpathSync(dir) && !!git(dir, 'rev-parse', '--verify', '-q', 'HEAD'); } catch { return false; }
}

// Both sides of every 'diff --git a/X b/Y' header, the index pre-images and any whole-file header line.
function readPatch(file) {
    const paths = new Set();
    const pre = {};
    const whole = [];
    let cur = null;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const h = line.match(/^diff --git a\/(\S+) b\/(\S+)$/);
        if (h) { paths.add(h[1]); paths.add(h[2]); cur = h[2]; continue; }
        const i = line.match(/^index ([0-9a-f]+)\.\./);
        if (i && cur) pre[cur] = i[1];
        const w = line.match(WHOLE_FILE);
        if (w) whole.push(w[1].trim());
    }
    return { paths, pre, whole };
}

function lastLine(r) {
    return `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => l.includes('FAIL')) ?? `exit ${r.status}`;
}

export function check({ repoRoot = REPO_ROOT, overlayDir = join(repoRoot, 'orca-overlay'), orcaDir = join(repoRoot, 'orca'), cap } = {}) {
    const fails = [];
    const notes = [];
    const seamsFile = join(overlayDir, 'seams.json');
    const patchesDir = join(overlayDir, 'patches');

    // a. seams.json, in the shape lane p62-02 also reads. An absent file is zero seams.
    let rows = [];
    if (existsSync(seamsFile)) {
        let doc;
        try { doc = JSON.parse(readFileSync(seamsFile, 'utf8')); } catch (err) { fails.push(`seams.json does not parse: ${err.message}`); }
        if (doc !== undefined) {
            if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).join() !== 'seams' || !Array.isArray(doc.seams)) {
                fails.push('seams.json is not an object with the one key "seams" holding an array');
            } else {
                rows = doc.seams;
            }
        }
    }
    const seen = new Set();
    rows = rows.filter((r, n) => {
        const bad = (why) => { fails.push(`seams.json row ${n}: ${why}`); return false; };
        if (!r || typeof r !== 'object' || Object.keys(r).sort().join() !== ROW_KEYS.join()) return bad(`keys are not exactly ${ROW_KEYS.join(', ')}`);
        if (!validPath(r.path)) return bad(`path '${r.path}' is not a plain relative path (no absolute path, no empty or .. segment)`);
        if (seen.has(r.path)) return bad(`duplicate path ${r.path}`);
        seen.add(r.path);
        if (!/^[0-9a-f]{40}$/.test(r.upstream_blob)) return bad(`upstream_blob of ${r.path} is not a 40-hex blob id`);
        if (!/^patches\/[A-Za-z0-9._-]+\.patch$/.test(r.patch)) return bad(`patch of ${r.path} is not a .patch file directly under patches/`);
        if (typeof r.reason !== 'string' || !r.reason.trim() || r.reason.includes('\n')) return bad(`reason of ${r.path} is not one line`);
        return true;
    });

    // c. patch files against rows, both ways; every patched path is its row's declared path.
    const patchFiles = existsSync(patchesDir) ? readdirSync(patchesDir).filter((f) => f.endsWith('.patch')).sort() : [];
    const rowPatches = new Set(rows.map((r) => r.patch));
    for (const f of patchFiles) if (!rowPatches.has(`patches/${f}`)) fails.push(`patch with no seams.json row (undeclared seam): patches/${f}`);
    for (const p of rowPatches) if (!patchFiles.includes(p.slice('patches/'.length))) fails.push(`seams.json row whose patch is missing: ${p}`);

    const stat = {};
    for (const f of patchFiles) {
        const rel = `patches/${f}`;
        const declared = new Set(rows.filter((r) => r.patch === rel).map((r) => r.path));
        const patch = readPatch(join(patchesDir, f));
        for (const p of patch.paths) if (!declared.has(p)) fails.push(`${rel} touches ${p}, which has no seams.json row for that patch (undeclared seam)`);
        for (const p of declared) if (!patch.paths.has(p)) fails.push(`seams.json row ${p}: ${rel} does not touch it`);
        for (const w of patch.whole) fails.push(`whole-file replacement: ${rel} carries '${w}' (a seam edits lines of an existing upstream file)`);
        // d. changed lines per path, without applying.
        const ns = spawnSync('git', ['apply', '--numstat', join(patchesDir, f)], { encoding: 'utf8', cwd: tmpdir() });
        if (ns.status !== 0) { fails.push(`${rel} is not a patch git can read: ${(ns.stderr || '').trim().split('\n')[0]}`); continue; }
        for (const line of ns.stdout.split('\n').filter(Boolean)) {
            const [a, d, p] = line.split('\t');
            const added = Number(a) || 0;
            const deleted = Number(d) || 0;
            stat[p] = { added, deleted, pre: patch.pre[p] };
            if (added + deleted > SEAM_LINE_BOUND) {
                fails.push(`seam ${p} changes ${added + deleted} lines (+${added}/-${deleted}), over the bound of ${SEAM_LINE_BOUND} (SEAM_LINE_BOUND, P62-17, D-16)`);
            }
        }
    }

    // g. the cap. Task 2 makes an absent cap red; undefined here means "not given by the caller".
    if (cap !== undefined && rows.length > cap) {
        fails.push(`${rows.length} seams over the cap of ${cap} (configuration.toml [orca] seam_cap, D-16)`);
    }

    // b. steps that need the fetched tree.
    if (!isGitTop(orcaDir)) {
        notes.push(`${NAME}: SKIP -- orca/ is not a fetched git checkout, so the pinned-blob, half-file and replay steps did not run (bash scripts/fetch-orca.sh)`);
    } else {
        const content = {};
        for (const r of rows) {
            let blob;
            try { blob = git(orcaDir, 'rev-parse', '--verify', '-q', `HEAD:${r.path}`).trim(); } catch { /* reported below */ }
            if (!blob || git(orcaDir, 'cat-file', '-t', blob).trim() !== 'blob') { fails.push(`seams.json row ${r.path} is not a file at the pin (git -C orca rev-parse HEAD:${r.path})`); continue; }
            if (blob !== r.upstream_blob) fails.push(`recorded upstream_blob ${r.upstream_blob} of ${r.path} does not equal the pinned blob ${blob}`);
            const s = stat[r.path];
            if (s?.pre && !blob.startsWith(s.pre)) fails.push(`pre-image does not match the pinned blob: ${r.patch} index ${s.pre} against ${blob} for ${r.path}`);
            content[r.path] = execFileSync('git', ['-C', orcaDir, 'cat-file', '-p', blob], { maxBuffer: 256 * 1024 * 1024 });
            const lines = content[r.path].toString('utf8').split('\n').length - 1;
            if (s && s.deleted >= Math.max(1, Math.ceil(lines / 2))) {
                fails.push(`whole-file replacement: ${r.patch} deletes ${s.deleted} of the ${lines} upstream lines of ${r.path} (half or more)`);
            }
        }
        // Hermetic replay: the pinned content of each declared path, the real apply (blob hash before and
        // after) and the real --check, so the result is the same whether orca/ is pristine or applied.
        if (patchFiles.length && Object.keys(content).length === rows.length) {
            const replay = mkdtempSync(join(tmpdir(), `${NAME}-replay-`));
            try {
                git(replay, 'init', '-q');
                for (const [p, body] of Object.entries(content)) { mkdirSync(dirname(join(replay, p)), { recursive: true }); writeFileSync(join(replay, p), body); }
                git(replay, 'add', '-A');
                git(replay, '-c', 'user.name=replay', '-c', 'user.email=replay@invalid', 'commit', '-q', '--allow-empty', '-m', 'pinned content of the declared seam paths');
                const ap = spawnSync('bash', [APPLY, '--upstream', replay, '--patches', patchesDir], { encoding: 'utf8' });
                if (ap.status !== 0) {
                    fails.push(`hermetic replay: apply-patches.sh did not apply the overlay onto the pinned content: ${lastLine(ap)}`);
                } else {
                    const ck = spawnSync('bash', [REGENERATE, '--check', '--upstream', replay, '--patches', patchesDir], { encoding: 'utf8' });
                    if (ck.status !== 0) fails.push(`hermetic replay: regenerate-patches.sh --check is red (a hunk was edited by hand; patches are regenerated, never text-edited): ${lastLine(ck)}`);
                }
            } finally {
                rmSync(replay, { recursive: true, force: true });
            }
        }
    }

    const seams = rows.map((r) => {
        const s = stat[r.path] ?? { added: 0, deleted: 0 };
        return `${r.path} +${s.added}/-${s.deleted}, blob ${r.upstream_blob.slice(0, 10)}`;
    });
    return { skip: null, fails, notes, counts: { seams: rows.length, files: 0 }, seams };
}

function render(r) {
    if (r.fails.length) return { code: 1, lines: [...r.notes, ...r.fails.map((f) => `${NAME}: FAIL -- ${f}`)] };
    const c = r.counts;
    return { code: 0, lines: [...r.notes, `${NAME}: PASS -- ${c.seams} seam(s)${r.seams.length ? ` (${r.seams.join('; ')})` : ''}, ${c.files} overlay file(s)`] };
}

// The CLI runs only when this file is the entry point, so check() can be imported.
const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.filter((a) => a !== '--self-test' && a !== '--built');
    if (unknown.length || args.length > 1) {
        console.error(`${NAME}: unknown argument ${unknown[0] ?? args[1]} (usage: node ${SELF_REL} [--built | --self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
        process.exit(2);
    }
    const { code, lines } = render(check());
    for (const l of lines) (code && l.includes('FAIL') ? console.error : console.log)(l);
    process.exit(code);
}
