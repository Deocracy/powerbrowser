#!/usr/bin/env node
// scripts/verify-orca-failure-classes.mjs
//
// RUN-06 (Phase 67, plan 67-01; P67-02, P67-03, P67-29, P67-36): every cause of an Orca hosting
// failure lands in exactly one failure class, and the class set is the one the failure page renders.
// Everything is derived at check time and compared as sets, so an addition and a removal both go red:
//
//  1. Codes. Every ORCAD_*_CODE export of powerbrowser/shell/OrcaEnv.sys.mjs maps through
//     ORCA_CODE_CLASSES.
//  2. Steps. OrcaService.sys.mjs is scanned for the first argument of every this._fail( call and
//     every step: property. Each must be a string literal; a this._fail(<x>.step) call forwards a
//     step: value and is accepted; anything else is red "step not derivable". The derived step set
//     equals the keys of ORCA_STEP_CLASSES, both ways, naming the side.
//  3. Orca's reasons, by parsing the pinned source with theia/node_modules/typescript (P63-27):
//     PairingOfferUnavailableReason (src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts)
//     equals ORCA_OFFER_UNAVAILABLE_REASONS, and WebRuntimeAuthFailureReason
//     (src/renderer/src/web/web-runtime-client-error.ts) plus lane p67-03's OFFER_REFUSAL_REASONS
//     (theia/extensions/orca-panes/src/node/offer-file-policy.ts, type-stripped) plus the
//     browser-host reason (P67-36) equals ORCA_CLIENT_REASONS. A union with no member is red
//     "source moved". With orca/ or typescript absent these clauses print one SKIP.
//  4. Classes. Every value of ORCA_STEP_CLASSES and ORCA_CODE_CLASSES, and failureClassOf for each
//     offer-unavailable reason, the browser-host reason and a restart, is a member of
//     ORCA_FAILURE_CLASSES; every class is reached by at least one of them.
//  5. Copy (lane p67-03's theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts,
//     type-stripped): the class set equals the keys of ORCA_FAILURE_COPY and of
//     ORCA_FAILURE_BUTTONS, and the keys of ORCA_CLIENT_REASON_CLASS equal ORCA_CLIENT_REASONS, each
//     pairing-lost except the browser-host reason, which is browser-not-attached. While that
//     failure/ directory is absent (lane p67-03 not merged) clauses 5 and the offer-refusal half of
//     3 print one SKIP; the directory present without the file is red.
//
// Limit: this proves the mapping tables and the source sets agree. It does not prove that a live
// orcad failure reaches the page; orca-service scenario G (stub boundary) and
// orca-failure-page-live (lane p67-03) do.
//
// --self-test copies OrcaEnv and OrcaService, synthetic Orca union files and synthetic copy and
// policy files carrying the interfaces names into a mkdtemp directory, requires the copies green,
// then plants each fault and requires red naming it.
//
// Honestly --quick: text reads, in-process imports and a TypeScript parse. No build, no browser.
//
// Usage:
//   node scripts/verify-orca-failure-classes.mjs
//   node scripts/verify-orca-failure-classes.mjs --self-test

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-failure-classes';
const SELF_REL = 'scripts/verify-orca-failure-classes.mjs';
const AUTH_REL = 'src/renderer/src/web/web-runtime-client-error.ts';
const PAIRING_REL = 'src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts';

