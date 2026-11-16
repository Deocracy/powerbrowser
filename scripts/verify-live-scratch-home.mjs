#!/usr/bin/env node
// scripts/verify-live-scratch-home.mjs
//
// live-scratch-home (owner ruling 2026-11-15, "Scratch HOME"): no live harness launches PowerBrowser, orcad or the
// Orca CLI with the developer's real HOME, so a live row never writes the real ~/.orca, ~/.config/orca or ~/.claude.
//
// It derives the launch sites from the tree, not from a list: every spawn, spawnSync, execFile and execFileSync call
// in scripts/**/*.mjs whose command or arguments (with a bare identifier resolved to its const/let definition in the
// same file) carry a launch mark: a --profile/-profile argument (PowerBrowser), orcad.js or buildOrcadArgs (orcad),
// or the Orca CLI ('cli', 'bin', 'orca', CLI_JS, 'out', 'cli', or a [...args, '--json'] tail). Each one must pass
// env: liveEnv(...) (scripts/lib/firefox-bidi.mjs), which moves HOME and the XDG base folders to a per-run scratch
// HOME and throws at launch when HOME is still the real one. A launch with no env inherits the real HOME and is red.
// It also requires the runtime half: liveEnv returns assertScratchHome(...), and assertScratchHome compares against
// os.homedir() (through realHomes) and throws, proven by calling it, also for a home-relocating name such as
// CLAUDE_CONFIG_DIR=~/.claude, which liveEnv must drop (68-11-REVIEW WR-02). And the real-agent seed: seedClaudeLogin writes
// fresh files (never copies or links a real one), seeds skipDangerousModePermissionPrompt, and keeps its token-expiry
// margin (CLAUDE_TOKEN_MARGIN_MIN), so claude never refreshes the owner's sign-in inside a scratch copy.
// The scratch HOME's lifetime is run, not read (68-11-REVIEW CR-01, CR-02): child nodes import the helper, seed a
// fixture sign-in, rotate its refresh token as a claude refresh would, and end by a normal exit, SIGTERM, SIGHUP, SIGINT
// (each must remove the folder, still end by that signal, and write the rotated token back) or SIGKILL (the next run's
// liveHome() must sweep the folder and write the token back). When the real file changed during the run, nothing may be
// overwritten and the folder must be kept.
//
// --self-test plants: a PowerBrowser spawn with no env, one with env: process.env, a CLI launch whose env sets
// HOME: homedir(), an orcad launch through an args identifier, liveEnv without its assertion, seedClaudeLogin copying
// the credentials file whole, dropping the bypass-prompt setting, or dropping the expiry margin, and the runtime guard
// accepting the real HOME, a helper with no signal listener, one with no sweep, one that deletes a rotated token and one
// that writes back with no compare-and-swap. Each must go red naming the drift;
// the controls (the same launches with liveEnv, the helper as it is) stay green.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(REPO_ROOT, 'scripts');
const HELPER_REL = 'scripts/lib/firefox-bidi.mjs';
const SELF_REL = 'scripts/verify-live-scratch-home.mjs';

const CALL_RE = /(?<![.\w$])(spawn|spawnSync|execFile|execFileSync)\(/g;
const LAUNCH_MARK = /'--?profile'|orcad\.js|buildOrcadArgs|'cli',\s*'bin',\s*'orca'|\bCLI_JS\b|'out',\s*'cli'|\[\s*\.\.\.\w+,\s*'--json'\s*\]/;

/** The text from `open` (an opening paren) to its match, skipping strings, templates and comments. */
function balanced(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === "'" || c === '"' || c === '`') {
            for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
        } else if (c === '/' && src[i + 1] === '/') {
            i = src.indexOf('\n', i); if (i < 0) return null;
        } else if (c === '/' && src[i + 1] === '*') {
            i = src.indexOf('*/', i + 2) + 1; if (i <= 0) return null;
        } else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { if (--depth === 0) return src.slice(open + 1, i); }
    }
    return null;
}

/** Top-level comma split of an argument list. */
function splitArgs(text) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "'" || c === '"' || c === '`') { for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++; }
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
    }
    out.push(text.slice(start).trim());
    return out;
}

