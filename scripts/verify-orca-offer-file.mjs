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
//            orca-failure-copy.ts's ORCA_CLIENT_REASON_CLASS and of OrcaEnv's ORCA_CLIENT_REASONS, read by
//            importing OrcaEnv (never by its layout). Both files are tracked: either one missing, or OrcaEnv
//            without ORCA_CLIENT_REASONS, is red "source moved".
//   decode   When orca/ and theia/node_modules/typescript exist: Orca's parseWebPairingInput and
//            readPairingInputFromLocation (src/renderer/src/web/web-pairing.ts, transpiled, P63-27) and
//            decodeOffer return the same object for three synthetic hand-off texts. A named SKIP otherwise.
//   backend  In orca-panes-backend-module.ts handOff: an lstat call precedes the first read of the offer bytes and
//            no stat() call is made; offerFileVerdict is called before the first read; decodeOffer and
//            offerEndpointVerdict are called before the offer is returned; no return or log line in handOff or
//            refuse names the path, the bridge folder, an error message, the stat or the content.
//            The first read is readNoFollow(<path>, <the lstat result>), and readNoFollow opens with O_NOFOLLOW and
//            compares the opened file's ino and dev with the judged stat before it reads, which closes the window
//            between the lstat and the read (harness-static-hosting-06).
//
// A clause that cannot run because an untracked input is absent (no mkfifo; no orca/ or typescript for the
// decode agreement) makes the row SKIP: exit 77 with one SKIP line (SKIP-PROTOCOL.md, harness-static-hosting-01).
// A tracked input that is missing is red, never a SKIP. --root=<dir> runs the check over another tree (the
// self-test's SKIP control uses it).
//
// --quick: text reads, a temp folder and an in-memory type strip. --self-test requires the clean tree green,
// then plants faults in memory and requires each to go red naming its rule.

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP_EXIT, verdictExit } from './lib/skip-verdict.mjs';

const NAME = 'orca-offer-file';
const ROOT_ARG = process.argv.find(a => a.startsWith('--root='));
const ROOT = ROOT_ARG ? resolve(ROOT_ARG.slice('--root='.length)) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
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

/**
 * harness-static-hosting-06, follow-up: readNoFollow's no-follow read, judged on its body. The file is opened once with
 * O_NOFOLLOW into a handle; the stat compared is that handle's own; a mismatch of the ino or of the dev refuses (an
 * "or" of the two at the top level of the condition, whose branch throws); and the bytes are read through the same
 * handle after the comparison, never by path. Returns fault texts.
 */
