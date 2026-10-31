#!/usr/bin/env node
// scripts/verify-fix-gate.mjs
//
// The fix gate (Phase 52, FIX-07 and FIX-11; the FIX-02 regeneration half). A
// diff the fixer produced is rejected before it can reach a branch. The gate
// reads the diff as data and never runs anything the diff carries.
//
// Stages, in order. A stage runs only when every earlier stage passed. Every
// rejection starts with its stage name in brackets and names the path it failed on.
//  1. path        Each path in the diff (---, +++, diff --git, rename lines) is
//                 matched against the deny globs in .github/fix-gate-deny.json
//                 and against the files a scripts/verify-platform.sh quick
//                 registry row names (parsed from the CHECKS array at check time).
//  2. apply       Every hunk's body line counts agree with its @@ header. The real
//                 run also applies the diff to a throwaway git worktree at the
//                 target ref; the fixer's workspace is never used.
//  3. regenerate-patches --check
//                 A changed patch must change its index line (the blob hash), or
//                 be a moved file. CR-01: a moved file is compared on +/- lines
//                 only, so a context-only change there is a NOTE. The real run
//                 replays every patch with scripts/regenerate-patches.sh --check.
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
//                 diff-theia-core.sh --quick in this checkout.
//  8. quick       The real run only: scripts/verify-platform.sh --quick in the worktree.
//
// shortcut: stages 1-7 are in-memory proxies. The real run adds the real
// scripts; the proxies are the fast refusal and the self-test's fixture.
// shortcut: the real run takes upstream/ in this checkout to be at --tag
// (scripts/fetch-upstream.sh places it); the gate names a missing upstream, it does not fetch.
//
// The self-test writes nothing. Each plant is a diff built in memory and passed
// through runChecks' overrides. The self-test proves that every deny entry, a
// registry-named file, a hand-edited hunk, a vacuous diff, a compiled-file
// target, a brand token and a Theia core path each go red naming their stage and
// path, and that a docs-only change, a changed-index patch and a moved file with
// context-only changes (CR-01) stay green.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const THEIA_REL = 'scripts/diff-theia-core.sh';
const PATCH_PREFIX = 'patches/';
const THEIA_CORE_PREFIX = 'theia/node_modules/@theia/';
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const INDEX_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+/;

