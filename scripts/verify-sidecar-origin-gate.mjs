#!/usr/bin/env node
// scripts/verify-sidecar-origin-gate.mjs
//
// RUN-08 hotfix (67-RESEARCH P67-13/P67-14). The token cookie is host-only on 127.0.0.1 and two loopback ports
// are the same site, so a page on another 127.0.0.1 port in a stock window sent it, and the gate answered 200
// (a /file-upload wrote a file at a path the page chose). The gate now admits only the sidecar's own origin.
//
// Rules:
//   policy   theia/extensions/token-gate/src/common/origin-policy.ts, loaded from the tree, gives the expected
//            verdict for every header class of the live record (67-RESEARCH "Live header record") and for the
//            rule's edges: a foreign Origin without Sec-Fetch-*, Origin null, an unknown Sec-Fetch-Site value,
//            and an unknown bound port. The own origin is derived from TheiaService's swap URL, not spelled here.
//   gate     gate() refuses (res.sendStatus(403); return;) on !this.isOwnOrigin(req) after the webview branch and
//            before the token is read.
//   ws       allowWsUpgrade() returns false on !this.isOwnOrigin(request) after the disabled bypass and before
//            the token is read.
//   wiring   isOwnOrigin passes req.headers.origin, the sec-fetch-site header and this.port to originVerdict and
//            admits only 'allow'.
//
// Honestly --quick: text reads and an in-memory type strip (node:module stripTypeScriptTypes). --self-test
// requires the clean tree green, then plants faults in memory and requires each to go red naming its rule.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const NAME = 'verify-sidecar-origin-gate';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_REL = 'theia/extensions/token-gate/src/common/origin-policy.ts';
const CONTRIB_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts';
const SERVICE_REL = 'powerbrowser/shell/TheiaService.sys.mjs';

// Header classes from the live record. PORT stands for the sidecar's bound port, OTHER for the foreign page's.
// [label, Origin, Sec-Fetch-Site, allowed]
const RECORDED = [
  ['chrome health probe (system principal)', undefined, undefined, true],
  ['shell navigation into Theia', undefined, 'none', true],
  ['Theia fetch/script/style/worker GET', undefined, 'same-origin', true],
  ['Theia POST (socket.io polling, /file-upload)', 'OWN', 'same-origin', true],
  ['Theia WebSocket', 'OWN', 'same-origin', true],
  ['stock-window cors GET', 'FOREIGN', 'same-site', false],
  ['stock-window img / no-cors GET', undefined, 'same-site', false],
  ['stock-window same-site navigation', undefined, 'same-site', false],
  ['stock-window multipart POST to /file-upload', 'FOREIGN', 'same-site', false],
  ['stock-window WebSocket', 'FOREIGN', 'same-site', false],
  ['overlay cors GET', 'FOREIGN', 'same-site', false],
  ['cross-site navigation from localhost', undefined, 'cross-site', false],
];
// The rule's edges, beyond what the record exercised.
const EDGES = [
  ['foreign Origin without Sec-Fetch-*', 'FOREIGN', undefined, false],
  ['Origin null (opaque)', 'null', 'same-origin', false],
  ['own host on another port', 'OTHER_PORT', 'same-origin', false],
  ['unknown Sec-Fetch-Site value', undefined, 'same-everything', false],
];

function loadInputs() {
  return {
    policy: readFileSync(join(ROOT, POLICY_REL), 'utf8'),
    contrib: readFileSync(join(ROOT, CONTRIB_REL), 'utf8'),
    service: readFileSync(join(ROOT, SERVICE_REL), 'utf8'),
  };
}

async function loadPolicy(src) {
  const emit = process.emitWarning;
  process.emitWarning = () => {}; // stripTypeScriptTypes is flagged experimental on Node 24
  try {
    const js = stripTypeScriptTypes(src);
    return await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  } finally {
    process.emitWarning = emit;
  }
}

