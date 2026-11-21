#!/usr/bin/env node
// scripts/verify-packaging-staging.mjs
//
// The packaging-staging row (audit-fix G5b: 63-CR-01, packaging-prefs-network-02, 68-WR-02).
// Static and fixture-only: it runs the tree's own packaging helpers on temp directories. No build,
// no browser, no network.
//
//  wrapper        63-CR-01. The specifier is read from the orca-agents backend
//                 (require.resolve('<spec>') in orca-agents-backend-module.ts). A temp sidecar stage
//                 with lib/backend/main.js is given to powerbrowser/packaging/stage-orca-agents-wrapper.sh,
//                 and Node's own resolution from that main.js (createRequire(...).resolve(spec), the call
//                 the packaged backend makes) must find a file inside the stage, byte-identical to the
//                 tree's wrapper. Every packaging script that stages the sidecar's lib/ as
//                 <X>/theia/lib calls the helper on <X>/theia. package-windows.sh stages a hosted
//                 sidecar and the backend offers no wrapper on win32 (WINDOWS 53), so it has no lib/ copy
//                 and is not in that set.
//  orca-licence   packaging-prefs-network-02. Every packaging script that copies Orca's out/web into an
//                 Orca stage also calls powerbrowser/packaging/stage-orca-licence.sh on that stage.
//                 Run on a temp stage, the helper writes LICENSE equal to orca/<licence_file> (SKIP of
//                 this half when orca/ is not fetched), and refuses a licence that does not hash to the
//                 allowlist digest (a fixture root).
//  no-skip        G5a handoff (SKIP-PROTOCOL.md). In every powerbrowser/packaging/*.sh (stage-*.sh
//                 included), every invocation of a scripts/verify-*.mjs check, however its path is quoted,
//                 runs through scripts/run-no-skip.sh as its own statement, ending with `|| fail ...` or
//                 nothing under set -e, so a check that did not run (exit 77, or exit 0 with a SKIP line)
//                 fails the packaging run. `|| true`, `;`, `&&`, a pipe, `if`, `!` and subshells are red.
//  checkout-grep  68-WR-02. No packaging script swallows a grep error with `2>/dev/null || true` on a
//                 recursive grep. The host_root_grep (package-linux.sh) and checkout_grep
//                 (package-macos.sh) functions, extracted from the scripts and run, pass a clean tree,
//                 fail a tree naming the root, and fail a missing target (grep exit 2).
//
// Usage: node scripts/verify-packaging-staging.mjs [--self-test]
// --self-test plants each pre-fix fault (in text copies and fixture trees) and requires red naming it.
// A clause whose input is absent (orca/ not fetched) makes the row exit 77 after one SKIP line.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'packaging-staging';
const PKG_DIR = 'powerbrowser/packaging';
const BACKEND_REL = 'theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts';
const WRAPPER_HELPER = 'stage-orca-agents-wrapper.sh';
const LICENCE_HELPER = 'stage-orca-licence.sh';
const SWALLOW = /grep\s+-r\S*\s[^\n]*2>\/dev\/null\s*\|\|\s*true/;

// Clauses that did not run because an input is absent (SKIP-PROTOCOL.md: the row then exits 77).
const SKIPS = new Set();
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function scripts(root) {
    return readdirSync(join(root, PKG_DIR)).filter((f) => f.endsWith('.sh')).sort()
        .map((f) => ({ name: f, text: readFileSync(join(root, PKG_DIR, f), 'utf8') }));
}

/** The specifier the backend resolves the wrapper by. */
export function wrapperSpecifier(backendText) {
    return /require\.resolve\(\s*'([^']+claude-wrapper[^']*)'\s*\)/.exec(backendText)?.[1] ?? null;
}

/** Logical lines (backslash continuations joined) with their first line number. */
function logicalLines(text) {
    const out = [];
    let cur = null;
    text.split('\n').forEach((l, i) => {
        if (cur) cur.text += ` ${l.trim()}`; else cur = { line: i + 1, text: l };
        if (/\\\s*$/.test(l)) cur.text = cur.text.replace(/\\\s*$/, ''); else { out.push(cur); cur = null; }
    });
    if (cur) out.push(cur);
    return out;
}

