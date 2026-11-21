#!/usr/bin/env node
// scripts/verify-orca-credential-store.mjs
//
// RUN-09 (Phase 67, plan 67-01; P67-16..P67-18, P67-29): PowerBrowser's refusal and its protection
// sentence stay tied to what the pinned orcad does. Derived at check time from the pinned Orca source
// with theia/node_modules/typescript (P63-27), compared with powerbrowser/shell/OrcaEnv.sys.mjs and
// website-staging/privacy.html:
//
//  1. The override. The string value of ORCAD_PLAINTEXT_SECRETS_ENV
//     (src/main/orcad/orcad-secret-protection-gap.ts) and the literal resolveState compares it with
//     (src/main/orcad/orcad-secret-key-resolution.ts) equal OrcaEnv.ORCA_PLAINTEXT_OVERRIDE.
//  2. Temp roots. The roots isTemporaryKeyDir tests (src/main/orcad/orcad-secret-key-record.ts),
//     with tmpdir() read as the TMPDIR, TMP, TEMP family Node's os.tmpdir() consults on POSIX, are
//     a subset of PowerBrowser's Linux roots (ORCA_FIXED_TEMP_ROOTS.linux plus
//     ORCA_TEMP_ENV_NAMES.linux).
//  3. Backends. The backend values of every object literal written in the key-record sources are
//     exactly host-file; anything else means orcad can keep the key in a keyring and the protection
//     sentence is no longer true. The key-record sources are every non-test file under
//     src/main/orcad whose name says secret, keyring or credential, or that names the record
//     (StoredKeyState, orcad-secret-key-record, 'host-file', 'os-keyring'); a record rebuilt inside
//     the function that JSON.parses the stored text is the read side and is not a write
//     (harness-static-hosting-07). Every keyring program a non-test orcad file runs (secret-tool,
//     security) runs a read subcommand only, and no file imports keytar.
//  7. Owner-only key file (harness-static-hosting-07). The sentence says only the user's account can
//     read the key file. From the pin: restrictExistingRecord (orcad-secret-key-record.ts) requires
//     (mode & 0o077) === 0; the key-record sources write files only through writeSecureFile; and
//     src/shared/secure-file.ts's writeSecureFile calls a function that chmods what it writes, every
//     chmodSync and mode: literal in that file leaving no group or other bit.
//  4. Allowlist. The override name is in neither ORCAD_ENV_ALLOWLIST nor ORCAD_FIXED_ENV_NAMES, so it
//     can never reach orcad (P67-17).
//  5. The sentence. privacy.html has exactly one element carrying data-orca-credential-protection and
//     its text equals OrcaEnv.ORCA_PROTECTION_SENTENCE; while lane p67-03's copy file exists its
//     ORCA_PROTECTION_SENTENCE equals it too (one named SKIP while the orca-panes failure/ directory
//     is absent, red when the directory exists without the file).
//  6. tempRootOf, over cases derived from PB's own roots: a data root under each Linux root matches
//     it, the same root reached through its realpath matches, a sibling sharing the root as a string
//     prefix (/tmpfoo) does not, and a win32 path differing only in case matches.
// Clauses 1-3 and 7 are skipped when orca/ or typescript is absent; 4-6 always run. A skipped clause
// makes the row SKIP (exit 77, one SKIP line, SKIP-PROTOCOL.md), never PASS (harness-static-hosting-01).
//
// Limit: this proves PB's constants and statement agree with the pinned source. That a refusal
// really spawns nothing, and that orcad reports what the sentence says, is orca-service scenario L
// (stub boundary) and orca-credential-store-live (built PowerBrowser and orcad).
//
// --self-test copies OrcaEnv, privacy.html, synthetic pinned files and a synthetic copy file into a
// mkdtemp directory, requires the copies green, then plants each fault and requires red naming it.
//
// Honestly --quick: text reads, one in-process import and a TypeScript parse.
//
// Usage:
//   node scripts/verify-orca-credential-store.mjs
//   node scripts/verify-orca-credential-store.mjs --self-test

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-credential-store';
const SELF_REL = 'scripts/verify-orca-credential-store.mjs';
// Node's os.tmpdir() on POSIX reads TMPDIR, then TMP, then TEMP (A-4, verified for Node and Gecko's TmpD).
const NODE_TMPDIR_FAMILY = ['TMPDIR', 'TMP', 'TEMP'];
const KEYRING_RED = 'Orca writes a keyring backend: the protection sentence is no longer true';
const KEYRING_WRITE_RED = 'keyring write: an orcad file runs a keyring program to store, not look up';
const OWNER_ONLY_RED = 'owner-only key file';
// The subcommands of the two keyring programs that only read (secret-tool(1), security(1)).
const KEYRING_PROGRAMS = { 'secret-tool': ['lookup', 'search'], security: ['find-generic-password', 'find-internet-password'] };
const FILE_WRITERS = ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream'];

