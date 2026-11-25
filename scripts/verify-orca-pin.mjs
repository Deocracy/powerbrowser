#!/usr/bin/env node
// scripts/verify-orca-pin.mjs
//
// The orca-pin gate (Phase 60, RUN-01, P59-01): the Orca source pin is
// declared once in configuration.toml ([upstreams] orca_tag and orca_commit)
// and every consumer reads that declaration. This check derives the expected
// tag and commit from the manifest at check time via the vendored parser and
// asserts agreement:
//
//  a. the manifest: both keys absent FAILs (Orca is integral to this tree, and
//     the pin gate must not vanish with the keys; harness-static-structure-03);
//     exactly one present FAILs naming the missing key; the tag must
//     match ^v<n>.<n>.<n>$ and the commit ^[0-9a-f]{40}$.
//  b. generated/upstream-pins.env carries exactly UPSTREAM_ORCA_TAG=<tag> and
//     UPSTREAM_ORCA_COMMIT=<commit>. An absent fragment skips this step only
//     (generated/ is gitignored, so that is every fresh clone), and a skipped
//     step makes the row exit 77 with a SKIP line.
//  c. scripts/fetch-orca.sh sources the fragment (names upstream-pins.env,
//     UPSTREAM_ORCA_TAG and UPSTREAM_ORCA_COMMIT) and carries neither the
//     pinned tag nor the pinned commit as a literal.
//  d. no tracked file under scripts/, .github/, nix/ or flake.nix carries the
//     pinned tag or commit string. The sweep looks for the exact pinned values,
//     never a version-shape regex, so unrelated version strings cannot trip it;
//     this script's own self-test uses synthetic values and is never a carrier.
//  e. git ls-files -- orca is empty, orca/ is gitignored, and
//     .planning/workstreams/orca/STATE.md is NOT ignored (the rule is anchored).
//  f. when orca/ exists: its HEAD and refs/tags/<tag>^{commit} both equal the
//     commit, so a moved tag or a changed commit is red. An absent orca/ skips
//     this step only; the row then exits 77 with a SKIP line and the driver
//     records SKIP, not PASS (harness-static-structure-01, SKIP-PROTOCOL.md).
//  g. flake.nix declares orca = pkgs.mkShell { ... } naming corepack_24 and
//     nodejs.
//
// Tier: --quick. No network, no build; reads git and files only.
// Limit: it proves agreement between the manifest and its consumers, not that
// the pinned tag is Orca's newest release (that is the Phase 68 re-pin job).
//
// Usage:
//   node scripts/verify-orca-pin.mjs
//   node scripts/verify-orca-pin.mjs --self-test
//
// The self-test first proves this tree green (SKIPs allowed) and a synthetic
// baseline green, then plants the faults and requires each to go red naming
// the drift. A plant whose anchor is absent from its input is itself a FAIL.
// Plants land in memory, except the two that need a real git checkout, which
// use a mkdtemp fixture repo removed in finally. No tracked file is edited.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureGitEnv, withHostileGitConfig } from './lib/fixture-git.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
import { parse } from './lib/toml.cjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pin';
const SELF_REL = 'scripts/verify-orca-pin.mjs';
const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/upstream-pins.env';
const FETCH_REL = 'scripts/fetch-orca.sh';
const FLAKE_REL = 'flake.nix';
const WORKSTREAM_PROBE = '.planning/workstreams/orca/STATE.md';
const SWEEP_SCOPE = ['scripts', '.github', 'nix', 'flake.nix'];
const TAG_SHAPE = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const COMMIT_SHAPE = /^[0-9a-f]{40}$/;
const RERUN_GENERATE = 'nix develop .#theia --command node scripts/generate.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
        process.exit(2);
    }
}

// --- io ---------------------------------------------------------------------

