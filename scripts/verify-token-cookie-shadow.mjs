#!/usr/bin/env node
// scripts/verify-token-cookie-shadow.mjs
//
// token-cookie-shadow (v1.7 audit-fix lane G4; item sidecar-gate-backends-03): a POWERBROWSER_TOKEN
// cookie a page on another loopback port planted on a longer path (sent first) never shadows the
// real token. The sidecar gate
// (theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts) is transpiled from the
// tree with theia/node_modules/typescript, with its own origin-policy.ts loaded for real and only
// Theia's DI and express imports stubbed, and asked both questions it answers: the HTTP gate and
// the WebSocket upgrade.
//
// Clauses, each over the gate and the upgrade:
//  a. planted value first, real token second: admitted;
//  b. real token first, planted value second: admitted;
//  c. only planted values (the token never sent): refused;
//  d. no cookie, and a cookie with the token under another name: refused;
//  e. a value that is the token plus a suffix or a prefix: refused (each value is compared whole);
//  f. the real token from a foreign origin: refused (RUN-08 still applies before any cookie).
//
// Tier: quick. SKIP when theia/node_modules/typescript is absent. --self-test plants the
// first-match read the item describes and a substring match, each must go red naming the
// clause, then the control re-runs green.
//
// Usage:
//   node scripts/verify-token-cookie-shadow.mjs
//   node scripts/verify-token-cookie-shadow.mjs --self-test

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import * as nodePath from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

// --root=<dir> runs the main mode over another tree (the self-test's SKIP control uses it); only as the entry point.
const ROOT_ARG = process.argv.slice(2).find(a => a.startsWith('--root='));
const REPO_ROOT = ROOT_ARG && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    ? resolve(ROOT_ARG.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'token-cookie-shadow';
const SELF_REL = 'scripts/verify-token-cookie-shadow.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const REL = {
    gate: 'theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts',
    policy: 'theia/extensions/token-gate/src/common/origin-policy.ts',
};

let ts;

function loadCjs(text, deps) {
    const out = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, esModuleInterop: false } }).outputText;
    const mod = { exports: {} };
    const requireFn = (id) => { if (id in deps) return deps[id]; throw new Error(`unexpected import ${id}`); };
    new Function('require', 'module', 'exports', out)(requireFn, mod, mod.exports);
    return mod.exports;
}

function load(texts) {
    const decorator = () => () => undefined;
    const stub = new Proxy({}, { get: () => decorator });
    const policy = loadCjs(texts.policy, {});
    return loadCjs(texts.gate, {
        crypto, http, https, path: nodePath,
        '@theia/core/shared/inversify': stub,
        '@theia/core/shared/express': {},
        '@theia/core/lib/node': stub,
        '@theia/core/lib/node/ws-request-validators': {},
        '@theia/core/shared/@theia/application-package': stub,
        './powerbrowser-env': { POWERBROWSER_ENV: {} },
        '../common/webview-host': { isWebviewHost: () => false },
        '../common/origin-policy': policy,
    });
}