export function pathsFor(root) {
    const orcad = join(root, 'orca', 'src', 'main', 'orcad');
    const failureDir = join(root, 'theia', 'extensions', 'orca-panes', 'src', 'browser', 'failure');
    return {
        orcaEnv: join(root, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs'),
        privacy: join(root, 'website-staging', 'privacy.html'),
        orcaDir: join(root, 'orca'),
        orcadDir: orcad,
        secureFile: join(root, 'orca', 'src', 'shared', 'secure-file.ts'),
        gapFile: join(orcad, 'orcad-secret-protection-gap.ts'),
        resolutionFile: join(orcad, 'orcad-secret-key-resolution.ts'),
        recordFile: join(orcad, 'orcad-secret-key-record.ts'),
        migrationFile: join(orcad, 'orcad-plaintext-credential-migration.ts'),
        failureDir,
        copyFile: join(failureDir, 'orca-failure-copy.ts'),
        typescriptFrom: join(REPO_ROOT, 'theia', 'package.json'),
    };
}

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
let importCounter = 0;
const freshImport = (path) => import(`${pathToFileURL(path).href}?v=${process.pid}-${++importCounter}`);

export function loadTypescript(from = pathsFor(REPO_ROOT).typescriptFrom) {
    try { return createRequire(from)('typescript'); } catch { return undefined; }
}

function walk(ts, node, visit) {
    visit(node);
    ts.forEachChild(node, (child) => walk(ts, child, visit));
}
const parse = (ts, text) => ts.createSourceFile('pinned.ts', text ?? '', ts.ScriptTarget.Latest, true);

/**
 * The pinned facts: { name, value, roots, backends, problems }. roots holds string literals and
 * 'tmpdir()'; problems names what could not be derived ("source moved").
 */
export function derivePinned(paths, ts) {
    const problems = [];
    let name = null;
    walk(ts, parse(ts, read(paths.gapFile)), (n) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === 'ORCAD_PLAINTEXT_SECRETS_ENV' && n.initializer && ts.isStringLiteral(n.initializer)) name = n.initializer.text;
    });
    if (!name) problems.push(`source moved: no string ORCAD_PLAINTEXT_SECRETS_ENV in ${paths.gapFile}`);

    let value = null;
    for (const file of [paths.resolutionFile, paths.migrationFile]) {
        walk(ts, parse(ts, read(file)), (n) => {
            if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.operatorToken.kind)) {
                const sides = [n.left, n.right];
                const access = sides.find((s) => ts.isElementAccessExpression(s) && s.argumentExpression.getText() === 'ORCAD_PLAINTEXT_SECRETS_ENV');
                const lit = sides.find((s) => ts.isStringLiteral(s));
                if (access && lit) value = lit.text;
            }
        });
    }
    if (!value) problems.push(`source moved: no comparison of ORCAD_PLAINTEXT_SECRETS_ENV with a string in ${paths.resolutionFile}`);

    // 3. Backends over every key-record source, and keyring programs over every orcad file.
    const backends = new Set();
    const keyringRuns = [];
    const writers = [];
    const orcadFiles = orcadSources(paths.orcadDir);
    const recordFiles = new Set([paths.resolutionFile, paths.migrationFile, paths.recordFile]);
    for (const file of orcadFiles) {
        const text = read(file);
        if (/secret|keyring|credential/i.test(file.slice(paths.orcadDir.length)) || /\bStoredKeyState\b|orcad-secret-key-record|'host-file'|'os-keyring'/.test(text ?? '')) recordFiles.add(file);
    }
    for (const file of orcadFiles) {
        const rel = file.slice(paths.orcadDir.length + 1);
        const isRecord = recordFiles.has(file);
        walk(ts, parse(ts, read(file)), (n) => {
            // A written record: a property assignment in an object literal, never a type literal, outside the parser.
            if (isRecord && ts.isPropertyAssignment(n) && n.name.getText() === 'backend' && ts.isObjectLiteralExpression(n.parent) && !insideParser(ts, n)) {
                backends.add(ts.isStringLiteral(n.initializer) ? n.initializer.text : `<non-literal ${n.initializer.getText()}>`);
            }
            if (isRecord && ts.isCallExpression(n)) {
                const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText();
                if (FILE_WRITERS.includes(callee)) writers.push(`${rel} calls ${callee}`);
            }
            if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && /^keytar\b/.test(n.moduleSpecifier.text)) keyringRuns.push({ rel, program: 'keytar', sub: 'import' });
            if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
                const program = /^(?:.*\/)?(secret-tool|security)$/.exec(n.text)?.[1];
                if (program && ts.isArrayLiteralExpression(n.parent)) {
                    const next = n.parent.elements[n.parent.elements.indexOf(n) + 1];
                    const first = next && ts.isArrayLiteralExpression(next) ? next.elements[0] : next;
                    keyringRuns.push({ rel, program, sub: first && ts.isStringLiteral(first) ? first.text : null });
                }
            }
        });
    }
    if (!backends.size) problems.push(`source moved: no written backend: property in the key-record sources under ${paths.orcadDir}`);

    // 7. Owner-only key file.
    const owner = [];
    let mask = null;
    walk(ts, parse(ts, read(paths.recordFile)), (n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === 'restrictExistingRecord') {
            walk(ts, n, (m) => {
                if (ts.isBinaryExpression(m) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(m.operatorToken.kind)) {
                    const [l, r] = [m.left, m.right].map((x) => (ts.isParenthesizedExpression(x) ? x.expression : x));
                    const and = [l, r].find((x) => ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandToken && /\.mode$/.test(x.left.getText()) && ts.isNumericLiteral(x.right));
                    const zero = [l, r].find((x) => ts.isNumericLiteral(x) && Number(x.text) === 0);
                    if (and && zero) mask = Number(and.right.text);
                }
            });
        }
    });
    if (mask === null) owner.push(`restrictExistingRecord in ${paths.recordFile} no longer tests (mode & <mask>) === 0`);
    else if ((mask & 0o077) !== 0o077) owner.push(`restrictExistingRecord accepts a record with group or other bits (mask 0o${mask.toString(8)}, not 0o077)`);
    let secureWrites = 0;
    walk(ts, parse(ts, read(paths.recordFile)), (n) => { if (ts.isCallExpression(n) && n.expression.getText() === 'writeSecureFile') secureWrites++; });
    if (!secureWrites) owner.push(`${paths.recordFile} no longer writes the record through writeSecureFile`);
    for (const w of writers) owner.push(`a key-record source writes a file outside writeSecureFile (${w})`);
    const secure = parse(ts, read(paths.secureFile));
    // A writer is a function that calls writeFileSync; each must also chmod what it writes, and writeSecureFile
    // must write through one of them (or be one).
    const writerFns = new Set();
    let writeSecureBody = null;
    walk(ts, secure, (n) => {
        if (ts.isFunctionDeclaration(n) && n.name) {
            if (n.name.text === 'writeSecureFile') writeSecureBody = n;
            let writes = false;
            let chmods = false;
            walk(ts, n, (m) => {
                if (!ts.isCallExpression(m)) return;
                if (m.expression.getText() === 'writeFileSync') writes = true;
                if (m.expression.getText() === 'chmodSync') chmods = true;
            });
            if (writes) writerFns.add(n.name.text);
            if (writes && !chmods) owner.push(`${n.name.text} in ${paths.secureFile} writes a file without chmodSync, so the umask decides its mode`);
        }
        const modeExpr = ts.isCallExpression(n) && n.expression.getText() === 'chmodSync' ? n.arguments[1]
            : ts.isPropertyAssignment(n) && n.name.getText() === 'mode' ? n.initializer : null;
        if (modeExpr) {
            const lits = [];
            walk(ts, modeExpr, (m) => { if (ts.isNumericLiteral(m)) lits.push(Number(m.text)); });
            if (!lits.length) owner.push(`source moved: ${paths.secureFile} sets a mode this check cannot read (${modeExpr.getText()})`);
            for (const l of lits) if (l & 0o077) owner.push(`${paths.secureFile} sets mode 0o${l.toString(8)}, which leaves group or other bits`);
        }
    });
    if (!writeSecureBody) owner.push(`source moved: ${paths.secureFile} no longer declares writeSecureFile`);
    else {
        let restricts = writerFns.has('writeSecureFile');
        walk(ts, writeSecureBody, (m) => { if (ts.isCallExpression(m) && writerFns.has(m.expression.getText())) restricts = true; });
        if (!restricts) owner.push(`writeSecureFile in ${paths.secureFile} no longer writes through a function that chmods what it writes`);
    }

    let roots = null;
    walk(ts, parse(ts, read(paths.recordFile)), (n) => {
        if (roots === null && ts.isFunctionDeclaration(n) && n.name?.text === 'isTemporaryKeyDir') {
            walk(ts, n, (m) => {
                if (roots === null && ts.isArrayLiteralExpression(m)) {
                    roots = m.elements.map((e) => (ts.isStringLiteral(e) ? e.text : ts.isCallExpression(e) && e.expression.getText() === 'tmpdir' ? 'tmpdir()' : `<unrecognised ${e.getText()}>`));
                }
            });
        }
    });
    if (!roots?.length) problems.push(`source moved: no root list in isTemporaryKeyDir in ${paths.recordFile}`);
    return { name, value, roots: roots ?? [], backends, keyringRuns, owner, recordFiles: recordFiles.size, problems };
}

