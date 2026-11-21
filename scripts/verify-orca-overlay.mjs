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
// Upstream key (Phase 68, OVL-06, P68-19, P68-36, D-27, D-31, D-45): every row
// carries upstream = { class, pr }, class one of UPSTREAM_CLASSES, pr null or
// https://github.com/<owner>/<repo>/pull/<n> with owner and repo parsed from
// the REMOTE= line of scripts/fetch-orca.sh (a missing line is red, never a
// default). orca-overlay/upstream/<seam-id>/ holds upstream-only material (an
// upstream.json with string keys title, problem, change and testing, and test
// files at Orca-relative paths); each directory name must equal a seam id, the
// patch file name without .patch. Nothing under upstream/ reaches a build:
// build-orca.sh copies files/ and applies patches/ only.
// --upstream-prs: red until each class in PR_CLASSES has a row with a non-null
// pr (D-31 removed the terminal-provider class, D-45 the web-entry class);
// 68-05 registers that row.
//
// Tier: default quick (steps that need orca/ are not run when it is not fetched: the row then exits 77 with
// one SKIP line, and the driver records SKIP, never PASS; harness-static-structure-01 and SKIP-PROTOCOL.md);
// --built full; --self-test quick (hermetic mkdtemp fixtures).
//
// The overlay itself is required (harness-static-structure-06): an absent orca-overlay/seams.json is red, not
// zero seams, and every overlay file that the build scripts name (scripts/build-orca*.sh: a vite.pb-*.config.ts,
// pb-css-scope.mjs or src/renderer/src/pb/ path) must exist under orca-overlay/files/. The list is read from
// those scripts at check time.
//
// Usage:
//   node scripts/verify-orca-overlay.mjs
//   node scripts/verify-orca-overlay.mjs --built
//   node scripts/verify-orca-overlay.mjs --upstream-prs
//   node scripts/verify-orca-overlay.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureGitArgs, fixtureGitEnv, withHostileGitConfig } from './lib/fixture-git.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
import { parse } from './lib/toml.cjs';
import { readRemote } from './verify-orca-mobile-protocol.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-overlay';
const SELF_REL = 'scripts/verify-orca-overlay.mjs';
const APPLY = join(REPO_ROOT, 'scripts', 'apply-patches.sh');
const REGENERATE = join(REPO_ROOT, 'scripts', 'regenerate-patches.sh');
// P62-17, D-16: a seam is "one-to-few-line"; added plus deleted lines per upstream path.
const SEAM_LINE_BOUND = 20;
const ROW_KEYS = ['patch', 'path', 'reason', 'upstream', 'upstream_blob'];
// D-27 as amended by D-31 and D-45: the seam classes, and the ones upstream must receive a PR for.
const UPSTREAM_CLASSES = ['browser-provider', 'pb-only'];
const PR_CLASSES = ['browser-provider'];
const UPSTREAM_DOC_KEYS = ['change', 'problem', 'testing', 'title'];
const MANIFEST_REL = 'configuration.toml';
const SOURCE_KINDS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
// P62-20: the literal each PB-added source file carries, followed by its path relative to the Orca root.
const MARKER = /pb-overlay:([A-Za-z0-9._/-]+)/g;
const WHOLE_FILE = /^(new file mode|deleted file mode|rename from|rename to|copy from|copy to|similarity index|Binary files |GIT binary patch)/;

