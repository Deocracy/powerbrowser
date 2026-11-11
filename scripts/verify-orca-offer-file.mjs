#!/usr/bin/env node
// scripts/verify-orca-offer-file.mjs
//
// orca-offer-file (67-03, RUN-07, P67-09, T-67-12..T-67-14). The Theia backend hands orcad's web-pairing offer
// to the authenticated frontend. Another local user or process must not be able to supply it, and a tampered
// offer must not point the hosted Orca client at a peer other than PowerBrowser's own orcad. The backend now
// lstats the offer file first and reads it only after offerFileVerdict, and returns it only after decodeOffer
// and offerEndpointVerdict accept it; a refusal is one reason code.
//
// Rules:
//   cases    theia/extensions/orca-panes/src/node/offer-file-policy.ts, type-stripped from the tree, judges real
//            lstat results on a mkdtemp folder: a 0600 regular file of this uid holding a loopback offer is ok;
//            a symlink to it is offer-symlink; a directory and a fifo are offer-not-regular; 0640 and 0604 are
//            offer-mode; an injected stat with another uid is offer-owner; a missing file is offer-missing.
//            Endpoints ws://192.168.1.5, wss://127.0.0.1, ws://127.0.0.1.evil.com, ws://localhost, port 0 and
//            a port other than the web-client URL's are offer-endpoint; garbage text does not decode.
//            Every fixture offer is synthetic.
//   reasons  OFFER_REFUSAL_REASONS equals, as a set, the refusal half (offer-*) of the client reasons in
//            orca-failure-copy.ts's ORCA_CLIENT_REASON_CLASS and, once lane p67-01 is merged, of OrcaEnv's
//            ORCA_CLIENT_REASONS (a named SKIP of that half before).
//   decode   When orca/ and theia/node_modules/typescript exist: Orca's parseWebPairingInput and
//            readPairingInputFromLocation (src/renderer/src/web/web-pairing.ts, transpiled, P63-27) and
//            decodeOffer return the same object for three synthetic hand-off texts. A named SKIP otherwise.
//   backend  In orca-panes-backend-module.ts handOff: an lstat call precedes the first read of the offer bytes and
//            no stat() call is made; offerFileVerdict is called before the first read; decodeOffer and
//            offerEndpointVerdict are called before the offer is returned; no return or log line in handOff or
//            refuse names the path, the bridge folder, an error message, the stat or the content.
//
// --quick: text reads, a temp folder and an in-memory type strip. --self-test requires the clean tree green,
// then plants faults in memory and requires each to go red naming its rule.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'orca-offer-file';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_REL = 'theia/extensions/orca-panes/src/node/offer-file-policy.ts';
const BACKEND_REL = 'theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts';
const COPY_REL = 'theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts';
const ORCA_ENV_REL = 'powerbrowser/shell/OrcaEnv.sys.mjs';
const WEB_PAIRING_REL = 'orca/src/renderer/src/web/web-pairing.ts';
const TS_REL = 'theia/node_modules/typescript';

const read = rel => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; } };

async function importTs(src) {
  const emit = process.emitWarning;
  process.emitWarning = () => {}; // stripTypeScriptTypes is flagged experimental on Node 24
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(src)).toString('base64')}`);
  } catch (err) {
    return { loadError: err?.message ?? String(err) };
  } finally {
    process.emitWarning = emit;
  }
}

/** A synthetic hand-off text as OrcaService writes it: orcad's web-client URL whose #pairing= carries orca://pair?code=. */
function fixtureText({ endpoint = 'ws://127.0.0.1:26768/', urlPort = 26768, form = 'url', extra = {} } = {}) {
  const payload = { v: 2, endpoint, deviceToken: 'fixture-token-orca-offer-file', publicKeyB64: 'Zml4dHVyZS1wdWJsaWMta2V5', pairedDeviceId: 'fixture-device', scope: 'runtime', ...extra };
  const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (form === 'code') return code;
  return `http://127.0.0.1:${urlPort}/web-index.html#pairing=${encodeURIComponent(`orca://pair?code=${code}`)}`;
}

function methodBody(src, signature) {
  const at = src.indexOf(signature);
  if (at < 0) return null;
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && (depth -= 1) === 0) return src.slice(open, i + 1);
  }
  return null;
}

