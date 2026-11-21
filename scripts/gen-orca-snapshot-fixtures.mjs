#!/usr/bin/env node
// scripts/gen-orca-snapshot-fixtures.mjs
//
// Reference fixtures for PowerBrowser's browser.snapshot (Phase 66 plan 04, BRW-03, P66-16, 66-RESEARCH A5).
// Orca's agents read the snapshot format of the agent-browser binary Orca pins (orca/package.json "agent-browser"),
// so the expected output is whatever that binary prints, never a tree written by hand. This script runs the pinned
// binary against a Chromium on each fixture page and records its JSON replies; verify-orca-browser-snapshot-live.mjs
// compares PowerBrowser's own snapshot with them structurally.
//
// Inputs:
//   scripts/fixtures/orca-snapshot/manifest.json  { agentBrowserVersion, pages: ["form", ...] }; pages is the input,
//                                                 agentBrowserVersion is rewritten from the installed binary
//   scripts/fixtures/orca-snapshot/<page>.html     the fixture page; it defines pbChange(), the scripted change
//   orca/node_modules/agent-browser/               the pinned binary, run through its own launcher
//   a Chromium: AGENT_BROWSER_EXECUTABLE_PATH, else `chromium` on PATH
// Output, per page, scripts/fixtures/orca-snapshot/<page>.json:
//   { agentBrowserVersion, chromiumVersion, generatedAt, full, interactive, afterChange }
//   full         `snapshot --json` data          interactive  `snapshot -i --json` data
//   afterChange  `snapshot --delta --json` data taken after pbChange(), against the `snapshot --delta` baseline taken
//                before it
//   Each is the binary's `data` object minus `lifecycle` (launch bookkeeping) and `origin` (it carries this run's
//   random loopback port); nothing else is touched.
//
// Re-run whenever orca/package.json's agent-browser range or the installed agent-browser version changes (a re-pin):
// the orca-snapshot-fixtures row goes red until then. Developer host only: neither agent-browser nor Chromium ships.
//
// The child environment is an allowlist, not a copy of this process's (harness-other-11): agent-browser reads
// AGENT_BROWSER_* variables (PROFILE, AUTO_CONNECT, INIT_SCRIPTS, EXTENSIONS, PROXY, CONFIG) and
// ~/.agent-browser/config.json, any of which would change the committed fixtures or drive the developer's own
// browser. It gets PATH and the locale, a scratch HOME and XDG directories (removed afterwards), a scratch working
// directory, and the one AGENT_BROWSER_EXECUTABLE_PATH this script resolved. --self-test proves that (no live run).
//
// Usage: node scripts/gen-orca-snapshot-fixtures.mjs
//        node scripts/gen-orca-snapshot-fixtures.mjs --self-test

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'gen-orca-snapshot-fixtures';
const FIXTURES = join(REPO_ROOT, 'scripts/fixtures/orca-snapshot');
const AB_DIR = join(REPO_ROOT, 'orca/node_modules/agent-browser');
const AB_LAUNCHER = join(AB_DIR, 'bin/agent-browser.js');

// Thrown, not exited, so the agent-browser session is always closed.
function fail(step, why) {
  throw new Error(`${step}: ${why}`);
}

function report(err) {
  console.error(`${NAME}: FAIL -- ${err.message}`);
  process.exitCode = 1;
}

function findChromium() {
  const named = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
  if (named) return existsSync(named) ? named : null;
  for (const dir of (process.env.PATH || '').split(':')) {
    const candidate = join(dir, 'chromium');
    if (dir && existsSync(candidate)) return realpathSync(candidate);
  }
  return null;
}

// Names copied from the parent environment; nothing else is. A variable that selects a locale is harmless here.
export const ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL'];

/** The environment agent-browser runs in: the allowlist, a scratch home under `scratch`, and the one executable path. */
export function agentBrowserEnv(parentEnv, chromium, scratch) {
  const env = {};
  for (const key of ENV_ALLOWLIST) if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  env.HOME = join(scratch, 'home');
  env.XDG_CONFIG_HOME = join(scratch, 'xdg-config');
  env.XDG_CACHE_HOME = join(scratch, 'xdg-cache');
  env.XDG_DATA_HOME = join(scratch, 'xdg-data');
  env.XDG_RUNTIME_DIR = join(scratch, 'xdg-runtime');
  env.TMPDIR = join(scratch, 'tmp');
  env.AGENT_BROWSER_EXECUTABLE_PATH = chromium;
  return env;
}