const WRAP = 'bash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-';
/**
 * no-skip: every invocation of a scripts/verify-*.mjs check, however its path is quoted, goes through
 * scripts/run-no-skip.sh as a statement of its own, and its status is not discarded: the logical line
 * starts with the wrapper and ends with `|| fail ...` or nothing (the script runs under set -e).
 * `|| true`, any other `||`, `&&`, `;`, a pipe, `if`, `!`, a subshell or a command substitution is red.
 */
export function noSkipDrift(name, text) {
    const fails = [];
    const setE = /^\s*set -[a-z]*e[a-z]*\b/m.test(text);
    for (const { line, text: l } of logicalLines(text)) {
        const code = l.replace(/(^|\s)#.*$/, '');
        if (!/scripts\/verify-[A-Za-z0-9_-]+\.mjs/.test(code) || /\bimport\b[^\n]*\bfrom\b/.test(code)) continue;
        const at = `${PKG_DIR}/${name}:${line}`;
        const t = code.trim();
        if (!t.includes(WRAP)) { fails.push(`no-skip: ${at} runs a check without scripts/run-no-skip.sh, so a skipped check passes the packaging run`); continue; }
        if (!t.startsWith(WRAP)) { fails.push(`no-skip: ${at} wraps the check inside another construct (${t.slice(0, t.indexOf(WRAP)).trim() || 'prefix'}), which discards or inverts its status`); continue; }
        const tail = t.replace(/^bash "\$ROOT\/scripts\/run-no-skip\.sh" -- node "\$ROOT\/scripts\/verify-[A-Za-z0-9_-]+\.mjs"(?:\s+(?:"[^"]*"|'[^']*'|[^\s;|&"']+))*/, '').trim();
        if (tail === '') { if (!setE) fails.push(`no-skip: ${at} runs the wrapper as a plain command in a script without set -e, so its failure is ignored`); continue; }
        if (!/^\|\|\s*fail\b/.test(tail)) fails.push(`no-skip: ${at} follows the wrapper with '${tail.slice(0, 20)}', which discards its status; end it with || fail or nothing`);
    }
    return fails;
}

/** Static rules over the packaging scripts' text. */
export function staticDrift(list) {
    const fails = [];
    for (const { name, text } of list) {
        for (const m of text.matchAll(/cp -a "\$APP\/lib" "([^"]+)\/lib"/g)) {
            const theia = m[1];
            if (!text.includes(`${WRAPPER_HELPER}" "$ROOT" "${theia}"`)) fails.push(`wrapper: ${PKG_DIR}/${name} stages the sidecar at ${theia} but never runs ${WRAPPER_HELPER} on it, so require.resolve finds no wrapper there`);
        }
        for (const m of text.matchAll(/cp -a [^\n]*\/out\/web" "([^"]+?)\/(?:out\/web|out\/)"/g)) {
            const stage = m[1];
            if (!text.includes(`${LICENCE_HELPER}" "$ROOT" "${stage}"`)) fails.push(`orca-licence: ${PKG_DIR}/${name} stages Orca's out/web under ${stage} but never runs ${LICENCE_HELPER} on it, so Orca's MIT notice does not ship`);
        }
        fails.push(...noSkipDrift(name, text));
        text.split('\n').forEach((l, i) => { if (SWALLOW.test(l)) fails.push(`checkout-grep: ${PKG_DIR}/${name}:${i + 1} swallows a grep error with 2>/dev/null || true`); });
    }
    return fails;
}

/** The shell text of `name() { ... }` (to the first line that is exactly `}`). */
function fnText(text, name) {
    const i = text.indexOf(`\n${name}() {`);
    if (i < 0) return null;
    const j = text.indexOf('\n}\n', i);
    return j < 0 ? null : text.slice(i + 1, j + 2);
}

/** Runs a checkout-grep function on three fixture trees; failures name the case. */
export function grepDrift(scriptName, text, tmp) {
    const fn = scriptName === 'package-linux.sh' ? 'host_root_grep' : 'checkout_grep';
    const body = fnText(text, fn);
    if (!body) return [`checkout-grep: ${PKG_DIR}/${scriptName} defines no ${fn}()`];
    const root = join(tmp, `${fn}-root`);
    const clean = join(tmp, `${fn}-clean`);
    const dirty = join(tmp, `${fn}-dirty`);
    mkdirSync(clean, { recursive: true });
    mkdirSync(dirty, { recursive: true });
    writeFileSync(join(clean, 'a.js'), '// nothing here\n');
    writeFileSync(join(dirty, 'b.js'), `// ${root}/src/x\n`);
    const call = fn === 'host_root_grep' ? (d) => `host_root_grep "${d}"` : (d) => `checkout_grep "the fixture" "${d}"`;
    const run = (d) => spawnSync('bash', ['-c', `set -euo pipefail\nfail() { echo "FAIL -- $*" >&2; exit 1; }\nPB_HOST_ROOT=${JSON.stringify(root)}; ROOT=${JSON.stringify(root)}\n${body}\n${call(d)}\n`], { encoding: 'utf8' });
    const fails = [];
    const c = run(clean);
    if (c.status !== 0) fails.push(`checkout-grep: ${fn}() refused a clean tree: ${c.stderr.trim()}`);
    const d = run(dirty);
    if (d.status === 0 || !d.stderr.includes('b.js')) fails.push(`checkout-grep: ${fn}() passed a tree naming the checkout root`);
    const m = run(join(tmp, `${fn}-missing`));
    if (m.status === 0) fails.push(`checkout-grep: ${fn}() passed a missing target (grep exit 2 taken as no match)`);
    return fails;
}

/** Runs the wrapper helper on a temp stage and resolves the backend's specifier from main.js. */
export function wrapperDrift(root, spec, tmp) {
    if (!spec) return [`wrapper: ${BACKEND_REL} no longer calls require.resolve('...claude-wrapper...'); update this check with the new rule`];
    const theia = join(tmp, 'wrapper-stage', 'theia');
    mkdirSync(join(theia, 'lib', 'backend'), { recursive: true });
    writeFileSync(join(theia, 'lib', 'backend', 'main.js'), '// fixture backend\n');
    const r = spawnSync('bash', [join(root, PKG_DIR, WRAPPER_HELPER), root, theia], { encoding: 'utf8' });
    if (r.status !== 0) return [`wrapper: ${WRAPPER_HELPER} failed: ${r.stderr.trim()}`];
    let got;
    try { got = createRequire(join(theia, 'lib', 'backend', 'main.js')).resolve(spec); } catch (e) {
        return [`wrapper: require.resolve('${spec}') from <stage>/lib/backend/main.js throws ${e.code ?? e.message}; the packaged backend offers no wrapper`];
    }
    if (relative(theia, got).startsWith('..')) return [`wrapper: '${spec}' resolved outside the stage, to ${got}`];
    const src = join(root, 'theia/extensions/orca-agents/bin/claude-wrapper.mjs');
    if (sha(got) !== sha(src)) return [`wrapper: the staged ${relative(theia, got)} differs from ${relative(root, src)}`];
    return [];
}

/** Runs the licence helper on a temp stage (real root), and on a fixture root with a wrong digest. */
export function licenceDrift(root, tmp) {
    const fails = [];
    const row = JSON.parse(readFileSync(join(root, 'inventory/licence-allowlist.json'), 'utf8')).trees.find((t) => t.path === 'orca');
    const helper = join(root, PKG_DIR, LICENCE_HELPER);
    if (existsSync(join(root, 'orca', row.licence_file))) {
        const stage = join(tmp, 'licence-stage');
        mkdirSync(stage, { recursive: true });
        const r = spawnSync('bash', [helper, root, stage], { encoding: 'utf8' });
        if (r.status !== 0) fails.push(`orca-licence: ${LICENCE_HELPER} failed on the fetched orca/: ${r.stderr.trim()}`);
        else if (sha(join(stage, 'LICENSE')) !== sha(join(root, 'orca', row.licence_file))) fails.push('orca-licence: the staged LICENSE differs from orca/LICENSE');
    } else SKIPS.add(`orca-licence did not run on the real tree: orca/${row.licence_file} is not fetched. Next step: bash scripts/fetch-orca.sh`);
    const fx = join(tmp, 'licence-fixture');
    mkdirSync(join(fx, 'orca'), { recursive: true });
    mkdirSync(join(fx, 'inventory'), { recursive: true });
    mkdirSync(join(fx, 'stage'), { recursive: true });
    writeFileSync(join(fx, 'orca', 'LICENSE'), 'Changed notice\n');
    writeFileSync(join(fx, 'inventory/licence-allowlist.json'), JSON.stringify({ trees: [{ path: 'orca', licence_file: 'LICENSE', licence_file_sha256: row.licence_file_sha256 }] }));
    const bad = spawnSync('bash', [helper, fx, join(fx, 'stage')], { encoding: 'utf8' });
    if (bad.status === 0 || existsSync(join(fx, 'stage', 'LICENSE'))) fails.push(`orca-licence: ${LICENCE_HELPER} staged a licence that does not hash to the allowlist digest`);
    return fails;
}

function drift(root, list, backendText, tmp) {
    const fails = [...staticDrift(list)];
    for (const s of list) if (s.name === 'package-linux.sh' || s.name === 'package-macos.sh') fails.push(...grepDrift(s.name, s.text, tmp));
    fails.push(...wrapperDrift(root, wrapperSpecifier(backendText), tmp));
    fails.push(...licenceDrift(root, tmp));
    return fails;
}

function withTmp(fn) {
    const tmp = mkdtempSync(join(tmpdir(), 'packaging-staging-'));
    try { return fn(tmp); } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function selfTest() {
    const list = scripts(REPO_ROOT);
    const backend = readFileSync(join(REPO_ROOT, BACKEND_REL), 'utf8');
    const edit = (name, f) => list.map((s) => (s.name === name ? { ...s, text: f(s.text) } : s));
    const PRE_FIX_GREP = `host_root_grep() {
    local hit
    while IFS= read -r hit; do
        fail "the staged tree still carries the host checkout path $PB_HOST_ROOT/: $hit"
    done < <(grep -rlF "$PB_HOST_ROOT/" "$@" 2>/dev/null || true)
}`;
    const plants = [
        { name: 'linux wrapper staging removed (63-CR-01 pre-fix)', naming: 'package-linux.sh stages the sidecar', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => x.replace(/\nbash "\$ROOT\/powerbrowser\/packaging\/stage-orca-agents-wrapper\.sh"[^\n]*/, '')), backend, t) },
        { name: 'macOS wrapper staging removed', naming: 'package-macos.sh stages the sidecar', run: (t) => drift(REPO_ROOT, edit('package-macos.sh', (x) => x.replace(/\nbash "\$ROOT\/powerbrowser\/packaging\/stage-orca-agents-wrapper\.sh"[^\n]*/, '')), backend, t) },
        { name: 'backend resolves a path the helper does not stage', naming: 'throws MODULE_NOT_FOUND', run: (t) => drift(REPO_ROOT, list, backend.replace('/bin/claude-wrapper.mjs', '/dist/claude-wrapper.mjs'), t) },
        { name: 'linux licence staging removed (packaging-prefs-network-02 pre-fix)', naming: 'package-linux.sh stages Orca', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => x.replace(/\n {4}bash "\$ROOT\/powerbrowser\/packaging\/stage-orca-licence\.sh"[^\n]*/, '')), backend, t) },
        { name: 'windows licence staging removed', naming: 'package-windows.sh stages Orca', run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => x.replace(/\nbash "\$ROOT\/powerbrowser\/packaging\/stage-orca-licence\.sh"[^\n]*/, '')), backend, t) },
        { name: 'macOS universal licence staging removed', naming: 'package-macos.sh stages Orca', run: (t) => drift(REPO_ROOT, edit('package-macos.sh', (x) => x.replace(/\n {4}bash "\$ROOT\/powerbrowser\/packaging\/stage-orca-licence\.sh" "\$ROOT" "\$out"/, '')), backend, t) },
        { name: 'linux grep swallows errors (68-WR-02 pre-fix)', naming: 'passed a missing target', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => x.replace(fnText(x, 'host_root_grep'), `${PRE_FIX_GREP}\n`)), backend, t) },
        { name: 'orca-packaged-tree called directly (G5a handoff pre-fix)', naming: 'no-skip: powerbrowser/packaging/package-macos.sh', run: (t) => drift(REPO_ROOT, edit('package-macos.sh', (x) => x.replace('bash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-orca-packaged-tree.mjs"', 'node "$ROOT/scripts/verify-orca-packaged-tree.mjs"')), backend, t) },
        { name: 'wrapper status discarded with || true (review 7)', naming: 'follows the wrapper with \'|| true', run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => `${x}\nbash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-x.mjs" || true\n`), backend, t) },
        { name: 'wrapper inside if (review 7)', naming: 'wraps the check inside another construct (if)', run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => `${x}\nif bash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-x.mjs"; then :; fi\n`), backend, t) },
        { name: 'wrapper negated (review 7)', naming: 'wraps the check inside another construct (!)', run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => `${x}\n! bash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-x.mjs"\n`), backend, t) },
        { name: 'wrapper followed by ; (review 7)', naming: "follows the wrapper with ';", run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => `${x}\nbash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-x.mjs"; echo done\n`), backend, t) },
        { name: 'braced ROOT, unwrapped (review 7)', naming: 'runs a check without scripts/run-no-skip.sh', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => `${x}\nnode "\${ROOT}/scripts/verify-x.mjs"\n`), backend, t) },
        { name: 'quote closed before the path (review 7)', naming: 'runs a check without scripts/run-no-skip.sh', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => `${x}\nnode "$ROOT"/scripts/verify-x.mjs\n`), backend, t) },
        { name: 'subshell relative path (review 7)', naming: 'runs a check without scripts/run-no-skip.sh', run: (t) => drift(REPO_ROOT, edit('package-linux.sh', (x) => `${x}\n(cd "$ROOT" && node scripts/verify-x.mjs)\n`), backend, t) },
        { name: 'direct call in a stage-*.sh helper (review 7)', naming: 'no-skip: powerbrowser/packaging/stage-orca-licence.sh', run: (t) => drift(REPO_ROOT, edit('stage-orca-licence.sh', (x) => `${x}\nnode "$ROOT/scripts/verify-x.mjs"\n`), backend, t) },
        { name: 'windows check called directly', naming: 'no-skip: powerbrowser/packaging/package-windows.sh', run: (t) => drift(REPO_ROOT, edit('package-windows.sh', (x) => x.replace('bash "$ROOT/scripts/run-no-skip.sh" -- node "$ROOT/scripts/verify-orca-packaged-tree.mjs"', 'node "$ROOT/scripts/verify-orca-packaged-tree.mjs"')), backend, t) },
        { name: 'swallowing grep form anywhere', naming: 'swallows a grep error', run: (t) => drift(REPO_ROOT, edit('package-macos.sh', (x) => `${x}\nx="$(grep -rlF "$ROOT/" "$RES" 2>/dev/null || true)"\n`), backend, t) },
    ];
    let ok = true;
    const base = withTmp((t) => drift(REPO_ROOT, list, backend, t));
    if (base.length) { console.error(`${NAME}: self-test FAIL -- the real tree is not clean: ${base.join('; ')}`); ok = false; }
    for (const p of plants) {
        const f = withTmp((t) => p.run(t));
        if (!f.some((x) => x.includes(p.naming))) { console.error(`${NAME}: self-test FAIL -- plant '${p.name}' was not red naming '${p.naming}' (got: ${f.join('; ') || 'PASS'})`); ok = false; }
    }
    // The licence helper's digest refusal is exercised by every run (licenceDrift's fixture root).
    if (ok) console.log(`${NAME}: self-test PASS -- the real tree is green, ${plants.length} plants each red naming the drift`);
    return ok;
}

let code;
if (process.argv.includes('--self-test')) code = selfTest() ? verdictExit(`${NAME} self-test`, [], [...SKIPS]) : 1;
else {
    const fails = withTmp((t) => drift(REPO_ROOT, scripts(REPO_ROOT), readFileSync(join(REPO_ROOT, BACKEND_REL), 'utf8'), t));
    if (fails.length) {
        console.error(`${NAME}: FAIL`);
        for (const f of fails) console.error(`  ${f}`);
        console.error(`  Next step: correct the named script in ${PKG_DIR}/, then rerun node scripts/verify-packaging-staging.mjs.`);
    }
    code = verdictExit(NAME, fails, [...SKIPS]);
    if (code === 0) console.log(`${NAME}: PASS -- the claude wrapper resolves from a staged sidecar, Orca's LICENSE is staged by every Orca-staging script, and the checkout-path greps fail on a grep error`);
}
process.exit(code);
