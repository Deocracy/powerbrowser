#!/usr/bin/env node
// scripts/verify-orca-git-sides.mjs
//
// orca-git-sides (v1.7 audit-fix lane G4; items 65-CR-01, sidecar-gate-backends-02): the
// pb-orca-git: backend read behind every Orca diff and merge tab in Theia, exercised for real
// on a hermetic repository. The backend module
// (theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts), the shared
// protocol (src/common/orca-git-protocol.ts) and the frontend resource
// (src/browser/orca-git-resource.ts) are transpiled with theia/node_modules/typescript and run
// with only Theia's DI and RPC imports stubbed: child_process, fs and git are the real ones.
//
// Clauses:
//  a. 65-CR-01: a side whose path is absent at an existing rev or index stage reads as
//     'missing', and the frontend resource turns that into an empty side: a staged added file
//     (HEAD side), a staged deleted file (index side), an untracked file (index side), and a
//     commit that adds or deletes a file (parent or commit side). A modified file still reads
//     its bytes. A rev that does not exist, and a path present in the tree whose blob is not
//     local, stay failures (never an empty side), and the resource rejects on them.
//  b. sidecar-gate-backends-02: in a partial clone whose configured upload-pack writes a marker
//     file, reading a historical blob does not fetch (the marker is never written) and fails;
//     the environment carries no inherited GIT_* name. b2: the clone's .git/config also sets
//     protocol.file.allow=always, and with GIT_NO_LAZY_FETCH removed (a git older than 2.44) the
//     injected per-transport protocol.<name>.allow=never alone must still stop the fetch.
//  c. sidecar-gate-backends-02: a git run that outlives the time bound is ended with every
//     process it started (a planted git that forks a sleeper; the sleeper must be gone).
//  d. Argument safety: a rev or path that starts with '-' or carries a NUL is refused by the
//     spec grammar and by the rev-parse argv builder; the read is refused, never run, and
//     never reported as 'missing'.
//
// Tier: quick. SKIP when theia/node_modules/typescript is absent or git is not on PATH, or (b
// only) when this git cannot make a partial clone. --self-test plants each pre-fix fault in
// memory (the source text is edited before transpiling; no file is written) and requires red
// naming the drift, then re-runs the control green.
//
// Usage:
//   node scripts/verify-orca-git-sides.mjs
//   node scripts/verify-orca-git-sides.mjs --self-test

import { spawnSync } from 'node:child_process';
import * as childProcess from 'node:child_process';
import * as nodeFs from 'node:fs';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-git-sides';
const SELF_REL = 'scripts/verify-orca-git-sides.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const EXT = 'theia/extensions/orca-workspace/src';
const REL = {
    protocol: `${EXT}/common/orca-git-protocol.ts`,
    backend: `${EXT}/node/orca-workspace-backend-module.ts`,
    resource: `${EXT}/browser/orca-git-resource.ts`,
};

let ts;

const source = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const transpile = (text, module) => ts.transpileModule(text, {
    compilerOptions: { module, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: false },
}).outputText;

function loadCjs(text, deps) {
    const mod = { exports: {} };
    const requireFn = (id) => {
        if (id in deps) return deps[id];
        throw new Error(`unexpected import ${id}`);
    };
    new Function('require', 'module', 'exports', transpile(text, ts.ModuleKind.CommonJS))(requireFn, mod, mod.exports);
    return mod.exports;
}

const decoratorStub = new Proxy({}, { get: () => () => () => undefined });

/** The three modules from (possibly planted) source texts. protocolOverrides replaces protocol exports (a short time bound). */
function load(texts, protocolOverrides = {}) {
    const protocol = { ...loadCjs(texts.protocol, {}), ...protocolOverrides };
    const backend = loadCjs(texts.backend, {
        child_process: childProcess,
        fs: nodeFs,
        '@theia/core/shared/inversify': { ContainerModule: class { constructor(fn) { this.fn = fn; } }, injectable: () => (t) => t },
        '@theia/core/lib/common': { ConnectionHandler: Symbol('ConnectionHandler'), JsonRpcConnectionHandler: class {} },
        '../common/orca-git-protocol': protocol,
    });
    const resource = loadCjs(texts.resource, {
        '@theia/core/shared/inversify': decoratorStub,
        '@theia/core/lib/common/resource': {},
        '@theia/core/lib/common/uri': { default: class {} },
        '@powerbrowser/tab-uris/lib/browser/profile-storage': {},
        '../common/orca-git-protocol': protocol,
        './orca-root-sync': {},
    });
    return { protocol, Service: backend.OrcaGitServiceImpl, Resource: resource.OrcaGitResource };
}

// ---------------------------------------------------------------- fixtures

function gitIn(cwd, args, extra = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([n]) => !/^GIT_/i.test(n)));
    const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', '-c', 'init.defaultBranch=main', ...args], { env, encoding: 'utf8', ...extra });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
}