// A plain relative path: letters, digits, dot, underscore, hyphen and slash; no empty, '.' or '..' segment.
export function validPath(p) {
    return typeof p === 'string' && /^[A-Za-z0-9._/-]+$/.test(p) && !p.startsWith('/')
        && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

function git(dir, ...a) {
    return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

// Fixture repositories only: no signing, no hooks, no global or system config (harness-static-structure-11).
function fgit(dir, ...a) {
    return execFileSync('git', [...fixtureGitArgs(), '-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: fixtureGitEnv(), maxBuffer: 256 * 1024 * 1024 });
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

// configuration.toml [orca] seam_cap through the vendored parser; undefined when absent or unreadable.
export function readCap(repoRoot) {
    try { return parse(readFileSync(join(repoRoot, MANIFEST_REL), 'utf8')).orca?.seam_cap; } catch { return undefined; }
}

// Every regular file under root, as sorted slash-separated relative paths; skip(name) prunes a directory.
function listFiles(root, skip = () => false) {
    const out = [];
    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        let entries;
        try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const p = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { if (!skip(e.name)) stack.push(p); } else if (e.isFile()) out.push(p);
        }
    }
    return out.sort();
}

const markersIn = (text) => new Set([...text.matchAll(MARKER)].map((m) => m[1]));
const kindOf = (p) => (p.match(/\.[A-Za-z0-9]+$/) ?? [''])[0];
export const seamId = (row) => row.patch.slice('patches/'.length, -'.patch'.length);

// owner/repo of the Orca remote, from fetch-orca.sh's REMOTE= line (https://github.com/<owner>/<repo>[.git]).
export function remoteRepo(repoRoot = REPO_ROOT) {
    const m = readRemote(repoRoot).match(/^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/);
    if (!m) throw new Error('the REMOTE= line of scripts/fetch-orca.sh is not https://github.com/<owner>/<repo>[.git]');
    return { owner: m[1], repo: m[2] };
}

// --upstream-prs: the PR classes with no row carrying a non-null pr.
export function missingPrClasses(rows) {
    return PR_CLASSES.filter((c) => !rows.some((r) => r?.upstream?.class === c && r.upstream.pr !== null && r.upstream.pr !== undefined));
}

// The overlay files the build scripts name, derived from scripts/build-orca*.sh: a Vite config at the Orca root,
// the CSS scoping pass, or a path under src/renderer/src/pb/. Each must be a file of orca-overlay/files/.
const NAMED_OVERLAY = /(?<![A-Za-z0-9._-])(vite\.pb-[a-z-]+\.config\.ts|pb-css-scope\.mjs|src\/renderer\/src\/pb\/[A-Za-z0-9._/-]+\.(?:tsx?|mjs))(?![A-Za-z0-9._-])/g;
export function namedOverlayFiles(repoRoot) {
    const dir = join(repoRoot, 'scripts');
    const out = new Set();
    let names = [];
    try { names = readdirSync(dir).filter((f) => /^build-orca[A-Za-z0-9-]*\.sh$/.test(f)); } catch { /* none */ }
    for (const f of names) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(NAMED_OVERLAY)) out.add(m[1]);
    return [...out].sort();
}

function lastLine(r) {
    return `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => l.includes('FAIL')) ?? `exit ${r.status}`;
}

export function check({ repoRoot = REPO_ROOT, overlayDir = join(repoRoot, 'orca-overlay'), orcaDir = join(repoRoot, 'orca'), cap } = {}) {
    const fails = [];
    const notes = [];
    const skips = [];
    const seamsFile = join(overlayDir, 'seams.json');
    const patchesDir = join(overlayDir, 'patches');

    // a. seams.json, in the shape lane p62-02 also reads. An absent file is red: an overlay that vanished is not
    // "zero seams" (harness-static-structure-06).
    let rows = [];
    if (!existsSync(seamsFile)) {
        fails.push('orca-overlay/seams.json is absent (an overlay that vanished is not zero seams; restore it from git)');
    } else {
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
    let repo = null;
    try { repo = remoteRepo(repoRoot); } catch (err) { fails.push(err.message); }
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
        const u = r.upstream;
        if (!u || typeof u !== 'object' || Array.isArray(u) || Object.keys(u).sort().join() !== 'class,pr') return bad(`upstream of ${r.path} is not an object with exactly class and pr`);
        if (!UPSTREAM_CLASSES.includes(u.class)) return bad(`upstream class '${u.class}' of ${r.path} is not one of ${UPSTREAM_CLASSES.join(', ')} (D-27, D-31, D-45)`);
        if (u.pr !== null) {
            const m = typeof u.pr === 'string' && u.pr.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/[0-9]+$/);
            if (!m) return bad(`upstream pr of ${r.path} is not null or a pull URL https://github.com/<owner>/<repo>/pull/<n>: ${u.pr}`);
            if (repo && (m[1] !== repo.owner || m[2] !== repo.repo)) return bad(`upstream pr of ${r.path} is on ${m[1]}/${m[2]}, not on the Orca remote ${repo.owner}/${repo.repo} (scripts/fetch-orca.sh REMOTE)`);
        }
        return true;
    });

    // Upstream-only material: one directory per seam id, never copied into a build.
    const upstreamDir = join(overlayDir, 'upstream');
    if (existsSync(upstreamDir)) {
        const ids = new Set(rows.map(seamId));
        for (const e of readdirSync(upstreamDir, { withFileTypes: true })) {
            if (!e.isDirectory() || !ids.has(e.name)) { fails.push(`upstream material for unknown seam ${e.name} (orca-overlay/upstream/ holds one directory per seam id: ${[...ids].join(', ') || 'none'})`); continue; }
            const doc = join(upstreamDir, e.name, 'upstream.json');
            if (!existsSync(doc)) continue;
            let d;
            try { d = JSON.parse(readFileSync(doc, 'utf8')); } catch (err) { fails.push(`upstream/${e.name}/upstream.json does not parse: ${err.message}`); continue; }
            if (!d || typeof d !== 'object' || Object.keys(d).sort().join() !== UPSTREAM_DOC_KEYS.join() || !UPSTREAM_DOC_KEYS.every((k) => typeof d[k] === 'string' && d[k].trim())) {
                fails.push(`upstream/${e.name}/upstream.json is not an object with exactly the non-empty string keys ${UPSTREAM_DOC_KEYS.join(', ')}`);
            }
        }
    }

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

    // g. the cap: one manifest value, passed in so the self-test can give a fixture's.
    if (!Number.isInteger(cap) || cap < 1) {
        fails.push(`${MANIFEST_REL} [orca] seam_cap is absent or not a whole number of at least 1 (the seam-count cap, D-16)`);
    } else if (rows.length > cap) {
        fails.push(`${rows.length} seams over the cap of ${cap} (${MANIFEST_REL} [orca] seam_cap, D-16)`);
    }

    // f. PB-added files, tracked half: path, kind and marker literal.
    const filesDir = join(overlayDir, 'files');
    const files = listFiles(filesDir);
    for (const need of namedOverlayFiles(repoRoot)) {
        if (!files.includes(need)) fails.push(`overlay file ${need} is named by scripts/build-orca*.sh but is not a file of orca-overlay/files/ (the overlay lost it; restore it from git)`);
    }
    const owned = {};
    for (const p of files) {
        if (!validPath(p)) { fails.push(`overlay file path '${p}' is not a plain relative path`); continue; }
        if (!SOURCE_KINDS.has(kindOf(p))) fails.push(`unclassified overlay file kind ${p} (the gate knows ${[...SOURCE_KINDS].join(' ')}; teach it the kind before adding one)`);
        owned[p] = markersIn(readFileSync(join(filesDir, p), 'utf8'));
        if (!owned[p].has(p)) fails.push(`missing marker literal pb-overlay:${p} in files/${p} (P62-20)`);
    }
    for (const [p, found] of Object.entries(owned)) {
        for (const q of found) if (q !== p && q in owned) fails.push(`files/${p} carries pb-overlay:${q}, a marker owned by ${q}`);
    }

    // b. steps that need the fetched tree.
    if (!isGitTop(orcaDir)) {
        skips.push('orca/ is not a fetched git checkout, so the pinned-blob, half-file, replay, shadowing and recorded-pin steps did not run. Next step: bash scripts/fetch-orca.sh');
    } else {
        // e. shadowing: a PB-added file never takes an upstream path, on any file system.
        if (files.length) {
            const upFiles = new Set(git(orcaDir, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean));
            const upDirs = new Set();
            for (const f of upFiles) for (let d = dirname(f); d !== '.'; d = dirname(d)) upDirs.add(d);
            const lower = new Map([...upFiles, ...upDirs].map((u) => [u.toLowerCase(), u]));
            for (const p of files) {
                if (upFiles.has(p)) { fails.push(`overlay file shadows upstream path ${p}`); continue; }
                if (upDirs.has(p)) fails.push(`overlay file files/${p} equals upstream directory ${p}`);
                const parts = p.split('/');
                for (let n = 1; n <= parts.length; n++) {
                    const pre = parts.slice(0, n).join('/');
                    if (n < parts.length && upFiles.has(pre)) fails.push(`overlay file files/${p} is under upstream file ${pre}`);
                    const twin = lower.get(pre.toLowerCase());
                    if (twin && twin !== pre) { fails.push(`case-only collision: files/${p} against upstream ${twin}`); break; }
                }
            }
        }
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
                fgit(replay, 'init', '-q');
                for (const [p, body] of Object.entries(content)) { mkdirSync(dirname(join(replay, p)), { recursive: true }); writeFileSync(join(replay, p), body); }
                fgit(replay, 'add', '-A');
                fgit(replay, '-c', 'user.name=replay', '-c', 'user.email=replay@invalid', 'commit', '-q', '--allow-empty', '-m', 'pinned content of the declared seam paths');
                const ap = spawnSync('bash', [APPLY, '--upstream', replay, '--patches', patchesDir], { encoding: 'utf8', env: fixtureGitEnv() });
                if (ap.status !== 0) {
                    fails.push(`hermetic replay: apply-patches.sh did not apply the overlay onto the pinned content: ${lastLine(ap)}`);
                } else {
                    const ck = spawnSync('bash', [REGENERATE, '--check', '--upstream', replay, '--patches', patchesDir], { encoding: 'utf8', env: fixtureGitEnv() });
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
    return { skip: null, fails, notes, skips, counts: { seams: rows.length, files: files.length }, seams };
}

// --built (criterion 5): each PB-added source file's marker literal is in a .js file that build:web or
// build:orcad wrote. node_modules never counts: a marker there was installed, not compiled.
export function checkBuilt({ repoRoot = REPO_ROOT, overlayDir = join(repoRoot, 'orca-overlay'), orcaDir = join(repoRoot, 'orca') } = {}) {
    const outs = ['out/web', 'out/orcad'].filter((d) => existsSync(join(orcaDir, d)));
    if (!outs.length) return { skip: 'no built orca/ (out/web and out/orcad are both absent; run nix develop .#orca --command bash scripts/build-orca.sh)', fails: [], notes: [] };
    const files = listFiles(join(overlayDir, 'files'));
    const fails = [];
    if (!files.length && namedOverlayFiles(repoRoot).length) fails.push('orca-overlay/files/ is empty but scripts/build-orca*.sh name overlay files to build (the overlay lost its files; restore them from git)');
    if (files.length) {
        const compiled = new Set();
        for (const d of outs) {
            for (const f of listFiles(join(orcaDir, d), (name) => name === 'node_modules')) {
                if (f.endsWith('.js')) for (const m of markersIn(readFileSync(join(orcaDir, d, f), 'utf8'))) compiled.add(m);
            }
        }
        for (const p of files) if (!compiled.has(p)) fails.push(`not compiled by build:web or build:orcad: ${p} (pb-overlay:${p} is in no .js file under ${outs.join(' or ')})`);
    }
    return { skip: null, fails, notes: [], files: files.length, outs };
}

// SKIP is exit 77 with the one SKIP line (SKIP-PROTOCOL.md); a failure wins over a skip.
function render(r) {
    if (r.fails.length) return { code: 1, lines: [...r.notes, ...r.fails.map((f) => `${NAME}: FAIL -- ${f}`)] };
    if (r.skips.length) return { code: SKIP_EXIT, lines: [...r.notes, skipLine(NAME, r.skips.join('; '))] };
    const c = r.counts;
    return { code: 0, lines: [...r.notes, `${NAME}: PASS -- ${c.seams} seam(s)${r.seams.length ? ` (${r.seams.join('; ')})` : ''}, ${c.files} overlay file(s)`] };
}

function renderBuilt(r) {
    const name = `${NAME}-built`;
    if (r.fails.length) return { code: 1, lines: r.fails.map((f) => `${name}: FAIL -- ${f}`) };
    if (r.skip) return { code: SKIP_EXIT, lines: [skipLine(name, r.skip)] };
    return {
        code: 0,
        lines: [r.files
            ? `${name}: PASS -- ${r.files} overlay file(s), each with its marker literal in a .js file under ${r.outs.join(' or ')}`
            : `${name}: PASS -- 0 overlay file(s), and none named by scripts/build-orca*.sh`],
    };
}

// Hermetic: a fixture "orca" git repo, a fixture overlay whose patches come from the real
// regenerate-patches.sh write mode (seed header, then regenerate), a fixture manifest cap and a fixture
// out/ tree. Every state is written from a spec object, so undoing a plant is writing the base again.
function runSelfTest() {
    // Every fixture commit runs under a global git config that fails signing and hooks (harness-static-structure-11).
    return withHostileGitConfig(runSelfTestBody);
}

function runSelfTestBody() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const orca = join(tmp, 'orca');
    const overlay = join(tmp, 'orca-overlay');
    const put = (root, rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
    const lines = (n, f) => `${Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')}\n`;
    try {
        const A = lines(60, (i) => `export const line${i} = ${i}`);
        const TINY = lines(6, (i) => `export const tiny${i} = ${i}`);
        mkdirSync(orca, { recursive: true });
        fgit(orca, 'init', '-q');
        put(orca, 'src/a.ts', A);
        put(orca, 'src/tiny.ts', TINY);
        put(orca, 'src/dir/x.ts', 'export const x = 1\n');
        put(orca, 'src/.fixture-file.ts', 'export const y = 1\n');
        fgit(orca, 'add', '-A');
        fgit(orca, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-q', '-m', 'fixture');
        const blob = (p) => fgit(orca, 'rev-parse', `HEAD:${p}`).trim();

        // A patch is never typed: edit the fixture tree, seed the header, regenerate, read the bytes back.
        let gen = 0;
        const makePatch = (edits) => {
            const dir = join(tmp, `gen-${gen++}`);
            for (const [p, body] of Object.entries(edits)) { if (body === null) rmSync(join(orca, p)); else put(orca, p, body); }
            fgit(orca, 'add', '-A');
            put(dir, 'x.patch', Object.keys(edits).map((p) => `diff --git a/${p} b/${p}\n`).join(''));
            const r = spawnSync('bash', [REGENERATE, '--upstream', orca, '--patches', dir], { encoding: 'utf8', env: fixtureGitEnv() });
            if (r.status !== 0 || !r.stdout.includes('rewrote x.patch')) throw new Error(`fixture patch was not regenerated: ${lastLine(r)}`);
            fgit(orca, 'reset', '-q', '--hard');
            return readFileSync(join(dir, 'x.patch'), 'utf8');
        };
        const insert = (n) => A.replace('export const line11 ', `${lines(n, (i) => `// .fixture seam line ${i}`)}export const line11 `);
        const TINY1 = TINY.replace('tiny3 = 3', 'tiny3 = 30');
        const P = {
            a3: makePatch({ 'src/a.ts': insert(3) }),
            a40: makePatch({ 'src/a.ts': insert(40) }),
            tiny1: makePatch({ 'src/tiny.ts': TINY1 }),
            tinyRewrite: makePatch({ 'src/tiny.ts': lines(6, (i) => `export const rewritten${i} = ${i}`) }),
            tinyDelete: makePatch({ 'src/tiny.ts': null }),
            newFile: makePatch({ 'src/.fixture-new.ts': 'export const z = 1\n' }),
            aAndTiny: makePatch({ 'src/a.ts': insert(3), 'src/tiny.ts': TINY1 }),
        };

        const ADDED = 'src/pb/.fixture-added.ts';
        const OTHER = 'src/pb/.fixture-other.ts';
        const src = (p) => `export const id = 'pb-overlay:${p}'\n`;
        const up = (cls) => ({ class: cls, pr: null });
        const rowA = { path: 'src/a.ts', upstream_blob: blob('src/a.ts'), patch: 'patches/010-a.patch', reason: 'fixture seam', upstream: up('browser-provider') };
        const rowTiny = { path: 'src/tiny.ts', upstream_blob: blob('src/tiny.ts'), patch: 'patches/020-tiny.patch', reason: 'fixture seam', upstream: up('pb-only') };
        const PR = (n) => `https://github.com/fixture-owner/fixture-repo/pull/${n}`;
        const DOC = `${JSON.stringify({ title: 't', problem: 'p', change: 'c', testing: 'x' })}\n`;
        const base = () => ({
            cap: 10,
            seams: [structuredClone(rowA)],
            patches: { '010-a.patch': P.a3 },
            files: { [ADDED]: src(ADDED) },
            upstream: { '010-a/upstream.json': DOC, '010-a/src/a.test.ts': 'export {}\n' },
            out: { 'out/web/assets/.fixture-app.js': `const a="pb-overlay:${ADDED}";` },
        });
        const run = (spec, orcaDir = orca) => {
            for (const d of [overlay, join(orca, 'out'), join(tmp, MANIFEST_REL)]) rmSync(d, { recursive: true, force: true });
            mkdirSync(overlay, { recursive: true });
            if (spec.seams) put(overlay, 'seams.json', `${JSON.stringify({ seams: spec.seams }, null, 2)}\n`);
            for (const [f, body] of Object.entries(spec.patches)) put(overlay, `patches/${f}`, body);
            for (const [f, body] of Object.entries(spec.files)) put(overlay, `files/${f}`, body);
            for (const [f, body] of Object.entries(spec.upstream ?? {})) put(overlay, `upstream/${f}`, body);
            for (const [f, body] of Object.entries(spec.out)) put(orca, f, body);
            put(tmp, 'scripts/fetch-orca.sh', 'REMOTE="https://github.com/fixture-owner/fixture-repo.git"\n');
            rmSync(join(tmp, 'scripts', 'build-orca-fixture.sh'), { force: true });
            if (spec.buildScript) put(tmp, 'scripts/build-orca-fixture.sh', spec.buildScript);
            put(tmp, MANIFEST_REL, spec.cap === null ? '[other]\nkey = 1\n' : `[orca]\nseam_cap = ${spec.cap}\n`);
            const r = check({ repoRoot: tmp, overlayDir: overlay, orcaDir, cap: readCap(tmp) });
            const b = checkBuilt({ repoRoot: tmp, overlayDir: overlay, orcaDir });
            return { fails: [...r.fails, ...b.fails], notes: r.notes, skips: r.skips, skipBuilt: b.skip };
        };

        const controls = [
            ['zero seams, zero files', { ...base(), seams: [], patches: {}, files: {}, upstream: {}, out: { 'out/web/a.js': '1' } }],
            ['one 3-line seam', { ...base(), files: {} }],
            ['one overlay file, marker compiled into out/web only', { ...base(), seams: [], patches: {}, upstream: {} }],
            ['one seam and one overlay file and its upstream/ material (the base of every plant)', base()],
        ];
        for (const [name, spec] of controls) {
            const r = run(spec);
            if (r.fails.length || r.skipBuilt) { console.error(`${NAME} self-test: FAIL -- control '${name}' is not green: ${r.skipBuilt ?? r.fails.join(' | ')}`); return 1; }
            console.log(`${NAME} self-test: control green -- ${name}`);
        }
        const away = run(base(), join(tmp, 'absent'));
        if (away.fails.length || !away.skips.length || !away.skipBuilt) {
            console.error(`${NAME} self-test: FAIL -- with no orca/ the tracked rules did not stay green behind a SKIP verdict: ${away.fails.join(' | ')}`);
            return 1;
        }
        // The verdict of the main mode on that run is exit 77 with the one SKIP line, and a failure beside the skip stays 1.
        const verdict = render({ fails: [], notes: [], skips: away.skips, counts: { seams: 0, files: 0 }, seams: [] });
        const withFail = render({ fails: ['x'], notes: [], skips: away.skips, counts: { seams: 0, files: 0 }, seams: [] });
        if (verdict.code !== SKIP_EXIT || !verdict.lines.some((l) => l.startsWith(`${NAME}: SKIP -- `)) || withFail.code !== 1) {
            console.error(`${NAME} self-test: FAIL -- a skipped orca/ step did not render exit ${SKIP_EXIT} with a SKIP line (or a failure did not win): ${verdict.code}, ${withFail.code}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- no orca/: tracked rules pass, the orca/ steps and the built row SKIP (exit ${SKIP_EXIT}), a failure still wins`);

        const two = (s) => { s.seams.push(structuredClone(rowTiny)); s.patches['020-tiny.patch'] = P.tiny1; };
        const plants = [
            { name: 'full-rewrite-of-a-small-file', naming: 'whole-file replacement', apply: (s) => { s.seams = [structuredClone(rowTiny)]; s.patches = { '020-tiny.patch': P.tinyRewrite }; } },
            { name: 'deleted-file-patch', naming: 'deleted file mode', apply: (s) => { s.seams = [structuredClone(rowTiny)]; s.patches = { '020-tiny.patch': P.tinyDelete }; } },
            { name: 'new-file-patch', naming: 'new file mode', apply: (s) => { s.seams.push({ ...rowTiny, path: 'src/.fixture-new.ts' }); s.patches['020-tiny.patch'] = P.newFile; } },
            { name: 'patch-with-no-row', naming: 'patch with no seams.json row (undeclared seam): patches/020-tiny.patch', apply: (s) => { s.patches['020-tiny.patch'] = P.tiny1; } },
            { name: 'row-with-no-patch', naming: 'seams.json row whose patch is missing: patches/020-tiny.patch', apply: (s) => { s.seams.push(structuredClone(rowTiny)); } },
            { name: 'patch-touches-undeclared-path', naming: 'touches src/tiny.ts', apply: (s) => { s.patches['010-a.patch'] = P.aAndTiny; } },
            { name: 'two-seams-over-cap-1', naming: '2 seams over the cap of 1', apply: (s) => { two(s); s.cap = 1; } },
            { name: 'cap-key-absent', naming: '[orca] seam_cap is absent', apply: (s) => { s.cap = null; } },
            { name: 'recorded-blob-changed', naming: 'recorded upstream_blob', apply: (s) => { s.seams[0].upstream_blob = 'f'.repeat(40); } },
            { name: 'index-pre-image-edited', naming: 'pre-image does not match the pinned blob', apply: (s) => { s.patches['010-a.patch'] = P.a3.replace(/^index [0-9a-f]+\.\./m, 'index 0123456789..'); } },
            { name: 'seam-of-40-lines', naming: 'over the bound of 20', apply: (s) => { s.patches['010-a.patch'] = P.a40; } },
            { name: 'hunk-edited-after-regeneration', naming: 'regenerate-patches.sh --check is red', apply: (s) => { s.patches['010-a.patch'] = P.a3.replace('+// .fixture seam line 2', '+// .fixture seam line 2, typed by hand'); } },
            { name: 'seam-path-with-dotdot', naming: "path 'src/../src/a.ts' is not a plain relative path", apply: (s) => { s.seams[0].path = 'src/../src/a.ts'; } },
            { name: 'file-shadows-upstream-path', naming: 'shadows upstream path src/.fixture-file.ts', apply: (s) => { s.files['src/.fixture-file.ts'] = src('src/.fixture-file.ts'); } },
            { name: 'file-case-only-collision', naming: 'case-only collision', apply: (s) => { s.files['src/A.ts'] = src('src/A.ts'); } },
            { name: 'file-under-upstream-file', naming: 'is under upstream file src/a.ts', apply: (s) => { s.files['src/a.ts/inner.ts'] = src('src/a.ts/inner.ts'); } },
            { name: 'file-equals-upstream-directory', naming: 'equals upstream directory src/dir', apply: (s) => { s.files['src/dir'] = src('src/dir'); } },
            { name: 'file-missing-marker', naming: `missing marker literal pb-overlay:${ADDED}`, apply: (s) => { s.files[ADDED] = 'export const id = 1\n'; } },
            { name: 'marker-owned-by-another-file', naming: `marker owned by ${ADDED}`, apply: (s) => { s.files[OTHER] = src(OTHER) + src(ADDED); s.out['out/orcad/.fixture-b.js'] = `const b="pb-overlay:${OTHER}";`; } },
            { name: 'file-of-unclassified-kind', naming: 'unclassified overlay file kind src/pb/.fixture-style.css', apply: (s) => { s.files['src/pb/.fixture-style.css'] = '/* pb-overlay:src/pb/.fixture-style.css */\n'; } },
            { name: 'built-marker-absent', naming: `not compiled by build:web or build:orcad: ${ADDED}`, apply: (s) => { s.out = { 'out/web/assets/.fixture-app.js': 'const a=1;' }; } },
            { name: 'upstream-key-missing', naming: 'keys are not exactly patch, path, reason, upstream, upstream_blob', apply: (s) => { delete s.seams[0].upstream; } },
            { name: 'upstream-class-unknown', naming: "upstream class 'terminal-provider'", apply: (s) => { s.seams[0].upstream.class = 'terminal-provider'; } },
            { name: 'upstream-class-web-entry-ruled-out', naming: "upstream class 'web-entry'", apply: (s) => { s.seams[0].upstream.class = 'web-entry'; } },
            { name: 'upstream-pr-on-another-repository', naming: 'is on other-owner/fixture-repo, not on the Orca remote fixture-owner/fixture-repo', apply: (s) => { s.seams[0].upstream.pr = 'https://github.com/other-owner/fixture-repo/pull/1'; } },
            { name: 'upstream-pr-not-a-pull-url', naming: 'is not null or a pull URL', apply: (s) => { s.seams[0].upstream.pr = PR(1).replace('/pull/', '/issues/'); } },
            { name: 'upstream-dir-for-unknown-seam', naming: 'upstream material for unknown seam 099-gone', apply: (s) => { s.upstream['099-gone/upstream.json'] = DOC; } },
            { name: 'upstream-json-missing-key', naming: 'upstream/010-a/upstream.json is not an object with exactly', apply: (s) => { s.upstream['010-a/upstream.json'] = '{ "title": "t" }\n'; } },
            { name: 'seams-json-absent', naming: 'orca-overlay/seams.json is absent', apply: (s) => { s.seams = null; } },
            { name: 'overlay-vanished', naming: 'orca-overlay/seams.json is absent', apply: (s) => { s.seams = null; s.patches = {}; s.files = {}; s.upstream = {}; } },
            { name: 'overlay-file-named-by-build-script-lost', naming: 'overlay file vite.pb-lost.config.ts is named by scripts/build-orca*.sh', apply: (s) => { s.buildScript = 'cmp orca-overlay/files/vite.pb-lost.config.ts orca/vite.pb-lost.config.ts\n'; } },
            { name: 'overlay-files-emptied-while-build-scripts-name-them', naming: 'orca-overlay/files/ is empty but scripts/build-orca*.sh name overlay files', apply: (s) => { s.files = {}; s.out = { 'out/web/a.js': '1' }; s.buildScript = 'cp src/renderer/src/pb/pb-gone.tsx x\n'; } },
            { name: 'built-marker-only-in-node_modules', naming: `not compiled by build:web or build:orcad: ${ADDED}`, apply: (s) => { s.out = { 'out/web/node_modules/x/index.js': `const a="pb-overlay:${ADDED}";`, 'out/orcad/orcad.js': '1' }; } },
        ];
        let failures = 0;
        for (const p of plants) {
            const spec = base();
            p.apply(spec);
            const r = run(spec);
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!text.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
            } else {
                console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            }
            const after = run(base());
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant ${p.name} did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        // --upstream-prs: control with a PR on every row (and the rows still green), plant with browser-provider's PR missing.
        const both = base();
        two(both);
        both.seams[0].upstream.pr = PR(1);
        both.seams[1].upstream.pr = PR(2);
        const bothRun = run(both);
        const bothMissing = missingPrClasses(both.seams);
        if (bothRun.fails.length || bothMissing.length) {
            console.error(`${NAME} self-test: FAIL -- --upstream-prs control (a PR for ${PR_CLASSES.join(' and ')}) is not green: ${[...bothRun.fails, ...bothMissing].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- --upstream-prs with a PR on ${PR_CLASSES.join(' and ')}`);
        both.seams[0].upstream.pr = null;
        const one = missingPrClasses(both.seams);
        if (one.join() !== 'browser-provider') { console.error(`  FAIL upstream-prs-one-class-missing -> named '${one.join(', ')}', want browser-provider`); failures++; } else {
            console.log("  ok upstream-prs-one-class-missing -> red, naming 'browser-provider'");
        }
        const total = plants.length + 1;
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${total} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${total} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

function runUpstreamPrs() {
    const rows = JSON.parse(readFileSync(join(REPO_ROOT, 'orca-overlay', 'seams.json'), 'utf8')).seams;
    const missing = missingPrClasses(rows);
    if (!missing.length) { console.log(`${NAME}-upstream-prs: PASS -- ${PR_CLASSES.map((c) => `${c} ${rows.filter((r) => r.upstream?.class === c && r.upstream.pr).map((r) => r.upstream.pr).join(' ')}`).join('; ')}`); return 0; }
    for (const c of missing) console.error(`${NAME}-upstream-prs: FAIL -- class ${c} has no seams.json row with a non-null upstream pr`);
    console.error('  Next step: the owner opens the issue and PR (68-05 hand-off list) and records the URL in seams.json');
    return 1;
}

// The CLI runs only when this file is the entry point, so check() can be imported.
const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.filter((a) => a !== '--self-test' && a !== '--built' && a !== '--upstream-prs');
    if (unknown.length || args.length > 1) {
        console.error(`${NAME}: unknown argument ${unknown[0] ?? args[1]} (usage: node ${SELF_REL} [--built | --upstream-prs | --self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
        process.exit(2);
    }
    if (args[0] === '--self-test') process.exit(runSelfTest());
    if (args[0] === '--upstream-prs') process.exit(runUpstreamPrs());
    const { code, lines } = args[0] === '--built' ? renderBuilt(checkBuilt()) : render(check({ cap: readCap(REPO_ROOT) }));
    for (const l of lines) (code && l.includes('FAIL') ? console.error : console.log)(l);
    process.exit(code);
}