function methodBody(src, name) {
  const m = new RegExp(`^( +)(?:protected |public |private )?${name}\\([^)]*\\)[^{]*\\{\\n`, 'm').exec(src);
  if (!m) return null;
  const end = src.indexOf(`\n${m[1]}}\n`, m.index);
  return end === -1 ? null : src.slice(m.index + m[0].length, end);
}

async function check(inp) {
  const failures = [];
  const passes = [];
  const fail = (rule, kind, text) => failures.push({ rule, kind, text });

  // The own origin: the URL TheiaService swaps the shell to.
  const swap = /powerbrowserSwapToUrl\(`(http:\/\/[^:`/]+):\$\{this\._port\}\/`\)/.exec(inp.service);
  if (!swap) {
    fail('policy', 'BROKEN', `${SERVICE_REL} has no powerbrowserSwapToUrl(\`http://<host>:\${this._port}/\`) to derive the sidecar origin from`);
  } else {
    let mod;
    try {
      mod = await loadPolicy(inp.policy);
    } catch (e) {
      fail('policy', 'BROKEN', `${POLICY_REL} does not load: ${e.message}`);
    }
    if (mod && typeof mod.originVerdict !== 'function') fail('policy', 'BROKEN', `${POLICY_REL} exports no originVerdict`);
    else if (mod) {
      const port = 41673;
      const value = o => ({ OWN: `${swap[1]}:${port}`, FOREIGN: `${swap[1]}:42727`, OTHER_PORT: `${swap[1]}:${port + 1}` })[o] ?? o;
      for (const [label, o, sfs, allowed] of [...RECORDED, ...EDGES]) {
        const got = mod.originVerdict(value(o), sfs, port);
        if ((got === 'allow') !== allowed) {
          fail('policy', allowed ? 'REFUSES OWN' : 'ADMITS FOREIGN', `${label} (Origin ${value(o) ?? 'absent'}, Sec-Fetch-Site ${sfs ?? 'absent'}) got ${got}`);
        }
      }
      for (const [label, o, sfs] of RECORDED.filter(r => r[3])) {
        const got = mod.originVerdict(value(o), sfs, undefined);
        if (got === 'allow') fail('policy', 'FAILS OPEN', `${label} is admitted while the bound port is unknown`);
      }
      if (!failures.some(f => f.rule === 'policy')) {
        passes.push(`policy PASS -- ${RECORDED.length} recorded classes and ${EDGES.length} edges give their verdicts against own origin ${swap[1]}:<port>; unknown port refuses`);
      }
    }
  }

  const gate = methodBody(inp.contrib, 'gate') ?? '';
  const gOwn = gate.search(/if \(!this\.isOwnOrigin\(req\)\) \{\n\s*res\.sendStatus\(403\);\n\s*return;\n\s*\}/);
  const gWeb = gate.indexOf('isWebviewHost(req.headers.host)');
  const gTok = gate.indexOf('this.getTokenFromCookie(req)');
  if (gOwn === -1 || gWeb === -1 || gTok === -1 || !(gWeb < gOwn && gOwn < gTok)) {
    fail('gate', 'GATE UNWIRED', `${CONTRIB_REL} gate() must refuse 403 on !this.isOwnOrigin(req) after the webview branch and before the token check`);
  } else passes.push('gate PASS -- gate() refuses a foreign origin with 403 before the token is read');

  const ws = methodBody(inp.contrib, 'allowWsUpgrade') ?? '';
  const wOwn = ws.search(/if \(!this\.isOwnOrigin\(request\)\) \{\n\s*return false;\n\s*\}/);
  const wDis = ws.indexOf('this.disabled');
  const wTok = ws.indexOf('this.getTokenFromCookie(request)');
  if (wOwn === -1 || wDis === -1 || wTok === -1 || !(wDis < wOwn && wOwn < wTok)) {
    fail('ws', 'WS UNWIRED', `${CONTRIB_REL} allowWsUpgrade() must return false on !this.isOwnOrigin(request) before the token check`);
  } else passes.push('ws PASS -- allowWsUpgrade() refuses a foreign origin before the token is read');

  const own = methodBody(inp.contrib, 'isOwnOrigin') ?? '';
  if (!/import \{ originVerdict \} from '\.\.\/common\/origin-policy';/.test(inp.contrib)
    || !/originVerdict\(req\.headers\.origin, [^;]*fetchSite[^;]*, this\.port\) === 'allow'/.test(own)
    || !/req\.headers\['sec-fetch-site'\]/.test(own)) {
    fail('wiring', 'POLICY BYPASSED', `${CONTRIB_REL} isOwnOrigin must return originVerdict(req.headers.origin, <sec-fetch-site>, this.port) === 'allow'`);
  } else passes.push('wiring PASS -- isOwnOrigin passes Origin, Sec-Fetch-Site and the bound port to originVerdict');

  return { failures, passes };
}