function gitIo(root) {
    return {
        readText(rel) {
            const p = join(root, rel);
            try { return existsSync(p) ? readFileSync(p, 'utf8') : null; } catch { return null; }
        },
        lsFiles(paths) {
            return execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: root, encoding: 'utf8' })
                .split('\0').filter(Boolean);
        },
        gitRevParse(rel, rev) {
            const r = spawnSync('git', ['-C', join(root, rel), 'rev-parse', '--verify', '-q', rev], { encoding: 'utf8' });
            return r.status === 0 ? r.stdout.trim() : null;
        },
        checkIgnore(rel) {
            return spawnSync('git', ['check-ignore', '-q', rel], { cwd: root }).status === 0;
        },
        exists(rel) {
            return existsSync(join(root, rel));
        },
    };
}

// --- the check ----------------------------------------------------------------

// Text of the block opened by the first `{` at or after `from`, or null.
function braceBlock(text, from) {
    const open = text.indexOf('{', from);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
    }
    return null;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns { skip: string|null, fails: string[], notes: string[], skips: string[], tag, commit }. A skip is a step that did not run. */
function check(io) {
    const fails = [];
    const notes = [];
    const skips = [];

    // a. the manifest
    const manifestText = io.readText(MANIFEST_REL);
    if (manifestText === null) {
        return { skip: null, fails: [`${MANIFEST_REL} is unreadable. Next step: restore it from git.`], notes };
    }
    let up;
    try {
        up = parse(manifestText).upstreams ?? {};
    } catch (e) {
        return { skip: null, fails: [`${MANIFEST_REL} does not parse (${e.message}). Next step: fix the TOML.`], notes };
    }
    const tag = up.orca_tag;
    const commit = up.orca_commit;
    if (tag === undefined && commit === undefined) {
        return { skip: null, fails: [`${MANIFEST_REL} states neither [upstreams] orca_tag nor orca_commit, so the Orca pin is gone. Next step: restore both keys (this tree builds Orca), then run: ${RERUN_GENERATE}`], notes, skips };
    }
    if (tag === undefined || commit === undefined) {
        const missing = tag === undefined ? 'upstreams.orca_tag' : 'upstreams.orca_commit';
        return { skip: null, fails: [`${MANIFEST_REL} sets one Orca key without the other: ${missing} is missing. Next step: add ${missing}, then run: ${RERUN_GENERATE}`], notes };
    }
    if (typeof tag !== 'string' || !TAG_SHAPE.test(tag)) {
        fails.push(`upstreams.orca_tag is ${JSON.stringify(tag)}, not v<n>.<n>.<n>. Next step: correct it in ${MANIFEST_REL}.`);
    }
    if (typeof commit !== 'string' || !COMMIT_SHAPE.test(commit)) {
        fails.push(`upstreams.orca_commit is ${JSON.stringify(commit)}, not a 40-hex commit. Next step: correct it in ${MANIFEST_REL}.`);
    }
    if (fails.length) return { skip: null, fails, notes, tag, commit };

    // b. the generated fragment
    const fragment = io.readText(FRAGMENT_REL);
    if (fragment === null) {
        skips.push(`${FRAGMENT_REL} is absent (fresh clone), so the fragment step did not run. Next step: ${RERUN_GENERATE}`);
    } else {
        const lines = fragment.split('\n');
        for (const [key, want] of [['UPSTREAM_ORCA_TAG', tag], ['UPSTREAM_ORCA_COMMIT', commit]]) {
            const got = lines.filter((l) => l.startsWith(`${key}=`));
            if (got.length !== 1 || got[0] !== `${key}=${want}`) {
                fails.push(`${FRAGMENT_REL} carries ${got.length ? got.join(', ') : `no ${key}`}, the manifest says ${key}=${want}. Next step: run: ${RERUN_GENERATE}`);
            }
        }
    }

    // c. the fetch script reads the fragment and carries no literal
    const fetchText = io.readText(FETCH_REL);
    if (fetchText === null) {
        fails.push(`${FETCH_REL} is missing. Next step: restore it from git.`);
    } else {
        for (const needle of ['upstream-pins.env', 'UPSTREAM_ORCA_TAG', 'UPSTREAM_ORCA_COMMIT']) {
            if (!fetchText.includes(needle)) fails.push(`${FETCH_REL} does not name ${needle}, so it does not read the pin from the fragment. Next step: restore the fragment read.`);
        }
    }

    // c + d. literal sweep over the build-relevant tracked tree
    const tagRe = new RegExp(`${escapeRe(tag)}(?![0-9.])`);
    for (const rel of io.lsFiles(SWEEP_SCOPE)) {
        const text = io.readText(rel);
        if (text === null) continue;
        if (tagRe.test(text) || text.includes(commit)) {
            fails.push(`${rel} carries the pinned Orca tag or commit as a literal; ${MANIFEST_REL} is the one carrier. Next step: read it from ${FRAGMENT_REL} instead.`);
        }
    }

    // e. orca/ untracked and ignored, the anchoring holds
    const tracked = io.lsFiles(['orca']);
    if (tracked.length) fails.push(`tracked path(s) under orca/: ${tracked.slice(0, 5).join(', ')}. Next step: git rm --cached them; orca/ is a fetched checkout.`);
    if (!io.checkIgnore('orca/')) fails.push(`orca/ is not gitignored. Next step: restore the anchored /orca/ entry in .gitignore.`);
    if (io.checkIgnore(WORKSTREAM_PROBE)) fails.push(`${WORKSTREAM_PROBE} is gitignored, so the orca ignore rule is unanchored. Next step: write it as /orca/ in .gitignore.`);

    // f. a fetched orca/ is at the pin
    if (!io.exists('orca')) {
        skips.push(`orca/ is absent, so the orca/ HEAD and tag step did not run. Next step: bash ${FETCH_REL}`);
    } else {
        const head = io.gitRevParse('orca', 'HEAD');
        const tagSha = io.gitRevParse('orca', `refs/tags/${tag}^{commit}`);
        if (head !== commit || tagSha !== commit) {
            fails.push(`orca/ HEAD is ${head ?? '<unresolvable>'} and ${tag} resolves to ${tagSha ?? '<tag not present>'}, the pin is ${commit}. Next step: rm -rf orca && bash ${FETCH_REL}`);
        }
    }

    // g. the dev shell
    const flake = io.readText(FLAKE_REL);
    const at = flake === null ? -1 : flake.search(/\borca\s*=\s*pkgs\.mkShell\s*\{/);
    const block = at < 0 ? null : braceBlock(flake, at);
    if (block === null || !block.includes('corepack_24') || !/\bnodejs\b/.test(block)) {
        fails.push(`${FLAKE_REL} has no devShells orca = pkgs.mkShell block naming corepack_24 and nodejs. Next step: restore devShells.orca.`);
    }

    return { skip: null, fails, notes, skips, tag, commit };
}

// FAIL wins over SKIP; a skipped step is exit 77 with the one SKIP line (SKIP-PROTOCOL.md).
function render(result) {
    if (result.fails.length) {
        return { code: 1, lines: [`${NAME}: FAIL -- ${result.fails.length} problem(s)`, ...result.fails.map((f) => `  - ${f}`)] };
    }
    if (result.skips?.length) return { code: SKIP_EXIT, lines: [skipLine(NAME, result.skips.join('; '))] };
    return { code: 0, lines: [`${NAME}: PASS -- ${result.tag} at ${result.commit} agrees across the manifest, fragment, fetch script, tracked tree, orca/ and flake.nix`] };
}

// --- self-test ----------------------------------------------------------------

function runSelfTest() {
    const real = check(gitIo(REPO_ROOT));
    if (real.fails.length) {
        console.error(`${NAME} self-test: FAIL -- the unmutated tree is already red, so the planted-fault results below would be meaningless:`);
        for (const f of real.fails) console.error(`  - ${f}`);
        return 1;
    }
    console.log(`${NAME} self-test: clean control (this tree) ${real.skips.length ? 'green, with skipped steps' : 'green'}`);

    const tmp = mkdtempSync(join(tmpdir(), 'orca-pin-selftest-'));
    try {
        // A fixture Orca checkout: two commits, two annotated tags, synthetic names.
        const repo = join(tmp, 'orca');
        mkdirSync(repo);
        const git = (...a) => execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Test',
            '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'advice.detachedHead=false', '-C', repo, ...a],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: fixtureGitEnv() }).trim();
        git('init', '-q');
        writeFileSync(join(repo, 'f'), 'one\n');
        git('add', 'f');
        git('commit', '-q', '-m', 'one');
        git('tag', '-a', 'v9.9.8', '-m', 'v9.9.8');
        writeFileSync(join(repo, 'f'), 'two\n');
        git('commit', '-q', '-am', 'two');
        git('tag', '-a', 'v9.9.9', '-m', 'v9.9.9');
        const TAG = 'v9.9.9';
        const COMMIT = git('rev-parse', 'refs/tags/v9.9.9^{commit}');
        const TAG_OBJECT = git('rev-parse', 'refs/tags/v9.9.9');

        const baseFiles = {
            [MANIFEST_REL]: `[upstreams]\norca_tag = "${TAG}"\norca_commit = "${COMMIT}"\n`,
            [FRAGMENT_REL]: `# banner\nFIREFOX_ESR_TAG=X_RELEASE\nUPSTREAM_ORCA_TAG=${TAG}\nUPSTREAM_ORCA_COMMIT=${COMMIT}\n`,
            [FETCH_REL]: readFileSync(join(REPO_ROOT, FETCH_REL), 'utf8'),
            [FLAKE_REL]: readFileSync(join(REPO_ROOT, FLAKE_REL), 'utf8'),
        };
        const fixtureGit = gitIo(tmp);
        const makeIo = (files, over = {}) => ({
            readText: (rel) => (rel in files ? files[rel] : null),
            lsFiles: (paths) => (paths.length === 1 && paths[0] === 'orca' ? [] : [FETCH_REL, FLAKE_REL]),
            gitRevParse: fixtureGit.gitRevParse,
            checkIgnore: (rel) => rel === 'orca/',
            exists: (rel) => rel === 'orca',
            ...over,
        });

        const base = check(makeIo(baseFiles));
        if (base.skips.length || base.fails.length) {
            console.error(`${NAME} self-test: FAIL -- the synthetic baseline is not green: ${[...base.fails, ...base.skips].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: clean control (synthetic baseline) green`);
        // The skip controls: a step that did not run is exit 77 with the SKIP line, and a failure beside it stays 1.
        const noOrca = check(makeIo(baseFiles, { exists: () => false }));
        const noFragment = check(makeIo({ ...baseFiles, [FRAGMENT_REL]: undefined }, { readText: (rel) => (rel === FRAGMENT_REL ? null : baseFiles[rel] ?? null) }));
        const skipOk = (r, what) => {
            const v = render(r);
            if (r.fails.length || v.code !== SKIP_EXIT || !v.lines[0].startsWith(`${NAME}: SKIP -- `) || !v.lines[0].includes(what)) {
                console.error(`${NAME} self-test: FAIL -- ${what} did not render exit ${SKIP_EXIT} with a SKIP line: ${v.code} ${v.lines.join(' | ')}`);
                return false;
            }
            console.log(`${NAME} self-test: control green -- ${what} -> exit ${SKIP_EXIT} with a SKIP line`);
            return true;
        };
        if (!skipOk(noOrca, 'orca/ is absent') || !skipOk(noFragment, `${FRAGMENT_REL} is absent`)) return 1;
        if (render({ ...noOrca, fails: ['x'] }).code !== 1) { console.error(`${NAME} self-test: FAIL -- a failure beside a skip did not stay exit 1`); return 1; }

        // Replace `anchor` in files[rel]; null when the anchor is absent (vacuous plant).
        const edit = (rel, anchor, repl) => (baseFiles[rel].includes(anchor)
            ? { ...baseFiles, [rel]: baseFiles[rel].replace(anchor, repl) } : null);

        const plants = [
            { name: 'fragment-tag-mismatch', naming: 'UPSTREAM_ORCA_TAG',
                io: () => { const f = edit(FRAGMENT_REL, `UPSTREAM_ORCA_TAG=${TAG}`, 'UPSTREAM_ORCA_TAG=v9.9.7'); return f && makeIo(f); } },
            { name: 'fragment-commit-mismatch', naming: 'UPSTREAM_ORCA_COMMIT',
                io: () => { const f = edit(FRAGMENT_REL, `UPSTREAM_ORCA_COMMIT=${COMMIT}`, `UPSTREAM_ORCA_COMMIT=${'0'.repeat(40)}`); return f && makeIo(f); } },
            { name: 'manifest-commit-is-tag-object', naming: 'orca/ HEAD',
                io: () => {
                    const f = edit(MANIFEST_REL, `orca_commit = "${COMMIT}"`, `orca_commit = "${TAG_OBJECT}"`);
                    if (!f || !f[FRAGMENT_REL].includes(COMMIT)) return null;
                    f[FRAGMENT_REL] = f[FRAGMENT_REL].replace(COMMIT, TAG_OBJECT);
                    return makeIo(f);
                } },
            { name: 'orca-checkout-at-other-tag', naming: 'orca/ HEAD',
                io: () => makeIo(baseFiles),
                before: () => git('checkout', '-q', 'v9.9.8'), after: () => git('checkout', '-q', COMMIT) },
            { name: 'tag-literal-in-fetch-script', naming: FETCH_REL,
                io: () => { const f = edit(FETCH_REL, 'set -euo pipefail', `set -euo pipefail\nTAG=${TAG}`); return f && makeIo(f); } },
            { name: 'moved-tag', naming: 'orca/ HEAD',
                io: () => makeIo(baseFiles),
                before: () => git('tag', '-f', '-a', '-m', 'moved', TAG, git('rev-parse', 'refs/tags/v9.9.8^{commit}')), after: () => git('tag', '-f', '-a', '-m', 'v9.9.9', TAG, COMMIT) },
            { name: 'changed-commit', naming: 'orca/ HEAD',
                io: () => {
                    const older = git('rev-parse', 'refs/tags/v9.9.8^{commit}');
                    const f = edit(MANIFEST_REL, `orca_commit = "${COMMIT}"`, `orca_commit = "${older}"`);
                    if (!f) return null;
                    f[FRAGMENT_REL] = f[FRAGMENT_REL].replace(COMMIT, older);
                    return makeIo(f);
                } },
            { name: 'both-keys-removed', naming: 'states neither',
                io: () => makeIo({ ...baseFiles, [MANIFEST_REL]: '[upstreams]\nfirefox_tag = "x"\n' }) },
            { name: 'pin-block-removed', naming: 'states neither',
                io: () => makeIo({ ...baseFiles, [MANIFEST_REL]: '[other]\nk = 1\n' }) },
            { name: 'tag-without-commit', naming: 'upstreams.orca_commit',
                io: () => { const f = edit(MANIFEST_REL, `orca_commit = "${COMMIT}"\n`, ''); return f && makeIo(f); } },
            { name: 'tracked-path-under-orca', naming: 'orca/package.json',
                io: () => makeIo(baseFiles, { lsFiles: (p) => (p.length === 1 && p[0] === 'orca' ? ['orca/package.json'] : [FETCH_REL, FLAKE_REL]) }) },
            { name: 'flake-without-orca-shell', naming: FLAKE_REL,
                io: () => { const f = edit(FLAKE_REL, 'orca = pkgs.mkShell', 'orcx = pkgs.mkShell'); return f && makeIo(f); } },
            { name: 'unanchored-ignore-hides-workstream', naming: '.planning/workstreams/orca',
                io: () => makeIo(baseFiles, { checkIgnore: (rel) => rel === 'orca/' || rel === WORKSTREAM_PROBE }) },
        ];

        let failures = 0;
        for (const p of plants) {
            p.before?.();
            try {
                const io = p.io();
                if (!io) { console.error(`  FAIL ${p.name} -> vacuous: its anchor is absent from the input`); failures++; continue; }
                const r = check(io);
                const text = r.fails.join('\n');
                if (r.skip || !r.fails.length) {
                    console.error(`  FAIL ${p.name} -> stayed ${r.skip ? 'SKIP' : 'green'}`);
                    failures++;
                } else if (!text.includes(p.naming)) {
                    console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`);
                    failures++;
                } else {
                    console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
                }
            } finally {
                p.after?.();
            }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

if (args.includes('--self-test')) {
    process.exit(withHostileGitConfig(runSelfTest));
}
const { code, lines } = render(check(gitIo(REPO_ROOT)));
for (const l of lines) (code ? console.error : console.log)(l);
process.exit(code);