/** The last `const|let|var id = ...;` before `pos`, as text (empty when none). */
function definition(src, id, pos) {
    const re = new RegExp(`(?:const|let|var)\\s+${id.replace(/\$/g, '\\$')}\\s*=\\s*`, 'g');
    let last = null;
    for (let m; (m = re.exec(src)) && m.index < pos;) last = m;
    if (!last) return '';
    const end = src.indexOf(';', last.index);
    return src.slice(last.index, end < 0 ? undefined : end);
}

/** Pure. Every launch call in `src`: { line, kind, envOk, text }. */
export function launchesIn(src) {
    const found = [];
    for (const m of src.matchAll(CALL_RE)) {
        const open = m.index + m[0].length - 1;
        const body = balanced(src, open);
        if (body === null) continue;
        const args = splitArgs(body);
        const resolved = args.slice(0, 2).map(a => (/^[A-Za-z_$][\w$]*$/.test(a) ? `${a} ${definition(src, a, m.index)}` : a)).join(' ');
        if (!LAUNCH_MARK.test(resolved)) continue;
        const opts = args.slice(2).find(a => a.startsWith('{')) ?? '{}';
        // The env property of the options literal: `env: <expr>`, or the shorthand `env` (expression env).
        const prop = splitArgs(opts.slice(1, -1)).find(p => /^env\b\s*(?::|$)/.test(p));
        const env = prop === undefined ? null : (prop.includes(':') ? prop.slice(prop.indexOf(':') + 1).trim() : 'env');
        found.push({ line: src.slice(0, m.index).split('\n').length, call: m[1], env, envOk: env !== null && /^liveEnv\(/.test(env) });
    }
    return found;
}

/** Pure. Red reasons for `files` ({ rel: source }). */
export function verdict(files) {
    const fails = [];
    let launches = 0;
    for (const [rel, src] of Object.entries(files)) {
        if (rel === SELF_REL) continue;
        for (const l of launchesIn(src)) {
            launches++;
            if (!l.envOk) fails.push(`${rel}:${l.line}: a live launch (${l.call}) ${l.env === null ? 'passes no env, so it inherits the real HOME' : `passes env: ${l.env}, not liveEnv(...)`}`);
        }
        // WR-04: OrcaEnv falls back to <HOME>/.cache, so a harness path derived from its own env misses what the launch wrote.
        for (const m of src.matchAll(/\b(?:bridgeDirFor|aliasPathFor)\([^;\n]*process\.env\[/g)) {
            fails.push(`${rel}:${src.slice(0, m.index).split('\n').length}: an Orca path derived from the harness's own process.env, not the launch's liveEnv()`);
        }
    }
    const helper = files[HELPER_REL] ?? '';
    const fn = (name) => { const i = helper.search(new RegExp(`export function ${name}\\(`)); return i < 0 ? null : balanced(helper, helper.indexOf('{', i)); };
    const live = fn('liveEnv');
    const guard = fn('assertScratchHome');
    if (live === null) fails.push(`${HELPER_REL} exports no liveEnv`);
    else if (!/return assertScratchHome\(/.test(live)) fails.push(`${HELPER_REL}: liveEnv does not return assertScratchHome(...), so a launch is never checked at runtime`);
    if (guard === null) fails.push(`${HELPER_REL} exports no assertScratchHome`);
    else if (!/throw /.test(guard) || !/inRealHome\(/.test(guard)) fails.push(`${HELPER_REL}: assertScratchHome neither tests inRealHome nor throws`);
    if (!/homedir\(\)/.test(fn('realHomes') ?? '')) fails.push(`${HELPER_REL}: realHomes does not include os.homedir()`);
    const seed = fn('seedClaudeLogin');
    if (seed === null) fails.push(`${HELPER_REL} exports no seedClaudeLogin`);
    else {
        if (/\b(copyFileSync|cpSync|symlinkSync|linkSync)\(/.test(seed)) fails.push(`${HELPER_REL}: seedClaudeLogin copies or links a whole real file, so MCP tokens and real-home state ride into the scratch HOME`);
        if (!/skipDangerousModePermissionPrompt/.test(seed)) fails.push(`${HELPER_REL}: seedClaudeLogin does not seed skipDangerousModePermissionPrompt, so claude stops at the Bypass Permissions confirmation`);
        if (!/CLAUDE_TOKEN_MARGIN_MIN/.test(seed)) fails.push(`${HELPER_REL}: seedClaudeLogin has no token-expiry margin, so claude can refresh the sign-in inside a scratch copy`);
    }
    if (!launches) fails.push('vacuous: no live launch site was found under scripts/');
    return { fails, launches };
}

/** Red reasons from calling the runtime guard: the real HOME must throw, a scratch one must pass. */
export async function runtimeVerdict(mod) {
    const fails = [];
    const scratch = Object.fromEntries(Object.entries(mod.LIVE_HOME_VARS).map(([k, sub]) => [k, join('/nonexistent-pb-scratch-home', sub)]));
    let threw = false;
    try { mod.assertScratchHome({ ...scratch, HOME: homedir() }); } catch { threw = true; }
    if (!threw) fails.push('runtime: assertScratchHome accepted HOME = os.homedir()');
    try { mod.assertScratchHome(scratch); } catch (e) { fails.push(`runtime: assertScratchHome refused a scratch HOME (${e.message})`); }
    const kept = mod.liveEnv(scratch);
    if (kept.HOME !== scratch.HOME) fails.push('runtime: liveEnv replaced a HOME that was already scratch');
    const relocated = { ...scratch, CLAUDE_CONFIG_DIR: join(homedir(), '.claude') };
    threw = false;
    try { mod.assertScratchHome(relocated); } catch { threw = true; }
    if (!threw) fails.push('runtime: assertScratchHome accepted CLAUDE_CONFIG_DIR inside the real home');
    try {
        if ('CLAUDE_CONFIG_DIR' in mod.liveEnv(relocated)) fails.push('runtime: liveEnv passed CLAUDE_CONFIG_DIR=~/.claude through, so claude would use the real config');
    } catch (e) { fails.push(`runtime: liveEnv did not drop CLAUDE_CONFIG_DIR=~/.claude (${e.message})`); }
    return fails;
}

/**
 * Runs `body` in a child node that imports the helper source `src` as `m` (written next to the helper, so its relative
 * imports resolve), with HOME=`home`. Resolves { lines, done }: the child's first stdout line, and its { code, signal }.
 */
function runHelperChild(src, body, home) {
    const probe = join(SCRIPTS, 'lib', `.scratch-home-probe-${process.pid}-${probeSeq++}.mjs`);
    writeFileSync(probe, src);
    const code = `const m = await import(${JSON.stringify(pathToFileURL(probe).href)});\n${body}`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const line = new Promise((res) => {
        child.stdout.on('data', (d) => { out += d; if (out.includes('\n')) res(out.split('\n')[0].trim()); });
        child.once('exit', () => res(out.split('\n')[0].trim()));
    });
    child.stderr.resume();
    const done = new Promise((res) => child.once('exit', (c, s) => { rmSync(probe, { force: true }); res({ code: c, signal: s }); }));
    return { child, line, done };
}
let probeSeq = 0;

/**
 * Red reasons from children that seed a scratch HOME from helper source `src` under a fixture sign-in (HOME is a fixture
 * folder, so realHomes() finds its .claude/.credentials.json first; fake token strings, never the owner's), rotate the
 * scratch copy's refresh token as a claude refresh would, and then end. CR-01: each ending signal and a normal exit
 * remove the folder and the child still ends by that signal; a SIGKILLed run's folder is swept by the next liveHome().
 * CR-02: every one of those paths writes the rotated token back (other keys kept, mode 0600), and when the real file
 * changed during the run (the owner's own claude refreshed it) nothing is overwritten and the folder is kept.
 */
export async function signalVerdict(src) {
    const fails = [];
    // Outside <repo>/.mozbuild, so liveEnv treats the fixture HOME as the real one and launches get the seeded liveHome().
    const home = mkdtempSync(join(tmpdir(), 'pb-fixture-home-'));
    const realFile = join(home, '.claude', '.credentials.json');
    const setReal = (refreshToken) => {
        mkdirSync(dirname(realFile), { recursive: true });
        writeFileSync(realFile, JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-access', refreshToken, expiresAt: Date.now() + 2 * 3600000 }, mcpOAuth: { fixture: 'kept' } }), { mode: 0o600 });
    };
    const real = () => { try { return JSON.parse(readFileSync(realFile, 'utf8')); } catch { return {}; } };
    const rotateTo = (token) => `const why = m.seedClaudeLogin(); if (why) { console.log('not seeded: ' + why); process.exit(3); }
        const fs = await import('node:fs'); const f = m.liveHome() + '/.claude/.credentials.json';
        const c = JSON.parse(fs.readFileSync(f, 'utf8')); c.claudeAiOauth.refreshToken = ${JSON.stringify(token)}; fs.writeFileSync(f, JSON.stringify(c));
        console.log(m.liveHome());`;
    const seeded = async (r, what) => {
        const dir = await r.line;
        if (dir.startsWith('/')) return dir;
        fails.push(`${what}: the child made no seeded scratch HOME (${dir || 'no output'})`);
        r.child.kill('SIGKILL'); await r.done;
        return null;
    };
    const wroteBack = (what, token) => {
        const r = real();
        if (r.claudeAiOauth?.refreshToken !== token) fails.push(`${what}: the refresh token claude rotated inside the scratch HOME was not written back to the real credentials file, so it is lost`);
        else if (r.mcpOAuth?.fixture !== 'kept') fails.push(`${what}: the write-back dropped the real credentials file's other keys`);
        else if ((statSync(realFile).mode & 0o077) !== 0) fails.push(`${what}: the written-back credentials file is readable by group or others`);
    };
    try {
        for (const sig of ['exit', 'SIGTERM', 'SIGHUP', 'SIGINT']) {
            setReal('fixture-seeded');
            const r = runHelperChild(src, rotateTo(`fixture-rotated-${sig}`) + (sig === 'exit' ? '' : '\nsetInterval(() => {}, 1e6);'), home);
            const dir = await seeded(r, sig);
            if (!dir) continue;
            if (sig !== 'exit') r.child.kill(sig);
            const end = await r.done;
            if (existsSync(dir)) { fails.push(`signal: ${sig} left the scratch HOME ${relative(REPO_ROOT, dir)} on disk`); rmSync(dir, { recursive: true, force: true }); }
            if (sig !== 'exit' && end.signal !== sig) fails.push(`signal: the child did not end by ${sig} (code ${end.code}, signal ${end.signal}), so the caller sees a different exit`);
            wroteBack(sig, `fixture-rotated-${sig}`);
        }
        setReal('fixture-seeded');
        const killed = runHelperChild(src, rotateTo('fixture-rotated-SIGKILL') + '\nsetInterval(() => {}, 1e6);', home);
        const stale = await seeded(killed, 'SIGKILL');
        if (stale) {
            killed.child.kill('SIGKILL');
            await killed.done;
            await runHelperChild(src, 'm.liveHome();', home).done;
            if (existsSync(stale)) { fails.push(`sweep: the scratch HOME a SIGKILLed run left (${relative(REPO_ROOT, stale)}) survived the next run's liveHome()`); rmSync(stale, { recursive: true, force: true }); }
            wroteBack('sweep', 'fixture-rotated-SIGKILL');
        }
        setReal('fixture-seeded');
        const raced = runHelperChild(src, rotateTo('fixture-rotated-raced') + '\nsetInterval(() => {}, 1e6);', home);
        const keep = await seeded(raced, 'compare-and-swap');
        if (keep) {
            setReal('fixture-owner-refreshed');
            raced.child.kill('SIGTERM');
            await raced.done;
            if (real().claudeAiOauth?.refreshToken !== 'fixture-owner-refreshed') fails.push('compare-and-swap: the write-back overwrote a real sign-in that changed during the run');
            if (!existsSync(join(keep, '.claude', '.credentials.json'))) fails.push('compare-and-swap: a refreshed sign-in that could not be written back was deleted with its scratch HOME');
            rmSync(keep, { recursive: true, force: true });
        }
        // WR-03: a harness HOME of its own under <repo>/.mozbuild is kept by liveEnv, so the seed must refuse, not seed a HOME no launch gets.
        const ownBase = join(REPO_ROOT, '.mozbuild', 'pb-live-profiles');
        mkdirSync(ownBase, { recursive: true });
        const own = mkdtempSync(join(ownBase, 'fixture-home-'));
        try {
            mkdirSync(join(own, '.claude'), { recursive: true });
            writeFileSync(join(own, '.claude', '.credentials.json'), readFileSync(realFile));
            const r = runHelperChild(src, 'console.log(String(m.seedClaudeLogin()));', own);
            const why = await r.line;
            await r.done;
            if (why === 'null') fails.push('seed: seedClaudeLogin seeded the scratch HOME while launches keep a HOME of their own, so claude never sees the sign-in');
        } finally {
            rmSync(own, { recursive: true, force: true });
        }
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
    return fails;
}

function treeFiles() {
    const files = {};
    for (const ent of readdirSync(SCRIPTS, { recursive: true, withFileTypes: true })) {
        if (!ent.isFile() || !ent.name.endsWith('.mjs')) continue;
        const abs = join(ent.parentPath ?? ent.path, ent.name);
        if (abs.includes(`${join('scripts', 'node_modules')}`)) continue;
        files[relative(REPO_ROOT, abs)] = readFileSync(abs, 'utf8');
    }
    return files;
}

async function selfTest() {
    const tree = treeFiles();
    const mod = await import('./lib/firefox-bidi.mjs');
    const rows = [];
    const red = (name, fails, needle) => rows.push([name, fails.some(f => f.includes(needle)), fails]);
    const plant = (src) => verdict({ ...tree, 'scripts/planted-live.mjs': src }).fails;
    const control = verdict(tree).fails;
    rows.push(['control: the tree is green', control.length === 0, control]);
    red('PowerBrowser spawn with no env', plant("spawn(FIREFOX_BIN, ['--headless', '--profile', dir], { stdio: 'ignore' });\n"), 'planted-live.mjs:1: a live launch (spawn) passes no env');
    red('PowerBrowser spawn with env: process.env', plant("spawn('bash', ['-c', 'x', binPath, '--profile', dir], { env: process.env, stdio: 'ignore' });\n"), 'passes env: process.env');
    red('CLI launch with HOME: homedir()', plant("const cli = join(root, 'cli', 'bin', 'orca');\nexecFileSync(cli, [...a, '--json'], { env: { PATH, HOME: homedir() }, cwd });\n"), 'planted-live.mjs:2');
    red('orcad launch through an args identifier', plant("const args = [join(dir, 'out', 'orcad', 'orcad.js'), '--json'];\nconst child = spawn(nodeBin, args, { cwd, env });\n"), 'passes env: env');
    red('an Orca bridge path from the harness env', plant("const dir = await OrcaEnv.bridgeDirFor(s.dataRoot, (n) => process.env[n], 'linux');\n"), "planted-live.mjs:1: an Orca path derived from the harness's own process.env");
    const ok = verdict({ ...tree, 'scripts/planted-live.mjs': "spawn(FIREFOX_BIN, ['--profile', d], { env: liveEnv(env) });\nconst cli = join(r, 'cli', 'bin', 'orca');\nexecFile(cli, [...a, '--json'], { env: liveEnv({ PATH }), cwd });\n" }).fails;
    rows.push(['control: the same launches through liveEnv stay green', ok.length === 0, ok]);
    const unguarded = { ...tree, [HELPER_REL]: tree[HELPER_REL].replace('return assertScratchHome(out);', 'return out;') };
    red('liveEnv without its runtime assertion', verdict(unguarded).fails, 'liveEnv does not return assertScratchHome');
    const seedPlant = (from, to) => verdict({ ...tree, [HELPER_REL]: tree[HELPER_REL].replace(from, to) }).fails;
    red('seedClaudeLogin copying the whole credentials file', seedPlant("writeFileSync(creds, JSON.stringify({ claudeAiOauth: oauth }), { mode: 0o600 });", "copyFileSync(join(real, '.claude', '.credentials.json'), creds);"), 'copies or links a whole real file');
    red('seedClaudeLogin without the bypass-prompt setting', seedPlant(/settings\.skipDangerousModePermissionPrompt === true \? \{ skipDangerousModePermissionPrompt: true \} : \{\}/, '{}'), 'does not seed skipDangerousModePermissionPrompt');
    red('seedClaudeLogin without the token-expiry margin', seedPlant(/if \(!\(minutesLeft >= CLAUDE_TOKEN_MARGIN_MIN\)\) return [^\n]*\n/, ''), 'no token-expiry margin');
    red('the runtime guard accepting the real HOME', await runtimeVerdict({ ...mod, assertScratchHome: () => undefined }), 'accepted HOME = os.homedir()');
    rows.push(['control: the runtime guard', (await runtimeVerdict(mod)).length === 0, await runtimeVerdict(mod)]);
    const homeVarsOnly = (env) => { for (const n of Object.keys(mod.LIVE_HOME_VARS)) if (mod.inRealHome(env?.[n])) throw new Error(n); return env; };
    red('the runtime guard checking HOME and XDG only', await runtimeVerdict({ ...mod, assertScratchHome: homeVarsOnly }), 'accepted CLAUDE_CONFIG_DIR');
    red('liveEnv passing CLAUDE_CONFIG_DIR through', await runtimeVerdict({ ...mod, liveEnv: (e) => ({ ...mod.liveEnv(e), CLAUDE_CONFIG_DIR: e.CLAUDE_CONFIG_DIR }) }), 'passed CLAUDE_CONFIG_DIR');
    const helperSrc = tree[HELPER_REL];
    const signalControl = await signalVerdict(helperSrc);
    rows.push(['control: every ending removes the scratch HOME and writes a rotated token back, a later run sweeps a killed one, a changed real sign-in is kept', signalControl.length === 0, signalControl]);
    const helperPlant = (from, to) => { const planted = helperSrc.replace(from, to); return planted === helperSrc ? Promise.resolve([`plant did not apply: ${from}`]) : signalVerdict(planted); };
    red('scratch HOME with no signal listener', await helperPlant('process.on(sig, onSignal);', ''), 'SIGTERM left the scratch HOME');
    red('scratch HOME with no sweep of dead runs', await helperPlant("if (name.startsWith('pb-home-') && !homeInUse(dir)) disposeHome(dir);", ''), 'survived the next run');
    red('a rotated refresh token deleted, not written back', await helperPlant('if (sha256(rotated.refreshToken) === seeded) return true;', 'return true;'), 'so it is lost');
    red('a seed into a HOME the launch does not get', await helperPlant(/    if \(launchHome !== home\) return [^\n]*\n/, ''), 'claude never sees the sign-in');
    red('a write-back with no compare-and-swap', await helperPlant('if (seeded && realToken && sha256(realToken) === seeded) {', 'if (realFile) {'), 'overwrote a real sign-in');
    let bad = 0;
    for (const [name, pass, fails] of rows) {
        console.log(`verify-live-scratch-home --self-test: ${pass ? 'PASS' : 'FAIL'} -- ${name}${pass ? '' : `: ${fails.join(' | ') || 'nothing went red'}`}`);
        if (!pass) bad++;
    }
    console.log(`verify-live-scratch-home: ${bad ? 'FAIL' : 'PASS'} -- ${rows.length - bad}/${rows.length} self-test rows`);
    process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    if (process.argv.includes('--self-test')) await selfTest();
    else {
        const { fails, launches } = verdict(treeFiles());
        fails.push(...await runtimeVerdict(await import('./lib/firefox-bidi.mjs')));
        fails.push(...await signalVerdict(readFileSync(join(REPO_ROOT, HELPER_REL), 'utf8')));
        for (const f of fails) console.error(`verify-live-scratch-home: FAIL -- ${f}`);
        if (fails.length) process.exit(1);
        console.log(`verify-live-scratch-home: PASS -- ${launches} live launch site(s) under scripts/ pass env: liveEnv(...), and the runtime guard refuses the real HOME`);
    }
}