/** Every non-test TypeScript source under `dir` (no *.test.ts, *-fixture.ts, *.test-fixture.ts or __fixtures__). */
function orcadSources(dir, out = []) {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const d of names) {
        const full = join(dir, d.name);
        if (d.isDirectory()) { if (d.name !== '__fixtures__' && d.name !== 'node_modules') orcadSources(full, out); continue; }
        if (/\.ts$/.test(d.name) && !/\.d\.ts$|\.test\.ts$|-fixture\.ts$|\.test-fixture\.ts$/.test(d.name)) out.push(full);
    }
    return out.sort();
}

/** True when `node` sits in a function that JSON.parses: the record is rebuilt from what was read, not written. */
function insideParser(ts, node) {
    for (let f = node.parent; f; f = f.parent) {
        if (ts.isFunctionLike(f)) {
            let parses = false;
            walk(ts, f, (m) => { if (ts.isCallExpression(m) && m.expression.getText() === 'JSON.parse') parses = true; });
            return parses;
        }
    }
    return false;
}

/** The text of every element carrying data-orca-credential-protection, entity-decoded and whitespace-collapsed. */
export function protectionTexts(html) {
    const count = (html.match(/\sdata-orca-credential-protection\b/g) ?? []).length;
    const texts = [...html.matchAll(/<(\w+)\b[^>]*\sdata-orca-credential-protection\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]
        .replace(/<[^>]*>/g, '')
        .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim());
    return { count, texts };
}