function main() {
  if (!existsSync(AB_LAUNCHER)) fail('agent-browser', `${AB_LAUNCHER} is missing; run scripts/fetch-orca.sh and scripts/build-orca.sh`);
  const agentBrowserVersion = JSON.parse(readFileSync(join(AB_DIR, 'package.json'), 'utf8')).version;
  const chromium = findChromium();
  if (!chromium) fail('chromium', 'no Chromium: set AGENT_BROWSER_EXECUTABLE_PATH or put chromium on PATH');
  let chromiumVersion;
  try {
    chromiumVersion = execFileSync(chromium, ['--version'], { encoding: 'utf8' }).trim().replace(/^\D+/, '');
  } catch (err) {
    fail('chromium', `${chromium} --version failed: ${err.message}`);
  }
  const manifestPath = join(FIXTURES, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) fail('manifest', 'pages is empty');
  for (const page of manifest.pages) {
    if (!/^[a-z0-9-]+$/.test(page) || !existsSync(join(FIXTURES, `${page}.html`))) fail('manifest', `page "${page}" has no ${page}.html`);
  }

  // Loopback only; the fixture directory's .html files and nothing else.
  const server = createServer((req, res) => {
    const m = /^\/([a-z0-9-]+)\.html$/.exec(new URL(req.url, 'http://127.0.0.1').pathname);
    if (!m || !manifest.pages.includes(m[1])) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(join(FIXTURES, `${m[1]}.html`)));
  });
  // The binary runs asynchronously: a blocking call would stall this process's loopback server while Chromium loads.
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const session = `pb-snapshot-fixtures-${process.pid}`;
    const scratch = mkdtempSync(join(tmpdir(), 'pb-snapshot-fixtures-'));
    for (const d of ['home', 'xdg-config', 'xdg-cache', 'xdg-data', 'xdg-runtime', 'tmp']) mkdirSync(join(scratch, d), { mode: 0o700 });
    const env = agentBrowserEnv(process.env, chromium, scratch);
    const run = async (step, args) => {
      let out;
      try {
        ({ stdout: out } = await promisify(execFile)(process.execPath, [AB_LAUNCHER, '--session', session, ...args, '--json'], { env, cwd: scratch, encoding: 'utf8', timeout: 120000 }));
      } catch (err) {
        fail(step, `agent-browser ${args.join(' ')} exited ${err.status}: ${String(err.stderr || err.stdout || err.message).trim().slice(0, 300)}`);
      }
      let reply;
      try {
        reply = JSON.parse(out);
      } catch {
        fail(step, `agent-browser ${args.join(' ')} printed no JSON`);
      }
      if (reply.success !== true || !reply.data) fail(step, `agent-browser ${args.join(' ')} answered ${JSON.stringify(reply.error)}`);
      const { lifecycle, origin, ...data } = reply.data;
      return data;
    };
    try {
      for (const page of manifest.pages) {
        await run(`${page}: open`, ['open', `http://127.0.0.1:${port}/${page}.html`]);
        const full = await run(`${page}: snapshot`, ['snapshot']);
        const interactive = await run(`${page}: snapshot -i`, ['snapshot', '-i']);
        await run(`${page}: snapshot --delta baseline`, ['snapshot', '--delta']);
        const changed = await run(`${page}: pbChange()`, ['eval', 'pbChange()']);
        if (String(changed.result) !== '1') fail(`${page}: pbChange()`, `the page answered ${JSON.stringify(changed.result)}, not 1`);
        const afterChange = await run(`${page}: snapshot --delta after the change`, ['snapshot', '--delta']);
        const out = { agentBrowserVersion, chromiumVersion, generatedAt: new Date().toISOString(), full, interactive, afterChange };
        writeFileSync(join(FIXTURES, `${page}.json`), `${JSON.stringify(out, null, 1)}\n`);
        console.log(`${NAME}: ${page}.json -- ${Object.keys(full.refs || {}).length} refs, after change ${afterChange.snapshot?.kind}`);
      }
      writeFileSync(manifestPath, `${JSON.stringify({ agentBrowserVersion, pages: manifest.pages }, null, 1)}\n`);
      console.log(`${NAME}: PASS -- agent-browser ${agentBrowserVersion}, Chromium ${chromiumVersion}, ${manifest.pages.length} page(s)`);
    } catch (err) {
      report(err);
    } finally {
      try {
        await promisify(execFile)(process.execPath, [AB_LAUNCHER, '--session', session, 'close'], { env, cwd: scratch, timeout: 60000 });
      } catch {
        // the session may already be gone
      }
      server.close();
      rmSync(scratch, { recursive: true, force: true });
    }
  });
}

