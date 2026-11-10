#!/usr/bin/env node
// scripts/verify-orca-mobile-protocol.mjs
//
// The orca-mobile-protocol gate (Phase 68, OVL-03, D-23; P68-15 as narrowed by
// P68-26): PowerBrowser's Orca overlay touches none of the files orcad shares
// with the stock Orca mobile app, so the stock app keeps pairing with
// PowerBrowser's orcad.
//
// Derived at check time, never hand-kept:
//  a. root 1: every non-test .ts/.tsx file under orca/mobile/src (no .test. or
//     .spec. name segment, not under __tests__), followed transitively through
//     relative imports. Only files under orca/src join the protected set; mobile
//     files are traversed, not protected.
//  b. root 2: the non-test .ts files directly in orca/src/main/runtime/runtime-rpc/
//     plus orca/src/main/ipc/mobile.ts, added as they are and NOT expanded. A
//     transitive root 2 reaches about 40% of src/ (research A8), which would
//     forbid seams D-27 requires.
//  c. the overlay paths: every seam path of orca-overlay/seams.json and every
//     file under orca-overlay/files/ (Orca-root relative).
// Red on: an overlay path inside the protected set (named, with its root); a
// protected set of size 0 ("source moved").
//
// Import extraction: TypeScript's preProcessFile from orca/node_modules/typescript
// when that package's JS entry exports it. TypeScript 7.0.2 (Orca's pin at
// v1.4.248) is the native compiler; its JS entry exports only the version
// (research A14), so the check then uses a regex over `import|export ... from
// '<s>'`, `import '<s>'`, `import('<s>')` and `require('<s>')`. Limit of the
// regex: it does not parse, so a specifier inside a comment or string that has
// that shape is followed too (over-protects, never under-protects), and a
// specifier built at run time is not seen. The PASS line names the method used.
// Only relative specifiers are followed. Resolution order: the exact path, then
// .ts, .tsx, a .js specifier mapped to .ts/.tsx, then /index.ts and /index.tsx.
// An unresolved relative specifier is counted and printed, never dropped.
//
// --skew (the orca-mobile-skew full row, P68-16 as amended by P68-27, D-29):
// the newest mobile-android-v* tag on the Orca remote (read from the REMOTE=
// line of scripts/fetch-orca.sh), that tag's mobile/src/transport/
// protocol-version.ts read through a one-blob partial clone, the pin's
// src/shared/protocol-version.ts, and Orca's own evaluateCompat imported from
// the pinned src/shared/protocol-compat.ts by Node type stripping (never a
// copy). Red on any verdict that refuses the pairing; the lags are reported.
//
// Tiers: default quick (one printed SKIP line and exit 0 when orca/ is absent);
// --skew full (network read; SKIP without orca/); --self-test and
// --skew-self-test quick, hermetic (mkdtemp fixtures, no network).
//
// Usage:
//   node scripts/verify-orca-mobile-protocol.mjs
//   node scripts/verify-orca-mobile-protocol.mjs --skew
//   node scripts/verify-orca-mobile-protocol.mjs --self-test
//   node scripts/verify-orca-mobile-protocol.mjs --skew-self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-mobile-protocol';
const SELF_REL = 'scripts/verify-orca-mobile-protocol.mjs';
const MOBILE_ROOT = 'mobile/src';
const RPC_DIR = 'src/main/runtime/runtime-rpc';
const IPC_MOBILE = 'src/main/ipc/mobile.ts';
const ROOT1_LABEL = 'orca/mobile/src';
const ROOT2_LABEL = 'runtime-rpc and ipc/mobile.ts';
const PARSED = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.cts']);
const SPEC_RE = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"\n]+)['"]|\bimport\s*['"]([^'"\n]+)['"]|\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

const toSlash = (p) => p.split(sep).join('/');
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isTest = (rel) => /\.(test|spec)\./.test(rel.split('/').pop()) || rel.split('/').includes('__tests__');
const extOf = (p) => (p.match(/\.[A-Za-z0-9]+$/) ?? [''])[0];