function check(texts) {
    const fails = [];
    let mod;
    try { mod = load(texts); } catch (e) { return [`${REL.gate} did not load: ${e?.message ?? e}`]; }
    const Gate = mod.PowerBrowserTokenGateContribution;
    const cookieName = mod.POWERBROWSER_TOKEN_COOKIE_NAME;
    if (typeof Gate !== 'function' || typeof cookieName !== 'string') return [`${REL.gate} exports no PowerBrowserTokenGateContribution or POWERBROWSER_TOKEN_COOKIE_NAME`];
    const token = crypto.randomBytes(32).toString('hex');
    const port = 41234;
    const gate = new Gate();
    gate.token = token;
    gate.port = port;
    const own = { origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' };
    const viaHttp = (headers) => {
        let status;
        let passed = false;
        const res = { sendStatus: (s) => { status = s; } };
        gate.gate({ headers, path: '/', method: 'GET' }, res, () => { passed = true; });
        return passed && status === undefined;
    };
    const viaWs = (headers) => gate.allowWsUpgrade({ headers }) === true;
    const both = (what, headers, want) => {
        for (const [route, ask] of [['the HTTP gate', viaHttp], ['the WebSocket upgrade', viaWs]]) {
            const got = ask(headers);
            if (got !== want) fails.push(`${what}: ${route} ${got ? 'admitted' : 'refused'} it`);
        }
    };
    const c = (...pairs) => pairs.map(([n, v]) => `${n}=${v}`).join('; ');
    both('a. a planted value on a longer path sent before the real token', { ...own, cookie: c([cookieName, 'x'], [cookieName, token]) }, true);
    both('b. the real token sent before a planted value', { ...own, cookie: c([cookieName, token], [cookieName, 'x']) }, true);
    both('c. only planted values', { ...own, cookie: c([cookieName, 'x'], [cookieName, 'y']) }, false);
    both('d. no cookie', { ...own }, false);
    both('d. the token under another cookie name', { ...own, cookie: c(['OTHER', token]) }, false);
    both('e. the token with a suffix', { ...own, cookie: c([cookieName, `${token}0`]) }, false);
    both('e. the token with a prefix', { ...own, cookie: c([cookieName, `0${token}`]) }, false);
    both('f. the real token from a foreign loopback origin', { origin: 'http://127.0.0.1:26768', 'sec-fetch-site': 'same-site', cookie: c([cookieName, token]) }, false);
    return fails;
}

const PLANTS = [
    { name: 'first-match-read', naming: 'a. a planted value on a longer path sent before the real token', edit: (s) => s.replace('            if (this.isTokenValid(value)) {\n                return value;\n            }\n', '            return value;\n') },
    { name: 'substring-match', naming: 'e. the token with a suffix', edit: (s) => s.replace('if (received.byteLength !== expected.byteLength) {\n            return false;\n        }\n        return crypto.timingSafeEqual(received, expected);', 'return candidate.includes(this.token);') },
];

function runSelfTest(texts) {
    const control = check(texts);
    if (control.length) { console.error(`${NAME} self-test: FAIL -- the control is not green: ${control.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green`);
    let failures = 0;
    for (const p of PLANTS) {
        const planted = p.edit(texts.gate);
        if (planted === texts.gate) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved in ${REL.gate})`); failures++; continue; }
        const r = check({ ...texts, gate: planted });
        if (!r.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
        else if (!r.join('\n').includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${r.join(' | ')}`); failures++; }
        else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    if (check(texts).length) { console.error('  FAIL the control did not re-run green'); failures++; }
    // SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, over a tree with no
    // Theia install must exit 77 with the SKIP line last and no PASS line.
    {
        const empty = mkdtempSync(join(tmpdir(), `${NAME}-root-`));
        try {
            const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--root=${empty}`], { encoding: 'utf8' });
            const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
            const last = lines[lines.length - 1] ?? '';
            if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- theia/node_modules/typescript is absent`)
                || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
                console.error(`  FAIL control: a tree without typescript did not exit 77 with the SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)})`);
                failures++;
            } else console.log('  ok control: a tree without typescript -> exit 77, the SKIP line last, no PASS line');
        } finally { rmSync(empty, { recursive: true, force: true }); }
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the clause; the control re-ran green`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test' && !args[0].startsWith('--root='))) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    // An absent input: nothing ran, so exit 77 with the SKIP line (SKIP-PROTOCOL.md); a self-test cannot run its plants.
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(skipLine(args[0] === '--self-test' ? `${NAME} self-test` : NAME, 'theia/node_modules/typescript is absent. Next step: run the audited Theia install (docs/BUILD.md "Theia half")')); process.exit(SKIP_EXIT); }
    ts = createRequire(import.meta.url)(TS_DIR);
    const texts = { gate: readFileSync(join(REPO_ROOT, REL.gate), 'utf8'), policy: readFileSync(join(REPO_ROOT, REL.policy), 'utf8') };
    if (args[0] === '--self-test') process.exit(runSelfTest(texts));
    const fails = check(texts);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- a planted same-name cookie never shadows the token, before or after it, on the HTTP gate and the WebSocket upgrade; planted-only, renamed, padded and foreign-origin tokens are refused`);
    process.exit(0);
}