const args = process.argv.slice(2);
let diffArg = null;
let tagArg = null;
for (const a of args) {
    if (a === '--self-test') continue;
    if (a.startsWith('--diff=') && a.length > 7) { diffArg = a.slice(7); continue; }
    if (a.startsWith('--tag=') && a.length > 6) { tagArg = a.slice(6); continue; }
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    console.error(`  Next step: run: node ${SELF_REL} --diff=<fix.diff> --tag=<target-tag>, or add --self-test to prove the gate discriminates.`);
    process.exit(2);
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

// Deny globs: `**` crosses slashes, `*` does not.
function globToRe(glob) {
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${glob.split('**').map(part => part.split('*').map(esc).join('[^/]*')).join('.*')}$`);
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
            cur = { path: m[2], renamed: false, changes: [] };
            files.push(cur);
            touched.add(m[1]); touched.add(m[2]);
        } else if ((m = line.match(/^rename (?:from|to) (.+)$/))) {
            touched.add(m[1]);
            if (cur) cur.renamed = true;
        } else if ((m = line.match(/^--- a\/(.+)$/))) {
            touched.add(m[1]);
        } else if ((m = line.match(/^\+\+\+ b\/(.+)$/))) {
            touched.add(m[1]);
            if (!cur || cur.path !== m[1]) { cur = { path: m[1], renamed: false, changes: [] }; files.push(cur); }
        } else if ((m = HUNK.exec(line))) {
            if (!cur) { errors.push(`line ${i + 1} is a hunk header with no file header above it`); continue; }
            oldLeft = m[1] === undefined ? 1 : Number(m[1]);
            newLeft = m[2] === undefined ? 1 : Number(m[2]);
        }
    }
    if (oldLeft > 0 || newLeft > 0) errors.push(`the diff ends inside a hunk of ${cur?.path ?? '(none)'}`);
    return { files, touched: [...touched].sort(), errors };
}

// The in-memory stages. Real stages run only in the CLI path, after these pass.
function runChecks(root, overrides = {}) {
    const failures = [];
    const notes = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const fail = (stage, msg) => failures.push(`[${stage}] ${msg}`);
    const done = (extra = {}) => ({ failures, notes, touched: [], changed: 0, ...extra });

    let deny = overrides.deny;
    if (deny === undefined) {
        try { deny = JSON.parse(read(DENY_REL)).paths; } catch { deny = null; }
        if (!Array.isArray(deny)) {
            fail('path', `${DENY_REL} could not be read or parsed, so no path can be checked against the deny list. Next step: restore the file.`);
            return done();
        }
    }
    const registry = registryFiles(read(PLATFORM_REL));
    if (registry === null) {
        fail('path', `${PLATFORM_REL} has no quick CHECKS array, so the registry-named files are unknown. Next step: restore the registry.`);
        return done();
    }
    if (typeof overrides.diff !== 'string' || overrides.diff.trim() === '') {
        fail('non-vacuity', `no diff was supplied, so there is nothing to gate. Next step: pass --diff=<fix.diff>.`);
        return done();
    }

    const parsed = parseDiff(overrides.diff);
    const touched = parsed.touched;

    // 1. path
    const denyRes = deny.map(g => [g, globToRe(g)]);
    for (const p of touched) {
        const hit = denyRes.find(([, re]) => re.test(p));
        if (hit) fail('path', `${p} matches the deny entry '${hit[0]}' in ${DENY_REL}, which the fixer may not change. Next step: drop that change from the fix; deny entries change only by a human owner.`);
        else if (registry.has(p)) fail('path', `${p} is named by a scripts/verify-platform.sh registry row, which the fixer may not change. Next step: drop that change from the fix; gate and row files change only by a human owner.`);
    }
    if (failures.length > 0) return done({ touched });

    // 2. apply (structural, in memory)
    if (parsed.errors.length > 0) {
        for (const e of parsed.errors) fail('apply', `${e}. Next step: regenerate the diff with git diff against the target ref.`);
        return done({ touched });
    }

    // 3. regenerate-patches --check (structural, in memory)
    for (const f of parsed.files) {
        if (!f.path.startsWith(PATCH_PREFIX) || f.changes.length === 0) continue;
        const inner = f.changes.map(c => c.slice(1));
        if (inner.some(s => INDEX_LINE.test(s))) continue;
        if (!f.renamed) {
            fail('regenerate-patches --check', `${f.path} changes its hunk body without changing its index line (the blob hash), which is a hand edit. Next step: regenerate the patch with scripts/regenerate-patches.sh --check; never text-edit a hunk.`);
            continue;
        }
        const payload = inner.some(s => (s[0] === '+' || s[0] === '-') && !/^(\+\+\+|---) /.test(s));
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
        if (!f.path.startsWith(PATCH_PREFIX)) continue;
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

// The real stages: a throwaway worktree at the target ref, the diff applied,
// then the real scripts. Stage 8 (--quick) runs here and nowhere else.
function runRealStages(diffText, tag, touched) {
    const failures = [];
    const ref = tag ?? 'HEAD';
    const dir = mkdtempSync(join(tmpdir(), 'fix-gate-'));
    const wt = join(dir, 'tree');
    const run = (cmd, argv, cwd, timeout = 600000) =>
        spawnSync(cmd, argv, { cwd, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024 });
    const tail = (r) => (r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' / ') || 'no output';
    try {
        let r = run('git', ['worktree', 'add', '--detach', wt, ref], REPO_ROOT);
        if (r.status !== 0) {
            failures.push(`[apply] could not check out '${ref}' into a throwaway worktree (${tail(r)}). Next step: fetch the target ref, or pass --tag=<target-tag>.`);
            return failures;
        }
        writeFileSync(join(dir, 'fix.diff'), diffText);
        r = run('git', ['apply', '--whitespace=nowarn', join(dir, 'fix.diff')], wt);
        if (r.status !== 0) {
            failures.push(`[apply] the diff does not apply to '${ref}' (${tail(r)}). Next step: regenerate the diff against '${ref}'.`);
            return failures;
        }
        run('git', ['add', '-A'], wt);
        // Git-ignored, machine-local inputs the real stages read. Linked after the
        // staging above, since a link to a directory would not match the ignore rules.
        // generated/ is copied, because its generator writes into it and a link would
        // write into this checkout; upstream/ and theia/node_modules are linked.
        for (const [rel, mode] of [['generated', 'copy'], ['upstream', 'link'], ['theia/node_modules', 'link']]) {
            const src = join(REPO_ROOT, rel);
            if (!existsSync(src)) continue;
            if (mode === 'copy') cpSync(src, join(wt, rel), { recursive: true });
            else symlinkSync(src, join(wt, rel), 'dir');
        }

        if (touched.some(p => p.startsWith(PATCH_PREFIX))) {
            if (tag === null) {
                failures.push(`[regenerate-patches --check] the diff touches ${PATCH_PREFIX} but no --tag was given, so the upstream replay has no target. Next step: pass --tag=<target-tag>.`);
            } else if (!existsSync(join(REPO_ROOT, 'upstream'))) {
                failures.push(`[regenerate-patches --check] upstream/ is not fetched, so the patches cannot be replayed at '${tag}'. Next step: run scripts/fetch-upstream.sh for '${tag}', then rerun the gate.`);
            } else {
                r = run('bash', [REGEN_REL, '--check', '--upstream', join(REPO_ROOT, 'upstream'), '--patches', join(wt, 'patches')], wt);
                if (r.status !== 0) failures.push(`[regenerate-patches --check] ${REGEN_REL} --check rejected the replay at '${tag}' (${tail(r)}). Next step: regenerate the patch with ${REGEN_REL}; never text-edit a hunk.`);
            }
        }

        const steps = [
            ['check-patch-surface', 'bash', [SURFACE_REL], wt, 600000],
            ['scan-brand-residue', 'node', [BRAND_SCAN_REL], wt, 600000],
            ['diff-theia-core', 'bash', [THEIA_REL, '--quick'], REPO_ROOT, 600000],
            ['verify-platform --quick', 'bash', [PLATFORM_REL, '--quick'], wt, 3600000],
        ];
        for (const [label, cmd, argv, cwd, timeout] of steps) {
            if (failures.length > 0) break;
            const rr = run(cmd, argv, cwd, timeout);
            if (rr.status !== 0) failures.push(`[${label}] \`${cmd} ${argv.join(' ')}\` exited ${rr.status ?? 'without a status'} in ${cwd} (${tail(rr)}). Next step: run that command in a checkout of '${ref}' with the fix applied and fix the named cause.`);
        }
    } finally {
        run('git', ['worktree', 'remove', '--force', wt], REPO_ROOT);
        run('git', ['worktree', 'prune'], REPO_ROOT);
        rmSync(dir, { recursive: true, force: true });
    }
    return failures;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    if (diffArg === null) {
        console.error(`${NAME}: FAIL -- no fix diff was given`);
        console.error(`  Next step: run: node ${SELF_REL} --diff=<fix.diff> --tag=<target-tag>.`);
        return 2;
    }
    let diff;
    try {
        diff = readFileSync(resolve(diffArg), 'utf8');
    } catch (e) {
        console.error(`${NAME}: FAIL -- the diff ${diffArg} could not be read (${e.code ?? e.message}).`);
        console.error(`  Next step: pass a readable unified diff with --diff=<path>.`);
        return 2;
    }
    const mem = runChecks(REPO_ROOT, { diff });
    const failures = mem.failures.length > 0 ? mem.failures : runRealStages(diff, tagArg, mem.touched);
    for (const n of mem.notes) console.log(`  note  ${n}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- verdict: reject; ${failures.length} problem(s) with the fix diff.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- verdict: pass; ${mem.touched.length} path(s) gated, ${mem.changed} file body(ies) changed, every stage green`);
    return 0;
}