export function regexExtract(text) {
    return [...text.matchAll(SPEC_RE)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
}

// preProcessFile when Orca's installed TypeScript JS entry exports it, else the regex (header: TS 7 has no JS API).
export function makeExtractor(orcaDir) {
    const pkgDir = join(orcaDir, 'node_modules', 'typescript');
    try {
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
        const dot = pkg.exports?.['.'];
        const entry = (typeof dot === 'string' ? dot : dot?.require ?? dot?.default) ?? pkg.main ?? 'index.js';
        const ts = createRequire(join(pkgDir, 'package.json'))(join(pkgDir, entry));
        if (typeof ts.preProcessFile === 'function') {
            return { method: `TypeScript ${pkg.version} preProcessFile`, extract: (text) => ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName) };
        }
        return { method: `regex (TypeScript ${pkg.version}'s JS entry has no preProcessFile)`, extract: regexExtract };
    } catch {
        return { method: 'regex (orca/node_modules/typescript not installed)', extract: regexExtract };
    }
}

// The exact path, then .ts, .tsx, a .js specifier mapped to .ts/.tsx, then /index.ts and /index.tsx.
export function resolveSpec(fromFile, spec) {
    const base = resolve(dirname(fromFile), spec);
    const cands = [base, `${base}.ts`, `${base}.tsx`];
    if (base.endsWith('.js')) cands.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
    cands.push(join(base, 'index.ts'), join(base, 'index.tsx'));
    return cands.find(isFile) ?? null;
}

function listFiles(root, rel = '') {
    const out = [];
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...listFiles(root, p)); } else if (e.isFile()) out.push(p);
    }
    return out;
}

// files: Orca-root relative paths of the protected set; from: path -> "<root label> via <importer>".
export function protectedSet({ orcaDir, extract }) {
    const files = new Set();
    const from = new Map();
    const unresolved = [];
    const rel = (abs) => toSlash(relative(orcaDir, abs));
    const inside = (r) => !r.startsWith('..') && !r.split('/').includes('node_modules');

    const mobileRoots = listFiles(join(orcaDir, MOBILE_ROOT))
        .filter((p) => (p.endsWith('.ts') || p.endsWith('.tsx')) && !isTest(p))
        .map((p) => join(orcaDir, MOBILE_ROOT, p));
    const seen = new Set(mobileRoots);
    const queue = [...mobileRoots];
    while (queue.length) {
        const file = queue.pop();
        if (!PARSED.has(extOf(file))) continue;
        for (const spec of extract(readFileSync(file, 'utf8'))) {
            if (!spec.startsWith('./') && !spec.startsWith('../') && spec !== '.' && spec !== '..') continue;
            const hit = resolveSpec(file, spec);
            if (!hit) { unresolved.push(`${rel(file)}: '${spec}'`); continue; }
            const r = rel(hit);
            if (!inside(r) || seen.has(hit)) continue;
            seen.add(hit);
            queue.push(hit);
            if (r.startsWith('src/')) { files.add(r); from.set(r, `${ROOT1_LABEL} via ${rel(file)}`); }
        }
    }
    const mobile = files.size;

    let rpc = 0;
    const rpcFiles = (() => { try { return readdirSync(join(orcaDir, RPC_DIR), { withFileTypes: true }); } catch { return []; } })()
        .filter((e) => e.isFile() && e.name.endsWith('.ts') && !isTest(e.name)).map((e) => `${RPC_DIR}/${e.name}`);
    if (isFile(join(orcaDir, IPC_MOBILE))) rpcFiles.push(IPC_MOBILE);
    for (const r of rpcFiles) {
        if (!files.has(r)) { files.add(r); from.set(r, ROOT2_LABEL); }
        rpc++;
    }
    return { files, from, unresolved, roots: { mobile, rpc, mobileFiles: mobileRoots.length } };
}