export function readerFaults(body, judged) {
  const faults = [];
  const open = /\b(?:const|let)\s+(\w+)\s*=\s*await\s+fs\.promises\.open\(([^;]*)\)\s*;/.exec(body);
  if (!open) return ['readNoFollow opens no file handle this check can read (const <handle> = await fs.promises.open(...))'];
  const handle = open[1];
  if (!/\bO_NOFOLLOW\b/.test(open[2])) faults.push('readNoFollow opens the offer without O_NOFOLLOW, so a symlink swapped in after the lstat is followed');
  const statM = new RegExp(`\\b(?:const|let)\\s+(\\w+)\\s*=\\s*await\\s+${handle}\\.stat\\(\\s*\\)`).exec(body);
  if (!statM) faults.push(`readNoFollow does not stat the opened handle (${handle}.stat()), so the stat it compares can be of another file than the one it reads`);
  const opened = statM?.[1];
  const statAt = statM ? statM.index : -1;
  if (/\bfs\.(?:promises\.)?(?:l?stat|fstat)(?:Sync)?\(/.test(body)) faults.push('readNoFollow stats by path or descriptor beside the handle, so the compared stat can be of another file');
  // The guard: the if whose condition names <opened>.ino.
  let guard = null;
  for (const m of body.matchAll(/\bif\s*\(/g)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < body.length; i += 1) {
      if (body[i] === '(') depth += 1;
      else if (body[i] === ')' && (depth -= 1) === 0) break;
    }
    const cond = body.slice(m.index + m[0].length, i);
    if (opened && new RegExp(`\\b${opened}\\.ino\\b`).test(cond)) { guard = { cond, at: m.index, end: i }; break; }
  }
  const readM = new RegExp(`\\b${handle}\\.(?:readFile|read)\\(`).exec(body);
  if (opened) {
    if (!guard) faults.push(`readNoFollow no longer compares the opened file's ino with the judged stat, so another file renamed over the offer after the lstat is read`);
    else {
      // Top-level disjuncts of the condition.
      const parts = [];
      let depth = 0;
      let from = 0;
      const c = guard.cond;
      for (let i = 0; i < c.length; i += 1) {
        if (c[i] === '(') depth += 1;
        else if (c[i] === ')') depth -= 1;
        else if (depth === 0 && c.startsWith('||', i)) { parts.push(c.slice(from, i)); from = i + 2; i += 1; }
      }
      parts.push(c.slice(from));
      for (const field of ['ino', 'dev']) {
        const re = new RegExp(`^\\s*(?:${opened}\\.${field}\\s*!==?\\s*${judged}\\.${field}|${judged}\\.${field}\\s*!==?\\s*${opened}\\.${field})\\s*$`);
        if (!parts.some(p => re.test(p))) faults.push(`readNoFollow does not refuse on a ${field} mismatch alone (the condition must be an "or" with ${opened}.${field} !== ${judged}.${field} as one term), so a rename on the same filesystem can pass`);
      }
      const after = body.slice(guard.end + 1).replace(/^\s*/, '');
      if (!/^\{?\s*throw\b/.test(after)) faults.push('readNoFollow does not throw when the opened file differs from the judged one');
      if (statAt >= 0 && statAt > guard.at) faults.push('readNoFollow compares before it stats the handle');
    }
  }
  if (!readM) faults.push(`readNoFollow does not read through the opened handle (${handle}.readFile or ${handle}.read), so the bytes can come from another file than the one it compared`);
  else if (guard && readM.index < guard.at) faults.push('readNoFollow reads the offer before it compares ino and dev with the judged stat');
  if (/(?<![\w$])(?:fs\.(?:promises\.)?)?(?:readFile|readFileSync|createReadStream)\(/.test(body.replace(new RegExp(`\\b${handle}\\.readFile\\(`, 'g'), ''))) faults.push('readNoFollow reads by path beside the handle, so the bytes can come from another file than the one it compared');
  return faults;
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
  const skips = [];
  const fail = (rule, text) => failures.push({ rule, text });
  const policy = await importTs(inp.policySrc ?? '');
  for (const name of ['OFFER_REFUSAL_REASONS', 'offerFileVerdict', 'offerEndpointVerdict', 'decodeOffer', 'offerPortOf']) {
    if (!policy[name]) fail('cases', `${POLICY_REL} exports no ${name}${policy.loadError ? ` (${policy.loadError})` : ''}`);
  }
  if (failures.length) return { passes, failures, skips };

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
      skips.push('the fifo case did not run: no mkfifo on this host. Next step: run it where coreutils mkfifo exists');
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
  // OrcaEnv is imported, so a reformatted table reads the same (harness-static-hosting-01 follow-up).
  const env = inp.envSrc ? await importTs(inp.envSrc) : { loadError: 'the file is missing' };
  if (Array.isArray(env.ORCA_CLIENT_REASONS)) compare(`${ORCA_ENV_REL} ORCA_CLIENT_REASONS`, new Set(env.ORCA_CLIENT_REASONS.filter(r => typeof r === 'string' && r.startsWith('offer-'))));
  else fail('reasons', `source moved: ${ORCA_ENV_REL} exports no ORCA_CLIENT_REASONS array${env.loadError ? ` (${env.loadError})` : ''}`);

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
    skips.push(`the decode agreement did not run: ${WEB_PAIRING_REL} or ${TS_REL} is absent. Next step: bash scripts/fetch-orca.sh, and yarn install in theia/`);
  }

  // backend
  const backend = inp.backendSrc ?? '';
  const body = methodBody(backend, 'async handOff(');
  const refuseBody = methodBody(backend, 'protected refuse(') ?? '';
  if (!body) {
    fail('backend', `${BACKEND_REL} has no async handOff(`);
  } else {
    const readRe = /\b(readNoFollow|readFile|readFileSync|createReadStream)\(|\.(open)\(/;
    const firstRead = body.search(readRe);
    const lstatAt = body.search(/\blstat(Sync)?\(/);
    const verdictAt = body.indexOf('offerFileVerdict(');
    const returnAt = body.indexOf('return { pairing }');
    if (/\bfs\.(?:promises\.)?stat(?:Sync)?\(/.test(body)) fail('backend', 'handOff calls stat() -- the offer file must be judged by lstat, which never follows a link');
    if (firstRead < 0) fail('backend', 'handOff reads no offer bytes that this check can find');
    else {
      if (lstatAt < 0 || lstatAt > firstRead) fail('backend', 'handOff reads the offer before any lstat call');
      if (verdictAt < 0 || verdictAt > firstRead) fail('backend', 'handOff reads the offer before offerFileVerdict');
      // harness-static-hosting-06: the first read is the no-follow, same-inode reader, given the judged lstat.
      const m = readRe.exec(body);
      const reader = m[1] ?? m[2];
      if (reader !== 'readNoFollow') fail('backend', `handOff reads the offer with ${reader}(), not readNoFollow: a symlink or another file swapped in after the lstat would be read`);
      else {
        const judged = /\b(\w+)\s*=\s*await\s+fs\.promises\.lstat\(\s*(\w+)\s*\)/.exec(body);
        const call = /\breadNoFollow\(\s*(\w+)\s*,\s*(\w+)\b/.exec(body);
        if (!judged || !call || call[1] !== judged[2] || call[2] !== judged[1]) fail('backend', `handOff does not pass readNoFollow the path and the stat it judged (${call ? `readNoFollow(${call[1]}, ${call[2]})` : 'no readNoFollow call'}${judged ? `, lstat result ${judged[1]} of ${judged[2]}` : ', no lstat result'})`);
      }
      const reader2 = methodBody(backend, 'function readNoFollow(');
      const param = /function readNoFollow\(\s*\w+\s*:[^,]+,\s*(\w+)/.exec(backend)?.[1];
      if (!reader2 || !param) fail('backend', `${BACKEND_REL} declares no readNoFollow(path, judged) this check can read`);
      else readerFaults(reader2, param).forEach(t => fail('backend', t));
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
  return { passes, failures, skips };
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
  // SKIP control (harness-static-hosting-01): the main mode over a tree with the four tracked inputs and no orca/
  // or typescript exits 77 with one SKIP line naming the decode agreement. Run as a child, output captured.
  {
    const tmp = mkdtempSync(join(tmpdir(), 'pb-orca-offer-file-root-'));
    try {
      for (const rel of [POLICY_REL, BACKEND_REL, COPY_REL, ORCA_ENV_REL]) {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), readFileSync(join(ROOT, rel)));
      }
      const r = spawnSync(process.execPath, [SELF, `--root=${tmp}`], { encoding: 'utf8' });
      const last = r.stdout.trim().split('\n').pop();
      if (r.status !== 77 || !/^orca-offer-file: SKIP -- .*decode agreement did not run/.test(last)) {
        console.log(`${NAME} self-test: FAIL -- a tree without orca/ did not exit 77 with the decode SKIP line last (status ${r.status}, last line ${JSON.stringify(last)})`);
        return 1;
      }
      console.log('  ok  a tree without orca/ or typescript -> exit 77, SKIP line naming the decode agreement');
      rmSync(join(tmp, ORCA_ENV_REL));
      const red = spawnSync(process.execPath, [SELF, `--root=${tmp}`], { encoding: 'utf8' });
      if (red.status !== 1 || !red.stdout.includes('source moved')) {
        console.log(`${NAME} self-test: FAIL -- a tree missing tracked OrcaEnv was not red (status ${red.status})`);
        return 1;
      }
      console.log('  ok  a tree missing the tracked OrcaEnv -> exit 1 (red, not SKIP)');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const sub = (key, from, to) => inp => ({ ...inp, [key]: inp[key].replace(from, to) });
  const plants = [
    ['the mode check removed', 'cases', sub('policySrc', /\n\s*if \(\(stat\.mode & 0o077\) !== 0\) \{\n\s*return refuse\('offer-mode'\);\n\s*\}/, '')],
    ['stat used instead of lstat', 'backend', sub('backendSrc', 'stat = await fs.promises.lstat(full);', 'stat = await fs.promises.stat(full);')],
    ['an endpoint check that accepts any host', 'cases', sub('policySrc', String.raw`/^ws:\/\/127\.0\.0\.1:([1-9][0-9]*)\/?$/`, String.raw`/^wss?:\/\/[^/]+:([1-9][0-9]*)\/?$/`)],
    ['the RPC reading before the verdict', 'backend', sub('backendSrc', '        const verdict = offerFileVerdict(', '        await readNoFollow(full, stat as fs.Stats);\n        const verdict = offerFileVerdict(')],
    ['a returned error naming the path', 'backend', sub('backendSrc', "            return this.refuse('offer-unreadable');\n        }\n        const verdict", "            return { refused: 'offer-unreadable', at: full } as never;\n        }\n        const verdict")],
    ['a refusal reason renamed', 'reasons', sub('policySrc', "'offer-owner', 'offer-mode', 'offer-endpoint',", "'offer-owner', 'offer-perms', 'offer-endpoint',")],
    // harness-static-hosting-06
    ['a plain readFile after the verdict', 'backend', sub('backendSrc', 'text = await readNoFollow(full, stat);', "text = await fs.promises.readFile(full, 'utf8');")],
    ['the inode comparison removed', 'backend', sub('backendSrc', ' || opened.ino !== judged.ino', '')],
    ['the device comparison removed', 'backend', sub('backendSrc', ' || opened.dev !== judged.dev', '')],
    ['the no-follow flag removed', 'backend', sub('backendSrc', 'fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)', 'fs.constants.O_RDONLY')],
    ['readNoFollow given a fresh stat, not the judged one', 'backend', sub('backendSrc', 'text = await readNoFollow(full, stat);', 'text = await readNoFollow(full, await fs.promises.lstat(full));')],
    // harness-static-hosting-06 follow-up: the review's three edits of the real reader.
    ['the compared stat taken by path after the open', 'backend', sub('backendSrc', 'const opened = await handle.stat();', 'const opened = await fs.promises.stat(full);')],
    ['the ino and dev mismatches joined with and', 'backend', sub('backendSrc', 'opened.ino !== judged.ino || opened.dev !== judged.dev', '(opened.ino !== judged.ino && opened.dev !== judged.dev)')],
    ['the bytes read by path after the comparison', 'backend', sub('backendSrc', "return await handle.readFile('utf8');", "return await fs.promises.readFile(full, 'utf8');")],
    // harness-static-hosting-01 follow-up: OrcaEnv's table is read by import, so its layout does not matter.
    ['the reasons table without ORCA_CLIENT_REASONS', 'reasons', sub('envSrc', 'export const ORCA_CLIENT_REASONS =', 'export const ORCA_CLIENT_REASON_LIST =')],
  ];
  // Control: the reasons table reformatted stays green.
  {
    const reformatted = sub('envSrc', 'export const ORCA_CLIENT_REASONS = Object.freeze([', 'export const ORCA_CLIENT_REASONS = Object.freeze(\n  [')(base);
    const r = await check(reformatted);
    if (reformatted.envSrc === base.envSrc || r.failures.length) {
      console.log(`${NAME} self-test: FAIL -- the reasons table reformatted is not green: ${r.failures.map(f => f.text).join('; ') || 'plant did not land'}`);
      return 1;
    }
    console.log('  ok  the reasons table reformatted -> green (control)');
  }
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
  if (bad) {
    console.log(`${NAME} self-test: FAIL -- ${bad} of ${plants.length} plant(s)`);
    return 1;
  }
  // A clean run that skipped a clause did not prove those plants could run (SKIP-PROTOCOL.md rule 2).
  if (clean.skips.length) {
    console.log(`${NAME} self-test: SKIP -- ${plants.length} plants went red, but the clean run skipped: ${clean.skips.join('; ')}`);
    return SKIP_EXIT;
  }
  console.log(`${NAME} self-test: PASS -- the clean tree is green and all ${plants.length} plants went red naming their rule`);
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(await selfTest(inputs));
}
const unknown = process.argv.slice(2).filter(a => a !== '--self-test' && !a.startsWith('--root='));
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
if (res.failures.length) console.log(`${NAME}: FAIL -- ${res.failures.length} rule failure(s)`);
const code = verdictExit(NAME, res.failures, res.skips);
if (code === 0) console.log(`${NAME}: PASS -- the offer reader refuses a non-private or non-loopback offer before reading or returning it, through a no-follow, same-inode read`);
process.exit(code);
