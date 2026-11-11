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
// Orca rules (67-02, RUN-08 for Orca's traffic; no second policy, the hotfix's rule is the one checked):
//   orcad-origin  orcad's origin, built from OrcaEnv's ORCAD_BIND_HOST and the powerbrowser.orca.port default in
//            powerbrowser-sidecar.js (never spelled here), is refused by originVerdict for every Sec-Fetch-Site
//            value the tables use and with none.
//   orca-routes   every HTTP route a theia/extensions/orca-*/src/node file registers (app.get/post/use...,
//            express.static) sits in a configure( body, which BackendApplication runs after the early-middleware
//            gate; no Orca node file touches EarlyExpressMiddleware or attaches a raw 'request'/'upgrade'
//            listener; the derived route set is non-empty and holds orca-panes' pane-bundle route prefix.
//
// Honestly --quick: text reads and an in-memory type strip (node:module stripTypeScriptTypes). --self-test
// requires the clean tree green, then plants faults in memory and requires each to go red naming its rule.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const NAME = 'verify-sidecar-origin-gate';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_REL = 'theia/extensions/token-gate/src/common/origin-policy.ts';
const CONTRIB_REL = 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts';
const SERVICE_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const ORCA_ENV_REL = 'powerbrowser/shell/OrcaEnv.sys.mjs';
const SIDECAR_PREFS_REL = 'powerbrowser/shell/powerbrowser-sidecar.js';
const PANES_PROTOCOL_REL = 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts';
const SIDECAR_PORT = 41673; // a stand-in bound port; the rules compare against it, never against a live one
// Every Sec-Fetch-Site value the tables above use, plus absent.
const FETCH_SITES = ['none', 'same-origin', 'same-site', 'cross-site', 'same-everything', undefined];

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

// Every .ts under theia/extensions/orca-*/src, as { rel, text }. shortcut: *.spec.ts/*.test.ts are skipped, so a
// test double's app.use is not read as a route; a route in a test file never reaches the sidecar anyway.
function orcaSources() {
  const ext = join(ROOT, 'theia/extensions');
  return readdirSync(ext).filter(d => d.startsWith('orca-')).flatMap(d =>
    readdirSync(join(ext, d, 'src'), { recursive: true })
      .filter(f => f.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(f))
      .map(f => {
        const rel = `theia/extensions/${d}/src/${f}`;
        return { rel, text: readFileSync(join(ROOT, rel), 'utf8') };
      }));
}