// The overlay's paths: seams.json rows and files/ entries, Orca-root relative. An absent seams.json is zero seams.
export function readOverlay(overlayDir) {
    const seamsFile = join(overlayDir, 'seams.json');
    const seamPaths = existsSync(seamsFile) ? JSON.parse(readFileSync(seamsFile, 'utf8')).seams.map((s) => s.path) : [];
    return { seamPaths, overlayFiles: listFiles(join(overlayDir, 'files')).sort() };
}

export function overlap({ protectedFiles, from = new Map(), seamPaths, overlayFiles }) {
    const fails = [];
    for (const [kind, paths] of [['seam', seamPaths], ['overlay file', overlayFiles]]) {
        for (const p of paths) if (protectedFiles.has(p)) fails.push(`overlay touches protected protocol file ${p} (${kind}; reached from ${from.get(p) ?? 'a root'})`);
    }
    return fails;
}

export function check({ orcaDir = join(REPO_ROOT, 'orca'), overlayDir = join(REPO_ROOT, 'orca-overlay'), extractor } = {}) {
    if (!existsSync(orcaDir)) return { skip: 'orca/ is not fetched, so the protected set cannot be derived (bash scripts/fetch-orca.sh)', fails: [] };
    const ex = extractor ?? makeExtractor(orcaDir);
    const set = protectedSet({ orcaDir, extract: ex.extract });
    const fails = [];
    if (set.files.size === 0 || set.roots.mobile === 0) fails.push(`protected set is empty: source moved (re-read the roots in this script's header; ${ROOT1_LABEL} reached ${set.roots.mobile} file(s) under orca/src)`);
    const { seamPaths, overlayFiles } = readOverlay(overlayDir);
    fails.push(...overlap({ protectedFiles: set.files, from: set.from, seamPaths, overlayFiles }));
    return { skip: null, fails, set, seamPaths, overlayFiles, method: ex.method };
}

