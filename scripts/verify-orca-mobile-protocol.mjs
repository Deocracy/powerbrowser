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
// when that package's JS entry exports it. TypeScript 7.0.2 (at Orca's pin
// when this check was written) is the native compiler; its JS entry exports only the version
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
// The tag is not commit-pinned, so its constants file is never executed
// (harness-static-hosting-02): the two integers are read as text, each from
// exactly one `export const NAME = <integer literal>` line, and any other
// shape is "constants file moved". Only the pinned, reviewed tree is imported.
//
// Tiers: default quick (SKIP, exit 77 with one SKIP line, when orca/ is absent;
// SKIP-PROTOCOL.md); --skew full (network read; SKIP without orca/); --self-test
// and --skew-self-test quick, hermetic (mkdtemp fixtures, no network).
//
// Usage:
//   node scripts/verify-orca-mobile-protocol.mjs
//   node scripts/verify-orca-mobile-protocol.mjs --skew
//   node scripts/verify-orca-mobile-protocol.mjs --self-test
//   node scripts/verify-orca-mobile-protocol.mjs --skew-self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from './lib/toml.cjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

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
    if (r.skip) return { code: SKIP_EXIT, lines: [skipLine(NAME, r.skip)] };
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
        // The main mode over an absent orca/, as a child with captured output: exit 77 and the SKIP line last.
        const away = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--orca-dir=${join(tmp, 'absent')}`], { encoding: 'utf8' });
        const awayLast = away.stdout.trim().split('\n').pop();
        if (away.status !== 77 || !awayLast.startsWith(`${NAME}: SKIP -- orca/ is not fetched`) || away.stderr.includes(': SKIP')) {
            console.error(`${NAME} self-test: FAIL -- no orca/ did not exit 77 with the SKIP line last on stdout (status ${away.status}, last line ${JSON.stringify(awayLast)})`);
            return 1;
        }
        console.log(`${NAME} self-test: control -- no orca/ exits 77 with the SKIP line last`);

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

// ---- --skew: the pin against the newest stock Android app (P68-16, P68-27, D-29) ----

const SKEW = 'orca-mobile-skew';
// Old layout first, then the transport/connection/ layout (moved by mobile-android-v0.0.65).
const APP_CONSTANTS_RELS = ['mobile/src/transport/protocol-version.ts', 'mobile/src/transport/connection/protocol-version.ts'];
const APP_CONSTANTS_REL = APP_CONSTANTS_RELS.join(' or ');
const PIN_CONSTANTS_REL = 'src/shared/protocol-version.ts';
const COMPAT_REL = 'src/shared/protocol-compat.ts';
const APP_JSON_REL = 'mobile/app.json';
const APP_TAG = /^refs\/tags\/mobile-android-v(\d+)\.(\d+)\.(\d+)$/;
const ORCA_TAG = /^refs\/tags\/(v(\d+)\.(\d+)\.(\d+))$/;
const triple = (s) => s.replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// The one REMOTE= line of scripts/fetch-orca.sh; a missing line is red, never a default.
export function readRemote(repoRoot = REPO_ROOT) {
    const m = readFileSync(join(repoRoot, 'scripts', 'fetch-orca.sh'), 'utf8').match(/^REMOTE="([^"\n]+)"$/m);
    if (!m) throw new Error('scripts/fetch-orca.sh has no REMOTE="..." line (the Orca remote is read from there)');
    return m[1];
}

export function listTags(remote) {
    return execFileSync('git', ['ls-remote', '--tags', remote], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
        .split('\n').filter(Boolean).map((l) => l.split('\t')[1]).filter((r) => r && !r.endsWith('^{}'));
}

export function newestAppTag(refs) {
    const tags = refs.map((r) => r.match(APP_TAG)).filter(Boolean).map((m) => ({ tag: m[0].slice('refs/tags/'.length), v: [+m[1], +m[2], +m[3]] }));
    if (!tags.length) throw new Error('no mobile-android tag on the remote (git ls-remote --tags listed none named mobile-android-vX.Y.Z)');
    return tags.sort((a, b) => cmp(b.v, a.v))[0];
}

// Strict vX.Y.Z tags newer than the pin, and the newest of them (the pin itself when none is newer).
export function orcaTagLag(refs, pinTag) {
    const pin = triple(pinTag);
    const tags = refs.map((r) => r.match(ORCA_TAG)).filter(Boolean).map((m) => m[1]);
    const newer = tags.filter((t) => cmp(triple(t), pin) > 0).sort((a, b) => cmp(triple(b), triple(a)));
    return { behind: newer.length, newest: newer[0] ?? pinTag };
}

// Relative specifiers in Orca's tree are extensionless; resolve them by this script's own rule.
let hooked = false;
function hookOrcaResolution() {
    if (hooked) return;
    hooked = true;
    registerHooks({
        resolve(spec, ctx, next) {
            if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) {
                const hit = resolveSpec(fileURLToPath(ctx.parentURL), spec);
                if (hit) return next(pathToFileURL(hit).href, ctx);
            }
            return next(spec, ctx);
        },
    });
    // Orca's package.json names no module type; Node's reparse notice is noise here, every other warning still prints.
    process.removeAllListeners('warning');
    process.on('warning', (w) => { if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON' && w.name !== 'ExperimentalWarning') console.error(`${w.name}: ${w.message}`); });
}

// The one integer literal of `export const <name> = <n>` (an optional `: number`, `as const` and `;`, a trailing line
// comment), or null when the file declares it in no such line or in more than one.
function integerConst(text, name) {
    const lines = String(text).split('\n').filter((l) => new RegExp(`\\b${name}\\b`).test(l) && /^\s*export\s/.test(l));
    if (lines.length !== 1) return null;
    const m = new RegExp(`^\\s*export\\s+const\\s+${name}\\s*(?::\\s*number\\s*)?=\\s*(0|[1-9]\\d*)(?:\\s+as\\s+const)?\\s*;?\\s*(?://.*)?$`).exec(lines[0]);
    return m ? Number(m[1]) : null;
}