/** Every input path of the check, for a tree rooted at `root`; typescript always comes from the repo. */
export function pathsFor(root) {
    const failureDir = join(root, 'theia', 'extensions', 'orca-panes', 'src', 'browser', 'failure');
    return {
        orcaEnv: join(root, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs'),
        orcaService: join(root, 'powerbrowser', 'shell', 'OrcaService.sys.mjs'),
        orcaDir: join(root, 'orca'),
        authFile: join(root, 'orca', AUTH_REL),
        pairingFile: join(root, 'orca', PAIRING_REL),
        failureDir,
        copyFile: join(failureDir, 'orca-failure-copy.ts'),
        policyFile: join(root, 'theia', 'extensions', 'orca-panes', 'src', 'node', 'offer-file-policy.ts'),
        typescriptFrom: join(REPO_ROOT, 'theia', 'package.json'),
    };
}

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
let importCounter = 0;
const freshImport = (path) => import(`${pathToFileURL(path).href}?v=${process.pid}-${++importCounter}`);

function loadTypescript(from) {
    try { return createRequire(from)('typescript'); } catch { return undefined; }
}

async function importTs(src) {
    const emit = process.emitWarning;
    process.emitWarning = () => {}; // stripTypeScriptTypes is flagged experimental on Node 24
    try {
        const js = stripTypeScriptTypes(src);
        return await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
    } finally {
        process.emitWarning = emit;
    }
}

/** The string-literal members of `type <typeName> = 'a' | 'b'` in a TypeScript source; [] when absent. */
export function unionMembers(ts, text, typeName) {
    const sf = ts.createSourceFile('pinned.ts', text, ts.ScriptTarget.Latest, true);
    let out = [];
    const visit = (node) => {
        if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
            const parts = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
            out = parts.filter((p) => ts.isLiteralTypeNode(p) && ts.isStringLiteral(p.literal)).map((p) => p.literal.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

const LITERAL = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;

/** The failed-step strings of OrcaService's source: { steps, bad } where bad holds non-literal sites. */
export function deriveSteps(source) {
    // Comment lines name the rule ("step:") without being a site.
    const code = source.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const steps = new Set();
    const bad = [];
    const take = (arg, passThroughOk) => {
        const lit = new RegExp(`^(?:${LITERAL})$`).exec(arg);
        if (lit) steps.add(JSON.parse(arg.startsWith("'") ? `"${arg.slice(1, -1).replaceAll('"', '\\"')}"` : arg));
        else if (!(passThroughOk && /^[A-Za-z_$][\w$]*\.step$/.test(arg))) bad.push(arg);
    };
    for (const m of code.matchAll(new RegExp(`this\\._fail\\(\\s*(${LITERAL}|[^,)]*)`, 'g'))) take(m[1].trim(), true);
    for (const m of code.matchAll(new RegExp(`\\bstep:\\s*(${LITERAL}|[^,}\\n]*)`, 'g'))) take(m[1].trim(), false);
    return { steps, bad };
}

const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();

/** Runs every clause over `paths`. Resolves { fails, notes, counts }. */
export async function check(paths) {
    const fails = [];
    const notes = [];
    let env;
    try { env = await freshImport(paths.orcaEnv); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], notes, counts: {} }; }
    const service = read(paths.orcaService);
    if (service === null) return { fails: [`${paths.orcaService} is missing`], notes, counts: {} };
    for (const name of ['ORCA_FAILURE_CLASSES', 'ORCA_STEP_CLASSES', 'ORCA_CODE_CLASSES', 'ORCA_OFFER_UNAVAILABLE_REASONS', 'ORCA_CLIENT_REASONS', 'ORCA_BROWSER_HOST_REASON', 'failureClassOf']) {
        if (env[name] === undefined) fails.push(`OrcaEnv.sys.mjs exports no ${name}`);
    }
    if (fails.length) return { fails, notes, counts: {} };
    const classes = new Set(env.ORCA_FAILURE_CLASSES);
    const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);
    const reached = new Map(); // class -> first cause naming it
    const reach = (cls, cause) => {
        if (!classes.has(cls)) fails.push(`${cause} maps to '${cls}', outside the class set ORCA_FAILURE_CLASSES`);
        else if (!reached.has(cls)) reached.set(cls, cause);
    };

    // 1. Codes.
    const codes = Object.entries(env).filter(([k, v]) => /^ORCAD_\w+_CODE$/.test(k) && typeof v === 'string');
    if (!codes.length) fails.push('OrcaEnv.sys.mjs exports no ORCAD_*_CODE constant, so the code clause would pass vacuously');
    for (const [k, v] of codes) {
        const cls = own(env.ORCA_CODE_CLASSES, v);
        if (cls === undefined) fails.push(`unmapped code: OrcaEnv.${k} '${v}' has no ORCA_CODE_CLASSES entry`);
        else reach(cls, `ORCA_CODE_CLASSES['${v}']`);
    }

    // 2. Steps.
    const { steps, bad } = deriveSteps(service);
    for (const b of bad) fails.push(`step not derivable: OrcaService.sys.mjs passes ${b} as a failed step, not a string literal`);
    if (!steps.size) fails.push('no failed step derived from OrcaService.sys.mjs, so the step clause would pass vacuously');
    const keys = new Set(Object.keys(env.ORCA_STEP_CLASSES));
    for (const s of diff(steps, keys)) fails.push(`unmapped step: OrcaService.sys.mjs fails with '${s}', which ORCA_STEP_CLASSES has no entry for`);
    for (const s of diff(keys, steps)) fails.push(`ORCA_STEP_CLASSES maps '${s}', which is no step OrcaService.sys.mjs uses`);
    for (const [s, cls] of Object.entries(env.ORCA_STEP_CLASSES)) reach(cls, `ORCA_STEP_CLASSES['${s}']`);

    // 4 (the runtime causes): what failureClassOf answers for the non-table causes.
    reach(env.failureClassOf({ state: 'starting', restarting: true }), 'failureClassOf(a restart)');
    for (const r of env.ORCA_OFFER_UNAVAILABLE_REASONS) {
        const cls = env.failureClassOf({ state: 'ready', offerUnavailableReason: r });
        if (cls !== 'pairing-lost') fails.push(`failureClassOf(ready, offer unavailable '${r}') is ${JSON.stringify(cls)}, not pairing-lost`);
        reach(cls, `failureClassOf(offer unavailable '${r}')`);
    }
    const hostClass = env.failureClassOf({ state: 'ready', clientReason: env.ORCA_BROWSER_HOST_REASON });
    if (hostClass !== 'browser-not-attached') fails.push(`failureClassOf(ready, '${env.ORCA_BROWSER_HOST_REASON}') is ${JSON.stringify(hostClass)}, not browser-not-attached`);
    reach(hostClass, `failureClassOf('${env.ORCA_BROWSER_HOST_REASON}')`);
    if (!env.ORCA_CLIENT_REASONS.includes(env.ORCA_BROWSER_HOST_REASON)) fails.push(`ORCA_CLIENT_REASONS lacks the browser-host reason ${env.ORCA_BROWSER_HOST_REASON} (P67-36)`);
    if (env.failureClassOf({ state: 'failed', step: 'a step no table has' }) !== 'could-not-start') fails.push('failureClassOf returns something other than could-not-start for a failed state with no mapping (P67-03)');

    // 3. Orca's reasons.
    const ts = loadTypescript(paths.typescriptFrom);
    let authSet = null;
    if (!existsSync(paths.orcaDir) || !ts) {
        notes.push(`SKIP of the pinned-source clauses only -- ${!ts ? 'theia/node_modules/typescript is not installed' : 'orca/ is not fetched (bash scripts/fetch-orca.sh)'}`);
    } else {
        const pinned = (file, type) => {
            const members = unionMembers(ts, read(file) ?? '', type);
            if (!members.length) fails.push(`source moved: ${type} has no string-literal member in ${file}`);
            return new Set(members);
        };
        const offer = pinned(paths.pairingFile, 'PairingOfferUnavailableReason');
        authSet = pinned(paths.authFile, 'WebRuntimeAuthFailureReason');
        const ours = new Set(env.ORCA_OFFER_UNAVAILABLE_REASONS);
        if (offer.size) {
            for (const r of diff(offer, ours)) fails.push(`added Orca reason: the pinned PairingOfferUnavailableReason has '${r}', which ORCA_OFFER_UNAVAILABLE_REASONS lacks`);
            for (const r of diff(ours, offer)) fails.push(`ORCA_OFFER_UNAVAILABLE_REASONS has '${r}', which the pinned PairingOfferUnavailableReason lacks`);
        }
        const client = new Set(env.ORCA_CLIENT_REASONS);
        for (const r of diff(authSet, client)) fails.push(`added Orca reason: the pinned WebRuntimeAuthFailureReason has '${r}', which ORCA_CLIENT_REASONS lacks`);
    }

    // 5 and the offer-refusal half of 3: lane p67-03's files.
    let copy = 'SKIP';
    if (!existsSync(paths.failureDir)) {
        notes.push('SKIP of the copy-table and offer-refusal clauses only -- lane p67-03 not merged (theia/extensions/orca-panes/src/browser/failure is absent)');
    } else {
        copy = 'compared';
        const load = async (file, names) => {
            const src = read(file);
            if (src === null) { fails.push(`${file} is missing while theia/extensions/orca-panes/src/browser/failure exists`); return null; }
            let mod;
            try { mod = await importTs(src); } catch (err) { fails.push(`${file} does not load after a type strip: ${err.message}`); return null; }
            for (const n of names) if (mod[n] === undefined) fails.push(`${file} exports no ${n}`);
            return mod;
        };
        const policy = await load(paths.policyFile, ['OFFER_REFUSAL_REASONS']);
        if (policy?.OFFER_REFUSAL_REASONS) {
            const expected = new Set([...(authSet ?? []), ...policy.OFFER_REFUSAL_REASONS, env.ORCA_BROWSER_HOST_REASON]);
            const client = new Set(env.ORCA_CLIENT_REASONS);
            for (const r of diff(new Set(policy.OFFER_REFUSAL_REASONS), client)) fails.push(`refusal reason '${r}' of OFFER_REFUSAL_REASONS is missing from ORCA_CLIENT_REASONS`);
            if (authSet) for (const r of diff(client, expected)) fails.push(`ORCA_CLIENT_REASONS has '${r}', which is no pinned auth reason, no offer refusal and not the browser-host reason`);
        }
        const table = await load(paths.copyFile, ['ORCA_FAILURE_COPY', 'ORCA_FAILURE_BUTTONS', 'ORCA_CLIENT_REASON_CLASS']);
        if (table?.ORCA_FAILURE_COPY && table.ORCA_FAILURE_BUTTONS && table.ORCA_CLIENT_REASON_CLASS) {
            for (const [what, obj] of [['ORCA_FAILURE_COPY', table.ORCA_FAILURE_COPY], ['ORCA_FAILURE_BUTTONS', table.ORCA_FAILURE_BUTTONS]]) {
                const k = new Set(Object.keys(obj));
                for (const c of diff(classes, k)) fails.push(`class without copy: '${c}' has no ${what} entry`);
                for (const c of diff(k, classes)) fails.push(`removed class: ${what} renders '${c}', which ORCA_FAILURE_CLASSES lacks`);
            }
            const reasonKeys = new Set(Object.keys(table.ORCA_CLIENT_REASON_CLASS));
            const client = new Set(env.ORCA_CLIENT_REASONS);
            for (const r of diff(client, reasonKeys)) fails.push(`ORCA_CLIENT_REASON_CLASS has no entry for the client reason '${r}'`);
            for (const r of diff(reasonKeys, client)) fails.push(`ORCA_CLIENT_REASON_CLASS maps '${r}', which ORCA_CLIENT_REASONS lacks`);
            for (const [r, cls] of Object.entries(table.ORCA_CLIENT_REASON_CLASS)) {
                const want = r === env.ORCA_BROWSER_HOST_REASON ? 'browser-not-attached' : 'pairing-lost';
                if (cls !== want) fails.push(`ORCA_CLIENT_REASON_CLASS maps '${r}' to '${cls}', not ${want}`);
                reach(cls, `ORCA_CLIENT_REASON_CLASS['${r}']`);
            }
        }
    }

    for (const c of classes) if (!reached.has(c)) fails.push(`class '${c}' is reached by no cause`);
    return { fails, notes, counts: { steps: steps.size, codes: codes.length, classes: classes.size, copy } };
}

// ---------------------------------------------------------------------------
// --self-test

const FIXTURE_AUTH = "export type WebRuntimeAuthFailureReason =\n  | 'unauthorized'\n  | 'device-revoked'\n  | 'device-downgraded'\n  | 'insecure-origin'\n";
const FIXTURE_PAIRING = "export type PairingOfferUnavailableReason =\n  | 'websocket_unavailable'\n  | 'device_registry_unavailable'\n  | 'e2ee_key_unavailable'\n  | 'invalid_advertised_endpoint'\n  | 'relay_mint_failed'\n  | 'network_exposure_failed'\n";
const FIXTURE_POLICY = "export const OFFER_REFUSAL_REASONS = ['offer-missing', 'offer-unreadable', 'offer-symlink', 'offer-not-regular', 'offer-owner', 'offer-mode', 'offer-endpoint'] as const;\n";

function fixtureCopy(env) {
    const buttons = { restarting: ['details'], 'could-not-start': ['restart', 'details'], 'port-in-use': ['restart', 'details'], 'files-missing': ['details'], 'temporary-profile': ['details'], 'plaintext-setting': ['details'], 'pairing-lost': ['reconnect', 'details'], 'browser-not-attached': ['reconnect', 'details'] };
    const lines = Object.keys(buttons).map((c) => `    '${c}': { message: 'fixture ${c}', protection: false },`);
    const reasons = env.ORCA_CLIENT_REASONS.map((r) => `    '${r}': '${r === env.ORCA_BROWSER_HOST_REASON ? 'browser-not-attached' : 'pairing-lost'}',`);
    return [
        'export type OrcaFailureClass = string;',
        `export const ORCA_FAILURE_COPY: Record<OrcaFailureClass, { message: string; protection: boolean }> = {\n${lines.join('\n')}\n};`,
        `export const ORCA_FAILURE_BUTTONS: Record<OrcaFailureClass, readonly string[]> = ${JSON.stringify(buttons, null, 4)};`,
        "export const ORCA_BUTTON_LABELS = { restart: 'Restart Orca', reconnect: 'Reconnect', details: 'Details' };",
        `export const ORCA_CLIENT_REASON_CLASS: Record<string, OrcaFailureClass> = {\n${reasons.join('\n')}\n};`,
        '',
    ].join('\n');
}

async function runSelfTest() {
    const ts = loadTypescript(pathsFor(REPO_ROOT).typescriptFrom);
    if (!ts) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const paths = pathsFor(tmp);
        mkdirSync(dirname(paths.orcaEnv), { recursive: true });
        cpSync(pathsFor(REPO_ROOT).orcaEnv, paths.orcaEnv);
        cpSync(pathsFor(REPO_ROOT).orcaService, paths.orcaService);
        mkdirSync(dirname(paths.authFile), { recursive: true });
        mkdirSync(dirname(paths.pairingFile), { recursive: true });
        writeFileSync(paths.authFile, FIXTURE_AUTH);
        writeFileSync(paths.pairingFile, FIXTURE_PAIRING);
        mkdirSync(paths.failureDir, { recursive: true });
        mkdirSync(dirname(paths.policyFile), { recursive: true });
        writeFileSync(paths.policyFile, FIXTURE_POLICY);
        writeFileSync(paths.copyFile, fixtureCopy(await freshImport(paths.orcaEnv)));

        const control = await check(paths);
        if (control.fails.length || control.notes.length) {
            console.error(`${NAME} self-test: FAIL -- the unmodified copies are not green: ${[...control.fails, ...control.notes].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green on copies (${control.counts.steps} steps, ${control.counts.codes} codes, ${control.counts.classes} classes, copy ${control.counts.copy})`);

        const swap = (a, b) => (text) => { if (!text.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 60)}`); return text.replace(a, b); };
        const plants = [
            { name: 'an added Orca auth reason', naming: 'added Orca reason', file: paths.authFile, edit: swap("  | 'insecure-origin'\n", "  | 'insecure-origin'\n  | 'session-expired'\n") },
            { name: 'an added Orca offer-unavailable reason', naming: 'added Orca reason', file: paths.pairingFile, edit: swap("  | 'network_exposure_failed'\n", "  | 'network_exposure_failed'\n  | 'quota_exhausted'\n") },
            { name: 'a class removed from ORCA_FAILURE_CLASSES', naming: 'removed class', file: paths.orcaEnv, edit: swap('  "files-missing",\n  "temporary-profile",', '  "temporary-profile",') },
            { name: 'a class with no copy entry', naming: 'class without copy', file: paths.copyFile, edit: swap("    'files-missing': { message: 'fixture files-missing', protection: false },\n", '') },
            { name: 'a new _fail step with no map entry', naming: 'unmapped step', file: paths.orcaService, edit: swap('  reportUnexpectedFailure(err) {\n', '  reportUnexpectedFailure(err) {\n    if (err === "plant") return this._fail("planting a new failure step", []);\n') },
            { name: 'a _fail step that is not a literal', naming: 'step not derivable', file: paths.orcaService, edit: swap('  reportUnexpectedFailure(err) {\n', '  reportUnexpectedFailure(err) {\n    if (err === "plant") return this._fail(err, []);\n') },
            { name: 'a map value outside the class set', naming: 'outside the class set', file: paths.orcaEnv, edit: swap('  "finding Node.js": "could-not-start",', '  "finding Node.js": "node-missing",') },
            { name: 'an Orca file with no union members', naming: 'source moved', file: paths.pairingFile, edit: swap('PairingOfferUnavailableReason =', 'PairingOfferUnavailableReasonV2 =') },
            { name: 'a refusal reason missing from ORCA_CLIENT_REASONS', naming: 'refusal reason', file: paths.orcaEnv, edit: swap('  "offer-mode",\n', '') },
            { name: 'the browser-host reason mapped to pairing-lost in the copy table', naming: 'not browser-not-attached', file: paths.copyFile, edit: swap("    'browser-host-attach-failed': 'browser-not-attached',", "    'browser-host-attach-failed': 'pairing-lost',") },
            { name: 'the copy directory present without the copy file', naming: 'is missing while', file: paths.copyFile, edit: () => null },
        ];

        let failures = 0;
        for (const p of plants) {
            const original = readFileSync(p.file, 'utf8');
            try {
                const edited = p.edit(original);
                if (edited === null) rmSync(p.file); else writeFileSync(p.file, edited);
                const r = await check(paths);
                const text = r.fails.join('\n');
                if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
                else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            } catch (err) {
                console.error(`  FAIL ${p.name} -> ${err.message}`); failures++;
            } finally {
                writeFileSync(p.file, original);
            }
            const after = await check(paths);
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant '${p.name}' did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
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
    const r = await check(pathsFor(REPO_ROOT));
    for (const n of r.notes) console.log(`${NAME}: ${n}`);
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${r.counts.steps} failed steps and ${r.counts.codes} codes each map to one of ${r.counts.classes} classes, every class is reached, Orca's offer-unavailable and auth reasons match the pin; copy tables ${r.counts.copy}`);
    process.exit(0);
}