// Diff text for one changed file. `changes` are +/- body lines with their prefix.
function diffOf(path, changes, { renamed = null, vacuous = false } = {}) {
    const from = renamed ?? path;
    if (vacuous) return `diff --git a/${path} b/${path}\nnew file mode 100644\n`;
    const head = [`diff --git a/${from} b/${path}`];
    if (renamed !== null) head.push('similarity index 90%', `rename from ${from}`, `rename to ${path}`);
    const old = changes.filter(c => c[0] !== '+').length;
    const neu = changes.filter(c => c[0] !== '-').length;
    head.push(`--- a/${from}`, `+++ b/${path}`, `@@ -1,${old} +1,${neu} @@`, ...changes);
    return `${head.join('\n')}\n`;
}

function selfTest() {
    const read = (rel) => readText(REPO_ROOT, rel);
    const denyDoc = (() => { try { return JSON.parse(read(DENY_REL)); } catch { return null; } })();
    const deny = denyDoc?.paths;
    const registry = registryFiles(read(PLATFORM_REL));
    const tokens = (() => { try { return brandTokens(read(BRAND_REL) ?? ''); } catch { return []; } })();
    if (!Array.isArray(deny) || deny.length === 0 || registry === null || tokens.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- the deny file, the registry or the brand inventory could not be read, so no plant would mean anything. Next step: restore ${DENY_REL}, ${PLATFORM_REL} or ${BRAND_REL}.`);
        return 1;
    }

    const control = runChecks(REPO_ROOT, { diff: diffOf('docs/fix-gate-control.md', ['+one control line']) });
    if (control.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        control.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  control: docs-only change -> green`);

    // Sample path for a deny glob: the glob with its wildcards filled in.
    const sample = (g) => g.replace(/\/\*\*$/, '/planted.txt').replace(/\*/g, 'planted');
    const plants = [];
    let failed = 0;
    for (const g of deny) {
        const p = sample(g);
        if (!globToRe(g).test(p)) {
            console.error(`${NAME}: --self-test FAIL -- the sample path '${p}' does not match its deny entry '${g}', so the plant would test nothing.`);
            failed += 1;
            continue;
        }
        plants.push([`deny entry '${g}'`, { diff: diffOf(p, ['+planted line']) }, [p]]);
    }
    const regPath = [...registry].find(p => !deny.some(g => globToRe(g).test(p)));
    plants.push(['registry-row-named file', { diff: diffOf(regPath, ['+planted line']) }, [regPath, 'registry row']]);
    plants.push(['hand-edited patch hunk', { diff: diffOf('patches/020-planted.patch', ['-+old payload', '++new payload']) }, ['patches/020-planted.patch', 'regenerate-patches --check']]);
    plants.push(['vacuous diff (no file body changes)', { diff: diffOf('docs/fix-gate-vacuous.md', [], { vacuous: true }) }, ['[non-vacuity]']]);
    plants.push(['patch adds a compiled-file target', { diff: diffOf('patches/021-planted.patch', ['+index 1234567890..abcdef0123', '++++ b/powerbrowser/planted.cpp']) }, ['[check-patch-surface]', 'powerbrowser/planted.cpp']]);
    plants.push(['brand-identifier token added', { diff: diffOf('docs/fix-gate-brand.md', [`+text ${tokens[0].token}`]) }, ['[scan-brand-residue]', 'docs/fix-gate-brand.md', `row ${tokens[0].idx}`]]);
    plants.push(['Theia core path changed', { diff: diffOf('theia/node_modules/@theia/core/planted.json', ['+planted']) }, ['[diff-theia-core]', 'theia/node_modules/@theia/core/planted.json']]);

    for (const [name, overrides, needles] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        const hit = failures.find(f => needles.every(n => f.includes(n)));
        if (hit !== undefined) {
            console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(' and ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${needles.join(' and ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    const controls = [
        ['hand edit with a changed index line', diffOf('patches/024-planted.patch', ['-+old payload', '++new payload', '+index 1234567890..abcdef0123']), (r) => r.failures.length === 0],
        ['moved patch, context-only change (CR-01)', diffOf('patches/023-planted.patch', ['- context before', '+ context after'], { renamed: 'patches/022-planted.patch' }), (r) => r.failures.length === 0 && r.notes.some(n => n.includes('CR-01'))],
    ];
    for (const [name, diff, ok] of controls) {
        const r = runChecks(REPO_ROOT, { diff });
        if (ok(r)) {
            console.log(`  ok  control: ${name} -> green`);
            for (const n of r.notes) console.log(`  note  ${n}`);
        }
        else { console.error(`${NAME}: --self-test FAIL -- the control '${name}' did not stay green: ${r.failures.join(' | ') || '(no CR-01 note)'}`); failed += 1; }
    }

    console.log(`  note  stage 8 (verify-platform --quick) runs only in the real gate: this row is itself a --quick row, so the self-test does not re-enter it`);
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their stage and path (${deny.length} deny entries, read from ${DENY_REL}), and 3 controls stayed green`);
    return 0;
}

process.exit(main());