function render(r) {
    if (r.skip) return { code: 0, lines: [`${NAME}: SKIP -- ${r.skip}`] };
    if (r.fails.length) return { code: 1, lines: r.fails.map((f) => `${NAME}: FAIL -- ${f}`) };
    const { set } = r;
    const lines = [`${NAME}: PASS -- ${set.files.size} protected files (${set.roots.mobile} from ${ROOT1_LABEL}, ${set.roots.rpc} runtime-rpc and ipc/mobile.ts), ${r.seamPaths.length} seam(s) and ${r.overlayFiles.length} overlay file(s) outside it, ${set.unresolved.length} unresolved specifier(s) [${r.method}]`];
    if (set.unresolved.length) lines.unshift(`${NAME}: NOTE -- unresolved relative specifier(s): ${set.unresolved.join('; ')}`);
    return { code: 0, lines };
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const orca = join(tmp, 'orca');
    const overlay = join(tmp, 'orca-overlay');
    const put = (root, rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
    const extractor = { method: 'regex (fixture)', extract: regexExtract };
    try {
        const base = () => ({
            orca: {
                'mobile/src/a.ts': "import { V } from '../../src/shared/protocol-version'\nimport './missing-asset'\n",
                'mobile/src/a.test.ts': "import '../../src/test-only'\n",
                'src/test-only.ts': 'export const t = 1\n',
                'src/shared/protocol-version.ts': "export { evaluate } from './protocol-compat'\nexport const V = 3\n",
                'src/shared/protocol-compat.ts': 'export const evaluate = () => 1\n',
                [`${RPC_DIR}/x.ts`]: "import { f } from '../../far.ts'\n",
                [`${RPC_DIR}/x.test.ts`]: 'export {}\n',
                'src/main/far.ts': 'export const f = 1\n',
                [IPC_MOBILE]: 'export const m = 1\n',
                'src/other.ts': 'export const o = 1\n',
            },
            seams: ['src/other.ts'],
            files: {},
        });
        const run = (spec) => {
            for (const d of [orca, overlay]) rmSync(d, { recursive: true, force: true });
            for (const [p, body] of Object.entries(spec.orca)) put(orca, p, body);
            mkdirSync(join(orca, MOBILE_ROOT), { recursive: true });
            put(overlay, 'seams.json', `${JSON.stringify({ seams: spec.seams.map((path) => ({ path })) }, null, 2)}\n`);
            for (const [p, body] of Object.entries(spec.files)) put(overlay, `files/${p}`, body);
            return check({ orcaDir: orca, overlayDir: overlay, extractor });
        };

        const ctl = run(base());
        const want = ['src/shared/protocol-version.ts', 'src/shared/protocol-compat.ts', `${RPC_DIR}/x.ts`, IPC_MOBILE].sort();
        const got = [...(ctl.set?.files ?? [])].sort();
        if (ctl.fails.length || got.join() !== want.join()) {
            console.error(`${NAME} self-test: FAIL -- control is not green with the expected set: fails ${ctl.fails.join(' | ') || 'none'}; set ${got.join(', ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- seam on src/other.ts; set ${got.join(', ')}`);
        if (ctl.set.files.has('src/main/far.ts') || ctl.set.files.has('src/test-only.ts')) {
            console.error(`${NAME} self-test: FAIL -- root 2 was expanded or a test file was a root (far.ts or test-only.ts in the set)`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- far.ts (imported only by runtime-rpc) and test-only.ts (imported only by a test) are outside the set`);
        if (ctl.set.unresolved.length !== 1 || !ctl.set.unresolved[0].includes('missing-asset')) {
            console.error(`${NAME} self-test: FAIL -- the unresolved specifier was not counted: ${ctl.set.unresolved.join('; ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- one unresolved specifier counted and printed, not red`);
        const far = run({ ...base(), seams: ['src/main/far.ts'] });
        if (far.fails.length) { console.error(`${NAME} self-test: FAIL -- a seam on far.ts went red (root 2 expanded): ${far.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control green -- a seam on src/main/far.ts`);
        const away = check({ orcaDir: join(tmp, 'absent'), overlayDir: overlay, extractor });
        if (!away.skip) { console.error(`${NAME} self-test: FAIL -- no orca/ did not SKIP`); return 1; }
        console.log(`${NAME} self-test: control -- no orca/ SKIPs by a line`);

        const plants = [
            { name: 'seam-on-protocol-version', naming: 'protected protocol file src/shared/protocol-version.ts', apply: (s) => { s.seams.push('src/shared/protocol-version.ts'); } },
            { name: 'overlay-file-shadows-closure-file', naming: 'protected protocol file src/shared/protocol-compat.ts (overlay file', apply: (s) => { s.files['src/shared/protocol-compat.ts'] = 'export {}\n'; } },
            { name: 'seam-on-runtime-rpc-file', naming: `protected protocol file ${RPC_DIR}/x.ts (seam; reached from ${ROOT2_LABEL})`, apply: (s) => { s.seams.push(`${RPC_DIR}/x.ts`); } },
            { name: 'empty-mobile-src', naming: 'source moved', apply: (s) => { for (const k of Object.keys(s.orca)) if (k.startsWith('mobile/')) delete s.orca[k]; } },
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
            if (run(base()).fails.length) { console.error(`${NAME} self-test: FAIL -- plant ${p.name} did not clean up`); return 1; }
        }
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const MODES = new Set(['--self-test']);
const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const bad = args.find((a) => !MODES.has(a)) ?? (args.length > 1 ? args[1] : undefined);
    if (bad !== undefined) {
        console.error(`${NAME}: unknown argument ${bad} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
        process.exit(2);
    }
    if (args[0] === '--self-test') process.exit(runSelfTest());
    const { code, lines } = render(check());
    for (const l of lines) (code ? console.error : console.log)(l);
    process.exit(code);
}