// The environment contract, checked against a hostile parent environment. The plant is the pre-fix construction
// ({ ...process.env, ... }); the same assertions must go red on it, naming what leaked.
function envFaults(env, scratch, chromium) {
  const faults = [];
  for (const key of Object.keys(env)) {
    if (key.startsWith('AGENT_BROWSER_') && key !== 'AGENT_BROWSER_EXECUTABLE_PATH') faults.push(`inherits ${key}`);
  }
  if (env.AGENT_BROWSER_EXECUTABLE_PATH !== chromium) faults.push('AGENT_BROWSER_EXECUTABLE_PATH is not the resolved Chromium');
  for (const key of ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
    if (!String(env[key] ?? '').startsWith(`${scratch}/`)) faults.push(`${key} is ${JSON.stringify(env[key])}, not under the scratch directory`);
  }
  for (const key of Object.keys(env)) if (!['PATH', 'LANG', 'LC_ALL', 'HOME', 'TMPDIR', 'AGENT_BROWSER_EXECUTABLE_PATH'].includes(key) && !key.startsWith('XDG_')) faults.push(`inherits ${key}`);
  if (env.PATH !== '/usr/bin:/bin') faults.push('PATH was not carried over');
  return faults;
}

function selfTest() {
  const hostile = {
    PATH: '/usr/bin:/bin', HOME: '/home/dev', LANG: 'C', XDG_CONFIG_HOME: '/home/dev/.config', SECRET_TOKEN: 'x',
    AGENT_BROWSER_PROFILE: '/home/dev/profile', AGENT_BROWSER_AUTO_CONNECT: '1', AGENT_BROWSER_INIT_SCRIPTS: '/home/dev/inject.js',
    AGENT_BROWSER_EXTENSIONS: '/home/dev/ext', AGENT_BROWSER_PROXY: 'http://proxy', AGENT_BROWSER_CONFIG: '/home/dev/ab.json',
    AGENT_BROWSER_EXECUTABLE_PATH: '/home/dev/other-chromium',
  };
  const scratch = '/scratch/pb';
  const chromium = '/usr/bin/chromium';
  let failures = 0;
  const control = envFaults(agentBrowserEnv(hostile, chromium, scratch), scratch, chromium);
  if (control.length) {
    console.error(`${NAME} self-test: FAIL -- the clean construction is not green (${control.join('; ')}), so the plant below proves nothing`);
    return 1;
  }
  console.log(`${NAME} self-test: control -- a hostile parent environment (6 AGENT_BROWSER_* variables, HOME, XDG_CONFIG_HOME, a secret) reaches the child as PATH, locale, a scratch HOME and the resolved Chromium only`);
  const planted = envFaults({ ...hostile, AGENT_BROWSER_EXECUTABLE_PATH: chromium }, scratch, chromium);
  for (const want of ['inherits AGENT_BROWSER_AUTO_CONNECT', 'inherits AGENT_BROWSER_INIT_SCRIPTS', 'inherits AGENT_BROWSER_PROFILE', 'HOME is "/home/dev"', 'inherits SECRET_TOKEN']) {
    if (planted.some((f) => f.includes(want))) console.log(`  ok pre-fix { ...process.env } construction -> red, naming '${want}'`);
    else { console.error(`  FAIL pre-fix { ...process.env } construction -> stayed green on '${want}'`); failures++; }
  }
  const dropped = envFaults(agentBrowserEnv({ ...hostile, PATH: undefined }, chromium, scratch), scratch, chromium);
  if (dropped.includes('PATH was not carried over')) console.log("  ok a dropped PATH -> red, naming 'PATH was not carried over'");
  else { console.error('  FAIL a dropped PATH stayed green'); failures++; }
  if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} plant(s) did not go red`); return 1; }
  console.log(`${NAME} self-test: PASS -- the allowlisted environment is clean and the unfiltered one is refused on each leak`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest());
  }
  try {
    main();
  } catch (err) {
    report(err);
  }
}