async function importTs(src) {
    const emit = process.emitWarning;
    process.emitWarning = () => {};
    try {
        return await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(src)).toString('base64')}`);
    } finally {
        process.emitWarning = emit;
    }
}

/** Runs every clause over `paths`. Resolves { fails, skips, counts }; skips name the clauses that did not run. */
export async function check(paths) {
    const fails = [];
    const skips = [];
    let env;
    try { env = await freshImport(paths.orcaEnv); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], skips, counts: {} }; }
    for (const n of ['ORCA_PLAINTEXT_OVERRIDE', 'ORCA_TEMP_ENV_NAMES', 'ORCA_FIXED_TEMP_ROOTS', 'tempRootOf', 'ORCA_PROTECTION_SENTENCE']) {
        if (env[n] === undefined) fails.push(`OrcaEnv.sys.mjs exports no ${n}`);
    }
    if (fails.length) return { fails, skips, counts: {} };
    const override = env.ORCA_PLAINTEXT_OVERRIDE;
    const linuxNames = env.ORCA_TEMP_ENV_NAMES.linux ?? [];
    const linuxFixed = env.ORCA_FIXED_TEMP_ROOTS.linux ?? [];
    const counts = { roots: 0, backends: 'SKIP', copy: 'SKIP', cases: 0, keyring: 0, recordFiles: 0 };

    // 1-3 and 7. The pin.
    const ts = loadTypescript(paths.typescriptFrom);
    if (!existsSync(paths.orcaDir) || !ts) {
        skips.push(`the pinned-source clauses (1-3, 7) did not run: ${!ts ? 'theia/node_modules/typescript is not installed. Next step: run yarn install in theia/ inside nix develop .#theia' : 'orca/ is not fetched. Next step: bash scripts/fetch-orca.sh'}`);
    } else {
        const pin = derivePinned(paths, ts);
        fails.push(...pin.problems);
        if (pin.name && pin.name !== override.name) fails.push(`renamed override: the pinned orcad reads ${pin.name}, OrcaEnv.ORCA_PLAINTEXT_OVERRIDE names ${override.name}`);
        if (pin.value && pin.value !== override.value) fails.push(`renamed override value: the pinned orcad triggers on '${pin.value}', OrcaEnv.ORCA_PLAINTEXT_OVERRIDE says '${override.value}'`);
        for (const root of pin.roots) {
            if (root === 'tmpdir()') {
                for (const n of NODE_TMPDIR_FAMILY) if (!linuxNames.includes(n)) fails.push(`PB root set lacks $${n}: Orca tests tmpdir(), which reads ${n}, and ORCA_TEMP_ENV_NAMES.linux does not`);
            } else if (root.startsWith('<')) {
                fails.push(`source moved: isTemporaryKeyDir lists ${root}`);
            } else if (!linuxFixed.includes(root)) {
                fails.push(`Orca temp root PB lacks: isTemporaryKeyDir tests ${root}, which ORCA_FIXED_TEMP_ROOTS.linux does not hold`);
            }
        }
        counts.roots = pin.roots.length;
        const others = [...pin.backends].filter((b) => b !== 'host-file');
        if (others.length || !pin.backends.has('host-file')) fails.push(`${KEYRING_RED} (written backends: ${[...pin.backends].join(', ') || 'none'})`);
        counts.backends = [...pin.backends].join(', ');
        counts.recordFiles = pin.recordFiles;
        for (const k of pin.keyringRuns) {
            const reads = KEYRING_PROGRAMS[k.program] ?? [];
            if (!reads.includes(k.sub)) fails.push(`${KEYRING_WRITE_RED} (${k.rel} runs ${k.program} ${k.sub ?? '<a subcommand this check cannot read>'})`);
        }
        counts.keyring = pin.keyringRuns.length;
        for (const o of pin.owner) fails.push(`${OWNER_ONLY_RED}: ${o}`);
    }

    // 4. Allowlist.
    for (const list of ['ORCAD_ENV_ALLOWLIST', 'ORCAD_FIXED_ENV_NAMES']) {
        if ((env[list] ?? []).includes(override.name)) fails.push(`${override.name} is in OrcaEnv.${list}, so the override could reach orcad (allowlist)`);
    }

    // 5. The sentence.
    const html = read(paths.privacy);
    if (html === null) fails.push(`${paths.privacy} is missing`);
    else {
        const { count, texts } = protectionTexts(html);
        if (count === 0) fails.push('statement removed: privacy.html has no element carrying data-orca-credential-protection');
        else if (count !== 1 || texts.length !== 1) fails.push(`privacy.html has ${count} data-orca-credential-protection attributes and ${texts.length} closed elements, not exactly one`);
        else if (texts[0] !== env.ORCA_PROTECTION_SENTENCE) fails.push(`the privacy.html protection sentence differs from OrcaEnv.ORCA_PROTECTION_SENTENCE: ${JSON.stringify(texts[0])}`);
    }
    if (!existsSync(paths.failureDir)) {
        skips.push('the copy-table sentence comparison did not run: theia/extensions/orca-panes/src/browser/failure is absent (lane p67-03 not merged). Next step: merge it');
    } else {
        const src = read(paths.copyFile);
        if (src === null) fails.push(`${paths.copyFile} is missing while theia/extensions/orca-panes/src/browser/failure exists`);
        else {
            let mod = null;
            try { mod = await importTs(src); } catch (err) { fails.push(`${paths.copyFile} does not load after a type strip: ${err.message}`); }
            if (mod && mod.ORCA_PROTECTION_SENTENCE !== env.ORCA_PROTECTION_SENTENCE) fails.push(`the copy table's protection sentence differs from OrcaEnv.ORCA_PROTECTION_SENTENCE: ${JSON.stringify(mod.ORCA_PROTECTION_SENTENCE)}`);
            counts.copy = 'compared';
        }
    }

    // 6. tempRootOf over derived cases.
    const cases = [];
    for (const root of linuxFixed) {
        cases.push({ paths: [`${root}/pb/powerbrowser-orca`], roots: linuxFixed, platform: 'linux', want: root, what: `a data root under ${root}` });
        cases.push({ paths: [`${root}foo/pb/powerbrowser-orca`], roots: linuxFixed, platform: 'linux', want: null, what: `${root}foo, a sibling sharing the string prefix (prefix is not a path segment)` });
        let real = null;
        try { real = realpathSync(root); } catch { /* absent on this host */ }
        if (real) cases.push({ paths: [`${real}/pb`], roots: [root, real], platform: 'linux', want: root === real ? root : real, what: `a data root under the realpath ${real} of ${root}` });
    }
    cases.push({ paths: ['/home/u/prof/powerbrowser-orca'], roots: linuxFixed, platform: 'linux', want: null, what: 'a data root outside every root' });
    cases.push({ paths: ['C:\\Users\\U\\AppData\\Local\\Temp\\pb\\powerbrowser-orca'], roots: ['c:\\users\\u\\appdata\\local\\temp'], platform: 'win32', want: 'c:\\users\\u\\appdata\\local\\temp', what: 'a win32 path differing only in case' });
    for (const c of cases) {
        const got = env.tempRootOf(c);
        if (got !== c.want) fails.push(`tempRootOf: ${c.what} gives ${JSON.stringify(got)}, not ${JSON.stringify(c.want)}`);
    }
    counts.cases = cases.length;
    return { fails, skips, counts };
}

