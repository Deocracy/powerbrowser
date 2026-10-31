#!/usr/bin/env node
// scripts/verify-fix-gate.mjs
//
// The fix gate (Phase 52, FIX-07 and FIX-11; the FIX-02 regeneration half). A
// diff the fixer produced is rejected before it can reach a branch. The input is
// adversarial: every stage fails closed. Stages 1-4 read the diff as data. The real
// stages 5-8 then run scripts over the patched tree, which executes code the diff
// carries (see the shortcut below); the gate does not pretend otherwise.
//
// Stages, in order. A stage runs only when every earlier stage passed. Every
// rejection starts with its stage name in brackets and names the path it failed on.
//  1. path        The authoritative path set is git's own: `git apply --numstat -z` on
//                 the diff, forward and reversed (the reverse run lists a rename's
//                 source), and `--summary` for modes. The in-memory header parser must
//                 name exactly the same set or the diff is rejected. A path that is not
//                 valid UTF-8, holds a control or format character, is not NFC-normalised
//                 or is not a plain relative path is rejected; so is a symlink, a
//                 submodule, an executable, or a binary change. Each path is matched,
//                 case-insensitively, against the deny globs in .github/fix-gate-deny.json
//                 and against the files a scripts/verify-platform.sh quick registry row
//                 names (parsed from the CHECKS array at check time). An empty registry
//                 set is a rejection.
//  2. apply       Every hunk's body line counts agree with its @@ header. The real run
//                 applies the diff to a throwaway git worktree at --ref (the fixer's
//                 workspace is never used), then reads `git status --porcelain=v1 -z
//                 --untracked-files=all --ignored` there: the paths git changed must equal
//                 the pre-apply set, pass stage 1 again, and none may be git-ignored (an
//                 ignored file never reaches a PR but is read by the later stages).
//  3. regenerate-patches --check
//                 In memory: a changed existing patch must change its index line as a
//                 removed/added pair with a differing hash, or be a moved file (CR-01: a
//                 moved file is compared on +/- lines only, so a context-only change
//                 there is a NOTE). Real run, when git's path set holds a patches/ path:
//                 the diff's patches are replayed onto a fresh copy of upstream/ reset to
//                 --tag (scripts/apply-patches.sh), then scripts/regenerate-patches.sh
//                 --check runs over that replay. No upstream at --tag is a rejection.
//  4. non-vacuity A diff that changes no file body is rejected.
//  5. check-patch-surface
//                 No patch adds a target whose suffix is in the compiled set parsed
//                 from scripts/check-patch-surface.sh. The real run executes it.
//  6. scan-brand-residue
//                 No added line carries a brand-identifier token classified in
//                 inventory/brand-tokens.json, named by row index, never printed.
//                 The real run executes scan-brand-residue.mjs over the worktree.
//  7. diff-theia-core
//                 No path under theia/node_modules/@theia/. The real run executes
//                 diff-theia-core.sh --quick in the patched worktree; it needs yarn, so
//                 run the gate inside `nix develop .#theia` (a missing yarn is a verdict).
//  8. quick       The real run only: scripts/verify-platform.sh --quick in the worktree.
//
// Arguments: --diff=<file>, --ref=<ref of this repo to apply onto, default HEAD>,
// --tag=<Gecko tag the patches replay onto; needed only when the diff touches patches/>.
// Both are validated as plain ref names before git sees them.
//
// shortcut: stages 5-8 run fix-controlled code (the --quick rows import files from
// powerbrowser/ and theia/, and scripts/** is denied but not everything a row executes
// is under scripts/). They must run only in a job with no secrets, no write token and no
// network beyond fetch, on an ephemeral runner: the 52-04 fix-gate job. Upgrade when 52-04
// lands: the workflows row enforces that job shape, and an unshare -n / bwrap wrapper adds
// a second wall. The worktree holds copies (cp -a --reflink=auto) of upstream/,
// theia/node_modules and generated/, never links into this checkout.
// shortcut: path matching is case-insensitive, so a path that case-folds onto a deny
// match is rejected on any filesystem; the gate is still meant for Linux runners.
// shortcut: stages 1-7 in memory are proxies for the real scripts. The self-test drives
// the real path-set logic (git apply --numstat, git status) in a scratch repo, but not the
// worktree/upstream/--quick stages: runRealStages needs a full checkout and 50 minutes.
//
// The self-test writes only to a scratch repo under the OS temp dir. Each plant is a diff
// built in memory and passed through runChecks' overrides (and, for the apply-time plants,
// through applyAndCheck in the scratch repo). It proves that every deny entry (naming its
// own glob), a registry-named file, the FIX-11 floor, a hand-edited hunk, a junk index
// line, a vacuous diff, a compiled-file target, a brand token, a Theia core path, an
// ignored file, a .gitignore edit, a newline in a name, a non-ASCII patch name, a header
// with a non-a/b prefix, a symlink, an executable, and a rename away from a denied path
// each go red naming their stage and path, and that a docs-only change, a changed-index
// patch and a moved file with context-only changes (CR-01) stay green.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'fix-gate';
const SELF_REL = 'scripts/verify-fix-gate.mjs';
const DENY_REL = '.github/fix-gate-deny.json';
const PLATFORM_REL = 'scripts/verify-platform.sh';
const SURFACE_REL = 'scripts/check-patch-surface.sh';
const BRAND_REL = 'inventory/brand-tokens.json';
const BRAND_SCAN_REL = 'scripts/scan-brand-residue.mjs';
const REGEN_REL = 'scripts/regenerate-patches.sh';
const APPLY_REL = 'scripts/apply-patches.sh';
const THEIA_REL = 'scripts/diff-theia-core.sh';
const PATCH_PREFIX = 'patches/';
const THEIA_CORE_PREFIX = 'theia/node_modules/@theia/';
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const INDEX_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+/;
// The FIX-11 requirement text names these 13 entries; a hand-kept floor is legitimate here
// because it is requirement text, not a copy of the tree. The self-test requires each one.
const FIX11_FLOOR = ['.github/**', '.claude/**', 'CLAUDE.md', 'scripts/verify-platform.sh', 'patches/030-*', 'powerbrowser/packaging/mar/**', 'brand/mar-*.der', 'inventory/brand-tokens.json', 'powerbrowser/endpoint-allowlist.json', '.github/settings/actions-selected.json', 'quick-baseline.txt', 'toolchain-baseline.txt', 'flake.lock'];
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' };