async function selfTest(base) {
  const clean = await check(base);
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
    ['the Origin check removed', mutate('policy', "    if (origin !== undefined && origin !== `http://127.0.0.1:${port}`) {\n        return 'foreign-origin';\n    }\n", ''), 'policy', 'ADMITS FOREIGN'],
    ['a Sec-Fetch-Site deny-list in place of the allow-list', mutate('policy', '!SAME_ORIGIN_SITES.has(fetchSite)', "['same-site', 'cross-site'].includes(fetchSite)"), 'policy', 'ADMITS FOREIGN'],
    ['an unknown port fails open', mutate('policy', "    if (port === undefined) {\n        // Fail closed: before announce() there is no own origin to compare with.\n        return 'foreign-origin';\n    }\n", ''), 'policy', 'FAILS OPEN'],
    ['the Origin compared by prefix', mutate('policy', 'origin !== `http://127.0.0.1:${port}`', "!origin.startsWith('http://127.0.0.1')"), 'policy', 'ADMITS FOREIGN'],
    ['same-site admitted', mutate('policy', "new Set(['same-origin', 'none'])", "new Set(['same-origin', 'none', 'same-site'])"), 'policy', 'ADMITS FOREIGN'],
    ['gate() skips the origin rule', mutate('contrib', '        if (!this.isOwnOrigin(req)) {\n            res.sendStatus(403);\n            return;\n        }\n', ''), 'gate', 'GATE UNWIRED'],
    ['allowWsUpgrade() skips the origin rule', mutate('contrib', '        if (!this.isOwnOrigin(request)) {\n            return false;\n        }\n', ''), 'ws', 'WS UNWIRED'],
    ['isOwnOrigin ignores the verdict', mutate('contrib', ", this.port) === 'allow';", ", this.port) !== undefined;"), 'wiring', 'POLICY BYPASSED'],
  ];
  let bad = 0;
  for (const [label, plant, rule, kind] of plants) {
    const inp = { ...base };
    if (!plant(inp)) {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not land`);
      continue;
    }
    const got = (await check(inp)).failures;
    if (got.some(f => f.rule === rule && f.kind === kind)) console.log(`  ok  ${label} -> red ${rule}/${kind}`);
    else {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not go red as ${rule}/${kind}; got: ${got.map(f => `${f.rule}/${f.kind}`).join(', ') || 'green'}`);
    }
  }
  console.log(bad
    ? `${NAME} --self-test: FAIL -- ${bad} of ${plants.length} plant(s)`
    : `${NAME} --self-test: PASS -- the clean tree is green and all ${plants.length} plants went red naming their rule`);
  return bad ? 1 : 0;
}

const inputs = loadInputs();
if (process.argv.includes('--self-test')) {
  process.exit(await selfTest(inputs));
}
const res = await check(inputs);
for (const p of res.passes) console.log(`  ${p}`);
for (const f of res.failures) console.log(`  FAIL ${f.rule}/${f.kind} -- ${f.text}`);
console.log(res.failures.length ? `${NAME}: FAIL -- ${res.failures.length} rule(s) red` : `${NAME}: PASS -- the sidecar admits only its own origin, on HTTP and WebSocket alike`);
process.exit(res.failures.length ? 1 : 0);