// The stock app's constants file, read as text and never executed (harness-static-hosting-02): the file comes from a
// tag nothing ties to a reviewed commit. label names it in a red.
export function readAppConstants(text, label) {
    const mobileProtocolVersion = integerConst(text, 'MOBILE_PROTOCOL_VERSION');
    const minCompatibleDesktopVersion = integerConst(text, 'MIN_COMPATIBLE_DESKTOP_VERSION');
    if (!Number.isSafeInteger(mobileProtocolVersion) || !Number.isSafeInteger(minCompatibleDesktopVersion)) {
        throw new Error(`the stock app's constants file moved (${label}: no MOBILE_PROTOCOL_VERSION and MIN_COMPATIBLE_DESKTOP_VERSION exports, each one export const line of an integer literal)`);
    }
    return { mobileProtocolVersion, minCompatibleDesktopVersion };
}

// The constants at whichever known layout holds them; read(rel) returns the file's text or throws when absent.
export async function constantsAt(read, tag) {
    for (const rel of APP_CONSTANTS_RELS) {
        let text = '';
        try { text = read(rel); } catch { continue; }
        try { return readAppConstants(text, `${rel} at ${tag}`); } catch { /* try the next layout */ }
    }
    return readAppConstants('', `${APP_CONSTANTS_REL} at ${tag}`);
}

