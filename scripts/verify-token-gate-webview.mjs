#!/usr/bin/env node
// scripts/verify-token-gate-webview.mjs
//
// Plan 38-07 security fix. Webviews run on <uuid>.webview.localhost:<port>, which the token cookie never reaches,
// so the token gate answers those requests itself. Downstream of the gate sits Theia's connection-token bootstrap,
// which Set-Cookies its own token on any request it sees; Socket.IO answers Theia's RPC before express. This gate
// goes red when either hole reopens.
//
// Rules, over theia/extensions/token-gate/src/node/token-gate-backend-{contribution,module}.ts:
//   order       initialize() puts the gate at the FRONT of the early middleware (handlers.unshift), ahead of Theia's
//               bootstrap.
//   branch      gate() opens with `if (isWebviewHost(req.headers.host)) { this.serveWebviewShell(req, res); return; }`,
//               before any next(); the branch hands serveWebviewShell no next.
//   serve       serveWebviewShell names no next and nothing that can set a header or cookie (cookie, setHeader,
//               header(, set(, append(, writeHead); it sends by exact name (WEBVIEW_SHELL_FILES.has(name)) from a
//               fixed root (sendFile(name, { root ...).
//   files       WEBVIEW_SHELL_FILES equals, as a set, the files Theia ships in
//               node_modules/@theia/plugin-ext/src/main/browser/webview/pre (derived, not hand-kept here).
//   ws          the module binds WsRequestValidatorContribution to the gate, and allowWsUpgrade validates the token
//               cookie (getTokenFromCookie and isTokenValid) and returns true only on the disabled dev bypass.
//
// Honestly --quick: text reads and one directory listing. --self-test requires the clean tree green, then plants
// faults in memory and requires each to go red naming its rule.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-token-gate-webview';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRIB_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts';
const MODULE_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-module.ts';
const PRE_REL = 'theia/node_modules/@theia/plugin-ext/src/main/browser/webview/pre';

function loadInputs() {
  let pre = null;
  try {
    pre = readdirSync(join(ROOT, PRE_REL)).sort();
  } catch {
    pre = null;
  }
  return { contrib: readFileSync(join(ROOT, CONTRIB_REL), 'utf8'), module: readFileSync(join(ROOT, MODULE_REL), 'utf8'), pre };
}

// The body of a class method `name(...)` up to its closing brace at the method's own indentation.
function methodBody(src, name) {
  const m = new RegExp(`^( +)(?:protected |public |private )?${name}\\([^)]*\\)[^{]*\\{\\n`, 'm').exec(src);
  if (!m) return null;
  const end = src.indexOf(`\n${m[1]}}\n`, m.index);
  return end === -1 ? null : src.slice(m.index + m[0].length, end);
}