// A plain ref name: no leading '-', no '..', no revision syntax. Refs reach git as argv.
function validRef(v) {
    return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v) && !v.includes('..') && !v.includes('//') && !v.endsWith('/') && !v.endsWith('.lock');
}

const args = process.argv.slice(2);
let diffArg = null;
let tagArg = null;
let refArg = null;
for (const a of args) {
    if (a === '--self-test') continue;
    if (a.startsWith('--diff=') && a.length > 7) { diffArg = a.slice(7); continue; }
    if (a.startsWith('--tag=') && a.length > 6) { tagArg = a.slice(6); continue; }
    if (a.startsWith('--ref=') && a.length > 6) { refArg = a.slice(6); continue; }
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    console.error(`  Next step: run: node ${SELF_REL} --diff=<fix.diff> [--ref=<ref>] [--tag=<gecko-tag>], or add --self-test to prove the gate discriminates.`);
    process.exit(2);
}
for (const [flag, v] of [['--tag', tagArg], ['--ref', refArg]]) {
    if (v !== null && !validRef(v)) {
        console.error(`${NAME}: FAIL -- ${flag} value ${JSON.stringify(v)} is not a plain ref name (letters, digits, '.', '_', '-', '/'; no leading '-', no '..').`);
        console.error(`  Next step: pass a plain ref, for example ${flag}=${flag === '--tag' ? 'FIREFOX_153_5_1esr_BUILD1' : 'main'}.`);
        process.exit(2);
    }
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

// Deny globs: `**` crosses slashes (and matches a newline: the `s` flag), `*` does not.
// Case-insensitive (IN-03): a path that case-folds onto a deny match is a match.
function globToRe(glob) {
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${glob.split('**').map(part => part.split('*').map(esc).join('[^/]*')).join('.*')}$`, 'is');
}

// The quick registry: every scripts/ file a row in the CHECKS array names.
// Parsed at check time, so an added or removed row widens or narrows the gate.
function registryFiles(platformText) {
    if (platformText === null) return null;
    const lines = platformText.split('\n');
    const open = lines.findIndex(l => /local -a CHECKS=\(/.test(l));
    if (open < 0) return null;
    const out = new Set();
    for (let i = open + 1; i < lines.length && lines[i].trim() !== ')'; i++) {
        for (const m of lines[i].matchAll(/\$REPO_ROOT\/(scripts\/[^\s"']+)/g)) out.add(m[1]);
    }
    return out;
}

function surfaceSuffixes(text) {
    const m = text?.match(/COMPILED_SUFFIXES=\(([^)]*)\)/);
    return m ? m[1].trim().split(/\s+/).filter(Boolean) : null;
}

// Residue tokens are the brand-identifier rows whose token is a plain word. The
// row index names the token in output, so the gate never prints the token.
function brandTokens(inventoryText) {
    const doc = JSON.parse(inventoryText);
    return (doc.tokens ?? [])
        .map((r, idx) => ({ idx, token: r.token, cls: r.class }))
        .filter(r => r.cls === 'brand-identifier' && typeof r.token === 'string' && /^[A-Za-z][A-Za-z0-9_]{4,}$/.test(r.token));
}

// Unified diff to { files, touched, errors }. A file's `changes` holds its
// +/- body lines with the prefix kept. Hunk counts are checked as they are read.
function parseDiff(text) {
    const files = [];
    const touched = new Set();
    const errors = [];
    let cur = null;
    let oldLeft = 0;
    let newLeft = 0;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (oldLeft > 0 || newLeft > 0) {
            if (line.startsWith('\\')) continue;
            const tag = line[0];
            if (tag === '+') { newLeft -= 1; cur.changes.push(line); }
            else if (tag === '-') { oldLeft -= 1; cur.changes.push(line); }
            else if (tag === ' ' || line === '') { oldLeft -= 1; newLeft -= 1; }
            else {
                errors.push(`line ${i + 1} is not a hunk line, but the @@ header of ${cur.path} still expects lines`);
                oldLeft = 0; newLeft = 0;
                continue;
            }
            if (oldLeft < 0 || newLeft < 0) {
                errors.push(`line ${i + 1} overruns the @@ header of ${cur.path}`);
                oldLeft = 0; newLeft = 0;
            }
            continue;
        }
        let m;
        if ((m = line.match(/^diff --git a\/(.+) b\/(.+)$/))) {
            cur = { path: m[2], renamed: false, isNew: false, changes: [] };
            files.push(cur);
            touched.add(m[1]); touched.add(m[2]);
        } else if ((m = line.match(/^rename (?:from|to) (.+)$/))) {
            touched.add(m[1]);
            if (cur) cur.renamed = true;
        } else if (/^new file mode /.test(line)) {
            if (cur) cur.isNew = true;
        } else if ((m = line.match(/^--- a\/(.+)$/))) {
            touched.add(m[1]);
        } else if ((m = line.match(/^\+\+\+ b\/(.+)$/))) {
            touched.add(m[1]);
            if (!cur || cur.path !== m[1]) { cur = { path: m[1], renamed: false, isNew: false, changes: [] }; files.push(cur); }
        } else if ((m = HUNK.exec(line))) {
            if (!cur) { errors.push(`line ${i + 1} is a hunk header with no file header above it`); continue; }
            oldLeft = m[1] === undefined ? 1 : Number(m[1]);
            newLeft = m[2] === undefined ? 1 : Number(m[2]);
        }
    }
    if (oldLeft > 0 || newLeft > 0) errors.push(`the diff ends inside a hunk of ${cur?.path ?? '(none)'}`);
    return { files, touched: [...touched].sort(), errors };
}

// git, with the user's and system's config off. Output is left as Buffers.
function git(argv, cwd, input) {
    return spawnSync('git', argv, { cwd, env: GIT_ENV, input, maxBuffer: 256 * 1024 * 1024 });
}
const tailOf = (r) => (r.stderr?.toString() || r.stdout?.toString() || '').trim().split('\n').slice(-2).join(' / ') || 'no output';
const splitNul = (buf) => {
    const out = [];
    let at = 0;
    for (let i = buf.indexOf(0); i >= 0; at = i + 1, i = buf.indexOf(0, at)) out.push(buf.subarray(at, i));
    if (at < buf.length) out.push(buf.subarray(at));
    return out;
};

// A raw path from git to { s, bad }: strict UTF-8, no control/format/private/unassigned
// character, NFC, and a plain relative path (CR-03). JSON.stringify shows it safely.
function decodePath(raw) {
    let s;
    try {
        s = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
        return { s: raw.toString('latin1'), bad: 'is not valid UTF-8' };
    }
    if (/[\p{C}\p{Zl}\p{Zp}]/u.test(s)) return { s, bad: 'contains a control or format character' };
    if (s !== s.normalize('NFC')) return { s, bad: 'is not NFC-normalised' };
    if (s === '' || s.startsWith('/') || s.split('/').some(c => c === '' || c === '.' || c === '..')) return { s, bad: 'is not a plain relative path' };
    return { s, bad: null };
}

// Mode problems from the diff's header lines and from `git apply --summary`.
function modeProblems(text, summary) {
    const out = new Set();
    const note = (line, mode, becomes) => {
        const shown = JSON.stringify(line.trim());
        if (mode === '120000') out.add(`a symlink (${shown})`);
        else if (mode === '160000') out.add(`a submodule (${shown})`);
        else if (becomes && (parseInt(mode, 8) & 0o111) !== 0) out.add(`an executable file (${shown})`);
    };
    for (const l of text.split('\n')) {
        let m;
        if ((m = l.match(/^(old mode|new mode|new file mode|deleted file mode) (\d+)/))) note(l, m[2], m[1] === 'new mode' || m[1] === 'new file mode');
        else if ((m = l.match(/^index \S+ (\d+)/))) note(l, m[2], false);
    }
    for (const l of summary.split('\n')) {
        let m;
        if ((m = l.match(/^ (create|delete) mode (\d+) /))) note(l, m[2], m[1] === 'create');
        else if ((m = l.match(/^ mode change (\d+) => (\d+) /))) { note(l, m[1], false); note(l, m[2], true); }
    }
    return [...out];
}

// git's own reading of a diff: { paths:Set, problems:[], error }. No tree access: the
// numstat and summary runs only parse. The reverse run adds a rename's or copy's source.
function gitInfo(buf, cwd) {
    const out = { paths: new Set(), problems: new Set(), error: null };
    const runs = [git(['apply', '--numstat', '-z'], cwd, buf), git(['apply', '-R', '--numstat', '-z'], cwd, buf), git(['apply', '--summary'], cwd, buf)];
    for (const r of runs) {
        if (r.status !== 0) {
            out.error = tailOf(r);
            return out;
        }
    }
    for (const r of runs.slice(0, 2)) {
        for (const rec of splitNul(r.stdout)) {
            const i1 = rec.indexOf(9);
            const i2 = i1 < 0 ? -1 : rec.indexOf(9, i1 + 1);
            if (i2 < 0) { out.problems.add(`git printed a numstat record this gate cannot read (${JSON.stringify(rec.toString('latin1'))})`); continue; }
            const { s, bad } = decodePath(rec.subarray(i2 + 1));
            out.paths.add(s);
            if (bad) out.problems.add(`${JSON.stringify(s)} ${bad}`);
            if (rec.subarray(0, i2).toString() === '-\t-') out.problems.add(`${JSON.stringify(s)} is a binary change, which a fix may not carry`);
        }
    }
    for (const m of modeProblems(buf.toString('utf8'), runs[2].stdout.toString('utf8'))) out.problems.add(`the diff creates or changes ${m}, which a fix may not carry`);
    return out;
}

const touchesPatches = (paths) => [...paths].some(p => p.toLowerCase().startsWith(PATCH_PREFIX));

// Stage 1 over a path set: the deny globs (every matching entry is named), then the registry-named files.
function pathFailures(paths, deny, registry) {
    const out = [];
    const denyRes = deny.map(g => [g, globToRe(g)]);
    const reg = new Set([...registry].map(p => p.toLowerCase()));
    for (const p of paths) {
        const hits = denyRes.filter(([, re]) => re.test(p)).map(([g]) => `'${g}'`);
        const shown = JSON.stringify(p);
        if (hits.length > 0) out.push(`[path] ${shown} matches the deny ${hits.length > 1 ? 'entries' : 'entry'} ${hits.join(', ')} in ${DENY_REL} (case-insensitively), which the fixer may not change. Next step: drop that change from the fix; deny entries change only by a human owner.`);
        else if (reg.has(p.toLowerCase())) out.push(`[path] ${shown} is named by a scripts/verify-platform.sh registry row, which the fixer may not change. Next step: drop that change from the fix; gate and row files change only by a human owner.`);
    }
    return out;
}

function loadPolicy(read) {
    let deny = null;
    try { deny = JSON.parse(read(DENY_REL)).paths; } catch { /* named by the caller */ }
    return { deny: Array.isArray(deny) ? deny : null, registry: registryFiles(read(PLATFORM_REL)) };
}

// The in-memory stages. Real stages run only in the CLI path, after these pass.
function runChecks(root, overrides = {}) {
    const failures = [];
    const notes = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const fail = (stage, msg) => failures.push(`[${stage}] ${msg}`);
    const done = (extra = {}) => ({ failures, notes, touched: [], changed: 0, ...extra });

    const policy = loadPolicy(read);
    const deny = overrides.deny ?? policy.deny;
    if (!Array.isArray(deny)) {
        fail('path', `${DENY_REL} could not be read or parsed, so no path can be checked against the deny list. Next step: restore the file.`);
        return done();
    }
    const registry = policy.registry;
    if (registry === null) {
        fail('path', `${PLATFORM_REL} has no quick CHECKS array, so the registry-named files are unknown. Next step: restore the registry.`);
        return done();
    }
    if (registry.size === 0) {
        fail('path', `the quick CHECKS array in ${PLATFORM_REL} names no scripts/ file, so the registry-derived half of the deny list would be empty. Next step: restore the registry rows; the gate does not run on an empty set.`);
        return done();
    }
    const diffBuf = Buffer.isBuffer(overrides.diff) ? overrides.diff : (typeof overrides.diff === 'string' ? Buffer.from(overrides.diff) : null);
    if (diffBuf === null || diffBuf.toString('utf8').trim() === '') {
        fail('non-vacuity', `no diff was supplied, so there is nothing to gate. Next step: pass --diff=<fix.diff>.`);
        return done();
    }

    const parsed = parseDiff(diffBuf.toString('utf8'));

    // 1. path: git's set is authoritative; the in-memory parser must agree with it.
    const info = overrides.gitInfo ?? gitInfo(diffBuf, root);
    if (info.error !== null) {
        fail('apply', `git cannot parse the diff (${info.error}). Next step: regenerate the diff with git diff against the target ref.`);
        return done();
    }
    const gitPaths = [...info.paths].sort();
    for (const p of info.problems) fail('path', `${p}. Next step: drop that change; a fix carries plain, tracked, non-executable text files only.`);
    const mem = new Set(parsed.touched);
    const onlyGit = gitPaths.filter(p => !mem.has(p));
    const onlyMem = parsed.touched.filter(p => !info.paths.has(p));
    if (onlyGit.length > 0 || onlyMem.length > 0) {
        fail('path', `the in-memory header parser and git disagree on the paths this diff names (only git: ${JSON.stringify(onlyGit.slice(0, 5))}; only the parser: ${JSON.stringify(onlyMem.slice(0, 5))}). A header the gate cannot read the way git does (a quoted name, a non-a/b prefix, odd spacing) is rejected. Next step: regenerate the diff with git diff, plain a/ and b/ paths.`);
    }
    failures.push(...pathFailures([...new Set([...gitPaths, ...parsed.touched])], deny, registry));
    if (failures.length > 0) return done({ touched: gitPaths });
    const touched = gitPaths;

    // 2. apply (structural, in memory)
    if (parsed.errors.length > 0) {
        for (const e of parsed.errors) fail('apply', `${e}. Next step: regenerate the diff with git diff against the target ref.`);
        return done({ touched });
    }

    // 3. regenerate-patches --check (structural, in memory)
    for (const f of parsed.files) {
        if (!f.path.toLowerCase().startsWith(PATCH_PREFIX) || f.changes.length === 0) continue;
        if (f.isNew) continue; // a new patch has no pre-image to compare; the real replay judges it
        if (!f.renamed) {
            // A changed index line must be a removed/added pair with a differing hash; one added
            // line that looks like an index line proves nothing (WR-05).
            const idx = (sign) => f.changes.filter(c => c[0] === sign && INDEX_LINE.test(c.slice(1))).map(c => c.slice(1).split(' ')[1]);
            const gone = idx('-');
            const came = idx('+');
            if (!(gone.length > 0 && gone.length === came.length && came.some(h => !gone.includes(h)))) {
                fail('regenerate-patches --check', `${f.path} changes its hunk body without a removed/added pair of index lines (the blob hash) that differ, which is a hand edit. Next step: regenerate the patch with scripts/regenerate-patches.sh --check; never text-edit a hunk.`);
            }
            continue;
        }
        const payload = f.changes.map(c => c.slice(1)).some(s => (s[0] === '+' || s[0] === '-') && !/^(\+\+\+|---) /.test(s));
        if (payload) fail('regenerate-patches --check', `${f.path} is a moved file and its +/- hunk lines changed without changing its index line, which is a hand edit. Next step: regenerate the patch with scripts/regenerate-patches.sh --check.`);
        else notes.push(`CR-01: ${f.path} is a moved file whose change is context-only; it is compared on +/- lines only, so a context-only edit is not caught here (regenerate and commit that patch with the pin bump).`);
    }
    if (failures.length > 0) return done({ touched });

    // 4. non-vacuity
    const changed = parsed.files.filter(f => f.changes.length > 0).length;
    if (changed === 0) {
        fail('non-vacuity', `the diff changes no file body (${touched.length} path(s) named, no +/- hunk line). An empty fix proves nothing. Next step: rerun the fixer; a fix must change at least one file.`);
        return done({ touched });
    }

    // 5. check-patch-surface
    const suffixes = surfaceSuffixes(read(SURFACE_REL));
    if (suffixes === null) {
        fail('check-patch-surface', `${SURFACE_REL} carries no COMPILED_SUFFIXES list, so the compiled-file test cannot run. Next step: restore the script.`);
        return done({ touched, changed });
    }
    for (const f of parsed.files) {
        if (!f.path.toLowerCase().startsWith(PATCH_PREFIX)) continue;
        for (const c of f.changes) {
            if (c[0] !== '+' || !c.slice(1).startsWith('+++ b/')) continue;
            const target = c.slice(7).trim();
            if (suffixes.some(s => target.endsWith(s)) || /(^|\/)Cargo\./.test(target)) {
                fail('check-patch-surface', `${f.path} adds the compiled-file target ${target}; the patch surface is config-only. Next step: drop that hunk from the patch.`);
                break;
            }
        }
    }
    if (failures.length > 0) return done({ touched, changed });

    // 6. scan-brand-residue
    const tokens = (() => { try { return brandTokens(read(BRAND_REL) ?? ''); } catch { return []; } })();
    if (tokens.length === 0) {
        fail('scan-brand-residue', `${BRAND_REL} yields no brand-identifier token, so the residue check is unproven. Next step: restore the inventory.`);
        return done({ touched, changed });
    }
    for (const f of parsed.files) {
        if (f.path === BRAND_REL) continue;
        const hit = f.changes.filter(c => c[0] === '+').map(c => tokens.find(t => c.includes(t.token))).find(Boolean);
        if (hit) fail('scan-brand-residue', `${f.path} adds a brand-identifier token classified in ${BRAND_REL} (row ${hit.idx}). Next step: use the target identifier, or drop the line.`);
    }
    if (failures.length > 0) return done({ touched, changed });

    // 7. diff-theia-core
    for (const p of touched) {
        if (p.startsWith(THEIA_CORE_PREFIX)) fail('diff-theia-core', `${p} is inside ${THEIA_CORE_PREFIX}, the Theia core boundary. Next step: consume @theia/* as an npm dependency; never edit core.`);
    }
    return done({ touched, changed });
}

// Apply the diff in `dir` (a clean git work tree), then read what git says changed there,
// ignored files included. `expected` is the set stage 1 took from git before the apply.
// Returns failures; an empty list means the applied change set equals the checked one.
function applyAndCheck(buf, dir, deny, registry, expected) {
    const tmp = mkdtempSync(join(tmpdir(), 'fix-gate-diff-'));
    try {
        const file = join(tmp, 'fix.diff');
        writeFileSync(file, buf);
        let r = git(['apply', '--whitespace=nowarn', file], dir);
        if (r.status !== 0) return [`[apply] the diff does not apply to the target tree (${tailOf(r)}). Next step: regenerate the diff against the target ref.`];
        r = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored'], dir);
        if (r.status !== 0) return [`[path] git status failed after the apply (${tailOf(r)}), so the applied paths are unchecked. Next step: rerun the gate in an intact checkout.`];
        const failures = [];
        const applied = new Set();
        const toks = splitNul(r.stdout);
        for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            const xy = t.subarray(0, 2).toString();
            const { s, bad } = decodePath(t.subarray(3));
            applied.add(s);
            if (bad) failures.push(`[path] applied path ${JSON.stringify(s)} ${bad}. Next step: drop that change.`);
            if (xy === '!!') failures.push(`[path] applied path ${JSON.stringify(s)} is git-ignored: it would be written to the tree but never reach a PR, and the later stages read it. Next step: drop that change.`);
            if (xy.includes('T')) failures.push(`[path] applied path ${JSON.stringify(s)} changes its file type. Next step: drop that change.`);
            if (xy[0] === 'R' || xy[0] === 'C') { const o = decodePath(toks[++i] ?? Buffer.alloc(0)); applied.add(o.s); }
        }
        failures.push(...pathFailures([...applied].sort(), deny, registry));
        const onlyApplied = [...applied].filter(p => !expected.has(p));
        const onlyExpected = [...expected].filter(p => !applied.has(p));
        if (onlyApplied.length > 0 || onlyExpected.length > 0) {
            failures.push(`[path] the paths git changed after the apply differ from the paths checked before it (only applied: ${JSON.stringify(onlyApplied.slice(0, 5))}; only checked: ${JSON.stringify(onlyExpected.slice(0, 5))}). Next step: regenerate the diff with git diff.`);
        }
        return failures;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

// The real stages: a throwaway worktree at --ref, the diff applied and re-checked, then the
// real scripts. Stage 8 (--quick) runs here and nowhere else. Stages 5-8 execute code from the
// patched tree: see the shortcut in the header.
function runRealStages(buf, ref, tag, paths, deny, registry) {
    const failures = [];
    const dir = mkdtempSync(join(tmpdir(), 'fix-gate-'));
    const wt = join(dir, 'tree');
    const run = (cmd, argv, cwd, timeout = 600000) =>
        spawnSync(cmd, argv, { cwd, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024 });
    try {
        let r = git(['worktree', 'add', '--detach', wt, ref], REPO_ROOT);
        if (r.status !== 0) {
            failures.push(`[apply] could not check out '${ref}' into a throwaway worktree (${tailOf(r)}). Next step: fetch the ref, or pass --ref=<ref of this repo>.`);
            return failures;
        }
        failures.push(...applyAndCheck(buf, wt, deny, registry, new Set(paths)));
        if (failures.length > 0) return failures;

        // Git-ignored, machine-local inputs the real stages read, copied (never linked) after the
        // apply and the status check above, so the diff cannot have written into them (WR-02).
        const bring = (rel) => {
            const src = join(REPO_ROOT, rel);
            const dst = join(wt, rel);
            if (!existsSync(src)) return null;
            if (lstatSync(dst, { throwIfNoEntry: false }) !== undefined) return `[apply] ${rel} already exists in the worktree after the diff applied, so the gate's own copy cannot be placed. Next step: drop the change under ${rel}.`;
            const c = run('cp', ['-a', '--reflink=auto', src, dst]);
            return c.status === 0 ? null : `[apply] could not copy ${rel} into the worktree (${tailOf(c)}). Next step: check free space, then rerun.`;
        };
        for (const rel of ['generated', 'upstream', 'theia/node_modules']) {
            const bad = bring(rel);
            if (bad !== null) { failures.push(bad); return failures; }
        }

        // 3 (real). A diff that touches patches/ (per git's set) is replayed onto a fresh upstream
        // at the Gecko tag, then regenerate-patches.sh --check compares the patches to the replay.
        if (touchesPatches(paths)) {
            const up = join(wt, 'upstream');
            const stage = '[regenerate-patches --check]';
            if (tag === null) {
                failures.push(`${stage} the diff touches ${PATCH_PREFIX} but no --tag was given, so the replay has no Gecko tag. Next step: pass --tag=<gecko-tag>.`);
            } else if (!existsSync(up)) {
                failures.push(`${stage} upstream/ is not fetched in this checkout, so the patches cannot be replayed at '${tag}' (fail closed). Next step: run scripts/fetch-upstream.sh for '${tag}', then rerun the gate.`);
            } else if ((r = git(['-C', up, 'rev-parse', '--verify', '-q', `${tag}^{commit}`], wt)).status !== 0) {
                failures.push(`${stage} upstream/ has no tag '${tag}', so the patches cannot be replayed there (fail closed; the gate does not fetch). Next step: fetch the tag into upstream/, then rerun the gate.`);
            } else if ((r = git(['-C', up, 'checkout', '--force', '--detach', tag], wt)).status !== 0 || (r = git(['-C', up, 'clean', '-fdxq'], wt)).status !== 0) {
                failures.push(`${stage} could not reset the upstream copy to '${tag}' (${tailOf(r)}). Next step: check the upstream/ checkout, then rerun the gate.`);
            } else if ((r = run('bash', [APPLY_REL], wt)).status !== 0) {
                failures.push(`${stage} the diff's patches do not replay onto '${tag}' (${tailOf(r)}). Next step: regenerate the patches with ${REGEN_REL} at that tag.`);
            } else {
                r = run('bash', [REGEN_REL, '--check', '--upstream', up, '--patches', join(wt, 'patches')], wt);
                if (r.status !== 0) failures.push(`${stage} ${REGEN_REL} --check rejected the replay at '${tag}' (${tailOf(r)}). Next step: regenerate the patch with ${REGEN_REL}; never text-edit a hunk.`);
            }
        }

        const steps = [
            ['check-patch-surface', 'bash', [SURFACE_REL], 600000],
            ['scan-brand-residue', 'node', [BRAND_SCAN_REL], 600000],
            ['diff-theia-core', 'bash', [THEIA_REL, '--quick'], 600000],
            ['verify-platform --quick', 'bash', [PLATFORM_REL, '--quick'], 3600000],
        ];
        for (const [label, cmd, argv, timeout] of steps) {
            if (failures.length > 0) break;
            if (label === 'diff-theia-core') {
                const y = run('yarn', ['--version'], wt, 60000);
                if (y.error || y.status !== 0) {
                    failures.push(`[diff-theia-core] yarn is not on PATH, so ${THEIA_REL} cannot run (fail closed). Next step: run the gate inside \`nix develop .#theia\`.`);
                    break;
                }
            }
            const rr = run(cmd, argv, wt, timeout);
            if (rr.status !== 0) failures.push(`[${label}] \`${cmd} ${argv.join(' ')}\` exited ${rr.status ?? 'without a status'} in the patched worktree (${tailOf(rr)}). Next step: run that command in a checkout of '${ref}' with the fix applied and fix the named cause.`);
        }
    } finally {
        git(['worktree', 'remove', '--force', wt], REPO_ROOT);
        git(['worktree', 'prune'], REPO_ROOT);
        rmSync(dir, { recursive: true, force: true });
    }
    return failures;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    if (diffArg === null) {
        console.error(`${NAME}: FAIL -- no fix diff was given`);
        console.error(`  Next step: run: node ${SELF_REL} --diff=<fix.diff> [--ref=<ref>] [--tag=<gecko-tag>].`);
        return 2;
    }
    let diff;
    try {
        diff = readFileSync(resolve(diffArg));
    } catch (e) {
        console.error(`${NAME}: FAIL -- the diff ${diffArg} could not be read (${e.code ?? e.message}).`);
        console.error(`  Next step: pass a readable unified diff with --diff=<path>.`);
        return 2;
    }
    const mem = runChecks(REPO_ROOT, { diff });
    let failures = mem.failures;
    if (failures.length === 0) {
        const { deny, registry } = loadPolicy((rel) => readText(REPO_ROOT, rel));
        failures = runRealStages(diff, refArg ?? 'HEAD', tagArg, mem.touched, deny, registry);
    }
    for (const n of mem.notes) console.log(`  note  ${n}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- verdict: reject; ${failures.length} problem(s) with the fix diff.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- verdict: pass; ${mem.touched.length} path(s) gated against ${refArg ?? "HEAD of the gate checkout (no --ref given)"}, ${mem.changed} file body(ies) changed, every stage green`);
    return 0;
}

// Diff text for one changed file. `changes` are +/- body lines with their prefix.
function diffOf(path, changes, { renamed = null, vacuous = false, created = false } = {}) {
    const from = renamed ?? path;
    if (vacuous) return `diff --git a/${path} b/${path}\nnew file mode 100644\n`;
    const head = [`diff --git a/${from} b/${path}`];
    if (renamed !== null) head.push('similarity index 90%', `rename from ${from}`, `rename to ${path}`);
    if (created) head.push('new file mode 100644');
    const old = created ? 0 : changes.filter(c => c[0] !== '+').length;
    const neu = changes.filter(c => c[0] !== '-').length;
    head.push(created ? '--- /dev/null' : `--- a/${from}`, `+++ b/${path}`, `@@ -${created ? 0 : 1},${old} +1,${neu} @@`, ...changes);
    return `${head.join('\n')}\n`;
}

// A scratch git repo that holds the real .gitignore, for the apply-time plants.
function scratchRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'fix-gate-scratch-'));
    mkdirSync(join(dir, 'docs'));
    copyFileSync(join(REPO_ROOT, '.gitignore'), join(dir, '.gitignore'));
    writeFileSync(join(dir, 'docs', 'seed.md'), 'seed\n');
    git(['init', '-q'], dir);
    git(['add', '.gitignore', 'docs/seed.md'], dir);
    git(['-c', 'user.name=fix-gate', '-c', 'user.email=fix-gate@invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'seed'], dir);
    return dir;
}

function selfTest() {
    const read = (rel) => readText(REPO_ROOT, rel);
    const { deny, registry } = loadPolicy(read);
    const tokens = (() => { try { return brandTokens(read(BRAND_REL) ?? ''); } catch { return []; } })();
    if (deny === null || deny.length === 0 || registry === null || tokens.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- the deny file, the registry or the brand inventory could not be read, so no plant would mean anything. Next step: restore ${DENY_REL}, ${PLATFORM_REL} or ${BRAND_REL}.`);
        return 1;
    }
    let failed = 0;
    const bad = (msg) => { console.error(`${NAME}: --self-test FAIL -- ${msg}`); failed += 1; };

    const scratch = scratchRepo();
    try {
        // The path logic end to end: runChecks (git's numstat), then, if green, applyAndCheck in the scratch repo.
        const gate = (diff, overrides = {}) => {
            const buf = Buffer.from(diff);
            const pre = runChecks(REPO_ROOT, { ...overrides, diff: buf });
            if (pre.failures.length > 0) return pre;
            const f = applyAndCheck(buf, scratch, deny, registry, new Set(pre.touched));
            git(['reset', '--hard', '-q'], scratch);
            git(['clean', '-fdxq'], scratch);
            return { ...pre, failures: f };
        };

        const control = gate(diffOf('docs/fix-gate-control.md', ['+one control line'], { created: true }));
        if (control.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
            control.failures.forEach(f => console.error(`  ${f}`));
            return 1;
        }
        console.log(`  ok  control: docs-only change -> green through path set, apply and git status`);

        // Floor: the FIX-11 entries are all present in the deny file (a deleted entry deletes its own plant).
        const missing = (d) => FIX11_FLOOR.filter(e => !d.includes(e));
        if (missing(deny).length > 0) bad(`the deny file lacks FIX-11 entr${missing(deny).length > 1 ? 'ies' : 'y'} ${JSON.stringify(missing(deny))}. Next step: restore ${DENY_REL}.`);
        else if (missing(deny.filter(e => e !== FIX11_FLOOR[12])).length !== 1) bad(`the FIX-11 floor check did not notice a deleted entry.`);
        else console.log(`  ok  floor: all ${FIX11_FLOOR.length} FIX-11 entries are in ${DENY_REL}, and a deleted entry is noticed`);

        // Sample path for a deny glob: the glob with its wildcards filled in.
        const sample = (g) => g.replace(/\/\*\*$/, '/planted.txt').replace(/\*/g, 'planted');
        const plants = [];
        for (const g of deny) {
            const p = sample(g);
            if (!globToRe(g).test(p)) { bad(`the sample path '${p}' does not match its deny entry '${g}', so the plant would test nothing.`); continue; }
            plants.push([`deny entry '${g}'`, () => runChecks(REPO_ROOT, { diff: diffOf(p, ['+planted line'], { created: true }) }), [p, `'${g}'`]]);
        }
        plants.push(['deny match by case (.GITHUB/)', () => runChecks(REPO_ROOT, { diff: diffOf('.GITHUB/planted.txt', ['+planted line'], { created: true }) }), ['.GITHUB/planted.txt', `'.github/**'`]]);
        plants.push(['rename away from a denied path', () => runChecks(REPO_ROOT, { diff: diffOf('docs/moved.yml', ['- a', '+ b'], { renamed: '.github/workflows/verify.yml' }) }), ['.github/workflows/verify.yml', `'.github/**'`]]);
        plants.push(['hand-edited patch hunk', () => runChecks(REPO_ROOT, { diff: diffOf('patches/020-planted.patch', ['-+old payload', '++new payload']) }), ['patches/020-planted.patch', 'regenerate-patches --check']]);
        plants.push(['hand edit with one junk added index line', () => runChecks(REPO_ROOT, { diff: diffOf('patches/024-planted.patch', ['-+old payload', '++new payload', '+index 1234567890..abcdef0123']) }), ['patches/024-planted.patch', 'regenerate-patches --check']]);
        plants.push(['vacuous diff (no file body changes)', () => runChecks(REPO_ROOT, { diff: diffOf('docs/fix-gate-vacuous.md', [], { vacuous: true }) }), ['[non-vacuity]']]);
        plants.push(['patch adds a compiled-file target', () => runChecks(REPO_ROOT, { diff: diffOf('patches/021-planted.patch', ['+index 1234567890..abcdef0123', '++++ b/powerbrowser/planted.cpp'], { created: true }) }), ['[check-patch-surface]', 'powerbrowser/planted.cpp']]);
        plants.push(['brand-identifier token added', () => runChecks(REPO_ROOT, { diff: diffOf('docs/fix-gate-brand.md', [`+text ${tokens[0].token}`], { created: true }) }), ['[scan-brand-residue]', 'docs/fix-gate-brand.md', `row ${tokens[0].idx}`]]);
        // theia/node_modules/** is denied, so stage 7's own proxy is reached only with that entry removed.
        plants.push(['Theia core path changed (deny entry removed to reach stage 7)', () => runChecks(REPO_ROOT, { deny: deny.filter(g => g !== 'theia/node_modules/**'), diff: diffOf('theia/node_modules/@theia/core/planted.json', ['+planted'], { created: true }) }), ['[diff-theia-core]', 'theia/node_modules/@theia/core/planted.json']]);

        // Path-set plants (CR-02, CR-03, CR-04): diffs as the reviewer planted them.
        const benign = diffOf('docs/ok.md', ['+x'], { created: true });
        const quoted = (q) => `diff --git "a/${q}" "b/${q}"\nnew file mode 100644\n--- /dev/null\n+++ "b/${q}"\n@@ -0,0 +1 @@\n+x\n`;
        plants.push(['ignored file planted (objdir/, passes every deny entry)', () => gate(diffOf('objdir/pwn.txt', ['+x'], { created: true })), ['objdir/pwn.txt', 'git-ignored']]);
        plants.push(['.gitignore edit that hides a workflow, plus a traditional-header file', () => gate(`diff --git a/.gitignore b/.gitignore\n--- a/.gitignore\n+++ b/.gitignore\n@@ -1,1 +1,2 @@\n+.github/workflows/evil.yml\n # Dependencies\n--- /dev/null\n+++ y/.github/workflows/evil.yml\n@@ -0,0 +1 @@\n+on: push\n`), ['.gitignore', `'.gitignore'`]]);
        plants.push(['newline in a path under .github/', () => runChecks(REPO_ROOT, { diff: benign + quoted('.github/evil\\nname.yml') }), ['control or format character', 'disagree']]);
        plants.push(['non-ASCII patch name (quoted header)', () => runChecks(REPO_ROOT, { diff: benign + quoted('patches/\\303\\251-x.patch') }), ['é-x.patch', 'disagree']]);
        plants.push(['header with a non-a/b prefix (traditional ---/+++ y/)', () => runChecks(REPO_ROOT, { diff: `${benign}--- /dev/null\n+++ y/docs/benign-y.md\n@@ -0,0 +1 @@\n+x\n` }), ['docs/benign-y.md', 'disagree']]);
        plants.push(['symlink created', () => runChecks(REPO_ROOT, { diff: `diff --git a/lnk b/lnk\nnew file mode 120000\n--- /dev/null\n+++ b/lnk\n@@ -0,0 +1 @@\n+/tmp/outside\n\\ No newline at end of file\n` }), ['symlink']]);
        plants.push(['executable created', () => runChecks(REPO_ROOT, { diff: diffOf('docs/run.sh', ['+x'], { created: true }).replace('100644', '100755') }), ['executable']]);
        plants.push(['empty registry set', () => runChecks(REPO_ROOT, { diff: benign, read: (rel) => (rel === PLATFORM_REL ? 'local -a CHECKS=(\n)\n' : read(rel)) }), ['names no scripts/ file']]);

        for (const [name, run, needles] of plants) {
            const { failures } = run();
            // Each needle must appear in some failure; the path and its own glob are in one line.
            if (needles.every(n => failures.some(f => f.includes(n)))) console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(' and ')}`);
            else bad(`'${name}' did not go red naming ${needles.join(' and ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
        }

        // Registry: every registry file is named by the registry rule alone, and is also covered by a deny entry.
        const regOnly = pathFailures([...registry], [], registry);
        if (registry.size === 0 || regOnly.length !== registry.size || !regOnly.every(f => f.includes('registry row'))) bad(`the registry rule alone did not reject all ${registry.size} registry-named file(s).`);
        const uncovered = [...registry].filter(p => !deny.some(g => globToRe(g).test(p)));
        if (uncovered.length > 0) bad(`registry-named file(s) ${JSON.stringify(uncovered.slice(0, 5))} are covered by no deny entry. Next step: add a deny entry that covers them.`);
        if (regOnly.length === registry.size && uncovered.length === 0) console.log(`  ok  registry: all ${registry.size} registry-named files rejected by the registry rule alone and covered by a deny entry`);

        // CR-04: the patches/ guard reads git's set, which holds the quoted non-ASCII name.
        const q = runChecks(REPO_ROOT, { diff: benign + quoted('patches/\\303\\251-x.patch') });
        if (touchesPatches(q.touched)) console.log(`  ok  patches guard: git's path set holds patches/é-x.patch, so the regenerate stage cannot be skipped`);
        else bad(`the patches/ guard did not see the quoted non-ASCII patch name in git's path set.`);
        for (const v of ['-x', '--upload-pack=x', 'a..b', 'a b', '', 'x.lock']) if (validRef(v)) bad(`validRef accepted ${JSON.stringify(v)}.`);
        for (const v of ['HEAD', 'main', 'FIREFOX_153_5_1esr_BUILD1', 'refs/tags/v1']) if (!validRef(v)) bad(`validRef refused ${JSON.stringify(v)}.`);

        const controls = [
            ['hand edit with a removed/added pair of index lines', diffOf('patches/024-planted.patch', ['-+old payload', '++new payload', '-index 1111111111..2222222222 100644', '+index 1111111111..abcdef0123 100644']), (r) => r.failures.length === 0],
            ['moved patch, context-only change (CR-01)', diffOf('patches/023-planted.patch', ['- context before', '+ context after'], { renamed: 'patches/022-planted.patch' }), (r) => r.failures.length === 0 && r.notes.some(n => n.includes('CR-01'))],
        ];
        for (const [name, diff, ok] of controls) {
            const r = runChecks(REPO_ROOT, { diff });
            if (ok(r)) {
                console.log(`  ok  control: ${name} -> green`);
                for (const n of r.notes) console.log(`  note  ${n}`);
            } else bad(`the control '${name}' did not stay green: ${r.failures.join(' | ') || '(no CR-01 note)'}`);
        }

        console.log(`  note  the real worktree, upstream replay and stage 8 (verify-platform --quick) run only in the real gate: this row is itself a --quick row, so the self-test does not re-enter it`);
        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their stage and path (${deny.length} deny entries, read from ${DENY_REL}), the floor and registry checks held, and ${controls.length + 1} controls stayed green`);
        return 0;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

process.exit(main());