// One-blob partial clone of <remote> at <tag>, then the constants file at HEAD.
export async function appConstants(remote, tag, scratch) {
    const dir = mkdtempSync(join(scratch, 'app-'));
    execFileSync('git', ['-c', 'advice.detachedHead=false', 'clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1', '--branch', tag, remote, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    return constantsAt((rel) => execFileSync('git', ['-C', dir, 'show', `HEAD:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), tag);
}

export async function pinConstants(orcaDir) {
    hookOrcaResolution();
    const m = await import(pathToFileURL(join(orcaDir, PIN_CONSTANTS_REL)).href);
    if (!Number.isInteger(m.RUNTIME_PROTOCOL_VERSION) || !Number.isInteger(m.MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION)) {
        throw new Error(`the pin's constants moved (orca/${PIN_CONSTANTS_REL}: no RUNTIME_PROTOCOL_VERSION and MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION exports)`);
    }
    return { desktopProtocolVersion: m.RUNTIME_PROTOCOL_VERSION, desktopMinCompatibleMobileVersion: m.MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION };
}

// Orca's own rule from the pinned tree. The accepting kind is what evaluateCompat returns for equal versions with no floor.
export async function loadCompat(orcaDir) {
    hookOrcaResolution();
    const { evaluateCompat } = await import(pathToFileURL(join(orcaDir, COMPAT_REL)).href);
    if (typeof evaluateCompat !== 'function') throw new Error(`orca/${COMPAT_REL} no longer exports evaluateCompat (the source moved)`);
    const acceptKind = evaluateCompat({ mobileProtocolVersion: 1, minCompatibleDesktopVersion: 0, desktopProtocolVersion: 1, desktopMinCompatibleMobileVersion: 0 }).kind;
    return { evaluateCompat, acceptKind };
}

export function verdictOf(compat, app, pin) {
    const v = compat.evaluateCompat({ ...app, ...pin });
    const kind = v.reason ? `${v.kind} (${v.reason})` : v.kind;
    return { kind, refuses: v.kind !== compat.acceptKind, detail: v };
}

async function runSkew({ repoRoot = REPO_ROOT, orcaDir = join(repoRoot, 'orca') } = {}) {
    if (!existsSync(join(orcaDir, COMPAT_REL))) return { code: SKIP_EXIT, lines: [skipLine(SKEW, 'orca/ is not fetched, so the pinned evaluateCompat and constants cannot be read. Next step: bash scripts/fetch-orca.sh')] };
    const scratch = mkdtempSync(join(tmpdir(), `${SKEW}-`));
    try {
        const remote = readRemote(repoRoot);
        const pinTag = parse(readFileSync(join(repoRoot, 'configuration.toml'), 'utf8')).upstreams?.orca_tag;
        if (typeof pinTag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(pinTag)) throw new Error('configuration.toml [upstreams] orca_tag is absent or not vX.Y.Z');
        const refs = listTags(remote);
        const app = newestAppTag(refs);
        const lag = orcaTagLag(refs, pinTag);
        const appC = await appConstants(remote, app.tag, scratch);
        const pin = await pinConstants(orcaDir);
        const compat = await loadCompat(orcaDir);
        const v = verdictOf(compat, appC, pin);
        const pinApp = JSON.parse(readFileSync(join(orcaDir, APP_JSON_REL), 'utf8')).expo?.version;
        if (typeof pinApp !== 'string' || !/^\d+\.\d+\.\d+$/.test(pinApp)) throw new Error(`orca/${APP_JSON_REL} has no expo.version X.Y.Z (the source moved)`);
        const d = app.v.map((n, i) => n - triple(pinApp)[i]);
        const facts = `pin ${pinTag} is ${lag.behind} tag(s) behind ${lag.newest}; stock Android app ${app.v.join('.')} (${app.tag}; pin's app ${pinApp}, difference ${d.join('.')}); app protocol ${appC.mobileProtocolVersion} needs desktop >= ${appC.minCompatibleDesktopVersion}, pin protocol ${pin.desktopProtocolVersion} needs mobile >= ${pin.desktopMinCompatibleMobileVersion}`;
        if (v.refuses) {
            return { code: 1, lines: [`${SKEW}: FAIL -- verdict ${v.kind}: evaluateCompat refuses the stock app against the pinned orcad, a re-pin is due; ${facts}`] };
        }
        return { code: 0, lines: [`${SKEW}: PASS -- ${facts}; verdict ${v.kind}`] };
    } catch (err) {
        return { code: 1, lines: [`${SKEW}: FAIL -- ${err.message.split('\n')[0]}`] };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

// No network: fixture listings and constants text; evaluateCompat and the pin's constants come from the real pinned tree.
async function runSkewSelfTest({ orcaDir = join(REPO_ROOT, 'orca') } = {}) {
    if (!existsSync(join(orcaDir, COMPAT_REL))) { console.log(skipLine(`${SKEW} self-test`, "orca/ is not fetched, so Orca's own evaluateCompat cannot be imported. Next step: bash scripts/fetch-orca.sh")); return SKIP_EXIT; }
    const scratch = mkdtempSync(join(tmpdir(), `${SKEW}-self-`));
    const constants = (mobile, minDesktop) => `// fixture\nexport const MOBILE_PROTOCOL_VERSION = ${mobile}\nexport const MIN_COMPATIBLE_DESKTOP_VERSION = ${minDesktop}\n`;
    const listing = ['refs/tags/v1.0.9', 'refs/tags/v1.0.10', 'refs/tags/v1.0.10-rc.1', 'refs/tags/mobile-android-v0.0.9', 'refs/tags/mobile-android-v0.0.10'];
    try {
        const pin = await pinConstants(orcaDir);
        const compat = await loadCompat(orcaDir);
        // One fixture case: a listing and a constants text through the same functions the live row calls.
        // files maps a layout path to its text; a bare string is the old layout's file.
        const evaluate = async (refs, files) => {
            const app = newestAppTag(refs);
            const tree = typeof files === 'string' ? { [APP_CONSTANTS_RELS[0]]: files } : files;
            const v = verdictOf(compat, await constantsAt((rel) => { if (!(rel in tree)) throw new Error('absent'); return tree[rel]; }, app.tag), pin);
            if (v.refuses) throw new Error(`verdict ${v.kind}`);
            return { app, v };
        };
        const ctl = await evaluate(listing, constants(pin.desktopProtocolVersion, pin.desktopMinCompatibleMobileVersion));
        const lag = orcaTagLag(listing, 'v1.0.9');
        if (ctl.app.tag !== 'mobile-android-v0.0.10' || lag.behind !== 1 || lag.newest !== 'v1.0.10') {
            console.error(`${SKEW} self-test: FAIL -- control picked ${ctl.app.tag}, ${lag.behind} behind ${lag.newest} (want mobile-android-v0.0.10, 1 behind v1.0.10: integer ordering, -rc excluded)`);
            return 1;
        }
        const moved = await evaluate(listing, { [APP_CONSTANTS_RELS[1]]: constants(pin.desktopProtocolVersion, pin.desktopMinCompatibleMobileVersion) });
        console.log(`${SKEW} self-test: new layout green -- ${APP_CONSTANTS_RELS[1]} found, verdict ${moved.v.kind}`);
        console.log(`${SKEW} self-test: control green -- the pin's constants against an app of the same versions: verdict ${ctl.v.kind}; newest app tag ${ctl.app.tag}; 1 tag behind v1.0.10`);
        // harness-static-hosting-02: a constants file with top-level code is read, never run.
        const canary = join(scratch, 'executed');
        const hostile = `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(canary)}, 'x')\n${constants(pin.desktopProtocolVersion, pin.desktopMinCompatibleMobileVersion)}`;
        const read = await evaluate(listing, hostile);
        if (existsSync(canary)) { console.error(`${SKEW} self-test: FAIL -- the fetched constants file was executed (its top-level code wrote ${canary})`); return 1; }
        console.log(`${SKEW} self-test: control green -- a constants file with top-level code is read as text, not executed (verdict ${read.v.kind})`);
        const plants = [
            { name: 'app-needs-newer-desktop', naming: 'desktop-too-old', run: () => evaluate(listing, constants(pin.desktopProtocolVersion, pin.desktopProtocolVersion + 1)) },
            { name: 'app-older-than-pin-minimum', naming: 'mobile-too-old', run: () => evaluate(listing, constants(pin.desktopMinCompatibleMobileVersion - 1, 0)) },
            { name: 'listing-with-no-app-tag', naming: 'no mobile-android tag', run: () => evaluate(listing.filter((r) => !r.includes('mobile-android')), constants(pin.desktopProtocolVersion, 0)) },
            { name: 'new-layout-needs-newer-desktop', naming: 'desktop-too-old', run: () => evaluate(listing, { [APP_CONSTANTS_RELS[1]]: constants(pin.desktopProtocolVersion, pin.desktopProtocolVersion + 1) }) },
            { name: 'constants-in-neither-layout', naming: 'constants file moved', run: () => evaluate(listing, { 'mobile/src/transport/elsewhere/protocol-version.ts': constants(pin.desktopProtocolVersion, 0) }) },
            { name: 'constants-file-moved', naming: 'constants file moved', run: () => evaluate(listing, 'export const SOMETHING_ELSE = 1\n') },
            { name: 'constant-computed-at-run-time', naming: 'constants file moved', run: () => evaluate(listing, `export const MOBILE_PROTOCOL_VERSION = Number(process.env.V ?? ${pin.desktopProtocolVersion})\nexport const MIN_COMPATIBLE_DESKTOP_VERSION = 0\n`) },
            { name: 'constant-declared-twice', naming: 'constants file moved', run: () => evaluate(listing, `${constants(pin.desktopProtocolVersion, 0)}export const MOBILE_PROTOCOL_VERSION = 99\n`) },
        ];
        let failures = 0;
        for (const p of plants) {
            let err = null;
            try { await p.run(); } catch (e) { err = e.message; }
            if (!err) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!err.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${err}`); failures++;
            } else {
                console.log(`  ok ${p.name} -> red, naming '${p.naming}' (${err})`);
            }
        }
        if (failures) { console.error(`${SKEW} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`); return 1; }
        console.log(`${SKEW} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } catch (err) {
        console.error(`${SKEW} self-test: FAIL -- ${err.message.split('\n')[0]}`);
        return 1;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

const MODES = new Set(['--self-test', '--skew', '--skew-self-test']);
// --orca-dir=<path> runs the default mode over another Orca checkout (the self-test's SKIP control).
const ORCA_DIR_ARG = process.argv.find((a) => a.startsWith('--orca-dir='));
const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const modeArgs = args.filter((a) => !a.startsWith('--orca-dir='));
    const bad = modeArgs.find((a) => !MODES.has(a)) ?? (modeArgs.length > 1 ? modeArgs[1] : undefined) ?? (ORCA_DIR_ARG && modeArgs.length ? ORCA_DIR_ARG : undefined);
    if (bad !== undefined) {
        console.error(`${NAME}: unknown argument ${bad} (usage: node ${SELF_REL} [--self-test | --skew | --skew-self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
        process.exit(2);
    }
    if (modeArgs[0] === '--self-test') process.exit(runSelfTest());
    if (modeArgs[0] === '--skew-self-test') process.exit(await runSkewSelfTest());
    const { code, lines } = modeArgs[0] === '--skew' ? await runSkew() : render(check(ORCA_DIR_ARG ? { orcaDir: resolve(ORCA_DIR_ARG.slice('--orca-dir='.length)) } : {}));
    for (const l of lines) (code === 0 || code === SKIP_EXIT ? console.log : console.error)(l);
    process.exit(code);
}