function check(inp) {
  const failures = [];
  const passes = [];
  const fail = (rule, kind, text) => failures.push({ rule, kind, text });

  const init = methodBody(inp.contrib, 'initialize');
  if (!init || !/this\.earlyMiddleware\.handlers\.unshift\(\(req, res, next\) => this\.gate\(req, res, next\)\);/.test(init)) {
    fail('order', 'NOT FIRST', `${CONTRIB_REL} initialize() must unshift the gate onto the early middleware: behind Theia's bootstrap, an unauthenticated request is issued Theia's token before the gate refuses it`);
  } else passes.push('order PASS -- the gate is unshifted ahead of every other early middleware');

  const gate = methodBody(inp.contrib, 'gate');
  const branch = gate && /^\s*(?:\/\/[^\n]*\n\s*)*if \(isWebviewHost\(req\.headers\.host\)\) \{\n([\s\S]*?)\n\s*\}\n/.exec(gate);
  if (!gate || !branch) {
    fail('branch', 'BRANCH MISSING', `${CONTRIB_REL} gate() must open with the webview branch (if (isWebviewHost(req.headers.host)) { ... }), before any next()`);
  } else if (/\bnext\b/.test(branch[1]) || !/^\s*this\.serveWebviewShell\(req, res\);\n\s*return;$/.test(branch[1])) {
    fail('branch', 'NEXT IN BRANCH', `${CONTRIB_REL} gate()'s webview branch must be exactly this.serveWebviewShell(req, res); return; -- found ${JSON.stringify(branch[1].trim())}: a next() hands an unauthenticated request to Theia's cookie bootstrap`);
  } else passes.push('branch PASS -- gate() answers a webview host through serveWebviewShell and returns, before any next()');

  const serve = methodBody(inp.contrib, 'serveWebviewShell');
  if (!serve) {
    fail('serve', 'BRANCH MISSING', `${CONTRIB_REL} defines no serveWebviewShell method`);
  } else {
    const sig = /serveWebviewShell\(([^)]*)\)/.exec(inp.contrib)[1];
    if (/\bnext\b/.test(serve) || /\bnext\b/.test(sig)) {
      fail('serve', 'NEXT IN BRANCH', `${CONTRIB_REL} serveWebviewShell names next: an unauthenticated webview request must end there`);
    }
    const setter = /cookie|setHeader|\.header\(|\.set\(|\.append\(|writeHead|\.location\(|\.redirect\(/i.exec(serve);
    if (setter) {
      fail('serve', 'SETS COOKIE', `${CONTRIB_REL} serveWebviewShell contains ${JSON.stringify(setter[0])}: the unauthenticated webview path may set no header or cookie`);
    }
    if (!/WEBVIEW_SHELL_FILES\.has\(name\)/.test(serve) || !/\.sendFile\(name, \{ root\b/.test(serve) || !/req\.method !== 'GET' && req\.method !== 'HEAD'/.test(serve)) {
      fail('serve', 'NOT ALLOWLISTED', `${CONTRIB_REL} serveWebviewShell must refuse all but GET and HEAD, check WEBVIEW_SHELL_FILES.has(name), and sendFile(name, { root ... }) from a fixed root`);
    }
    if (!failures.some(f => f.rule === 'serve')) passes.push('serve PASS -- serveWebviewShell ends the request, sets no header, and sends GET/HEAD by exact name from a fixed root');
  }

  const decl = /^const WEBVIEW_SHELL_FILES = new Set\(\[([^\]]*)\]\);$/m.exec(inp.contrib);
  const listed = decl ? [...decl[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort() : null;
  if (!inp.pre) {
    fail('files', 'BROKEN', `could not list ${PRE_REL}; run yarn in theia/`);
  } else if (!listed || JSON.stringify(listed) !== JSON.stringify(inp.pre)) {
    fail('files', 'FILES MISMATCH', `${CONTRIB_REL} WEBVIEW_SHELL_FILES is ${JSON.stringify(listed)}; Theia ships ${JSON.stringify(inp.pre)} in ${PRE_REL}`);
  } else passes.push(`files PASS -- WEBVIEW_SHELL_FILES equals Theia's webview shell ${inp.pre.join(', ')}`);

  const ws = methodBody(inp.contrib, 'allowWsUpgrade');
  const bound = /^\s*bind\(WsRequestValidatorContribution\)\.toService\(PowerBrowserTokenGateContribution\);$/m.test(inp.module);
  const validates = ws && /const token = this\.getTokenFromCookie\(request\);\n\s*return token !== undefined && this\.isTokenValid\(token\);$/.test(ws.trimEnd())
    && (ws.match(/return true;/g) || []).length === (/if \(this\.disabled\) \{\n\s*return true;\n\s*\}/.test(ws) ? 1 : 0);
  if (!bound || !validates) {
    fail('ws', 'WS UNGATED', `${!bound ? `${MODULE_REL} does not bind WsRequestValidatorContribution to the gate` : `${CONTRIB_REL} allowWsUpgrade does not require a valid token cookie`}: Theia's RPC handshake would rest on Theia's connection token alone`);
  } else passes.push('ws PASS -- the gate is a WsRequestValidatorContribution that requires the token cookie on every upgrade');

  return { failures, passes };
}

function selfTest(base) {
  const clean = check(base);
  if (clean.failures.length) {
    console.log(`${NAME} --self-test: FAIL -- the clean tree is not green: ${clean.failures.map(f => f.text).join('; ')}`);
    return 1;
  }
  const mutate = (key, find, replace) => inp => {
    if (!inp[key].includes(find)) return false;
    inp[key] = inp[key].replace(find, replace);
    return true;
  };
  const plants = [
    ['the webview branch calls next()', mutate('contrib', 'this.serveWebviewShell(req, res);\n            return;', 'next();\n            return;'), 'branch', 'NEXT IN BRANCH'],
    ['serveWebviewShell passes on to next()', mutate('contrib', "        const root = path.join(", "        (req as any).next();\n        const root = path.join("), 'serve', 'NEXT IN BRANCH'],
    ['the webview path sets a cookie', mutate('contrib', '        const root = path.join(', "        res.cookie('theia-connection-token', 'x');\n        const root = path.join("), 'serve', 'SETS COOKIE'],
    ['the webview path sets a Set-Cookie header', mutate('contrib', '        const root = path.join(', "        res.setHeader('Set-Cookie', 'x=1');\n        const root = path.join("), 'serve', 'SETS COOKIE'],
    ['the webview branch moved after the token check', inp => {
      const m = /( +)\/\/ Plan 38-07: a webview frame runs on its own origin[\s\S]*?if \(isWebviewHost\(req\.headers\.host\)\) \{\n[\s\S]*?\n +\}\n/.exec(inp.contrib);
      if (!m) return false;
      inp.contrib = inp.contrib.replace(m[0], '').replace('            next();\n            return;\n        }\n', `            next();\n            return;\n        }\n${m[0]}`);
      return true;
    }, 'branch', 'BRANCH MISSING'],
    ['the gate pushed behind Theia\'s bootstrap', mutate('contrib', 'handlers.unshift((req, res, next) => this.gate(', 'handlers.push((req, res, next) => this.gate('), 'order', 'NOT FIRST'],
    ['any file served from the webview path', mutate('contrib', '!WEBVIEW_SHELL_FILES.has(name)', '!name'), 'serve', 'NOT ALLOWLISTED'],
    ['a file added to the allow-list', mutate('contrib', "'fake.html']);", "'fake.html', 'index.js']);"), 'files', 'FILES MISMATCH'],
    ['the WS validator binding removed', mutate('module', '    bind(WsRequestValidatorContribution).toService(PowerBrowserTokenGateContribution);\n', ''), 'ws', 'WS UNGATED'],
    ['the WS validator admits every upgrade', mutate('contrib', '        return token !== undefined && this.isTokenValid(token);\n    }\n\n    protected getTokenFromCookie', '        return true;\n    }\n\n    protected getTokenFromCookie'), 'ws', 'WS UNGATED'],
  ];
  let bad = 0;
  for (const [label, plant, rule, kind] of plants) {
    const inp = { ...base };
    if (!plant(inp)) {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not land`);
      continue;
    }
    const hit = check(inp).failures.find(f => f.rule === rule && f.kind === kind);
    if (hit) console.log(`  ok  ${label} -> red ${rule}/${kind}`);
    else {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not go red as ${rule}/${kind}; got: ${check(inp).failures.map(f => `${f.rule}/${f.kind}`).join(', ') || 'green'}`);
    }
  }
  console.log(bad
    ? `${NAME} --self-test: FAIL -- ${bad} of ${plants.length} plant(s)`
    : `${NAME} --self-test: PASS -- the clean tree is green and all ${plants.length} plants went red naming their rule`);
  return bad ? 1 : 0;
}

const inputs = loadInputs();
if (process.argv.includes('--self-test')) {
  process.exit(selfTest(inputs));
}
const res = check(inputs);
for (const p of res.passes) console.log(`  ${p}`);
for (const f of res.failures) console.log(`  FAIL ${f.rule}/${f.kind} -- ${f.text}`);
console.log(res.failures.length ? `${NAME}: FAIL -- ${res.failures.length} rule(s) red` : `${NAME}: PASS -- the webview path ends unauthenticated requests without a cookie, and every WebSocket upgrade needs the token`);
process.exit(res.failures.length ? 1 : 0);