// ---------------------------------------------------------------------------
// --self-test

const FIXTURE = {
    gap: "export const ORCAD_PLAINTEXT_SECRETS_ENV = 'ORCA_HEADLESS_SECRET_STORE'\nexport function describeOrcadDisposableProfile(): string { return 'fixture' }\n",
    resolution: [
        "type StoredKeyState = { version: 1; backend: 'host-file'; key: string } | { version: 1; backend: 'os-keyring'; account: string }",
        "function newFileRecord(): StoredKeyState { return { version: 1, backend: 'host-file', key: 'k' } }",
        "function migrate(stored: Extract<StoredKeyState, { backend: 'os-keyring' }>): StoredKeyState { return stored.backend === 'os-keyring' ? { version: 1, backend: 'host-file', key: 'k' } : newFileRecord() }",
        "export function resolveState(env: Record<string, string>) { if (env[ORCAD_PLAINTEXT_SECRETS_ENV] === 'plaintext') { return 'plaintext' } return 'ready' }",
        '',
    ].join('\n'),
    record: [
        "import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-file'",
        "export function isTemporaryKeyDir(keyDir: string): boolean {\n  const roots = [tmpdir(), '/tmp', '/var/tmp'].flatMap((root) => [root])\n  return roots.some((r) => keyDir.startsWith(r))\n}",
        "function parseStoredState(raw: string): StoredKeyState | null {\n  const record = JSON.parse(raw)\n  if (record.backend === 'os-keyring') { return { version: 1, backend: 'os-keyring', account: record.account } }\n  return null\n}",
        "export function publishRecordExclusively(path: string, record: StoredKeyState): string {\n  if (!writeSecureFile(path, JSON.stringify(record), { durable: true })) { return 'unrestricted' }\n  return 'published'\n}",
        "export async function restrictExistingRecord(path: string): Promise<boolean> {\n  hardenExistingSecureFile(path)\n  return (statSync(path).mode & 0o077) === 0\n}",
        '',
    ].join('\n'),
    migration: "export function orcadCredentialRoot(): string { return join(homedir(), '.orca') }\n",
    store: "import { readStoredRecord } from './orcad-secret-key-record'\nexport function openStore(path: string) { return readStoredRecord(path) }\n",
    legacy: "function lookupArgv(platform: string): [string, string[]] | null {\n  if (platform === 'darwin') { return ['/usr/bin/security', ['find-generic-password', '-s', 'svc', '-w', '-a']] }\n  return platform === 'linux' ? ['secret-tool', ['lookup', 'service', 'svc', 'account']] : null\n}\n",
    secure: [
        "function hardenSecurePathOnce(targetPath: string, isDirectory: boolean): boolean {\n  chmodSync(targetPath, isDirectory ? 0o700 : 0o600)\n  return true\n}",
        "export function writeSecureFile(targetPath: string, contents: string): boolean {\n  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })\n  hardenSecurePathOnce(dirname(targetPath), true)\n  return writeModeRestrictedFile(targetPath, contents)\n}",
        "function writeModeRestrictedFile(tmpFile: string, contents: string): boolean {\n  writeFileSync(tmpFile, contents, { encoding: 'utf-8', mode: 0o600 })\n  chmodSync(tmpFile, 0o600)\n  return true\n}",
        '',
    ].join('\n'),
};