/** One repository: a commit that adds and deletes files, then a staged add, a staged delete, a modified file and an untracked file. */
function buildRepo(base) {
    const root = join(base, 'repo');
    mkdirSync(root);
    gitIn(root, ['init', '-q']);
    gitIn(root, ['config', 'uploadpack.allowFilter', 'true']);
    const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
    put('m.txt', 'modified, committed\n');
    put('gone.txt', 'deleted in the second commit\n');
    put('s-del.txt', 'deleted in the index\n');
    put('hist.txt', 'first version\n');
    gitIn(root, ['add', '.']);
    gitIn(root, ['commit', '-q', '-m', 'one']);
    const parent = gitIn(root, ['rev-parse', 'HEAD']);
    put('added.txt', 'added in the second commit\n');
    put('hist.txt', 'second version\n');
    gitIn(root, ['rm', '-q', 'gone.txt']);
    gitIn(root, ['add', '.']);
    gitIn(root, ['commit', '-q', '-m', 'two']);
    const commit = gitIn(root, ['rev-parse', 'HEAD']);
    put('s-add.txt', 'added in the index\n');
    gitIn(root, ['add', 's-add.txt']);
    gitIn(root, ['rm', '-q', '--cached', 's-del.txt']);
    put('m.txt', 'modified, working\n');
    put('u.txt', 'untracked\n');
    return { root: realpathSync(root), parent, commit };
}

/** A blob:none clone of repo whose upload-pack writes marker before serving: a lazy fetch would write it. */
function buildPartialClone(base, repo) {
    const clone = join(base, 'clone');
    const r = spawnSync('git', ['clone', '-q', '--filter=blob:none', `file://${repo.root}`, clone], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([n]) => !/^GIT_/i.test(n))) });
    if (r.status !== 0) return undefined;
    const marker = join(base, 'LAZY-FETCH-RAN');
    gitIn(clone, ['config', 'remote.origin.uploadpack', `sh -c 'touch "${marker}"; exec git-upload-pack "$@"' upload-pack`]);
    // A hostile per-protocol override: git reads protocol.file.allow before protocol.allow.
    gitIn(clone, ['config', 'protocol.file.allow', 'always']);
    return { root: realpathSync(clone), marker };
}

// ---------------------------------------------------------------- the check

const quiet = async (fn) => {
    const warn = console.warn;
    console.warn = () => undefined;
    try { return await fn(); } finally { console.warn = warn; }
};

