#!/usr/bin/env node
// scripts/verify-orca-bridge-dir.mjs
//
// orca-bridge-dir (Phase 63, EXT-02; D-31, P63-26, P63-35, P63-36): the chrome
// half of the bridge folder, for linux, darwin and win32. PowerBrowser hands
// the Theia backend and its own chrome one private folder for hand-off files,
// built by powerbrowser/shell/OrcaEnv.sys.mjs; OrcaService writes
// orcad-data-root there through PowerBrowserProcesses.writePrivateFile, and
// the EXT-02 wrapper (lane p63-03, theia/extensions/orca-agents) reads it.
//
// Derived at check time, never hand-kept:
//  a. OrcaEnv's builders (nodePlatform, bridgeDirFor, bridgeFileFor,
//     aliasPathFor), imported by path, against the 12 hex of SHA-256 of the
//     data root (node:crypto);
//  b. the data-root file name on three sides: OrcaEnv.ORCAD_DATA_ROOT_FILE,
//     the DATA_ROOT_FILE export of orca-agents' bin/claude-wrapper.mjs
//     (imported; its main sits behind an entry guard) and the
//     ORCAD_DATA_ROOT_FILE string literal of src/common/orca-agents-protocol.ts;
//  c. writePrivateFile's body, cut out of PowerBrowserAPI.sys.mjs by brace
//     matching.
// Red on: nodePlatform not mapping linux, macosx and win to linux, darwin and
// win32; a linux folder not under XDG_RUNTIME_DIR, else HOME/.cache; a base
// under /tmp accepted; a darwin folder not under HOME/.cache; a win32 folder
// not under an absolute-drive LOCALAPPDATA, or a relative or missing
// LOCALAPPDATA accepted; a folder not ending in -bridge; a 12 hex different
// from aliasPathFor's; the three data-root literals differing; writePrivateFile
// missing a step of 67-RESEARCH A-11 or taking them out of order (folder 0700
// on create, folder 0700 again, stale .tmp removed, .tmp created empty and
// exclusively, .tmp 0600, content written with overwrite, .tmp moved over the
// target), and "umask window" when any content write precedes the 0600 call.
// The data-root join alone prints a SKIP while theia/extensions/orca-agents is
// absent (lane p63-03 not merged); the directory present with either file or
// export missing is red, never a SKIP.
//
// Limit: path strings and source order only. The modes on disk and the
// content are the live row's (orca-agent-status-live, lane p63-03), on Linux.
//
// Tier: quick (text and in-process imports; no build, browser or network).
// --self-test quick: plants each fault on a wrapped OrcaEnv, a fixture
// orca-agents directory and a fixture boundary copy in a mkdtemp base, and
// requires red naming it.
//
// Usage:
//   node scripts/verify-orca-bridge-dir.mjs
//   node scripts/verify-orca-bridge-dir.mjs --self-test

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-bridge-dir';
const SELF_REL = 'scripts/verify-orca-bridge-dir.mjs';
const ORCA_ENV = join(REPO_ROOT, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs');
const BOUNDARY = join(REPO_ROOT, 'powerbrowser', 'shell', 'PowerBrowserAPI.sys.mjs');
const ORCA_AGENTS = join(REPO_ROOT, 'theia', 'extensions', 'orca-agents');
const DATA_ROOT = '/home/user/.powerbrowser/abcd1234.default/powerbrowser-orca';
const WIN_DATA_ROOT = 'C:\\Users\\user\\AppData\\Roaming\\PowerBrowser\\Profiles\\abcd1234.default/powerbrowser-orca';
const SUFFIX = '-bridge';

const hex12 = (dataRoot) => createHash('sha256').update(dataRoot, 'utf8').digest('hex').slice(0, 12);
const envOf = (vars) => (name) => vars[name];
let importCounter = 0;
const freshImport = (path) => import(`${pathToFileURL(path).href}?v=${process.pid}-${++importCounter}`);

// ---------------------------------------------------------------------------
// Pure verdicts. Each returns red reasons; [] is green.

/** nodePlatform maps the boundary's platform names to Node's. */
export function platformVerdict(env) {
    const fails = [];
    for (const [from, to] of [['linux', 'linux'], ['macosx', 'darwin'], ['win', 'win32']]) {
        const got = env.nodePlatform(from);
        if (got !== to) fails.push(`nodePlatform maps ${from} to ${JSON.stringify(got)}, not ${to}`);
    }
    return fails;
}

/** The folder rules for each platform, with the hex taken from SHA-256 of the data root. */
export async function folderVerdict(env) {
    const fails = [];
    const hex = hex12(DATA_ROOT);
    const cases = [
        ['linux', 'XDG_RUNTIME_DIR form', { XDG_RUNTIME_DIR: '/run/user/1000/', HOME: '/home/user' }, DATA_ROOT, `/run/user/1000/pb-orca-${hex}${SUFFIX}`],
        ['linux', 'HOME/.cache form', { HOME: '/home/user' }, DATA_ROOT, `/home/user/.cache/pb-orca-${hex}${SUFFIX}`],
        ['linux', 'a base under /tmp refused', { XDG_RUNTIME_DIR: '/tmp/run', HOME: '/tmp/home' }, DATA_ROOT, null],
        ['linux', 'nothing usable', {}, DATA_ROOT, null],
        ['darwin', 'HOME/.cache form', { HOME: '/Users/user' }, DATA_ROOT, `/Users/user/.cache/pb-orca-${hex}${SUFFIX}`],
        ['darwin', 'a base under /tmp refused', { HOME: '/tmp' }, DATA_ROOT, null],
        ['win32', 'LOCALAPPDATA form', { LOCALAPPDATA: 'C:\\Users\\user\\AppData\\Local\\' }, WIN_DATA_ROOT, `C:\\Users\\user\\AppData\\Local\\pb-orca-${hex12(WIN_DATA_ROOT)}${SUFFIX}`],
        ['win32', 'a relative LOCALAPPDATA refused', { LOCALAPPDATA: 'AppData\\Local' }, WIN_DATA_ROOT, null],
        ['win32', 'a missing LOCALAPPDATA refused', { HOME: '/home/user' }, WIN_DATA_ROOT, null],
        ['freebsd', 'an unknown platform', { XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/user' }, DATA_ROOT, null],
    ];
    for (const [platform, what, vars, dataRoot, want] of cases) {
        let got;
        try { got = await env.bridgeDirFor(dataRoot, envOf(vars), platform); } catch (err) { got = `threw ${err.message}`; }
        if (got === want) continue;
        if (want === null) {
            const why = what.includes('/tmp') ? 'a base under /tmp was accepted' : what.includes('relative') ? 'a relative LOCALAPPDATA was accepted' : `${what} was accepted`;
            fails.push(`bridgeDirFor(${platform}, ${what}): ${why}, giving ${JSON.stringify(got)} instead of null`);
        } else if (typeof got === 'string' && !got.endsWith(SUFFIX)) {
            fails.push(`bridgeDirFor(${platform}, ${what}) is ${JSON.stringify(got)}, which does not end in ${SUFFIX} (D-31: one bridge folder, no PTY folder)`);
        } else {
            const gotHex = /pb-orca-([0-9a-f]+)-bridge$/.exec(String(got))?.[1];
            const wantHex = /pb-orca-([0-9a-f]+)-bridge$/.exec(want)[1];
            const hexNote = gotHex && gotHex !== wantHex ? ` (its 12 hex ${gotHex} are not the start of SHA-256 of the data root, ${wantHex})` : '';
            fails.push(`bridgeDirFor(${platform}, ${what}) is ${JSON.stringify(got)}, not ${want}${hexNote}`);
        }
    }
    // The folder is the alias plus "-bridge", so the 12 hex must be aliasPathFor's for the same root.
    const vars = envOf({ XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/user' });
    const alias = await env.aliasPathFor(DATA_ROOT, vars);
    const folder = await env.bridgeDirFor(DATA_ROOT, vars, 'linux');
    const aliasHex = /pb-orca-([0-9a-f]{12})$/.exec(String(alias))?.[1];
    const folderHex = /pb-orca-([0-9a-f]{12})-bridge$/.exec(String(folder))?.[1];
    if (!aliasHex || aliasHex !== folderHex) fails.push(`the bridge folder's 12 hex (${folderHex}) differ from aliasPathFor's (${aliasHex}) for one data root, so one profile gets two names`);
    return fails;
}

/** bridgeFileFor joins with that platform's separator. */
export function joinVerdict(env) {
    const fails = [];
    for (const [platform, dir, want] of [['linux', '/a/b', '/a/b/orcad-data-root'], ['darwin', '/a/b', '/a/b/orcad-data-root'], ['win32', 'C:\\a\\b', 'C:\\a\\b\\orcad-data-root']]) {
        const got = env.bridgeFileFor(dir, env.ORCAD_DATA_ROOT_FILE, platform);
        if (got !== want) fails.push(`bridgeFileFor on ${platform} gives ${JSON.stringify(got)}, not ${want}`);
    }
    return fails;
}

/** The data-root file name: OrcaEnv's literal against the wrapper's export and the protocol file's literal. */
export function literalVerdict(orcaEnvName, wrapperName, protocolSource) {
    const fails = [];
    if (typeof orcaEnvName !== 'string' || !orcaEnvName) fails.push('OrcaEnv exports no ORCAD_DATA_ROOT_FILE');
    if (wrapperName !== orcaEnvName) fails.push(`the wrapper's literal DATA_ROOT_FILE is ${JSON.stringify(wrapperName)}, not OrcaEnv's ${JSON.stringify(orcaEnvName)}, so the wrapper looks for a file chrome never writes`);
    const m = /\bexport\s+const\s+ORCAD_DATA_ROOT_FILE\s*(?::\s*[^=]+)?=\s*(['"`])([^'"`]*)\1/.exec(protocolSource ?? '');
    if (!m) fails.push('orca-agents-protocol.ts has no ORCAD_DATA_ROOT_FILE string literal');
    else if (m[2] !== orcaEnvName) fails.push(`the protocol file's literal ORCAD_DATA_ROOT_FILE is ${JSON.stringify(m[2])}, not OrcaEnv's ${JSON.stringify(orcaEnvName)}`);
    return fails;
}

/** The body of `async writePrivateFile(...) { ... }` in a boundary source, by brace matching; null when absent. */
export function extractMember(source, name) {
    const at = source.search(new RegExp(`^\\s*async\\s+${name}\\s*\\(`, 'm'));
    if (at < 0) return null;
    const open = source.indexOf('{', source.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    return null;
}

// 67-RESEARCH A-11, in order. Each regex runs over the body with its // comments removed.
const STEPS = [
    ['folder created 0700', /IOUtils\.makeDirectory\(\s*dir\b[^;]*permissions:\s*0o700/],
    ['folder re-apply 0700', /IOUtils\.setPermissions\(\s*dir\s*,\s*0o700\b/],
    ['stale .tmp removed', /IOUtils\.remove\(\s*tmp\b/],
    ['exclusive create of an empty .tmp', /IOUtils\.write\(\s*tmp\s*,\s*new Uint8Array\(0\)\s*,\s*\{\s*mode:\s*["']create["']/],
    ['.tmp set 0600', /IOUtils\.setPermissions\(\s*tmp\s*,\s*0o600\b/],
    ['content written with overwrite', /IOUtils\.writeUTF8\(\s*tmp\s*,[^;]*mode:\s*["']overwrite["']/],
    ['.tmp moved over the target', /IOUtils\.move\(\s*tmp\s*,\s*path\b/],
];

/** writePrivateFile's call order (P63-36) in a boundary source. */
export function orderVerdict(source) {
    const body = extractMember(source ?? '', 'writePrivateFile');
    if (body === null) return ['PowerBrowserAPI.sys.mjs has no async writePrivateFile member'];
    const code = body.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const fails = [];
    let last = -1;
    let lastName = 'the start of the method';
    for (const [name, re] of STEPS) {
        const m = re.exec(code);
        if (!m) { fails.push(`writePrivateFile has no ${name} step (67-RESEARCH A-11)`); continue; }
        if (m.index < last) fails.push(`writePrivateFile's ${name} step comes before ${lastName}, out of A-11 order`);
        last = m.index;
        lastName = `the ${name} step`;
    }
    const chmod = STEPS[4][1].exec(code)?.index ?? Infinity;
    const empty = STEPS[3][1].exec(code)?.index ?? -1;
    for (const m of code.matchAll(/IOUtils\.write(?:UTF8|JSON)?\(/g)) {
        if (m.index < chmod && m.index !== empty) fails.push('umask window: writePrivateFile writes content before the .tmp is set 0600, so another user can read it while IOUtils leaves it 0666 under the umask');
    }
    return fails;
}

/**
 * The data-root join for an orca-agents directory. Resolves { skip } while it is absent, else
 * { fails } (empty when the three literals agree).
 */
export async function literalJoin(env, extDir) {
    if (!existsSync(extDir)) return { skip: 'SKIP (lane p63-03 not merged)' };
    const wrapper = join(extDir, 'bin', 'claude-wrapper.mjs');
    const protocol = join(extDir, 'src', 'common', 'orca-agents-protocol.ts');
    const fails = [];
    let wrapperName;
    if (!existsSync(wrapper)) fails.push('theia/extensions/orca-agents exists but bin/claude-wrapper.mjs is missing, so the data-root literal cannot be compared');
    else {
        try { wrapperName = (await freshImport(wrapper)).DATA_ROOT_FILE; } catch (err) { fails.push(`bin/claude-wrapper.mjs does not import in Node: ${err.message}`); }
        if (wrapperName === undefined && !fails.length) fails.push('bin/claude-wrapper.mjs exports no DATA_ROOT_FILE');
    }
    let protocolSource = null;
    try { protocolSource = readFileSync(protocol, 'utf8'); } catch { fails.push('theia/extensions/orca-agents exists but src/common/orca-agents-protocol.ts is missing, so the data-root literal cannot be compared'); }
    if (!fails.length) fails.push(...literalVerdict(env.ORCAD_DATA_ROOT_FILE, wrapperName, protocolSource));
    return { fails };
}

/** Every clause over one OrcaEnv namespace, one orca-agents directory and one boundary file. Resolves { fails, join }. */
export async function check({ env, extDir, apiFile }) {
    let api = null;
    try { api = readFileSync(apiFile, 'utf8'); } catch { /* reported by orderVerdict */ }
    const fails = [...platformVerdict(env), ...(await folderVerdict(env)), ...joinVerdict(env), ...orderVerdict(api)];
    const lit = await literalJoin(env, extDir);
    if (lit.skip) return { fails, join: lit.skip };
    return { fails: [...fails, ...lit.fails], join: 'compared' };
}

// ---------------------------------------------------------------------------
// --self-test

const FIXTURE_WRAPPER = `import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const DATA_ROOT_FILE = 'orcad-data-root';
function main() { process.stdout.write('started'); }
const isEntry = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntry) main();
`;
const FIXTURE_PROTOCOL = "/** Bridge-folder file names. */\nexport const ORCAD_DATA_ROOT_FILE = 'orcad-data-root';\n";

async function runSelfTest() {
    const real = await import(pathToFileURL(ORCA_ENV).href);
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const extDir = join(tmp, 'orca-agents');
        const wrapper = join(extDir, 'bin', 'claude-wrapper.mjs');
        const protocol = join(extDir, 'src', 'common', 'orca-agents-protocol.ts');
        const apiFile = join(tmp, 'PowerBrowserAPI.sys.mjs');
        mkdirSync(dirname(wrapper), { recursive: true });
        mkdirSync(dirname(protocol), { recursive: true });
        writeFileSync(wrapper, FIXTURE_WRAPPER);
        writeFileSync(protocol, FIXTURE_PROTOCOL);
        copyFileSync(BOUNDARY, apiFile);
        const base = { env: real, extDir, apiFile };
        const control = await check(base);
        if (control.fails.length || control.join !== 'compared') {
            console.error(`${NAME} self-test: FAIL -- the control is not green and compared: ${control.join}; ${control.fails.join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green (real OrcaEnv, fixture orca-agents, boundary copy; data-root literal compared)`);

        const wrap = (over) => ({ ...real, ...over });
        const fileEdit = (file, fn) => {
            let original;
            return { setup: () => { original = readFileSync(file, 'utf8'); const t = fn(original); if (t === null) rmSync(file); else writeFileSync(file, t); }, undo: () => writeFileSync(file, original) };
        };
        const swap = (a, b) => (text) => { if (!text.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 60)}`); return text.replace(a, b); };
        const WRITE = '    await IOUtils.writeUTF8(tmp, String(text), { mode: "overwrite" });\n';
        const CHMOD = '    if (posix) {\n      await IOUtils.setPermissions(tmp, 0o600, false);\n    }\n';
        const plants = [
            { name: 'bridgeDirFor accepts a relative LOCALAPPDATA', naming: 'relative LOCALAPPDATA', env: wrap({ bridgeDirFor: async (root, getEnv, p) => (p === 'win32' && getEnv('LOCALAPPDATA') && !/^[A-Za-z]:/.test(getEnv('LOCALAPPDATA')) ? `${getEnv('LOCALAPPDATA')}\\pb-orca-${hex12(root)}-bridge` : real.bridgeDirFor(root, getEnv, p)) }) },
            { name: 'a base under /tmp accepted', naming: '/tmp', env: wrap({ bridgeDirFor: async (root, getEnv, p) => ((getEnv('XDG_RUNTIME_DIR') ?? '').startsWith('/tmp') ? `${getEnv('XDG_RUNTIME_DIR')}/pb-orca-${hex12(root)}-bridge` : real.bridgeDirFor(root, getEnv, p)) }) },
            { name: 'nodePlatform maps macosx to linux', naming: 'nodePlatform maps macosx', env: wrap({ nodePlatform: (p) => (p === 'macosx' ? 'linux' : real.nodePlatform(p)) }) },
            { name: 'a 12-hex prefix differing from aliasPathFor', naming: '12 hex', env: wrap({ bridgeDirFor: async (root, getEnv, p) => { const d = await real.bridgeDirFor(root, getEnv, p); return d && d.replace(/pb-orca-[0-9a-f]{12}-bridge$/, 'pb-orca-000000000000-bridge'); } }) },
            { name: 'a folder ending -pty', naming: 'does not end in -bridge', env: wrap({ bridgeDirFor: async (root, getEnv, p) => { const d = await real.bridgeDirFor(root, getEnv, p); return d && d.replace(/-bridge$/, '-pty'); } }) },
            { name: "the wrapper's literal differing", naming: "wrapper's literal", env: real, ...fileEdit(wrapper, swap("DATA_ROOT_FILE = 'orcad-data-root'", "DATA_ROOT_FILE = 'orcad-root'")) },
            { name: 'the protocol file deleted while the fixture extension directory exists (red, not SKIP)', naming: 'orca-agents-protocol.ts is missing', env: real, ...fileEdit(protocol, () => null) },
            { name: 'writeUTF8 moved before the 0o600 call', naming: 'umask window', env: real, ...fileEdit(apiFile, (t) => swap(CHMOD + WRITE, WRITE + CHMOD)(t)) },
            { name: 'the folder re-apply removed', naming: 'folder re-apply 0700', env: real, ...fileEdit(apiFile, swap('    if (posix) {\n      await IOUtils.setPermissions(dir, 0o700, false);\n    }\n', '')) },
            { name: 'the exclusive create removed', naming: 'exclusive create', env: real, ...fileEdit(apiFile, swap('    await IOUtils.write(tmp, new Uint8Array(0), { mode: "create" });\n', '')) },
        ];
        let failures = 0;
        for (const p of plants) {
            try {
                p.setup?.();
                const r = await check({ ...base, env: p.env });
                const text = r.fails.join('\n');
                if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green (join ${r.join})`); failures++; }
                else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            } catch (err) {
                console.error(`  FAIL ${p.name} -> ${err.message}`); failures++;
            } finally {
                p.undo?.();
            }
            const after = await check(base);
            if (after.fails.length || after.join !== 'compared') { console.error(`${NAME} self-test: FAIL -- plant '${p.name}' did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`); return 1; }
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
    let env;
    try { env = await import(pathToFileURL(ORCA_ENV).href); } catch (err) {
        console.error(`${NAME}: FAIL -- OrcaEnv.sys.mjs does not import in Node: ${err.message}`);
        process.exit(1);
    }
    const r = await check({ env, extDir: ORCA_AGENTS, apiFile: BOUNDARY });
    if (r.join.startsWith('SKIP')) console.log(`${NAME}: SKIP of the data-root literal join only -- lane p63-03 not merged (theia/extensions/orca-agents is absent)`);
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- linux, darwin, win32: nodePlatform maps each, bridgeDirFor builds each -bridge folder (no /tmp base, no relative LOCALAPPDATA, aliasPathFor's 12 hex), bridgeFileFor joins with each separator; data-root literal ${r.join}; writePrivateFile order ok`);
    process.exit(0);
}