async function runSelfTest() {
    if (!loadTypescript()) { console.log(skipLine(`${NAME} self-test`, 'theia/node_modules/typescript is not installed, so no plant can run. Next step: run yarn install in theia/ inside nix develop .#theia')); return SKIP_EXIT; }
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const paths = pathsFor(tmp);
        mkdirSync(dirname(paths.orcaEnv), { recursive: true });
        cpSync(pathsFor(REPO_ROOT).orcaEnv, paths.orcaEnv);
        mkdirSync(dirname(paths.privacy), { recursive: true });
        cpSync(pathsFor(REPO_ROOT).privacy, paths.privacy);
        mkdirSync(dirname(paths.gapFile), { recursive: true });
        writeFileSync(paths.gapFile, FIXTURE.gap);
        writeFileSync(paths.resolutionFile, FIXTURE.resolution);
        writeFileSync(paths.recordFile, FIXTURE.record);
        writeFileSync(paths.migrationFile, FIXTURE.migration);
        writeFileSync(join(paths.orcadDir, 'orcad-secret-store.ts'), FIXTURE.store);
        writeFileSync(join(paths.orcadDir, 'orcad-legacy-keyring-key.ts'), FIXTURE.legacy);
        writeFileSync(join(paths.orcadDir, 'orcad-profile-state-telemetry.ts'), "export const selection = { backend: 'sqlite' }\n"); // not a key record: ignored
        mkdirSync(dirname(paths.secureFile), { recursive: true });
        writeFileSync(paths.secureFile, FIXTURE.secure);
        const sentence = (await freshImport(paths.orcaEnv)).ORCA_PROTECTION_SENTENCE;
        mkdirSync(paths.failureDir, { recursive: true });
        writeFileSync(paths.copyFile, `export const ORCA_PROTECTION_SENTENCE: string = ${JSON.stringify(sentence)};\n`);

        const control = await check(paths);
        if (control.fails.length || control.skips.length) {
            console.error(`${NAME} self-test: FAIL -- the unmodified copies are not green: ${[...control.fails, ...control.skips].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green on copies (${control.counts.roots} pinned roots, backends ${control.counts.backends} over ${control.counts.recordFiles} key-record files, ${control.counts.keyring} keyring lookups, copy ${control.counts.copy}, ${control.counts.cases} tempRootOf cases)`);
        // SKIP control (harness-static-hosting-01): with no orcad sources the pinned clauses do not run, and the row is SKIP.
        {
            const noPin = { ...paths, orcaDir: join(tmp, 'no-orca') };
            const r = await check(noPin);
            if (r.fails.length || !r.skips.some((x) => x.includes('pinned-source clauses'))) { console.error(`${NAME} self-test: FAIL -- a tree without orca/ did not skip the pinned clauses: ${[...r.fails, ...r.skips].join(' | ') || 'green'}`); return 1; }
            console.log('  ok a tree without orca/ -> the pinned clauses are a SKIP, not a PASS');
        }
        const newFile = (rel, text) => ({ file: join(paths.orcadDir, rel), edit: () => text });

        const swap = (a, b) => (text) => { if (!text.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 60)}`); return text.replace(a, b); };
        const plants = [
            { name: 'the override renamed in the pin', naming: 'renamed override', file: paths.gapFile, edit: swap("'ORCA_HEADLESS_SECRET_STORE'", "'ORCA_HEADLESS_SECRETS'") },
            { name: 'the trigger value changed in the pin', naming: 'renamed override value', file: paths.resolutionFile, edit: swap("=== 'plaintext'", "=== 'unencrypted'") },
            { name: 'an Orca temp root PB lacks', naming: 'Orca temp root PB lacks', file: paths.recordFile, edit: swap("'/var/tmp']", "'/var/tmp', '/dev/shm']") },
            { name: 'the override name in the allowlist', naming: 'allowlist', file: paths.orcaEnv, edit: swap('  "PATH",\n  "HOME",', '  "PATH",\n  "ORCA_HEADLESS_SECRET_STORE",\n  "HOME",') },
            { name: 'the privacy paragraph removed', naming: 'statement removed', file: paths.privacy, edit: (t) => t.replace(/\s*<p data-orca-credential-protection>[\s\S]*?<\/p>/, '') },
            { name: 'a keyring backend written', naming: 'keyring backend', file: paths.resolutionFile, edit: swap("? { version: 1, backend: 'host-file', key: 'k' }", "? { version: 1, backend: 'os-keyring', account: 'a' }") },
            { name: "PB's root set lacking $TMP", naming: 'lacks $TMP', file: paths.orcaEnv, edit: swap('  linux: Object.freeze(["TMPDIR", "TMP", "TEMP"]),', '  linux: Object.freeze(["TMPDIR", "TEMP"]),') },
            { name: 'tempRootOf matching /tmpfoo', naming: 'prefix is not a path segment', file: paths.orcaEnv, edit: swap('t.startsWith(`${r}${sep}`)', 't.startsWith(r)') },
            { name: 'the copy-table sentence differs', naming: "copy table's protection sentence differs", file: paths.copyFile, edit: swap("your system's keyring", 'the system keyring') },
            { name: 'the privacy sentence differs', naming: 'privacy.html protection sentence differs', file: paths.privacy, edit: swap("not with your system's keyring.</p>", 'not with a keyring.</p>') },
            // harness-static-hosting-07: writes outside the two files the clause used to read, and the key file's mode.
            { name: 'a keyring backend written in a third key-record file', naming: 'keyring backend', file: join(paths.orcadDir, 'orcad-secret-store.ts'), edit: (t) => `${t}export function keep(): StoredKeyState { return { version: 1, backend: 'os-keyring', account: 'a' } }\n` },
            { name: 'secret-tool store in a new orcad file', naming: 'keyring write', ...newFile('orcad-secret-keyring-writer.ts', "export const argv = ['secret-tool', ['store', '--label', 'orca', 'service', 'svc']]\n") },
            { name: 'security add-generic-password next to the lookup', naming: 'keyring write', file: join(paths.orcadDir, 'orcad-legacy-keyring-key.ts'), edit: swap("['find-generic-password',", "['add-generic-password',") },
            { name: 'a keytar import in an orcad file', naming: 'keyring write', ...newFile('orcad-account-services.ts', "import keytar from 'keytar'\nexport const k = keytar\n") },
            { name: 'the key file written 0644', naming: OWNER_ONLY_RED, file: paths.secureFile, edit: swap("chmodSync(tmpFile, 0o600)", "chmodSync(tmpFile, 0o644)") },
            { name: 'writeSecureFile no longer chmods what it writes', naming: OWNER_ONLY_RED, file: paths.secureFile, edit: swap("  return writeModeRestrictedFile(targetPath, contents)\n", "  writeFileSync(targetPath, contents)\n  return true\n") },
            { name: 'restrictExistingRecord accepting group-readable records', naming: OWNER_ONLY_RED, file: paths.recordFile, edit: swap('& 0o077) === 0', '& 0o002) === 0') },
            { name: 'the record written with writeFileSync', naming: OWNER_ONLY_RED, file: paths.recordFile, edit: swap("if (!writeSecureFile(path, JSON.stringify(record), { durable: true })) { return 'unrestricted' }", "writeFileSync(path, JSON.stringify(record))") },
        ];
        let failures = 0;
        for (const p of plants) {
            const existed = existsSync(p.file);
            const original = existed ? readFileSync(p.file, 'utf8') : '';
            try {
                writeFileSync(p.file, p.edit(original));
                const r = await check(paths);
                const text = r.fails.join('\n');
                if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
                else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            } catch (err) {
                console.error(`  FAIL ${p.name} -> ${err.message}`); failures++;
            } finally {
                if (existed) writeFileSync(p.file, original); else rmSync(p.file, { force: true });
            }
            const after = await check(paths);
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant '${p.name}' did not clean up: ${after.fails.join(' | ')}`); return 1; }
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

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    const r = await check(pathsFor(REPO_ROOT));
    for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
    const code = verdictExit(NAME, r.fails, r.skips);
    if (code === 0) console.log(`${NAME}: PASS -- the override pair equals the pin, Orca's ${r.counts.roots} temp roots are within PB's, written backends ${r.counts.backends} over ${r.counts.recordFiles} key-record files, ${r.counts.keyring} keyring program run(s) all lookups, the key file owner-only, the name stays off orcad's allowlist, the privacy sentence equals OrcaEnv's (copy table ${r.counts.copy}), ${r.counts.cases} tempRootOf cases`);
    process.exit(code);
}