/** Orca's own parser from the pin, transpiled to CommonJS; its imports resolved to the two pinned shared files and a descriptor stub. */
function loadOrcaParser() {
  const tsDir = join(ROOT, TS_REL);
  if (!existsSync(join(ROOT, WEB_PAIRING_REL)) || !existsSync(tsDir)) return null;
  const ts = createRequire(join(tsDir, 'package.json'))('typescript');
  const shared = join(ROOT, 'orca/src/shared');
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const out = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    cache.set(file, module.exports);
    const req = spec => {
      const base = spec.split('/').pop();
      if (base === 'runtime-host-descriptor') return { RuntimeHostDescriptorSchema: { safeParse: () => ({}) } };
      if (base === 'mobile-pairing-base64' || base === 'mobile-pairing-protocol-limits') return load(join(shared, `${base}.ts`));
      throw new Error(`unexpected import ${spec} in ${file}`);
    };
    new Function('exports', 'require', 'module', out)(module.exports, req, module);
    cache.set(file, module.exports);
    return module.exports;
  };
  return load(join(ROOT, WEB_PAIRING_REL));
}

async function check(inp) {
  const passes = [];
  const failures = [];
  const fail = (rule, text) => failures.push({ rule, text });
  const policy = await importTs(inp.policySrc ?? '');
  for (const name of ['OFFER_REFUSAL_REASONS', 'offerFileVerdict', 'offerEndpointVerdict', 'decodeOffer', 'offerPortOf']) {
    if (!policy[name]) fail('cases', `${POLICY_REL} exports no ${name}${policy.loadError ? ` (${policy.loadError})` : ''}`);
  }
  if (failures.length) return { passes, failures };

  // cases: real lstat on a temp folder.
  const uid = process.getuid();
  const dir = mkdtempSync(join(tmpdir(), 'pb-orca-offer-file-'));
  try {
    const good = join(dir, 'web-pairing');
    writeFileSync(good, fixtureText(), { mode: 0o600 });
    chmodSync(good, 0o600);
    const lst = p => { try { return lstatSync(p); } catch { return null; } };
    const fileCase = (label, stat, want) => {
      const v = policy.offerFileVerdict({ stat, uid, platform: 'linux' });
      const got = v.ok ? 'ok' : v.reason;
      if (got === want) passes.push(`ok ${label} -> ${want}`);
      else fail('cases', `${label}: expected ${want}, got ${got}${want !== 'ok' && got === 'ok' ? ' (accepted)' : ''}`);
    };
    fileCase('0600 regular file of this uid', lst(good), 'ok');
    const link = join(dir, 'link');
    symlinkSync(good, link);
    fileCase('symlink to the offer', lst(link), 'offer-symlink');
    const sub = join(dir, 'folder');
    mkdirSync(sub);
    fileCase('directory', lst(sub), 'offer-not-regular');
    const fifo = join(dir, 'fifo');
    try {
      execFileSync('mkfifo', [fifo]);
      fileCase('fifo', lst(fifo), 'offer-not-regular');
    } catch {
      passes.push('SKIP fifo case (no mkfifo on this host)');
    }
    for (const mode of [0o640, 0o604]) {
      const p = join(dir, `mode-${mode.toString(8)}`);
      writeFileSync(p, fixtureText());
      chmodSync(p, mode);
      fileCase(`mode 0${mode.toString(8)}`, lst(p), 'offer-mode');
    }
    const real = lst(good);
    fileCase('owned by another uid (injected stat)', { isSymbolicLink: () => false, isFile: () => true, mode: real.mode, uid: uid + 1 }, 'offer-owner');
    fileCase('missing file', lst(join(dir, 'absent')), 'offer-missing');
    const t = policy.offerFileVerdict({ stat: { isSymbolicLink: () => false, isFile: () => true, mode: 0o100644, uid: uid + 1 }, uid, platform: 'win32' });
    if (t.ok) passes.push('ok win32 judges the file type only (Phase 68)');
    else fail('cases', `win32: owner and mode are Phase 68's, got ${t.reason}`);

    // decode + endpoint
    const endpointCase = (label, text, want) => {
      const offer = policy.decodeOffer(text);
      const got = !offer ? 'offer-unreadable' : (v => (v.ok ? 'ok' : v.reason))(policy.offerEndpointVerdict(offer, policy.offerPortOf(text)));
      if (got === want) passes.push(`ok ${label} -> ${want}`);
      else fail('cases', `${label}: expected ${want}, got ${got}${want !== 'ok' && got === 'ok' ? ' (accepted)' : ''}`);
    };
    endpointCase('the file\'s own loopback offer', readFileSync(good, 'utf8'), 'ok');
    endpointCase('loopback offer without a trailing slash, bare code', fixtureText({ endpoint: 'ws://127.0.0.1:26768', form: 'code' }), 'ok');
    endpointCase('endpoint on another machine', fixtureText({ endpoint: 'ws://192.168.1.5:26768/' }), 'offer-endpoint');
    endpointCase('wss endpoint', fixtureText({ endpoint: 'wss://127.0.0.1:26768/' }), 'offer-endpoint');
    endpointCase('lookalike host', fixtureText({ endpoint: 'ws://127.0.0.1.evil.com:26768/' }), 'offer-endpoint');
    endpointCase('localhost name', fixtureText({ endpoint: 'ws://localhost:26768/' }), 'offer-endpoint');
    endpointCase('port 0', fixtureText({ endpoint: 'ws://127.0.0.1:0/', urlPort: 0 }), 'offer-endpoint');
    endpointCase('port other than the web-client URL\'s', fixtureText({ endpoint: 'ws://127.0.0.1:26769/' }), 'offer-endpoint');
    endpointCase('garbage text', 'not an offer at all %%%', 'offer-unreadable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // reasons
  const refusal = new Set(policy.OFFER_REFUSAL_REASONS);
  const compare = (label, other) => {
    const missing = [...other].filter(r => !refusal.has(r));
    const extra = [...refusal].filter(r => !other.has(r));
    if (!missing.length && !extra.length) passes.push(`ok OFFER_REFUSAL_REASONS equals the offer-* reasons of ${label}`);
    for (const r of missing) fail('reasons', `'${r}' of ${label} is missing from OFFER_REFUSAL_REASONS`);
    for (const r of extra) fail('reasons', `OFFER_REFUSAL_REASONS has '${r}', which ${label} lacks`);
  };
  const copy = await importTs(inp.copySrc ?? '');
  if (copy.ORCA_CLIENT_REASON_CLASS) compare(COPY_REL, new Set(Object.keys(copy.ORCA_CLIENT_REASON_CLASS).filter(r => r.startsWith('offer-'))));
  else fail('reasons', `${COPY_REL} exports no ORCA_CLIENT_REASON_CLASS`);
  const envReasons = /export const ORCA_CLIENT_REASONS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(inp.envSrc ?? '');
  if (envReasons) compare(`${ORCA_ENV_REL} ORCA_CLIENT_REASONS`, new Set([...envReasons[1].matchAll(/"(offer-[a-z-]+)"/g)].map(m => m[1])));
  else passes.push(`SKIP ${ORCA_ENV_REL} has no ORCA_CLIENT_REASONS (lane p67-01 not merged)`);

  // decode agreement with Orca's own parser
  let orca = null;
  try {
    orca = loadOrcaParser();
  } catch (err) {
    fail('decode', `Orca's web-pairing.ts did not load: ${err.message}`);
  }
  if (orca) {
    const samples = [
      ['web-client URL', fixtureText()],
      ['bare code', fixtureText({ form: 'code' })],
      ['http endpoint and empty paired device', fixtureText({ endpoint: 'http://127.0.0.1:26768/', extra: { pairedDeviceId: '' } })],
    ];
    for (const [label, text] of samples) {
      const input = /^https?:\/\//.test(text) ? orca.readPairingInputFromLocation(new URL(text)) ?? text : text;
      const want = JSON.stringify(orca.parseWebPairingInput(input));
      const got = JSON.stringify(policy.decodeOffer(text));
      if (want === got && want !== 'null') passes.push(`ok decodeOffer agrees with Orca's parser (${label})`);
      else fail('decode', `decodeOffer disagrees with Orca's parser for the ${label} sample`);
    }
  } else if (!failures.some(f => f.rule === 'decode')) {
    passes.push(`SKIP decode agreement (${WEB_PAIRING_REL} or ${TS_REL} absent)`);
  }

  // backend
  const backend = inp.backendSrc ?? '';
  const body = methodBody(backend, 'async handOff(');
  const refuseBody = methodBody(backend, 'protected refuse(') ?? '';
  if (!body) {
    fail('backend', `${BACKEND_REL} has no async handOff(`);
  } else {
    const firstRead = body.search(/\b(readNoFollow|readFile|readFileSync|createReadStream)\(|\.open\(/);
    const lstatAt = body.search(/\blstat(Sync)?\(/);
    const verdictAt = body.indexOf('offerFileVerdict(');
    const returnAt = body.indexOf('return { pairing }');
    if (/\bfs\.(?:promises\.)?stat(?:Sync)?\(/.test(body)) fail('backend', 'handOff calls stat() -- the offer file must be judged by lstat, which never follows a link');
    if (firstRead < 0) fail('backend', 'handOff reads no offer bytes that this check can find');
    else {
      if (lstatAt < 0 || lstatAt > firstRead) fail('backend', 'handOff reads the offer before any lstat call');
      if (verdictAt < 0 || verdictAt > firstRead) fail('backend', 'handOff reads the offer before offerFileVerdict');
    }
    for (const fn of ['decodeOffer(', 'offerEndpointVerdict(']) {
      const at = body.indexOf(fn);
      if (at < 0 || returnAt < 0 || at > returnAt) fail('backend', `handOff returns the offer before ${fn.slice(0, -1)}`);
    }
    const sinks = [...`${body}\n${refuseBody}`.matchAll(/\breturn\b[^;]*;|\b(?:logOnce|console\.\w+)\([^;]*;/g)].map(m => m[0]).filter(s => s !== 'return { pairing };');
    // Only code can carry a value: string text is dropped, a template keeps its ${...} expressions.
    const codeOf = sink => sink.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
      .replace(/`([^`]*)`/g, (_m, inner) => (inner.match(/\$\{[^}]*\}/g) ?? []).join(' '));
    for (const s of sinks) {
      const named = /\b(full|text|pairing|offer|stat|bridgeDir|WEB_PAIRING_FILE)\b|\.message\b/.exec(codeOf(s));
      if (named) fail('backend', `a returned value or log line in handOff names '${named[0]}': ${s.slice(0, 80)}`);
    }
    if (!failures.some(f => f.rule === 'backend')) passes.push('ok handOff: lstat and offerFileVerdict before the read, decode and endpoint verdicts before the return, no value in a return or log line');
  }
  return { passes, failures };
}

const inputs = {
  policySrc: read(POLICY_REL),
  backendSrc: read(BACKEND_REL),
  copySrc: read(COPY_REL),
  envSrc: read(ORCA_ENV_REL),
};

async function selfTest(base) {
  const clean = await check(base);
  if (clean.failures.length) {
    console.log(`${NAME} self-test: FAIL -- the clean tree is not green: ${clean.failures.map(f => f.text).join('; ')}`);
    return 1;
  }
  const sub = (key, from, to) => inp => ({ ...inp, [key]: inp[key].replace(from, to) });
  const plants = [
    ['the mode check removed', 'cases', sub('policySrc', /\n\s*if \(\(stat\.mode & 0o077\) !== 0\) \{\n\s*return refuse\('offer-mode'\);\n\s*\}/, '')],
    ['stat used instead of lstat', 'backend', sub('backendSrc', 'stat = await fs.promises.lstat(full);', 'stat = await fs.promises.stat(full);')],
    ['an endpoint check that accepts any host', 'cases', sub('policySrc', String.raw`/^ws:\/\/127\.0\.0\.1:([1-9][0-9]*)\/?$/`, String.raw`/^wss?:\/\/[^/]+:([1-9][0-9]*)\/?$/`)],
    ['the RPC reading before the verdict', 'backend', sub('backendSrc', '        const verdict = offerFileVerdict(', '        await readNoFollow(full, stat as fs.Stats);\n        const verdict = offerFileVerdict(')],
    ['a returned error naming the path', 'backend', sub('backendSrc', "            return this.refuse('offer-unreadable');\n        }\n        const verdict", "            return { refused: 'offer-unreadable', at: full } as never;\n        }\n        const verdict")],
    ['a refusal reason renamed', 'reasons', sub('policySrc', "'offer-owner', 'offer-mode', 'offer-endpoint',", "'offer-owner', 'offer-perms', 'offer-endpoint',")],
  ];
  let bad = 0;
  for (const [label, rule, plant] of plants) {
    const planted = plant(base);
    if (JSON.stringify(planted) === JSON.stringify(base)) {
      console.log(`${NAME} self-test: FAIL -- plant '${label}' did not land`);
      bad += 1;
      continue;
    }
    const got = (await check(planted)).failures;
    if (got.some(f => f.rule === rule)) console.log(`  ok  ${label} -> red ${rule}: ${got.find(f => f.rule === rule).text}`);
    else {
      console.log(`  FAIL ${label} did not go red as ${rule}; got: ${got.map(f => `${f.rule}: ${f.text}`).join(' | ') || 'green'}`);
      bad += 1;
    }
  }
  console.log(bad
    ? `${NAME} self-test: FAIL -- ${bad} of ${plants.length} plant(s)`
    : `${NAME} self-test: PASS -- the clean tree is green and all ${plants.length} plants went red naming their rule`);
  return bad ? 1 : 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(await selfTest(inputs));
}
const unknown = process.argv.slice(2).filter(a => a !== '--self-test');
if (unknown.length) {
  console.log(`${NAME}: FAIL -- unknown argument ${unknown[0]}`);
  process.exit(2);
}
if (!inputs.policySrc || !inputs.backendSrc) {
  console.log(`${NAME}: FAIL -- ${POLICY_REL} or ${BACKEND_REL} is missing`);
  process.exit(1);
}
const res = await check(inputs);
for (const p of res.passes) console.log(`  ${p}`);
for (const f of res.failures) console.log(`  FAIL ${f.rule} -- ${f.text}`);
console.log(res.failures.length
  ? `${NAME}: FAIL -- ${res.failures.length} rule failure(s)`
  : `${NAME}: PASS -- the offer reader refuses a non-private or non-loopback offer before reading or returning it`);
process.exit(res.failures.length ? 1 : 0);