function loadInputs() {
  return {
    policy: readFileSync(join(ROOT, POLICY_REL), 'utf8'),
    contrib: readFileSync(join(ROOT, CONTRIB_REL), 'utf8'),
    service: readFileSync(join(ROOT, SERVICE_REL), 'utf8'),
    orcaEnv: readFileSync(join(ROOT, ORCA_ENV_REL), 'utf8'),
    sidecarPrefs: readFileSync(join(ROOT, SIDECAR_PREFS_REL), 'utf8'),
    orca: orcaSources(),
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

// [start, end) of every `name(...) {` method body in src, by the same indentation rule as methodBody.
function methodRanges(src, name) {
  const re = new RegExp(`^( +)(?:protected |public |private )?(?:async )?${name}\\([^)]*\\)[^{]*\\{\\n`, 'gm');
  const out = [];
  for (let m; (m = re.exec(src));) {
    const end = src.indexOf(`\n${m[1]}}\n`, m.index);
    if (end !== -1) out.push([m.index + m[0].length, end]);
  }
  return out;
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
      const port = SIDECAR_PORT;
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

  await orcaRules(inp, fail, passes, failures);
  return { failures, passes };
}

async function orcaRules(inp, fail, passes, failures) {
  // orcad-origin: the origin orcad serves its web client on, derived from the tree.
  const portLine = /^pref\("powerbrowser\.orca\.port",\s*(\d+)\);/m.exec(inp.sidecarPrefs);
  let host;
  try {
    host = (await import(`data:text/javascript;base64,${Buffer.from(inp.orcaEnv).toString('base64')}`)).ORCAD_BIND_HOST;
  } catch (e) {
    fail('orcad-origin', 'BROKEN', `${ORCA_ENV_REL} does not load: ${e.message}`);
  }
  if (!portLine) fail('orcad-origin', 'BROKEN', `orcad port not derivable: ${SIDECAR_PREFS_REL} has no pref("powerbrowser.orca.port", N) line`);
  else if (typeof host !== 'string' || !host) fail('orcad-origin', 'BROKEN', `${ORCA_ENV_REL} exports no ORCAD_BIND_HOST`);
  else if (Number(portLine[1]) === SIDECAR_PORT) fail('orcad-origin', 'BROKEN', `orcad's default port equals the stand-in sidecar port ${SIDECAR_PORT}`);
  else {
    let mod;
    try {
      mod = await loadPolicy(inp.policy);
    } catch { /* the policy rule already names a load failure */ }
    const orcad = `http://${host}:${portLine[1]}`;
    if (typeof mod?.originVerdict === 'function') {
      // Origin set (cors GET, POST, WebSocket), and absent (no-cors GET, img, navigation) from the same page.
      for (const origin of [orcad, undefined]) {
        for (const sfs of FETCH_SITES) {
          if (origin === undefined && (sfs === undefined || sfs === 'none' || sfs === 'same-origin')) continue; // own-origin classes
          const got = mod.originVerdict(origin, sfs, SIDECAR_PORT);
          if (got === 'allow') fail('orcad-origin', 'ADMITS ORCAD', `orcad origin admitted: Origin ${origin ?? 'absent'}, Sec-Fetch-Site ${sfs ?? 'absent'} got allow`);
        }
      }
      if (!failures.some(f => f.rule === 'orcad-origin')) {
        passes.push(`orcad-origin PASS -- ${orcad} (ORCAD_BIND_HOST, powerbrowser.orca.port default) is refused for Sec-Fetch-Site ${FETCH_SITES.map(s => s ?? 'absent').join(', ')}, and its Origin-less same-site and cross-site requests too`);
      }
    } else fail('orcad-origin', 'BROKEN', `${POLICY_REL} gives no originVerdict to check orcad's origin against`);
  }

  // orca-routes: every Orca HTTP route behind gate().
  const consts = new Map();
  for (const f of inp.orca) for (const m of f.text.matchAll(/export const (\w+) = '([^']*)'/g)) consts.set(m[1], m[2]);
  const bundle = consts.get('ORCA_PANES_ROUTE_PREFIX');
  const routes = [];
  for (const f of inp.orca.filter(x => x.rel.includes('/src/node/'))) {
    // shortcut: matches registrations on an identifier named app (Theia's configure(app) parameter) and
    // express.static; a route registered through another receiver name would need this widened.
    const configure = methodRanges(f.text, 'configure');
    const inConfigure = i => configure.some(([s, e]) => i >= s && i < e);
    for (const m of f.text.matchAll(/\bapp\.(get|post|put|patch|delete|all|use)\s*\(\s*([^,)]*)|\bexpress\.static\s*\(/g)) {
      const line = f.text.slice(0, m.index).split('\n').length;
      const arg = (m[2] ?? '').trim();
      const path = /^'([^']*)'$/.exec(arg)?.[1] ?? consts.get(arg) ?? (m[1] ? `<unresolved ${arg || 'no path'}>` : null);
      if (path !== null) routes.push(path);
      if (!inConfigure(m.index)) fail('orca-routes', 'ROUTE OUTSIDE GATE', `${f.rel}:${line} registers ${m[0].trim()} outside a configure( body, where gate() does not run first`);
    }
    if (/\bEarlyExpressMiddleware\b|\bearlyMiddleware\b/.test(f.text)) {
      fail('orca-routes', 'EARLY HANDLER', `Orca handler ahead of the gate: ${f.rel} references the early middleware`);
    }
    const raw = /\.(on|once|addListener|prependListener|prependOnceListener)\(\s*['"](request|upgrade)['"]/.exec(f.text);
    if (raw) fail('orca-routes', 'RAW LISTENER', `raw listener bypasses the gate: ${f.rel}:${f.text.slice(0, raw.index).split('\n').length} ${raw[0]}`);
  }
  if (!routes.length) fail('orca-routes', 'ROUTE SCAN BLIND', 'route scan blind: no HTTP route found under theia/extensions/orca-*/src/node, so the pane-bundle route is not seen either');
  else if (!bundle) fail('orca-routes', 'BROKEN', `${PANES_PROTOCOL_REL} no longer exports ORCA_PANES_ROUTE_PREFIX`);
  else if (!routes.includes(bundle)) fail('orca-routes', 'BUNDLE ROUTE MISSING', `pane-bundle route not found: ${bundle} is not among the derived routes (${routes.join(', ')})`);
  if (!failures.some(f => f.rule === 'orca-routes')) {
    passes.push(`orca-routes PASS -- ${routes.join(', ')} registered in configure(), behind gate(); no Orca early-middleware handler or raw request/upgrade listener`);
  }
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
  // Orca plants replace the file array, never edit the shared base in place.
  const addOrca = text => inp => {
    inp.orca = [...inp.orca, { rel: 'theia/extensions/orca-planted/src/node/planted.ts', text }];
    return true;
  };
  const mutateOrca = (relPart, find, replace) => inp => {
    const i = inp.orca.findIndex(f => f.rel.includes(relPart) && f.text.includes(find));
    if (i === -1) return false;
    inp.orca = inp.orca.map((f, j) => (j === i ? { ...f, text: f.text.replace(find, replace) } : f));
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
    ['originVerdict admits the orcad port', inp => {
      const p = /^pref\("powerbrowser\.orca\.port",\s*(\d+)\);/m.exec(inp.sidecarPrefs)?.[1];
      return p && mutate('policy', '    if (port === undefined) {\n', `    if (origin?.endsWith(':${p}')) {\n        return 'allow';\n    }\n    if (port === undefined) {\n`)(inp);
    }, 'orcad-origin', 'ADMITS ORCAD'],
    ['an Orca node file unshifts onto earlyMiddleware.handlers', addOrca(
      'export class Early {\n    onStart(): void {\n        this.earlyMiddleware.handlers.unshift((req, res, next) => next());\n    }\n}\n'), 'orca-routes', 'EARLY HANDLER'],
    ['an Orca onStart attaches server.on(\'request\')', addOrca(
      "export class Raw {\n    onStart(server: http.Server): void {\n        server.on('request', (req, res) => res.end());\n    }\n}\n"), 'orca-routes', 'RAW LISTENER'],
    ['an Orca node file set with no route', inp => {
      inp.orca = inp.orca.filter(f => !/\bapp\.\w+\s*\(|express\.static/.test(f.text));
      return true;
    }, 'orca-routes', 'ROUTE SCAN BLIND'],
    ['the bundle route registered in onStart instead of configure', mutateOrca('orca-panes/src/node/',
      '    configure(app: express.Application): void {\n', '    onStart(app: express.Application): void {\n'), 'orca-routes', 'ROUTE OUTSIDE GATE'],
    ['the bundle route moved off its prefix', mutateOrca('orca-panes/src/node/',
      'app.use(ORCA_PANES_ROUTE_PREFIX,', "app.use('/elsewhere/',"), 'orca-routes', 'BUNDLE ROUTE MISSING'],
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
console.log(res.failures.length ? `${NAME}: FAIL -- ${res.failures.length} rule(s) red` : `${NAME}: PASS -- the sidecar admits only its own origin, on HTTP and WebSocket alike; orcad's origin is refused and every Orca route is behind the gate`);
process.exit(res.failures.length ? 1 : 0);