async function check(texts) {
    const fails = [];
    const notes = [];
    const base = realpathSync(mkdtempSync(join(tmpdir(), `${NAME}-`)));
    const savedPath = process.env.PATH;
    try {
        const { protocol, Service, Resource } = load(texts);
        if (typeof Service !== 'function') { fails.push(`OrcaGitServiceImpl is not exported by ${REL.backend}`); return { fails, notes }; }
        if (typeof Resource !== 'function') { fails.push(`OrcaGitResource is not exported by ${REL.resource}`); return { fails, notes }; }
        const svc = new Service();
        const repo = buildRepo(base);
        const read = (root, rel, rev) => quiet(() => svc.readBlob(root, rel, rev));
        const resourceText = async (root, rel, rev) => {
            try { return { text: await new Resource({}, () => read(root, rel, rev)).readContents() }; } catch (e) { return { threw: String(e?.message ?? e) }; }
        };

        // a. absent sides are empty; present sides read; failures stay failures.
        const missing = protocol.ORCA_GIT_MISSING;
        if (typeof missing !== 'string') fails.push(`${REL.protocol} exports no ORCA_GIT_MISSING reason`);
        const ABSENT = [
            ['a staged added file, HEAD side', 's-add.txt', repo.commit],
            ['a staged deleted file, index side', 's-del.txt', ':0'],
            ['an untracked file, index side (single unstaged diff)', 'u.txt', ':0'],
            ['a file the commit adds, parent side', 'added.txt', repo.parent],
            ['a file the commit deletes, commit side', 'gone.txt', repo.commit],
        ];
        for (const [what, rel, rev] of ABSENT) {
            const r = await read(repo.root, rel, rev);
            if (r.ok || r.reason !== missing) fails.push(`absent side not reported as missing: ${what} read as ${JSON.stringify(r)}`);
            const res = await resourceText(repo.root, rel, rev);
            if (res.text !== '') fails.push(`absent side is not an empty side in the resource: ${what} gave ${JSON.stringify(res)}`);
        }
        const present = await read(repo.root, 'm.txt', ':0');
        if (!present.ok || present.text !== 'modified, committed\n') fails.push(`a modified file's index side did not read its bytes: ${JSON.stringify(present)}`);
        const hist = await read(repo.root, 'hist.txt', repo.parent);
        if (!hist.ok || hist.text !== 'first version\n') fails.push(`a historical blob did not read its bytes: ${JSON.stringify(hist)}`);
        const noRev = await read(repo.root, 'm.txt', 'f'.repeat(40));
        if (noRev.ok || noRev.reason === missing) fails.push(`a rev that does not exist read as ${JSON.stringify(noRev)}, not a failure`);
        const noRevRes = await resourceText(repo.root, 'm.txt', 'f'.repeat(40));
        if (noRevRes.threw === undefined) fails.push(`the resource did not reject a rev that does not exist: ${JSON.stringify(noRevRes)}`);

        // b. no lazy fetch, no inherited GIT_*.
        const clone = buildPartialClone(base, repo);
        if (!clone) notes.push('b SKIP (this git cannot make a blob:none clone)');
        else {
            process.env.GIT_DIR = join(base, 'nowhere');
            const lazy = await read(clone.root, 'hist.txt', repo.parent);
            delete process.env.GIT_DIR;
            if (existsSync(clone.marker)) fails.push('a read in a partial clone ran a lazy fetch (the configured upload-pack wrote its marker)');
            if (lazy.ok || lazy.reason === missing) fails.push(`a blob that is not local read as ${JSON.stringify(lazy)}, not a failure (a present path is never an empty side)`);
            const local = await read(clone.root, 'm.txt', ':0');
            if (!local.ok) fails.push(`a local read in the partial clone failed with GIT_DIR planted in the environment: ${JSON.stringify(local)}`);
            // b2. A git older than 2.44 ignores GIT_NO_LAZY_FETCH: the transport lockout alone must stop the fetch,
            // against the repository's protocol.file.allow=always.
            const oldGitEnv = { ...protocol.gitReadEnv(process.env) };
            delete oldGitEnv.GIT_NO_LAZY_FETCH;
            spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', clone.root, 'cat-file', 'blob', '--', `${repo.parent}:hist.txt`], { env: oldGitEnv, stdio: 'ignore', timeout: 10000 });
            if (existsSync(clone.marker)) fails.push('b2: with lazy fetch left on (a git older than 2.44), the repository\'s protocol.file.allow=always re-opened the transport and the configured upload-pack ran');
            notes.push('b compared');
        }
        const env = protocol.gitReadEnv?.({ PATH: '/bin', GIT_DIR: '/x', git_exec_path: '/y' });
        if (!env) fails.push(`${REL.protocol} exports no gitReadEnv`);
        else {
            if (env.GIT_DIR !== undefined || env.git_exec_path !== undefined) fails.push('gitReadEnv keeps an inherited GIT_* name');
            if (env.GIT_TERMINAL_PROMPT !== '0') fails.push('gitReadEnv does not set GIT_TERMINAL_PROMPT=0');
        }

        // c. the time bound ends git's children.
        if (process.platform !== 'win32') {
            const fake = join(base, 'fake-bin');
            mkdirSync(fake);
            const pidFile = join(base, 'sleeper.pid');
            writeFileSync(join(fake, 'git'), `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > "${pidFile}"\nwait\n`);
            chmodSync(join(fake, 'git'), 0o755);
            const short = load(texts, { ORCA_GIT_TIMEOUT_MS: 400 });
            const shortSvc = new short.Service();
            // The root check is the first git run of resolveHead, so the planted git hangs there.
            process.env.PATH = `${fake}:${savedPath}`;
            const started = Date.now();
            const r = await quiet(() => shortSvc.resolveHead(repo.root));
            process.env.PATH = savedPath;
            if (Date.now() - started > 5000) fails.push('the time bound did not end a hung git run');
            const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : undefined;
            if (!pid) fails.push('the planted git did not start (the time-bound clause could not run)');
            else {
                let alive = true;
                for (let i = 0; i < 40 && alive; i++) {
                    try { process.kill(pid, 0); await new Promise((d) => setTimeout(d, 50)); } catch { alive = false; }
                }
                if (alive) { fails.push('a timed-out git run left the process it started running (only git itself was killed)'); try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
            }
            if (r !== null) fails.push(`a timed-out HEAD lookup resolved ${JSON.stringify(r)}, not null`);
        } else notes.push('c SKIP (win32)');

        // d. argument safety.
        const REFUSED = [
            ['a rev starting with "-"', 'm.txt', '-x'],
            ['a rev carrying a NUL', 'm.txt', ':0\0'],
            ['a path starting with "-"', '-x', ':0'],
            ['a path carrying a NUL', 'm\0.txt', ':0'],
        ];
        for (const [what, rel, rev] of REFUSED) {
            if (protocol.specRefusal(rel, rev) === undefined) fails.push(`the spec grammar accepts ${what}`);
            const r = await read(repo.root, rel, rev);
            if (r.ok || r.reason === missing) fails.push(`the read of ${what} was not refused: ${JSON.stringify(r)}`);
        }
        for (const [what, spec] of [['an option-shaped spec', '--output=/tmp/x'], ['a spec carrying a NUL', ':0:a\0b']]) {
            let threw = false;
            try { protocol.resolveArgs('/r', spec); } catch { threw = true; }
            if (!threw) fails.push(`resolveArgs builds an argv for ${what}`);
        }
        const argv = protocol.resolveArgs('/r', ':0:a.txt');
        if (!Array.isArray(argv) || argv[argv.length - 1] !== ':0:a.txt' || !argv.includes('rev-parse')) fails.push(`resolveArgs is not an argv array ending in the spec: ${JSON.stringify(argv)}`);
    } catch (e) {
        fails.push(`the check could not run: ${e?.stack ?? e}`);
    } finally {
        process.env.PATH = savedPath;
        delete process.env.GIT_DIR;
        rmSync(base, { recursive: true, force: true });
    }
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

const PLANTS = [
    { name: 'backend-without-missing-side', naming: 'absent side not reported as missing', file: 'backend', edit: (s) => s.replace("if (r.reason === 'git-failed' && await sideIsMissing(exitsZero, root, rev, relativePath)) {", 'if (false) {') },
    { name: 'resource-throws-on-missing', naming: 'absent side is not an empty side in the resource', file: 'resource', edit: (s) => s.replace('if (r.reason === ORCA_GIT_MISSING) {', 'if (false) {') },
    { name: 'missing-for-any-failure', naming: 'a rev that does not exist read as', file: 'protocol', edit: (s) => s.replace("return STAGE.test(rev) || await resolves(resolveArgs(root, `${rev}^{object}`));", 'return true;') },
    { name: 'pre-fix-environment', naming: 'ran a lazy fetch', file: 'backend', edit: (s) => s.replace('env: gitReadEnv(process.env)', 'env: Object.fromEntries(Object.entries(process.env).filter(([n]) => !/^GIT_/i.test(n)))') },
    { name: 'protocol-allow-only', naming: "b2: with lazy fetch left on (a git older than 2.44), the repository's protocol.file.allow=always re-opened the transport", file: 'protocol', edit: (s) => s.replace("const keys = ['protocol.allow', ...ORCA_GIT_NEVER_PROTOCOLS.map(p => `protocol.${p}.allow`)];", "const keys = ['protocol.allow'];") },
    { name: 'kill-git-only', naming: 'left the process it started running', file: 'backend', edit: (s) => s.replace("process.kill(-child.pid, 'SIGKILL');", "child.kill('SIGKILL');") },
    { name: 'rev-parse-accepts-dash', naming: 'resolveArgs builds an argv for an option-shaped spec', file: 'protocol', edit: (s) => s.replace("if (spec.startsWith('-') || /[\\0\\n\\r]/.test(spec)) {", 'if (false) {') },
    { name: 'rev-grammar-accepts-dash', naming: 'the spec grammar accepts a rev starting with "-"', file: 'protocol', edit: (s) => s.replace("if (typeof rev !== 'string' || !(rev === '' || OBJECT_ID.test(rev) || STAGE.test(rev))) {", "if (typeof rev !== 'string' || !(rev === '' || rev.startsWith('-') || OBJECT_ID.test(rev) || STAGE.test(rev))) {") },
];

async function runSelfTest(texts) {
    const control = await check(texts);
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green (${control.notes.join('; ')})`);
    let failures = 0;
    for (const p of PLANTS) {
        const planted = p.edit(texts[p.file]);
        if (planted === texts[p.file]) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved in ${REL[p.file]})`); failures++; continue; }
        const r = await check({ ...texts, [p.file]: planted });
        const text = r.fails.join('\n');
        if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
        else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
        else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    const again = await check(texts);
    if (again.fails.length) { console.error(`  FAIL the control did not re-run green: ${again.fails.join(' | ')}`); failures++; }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; the control re-ran green`);
    return 0;
}

// ---------------------------------------------------------------- entry

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install (docs/BUILD.md "Theia half")`); process.exit(0); }
    if (spawnSync('git', ['--version']).status !== 0) { console.log(`${NAME}: SKIP -- git is not on PATH`); process.exit(0); }
    ts = createRequire(import.meta.url)(TS_DIR);
    const texts = { protocol: source(REL.protocol), backend: source(REL.backend), resource: source(REL.resource) };
    if (args[0] === '--self-test') process.exit(await runSelfTest(texts));
    const r = await check(texts);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- added, deleted and untracked sides read as empty sides; present, absent-rev and non-local reads behave; no lazy fetch; the time bound ends git's children; dash and NUL specs refused (${r.notes.join('; ')})`);
    process.exit(0);
}
