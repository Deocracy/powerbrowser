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
// Usage: node scripts/gen-orca-snapshot-fixtures.mjs

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
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
    const env = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: chromium };
    const run = async (step, args) => {
      let out;
      try {
        ({ stdout: out } = await promisify(execFile)(process.execPath, [AB_LAUNCHER, '--session', session, ...args, '--json'], { env, encoding: 'utf8', timeout: 120000 }));
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
        await promisify(execFile)(process.execPath, [AB_LAUNCHER, '--session', session, 'close'], { env, timeout: 60000 });
      } catch {
        // the session may already be gone
      }
      server.close();
    }
  });
}

try {
  main();
} catch (err) {
  report(err);
}
