#!/usr/bin/env node
// scripts/verify-orca-failure-classes.mjs
//
// RUN-06 (Phase 67, plan 67-01; P67-02, P67-03, P67-29, P67-36): every cause of an Orca hosting
// failure lands in exactly one failure class, and the class set is the one the failure page renders.
// Everything is derived at check time and compared as sets, so an addition and a removal both go red:
//
//  1. Codes. Every ORCAD_*_CODE export of powerbrowser/shell/OrcaEnv.sys.mjs maps through
//     ORCA_CODE_CLASSES, and the code list OrcaService.sys.mjs treats as unrecoverable (the array it
//     searches orcad's stderr with) equals the keys of ORCA_CODE_CLASSES as a set
//     (harness-static-hosting-10).
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
//     "source moved".
//     Orca's fatal codes (harness-static-hosting-10): every error class resolveOrcadExitCode
//     (src/main/orcad/orcad-exit-code.ts) tests, followed through imports and re-exports, gives its
//     code (a `readonly code = '<literal>'` field, or the union type of a `readonly code` constructor
//     parameter). Each such code is a configuration refusal orcad exits on, so each must be a key of
//     ORCA_CODE_CLASSES; an unmapped one is red naming it, because OrcaService would retry it as
//     recoverable. A class with no code is listed, not judged. (That each key of ORCA_CODE_CLASSES
//     is still in the pin is orca-service clause 9.)
//     With orca/ or typescript absent these clauses do not run and the row is SKIP (exit 77, one
//     SKIP line, SKIP-PROTOCOL.md; harness-static-hosting-01).
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
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-failure-classes';
const SELF_REL = 'scripts/verify-orca-failure-classes.mjs';
const AUTH_REL = 'src/renderer/src/web/web-runtime-client-error.ts';
const PAIRING_REL = 'src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts';
const EXIT_CODE_REL = 'src/main/orcad/orcad-exit-code.ts';

/** Every input path of the check, for a tree rooted at `root`; typescript always comes from the repo. */
export function pathsFor(root) {
    const failureDir = join(root, 'theia', 'extensions', 'orca-panes', 'src', 'browser', 'failure');
    return {
        orcaEnv: join(root, 'powerbrowser', 'shell', 'OrcaEnv.sys.mjs'),
        orcaService: join(root, 'powerbrowser', 'shell', 'OrcaService.sys.mjs'),
        orcaDir: join(root, 'orca'),
        authFile: join(root, 'orca', AUTH_REL),
        pairingFile: join(root, 'orca', PAIRING_REL),
        exitFile: join(root, 'orca', EXIT_CODE_REL),
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

/**
 * The codes OrcaService treats as unrecoverable: the OrcaEnv names in `[OrcaEnv.A, ...].find(c => text.includes(c))`,
 * or every key of ORCA_CODE_CLASSES when it searches Object.keys(OrcaEnv.ORCA_CODE_CLASSES). null when neither form
 * is in the source.
 */
export function serviceFatalCodes(source, env) {
    if (/Object\.keys\(\s*OrcaEnv\.ORCA_CODE_CLASSES\s*\)\s*\.find\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\w+\.includes\(\s*\1\s*\)/.test(source)) return new Set(Object.keys(env.ORCA_CODE_CLASSES));
    const m = /\[((?:\s*OrcaEnv\.\w+\s*,?)+)\]\s*\.find\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\w+\.includes\(\s*\2\s*\)/.exec(source);
    if (!m) return null;
    return new Set([...m[1].matchAll(/OrcaEnv\.(\w+)/g)].map((x) => env[x[1]] ?? `<OrcaEnv.${x[1]} is not exported>`));
}

/**
 * The pinned configuration refusals: [{ cls, codes: [..] }] for each error class resolveOrcadExitCode tests with
 * instanceof, followed through imports and `export { X } from` re-exports. Throws "source moved: ..." when a site
 * no longer reads as expected.
 */
export function pinnedFatalCodes(ts, exitFile) {
    const parseFile = (file) => {
        const text = read(file);
        return text === null ? null : ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    };
    const resolveSpec = (from, spec) => {
        if (!spec.startsWith('.')) return null;
        const base = resolve(dirname(from), spec);
        return [`${base}.ts`, join(base, 'index.ts')].find((f) => existsSync(f)) ?? `${base}.ts`;
    };
    const sf = parseFile(exitFile);
    if (!sf) throw new Error(`source moved: ${EXIT_CODE_REL} is absent at the pin`);
    let fn = null;
    ts.forEachChild(sf, (n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === 'resolveOrcadExitCode') fn = n; });
    if (!fn) throw new Error(`source moved: ${EXIT_CODE_REL} no longer declares resolveOrcadExitCode`);
    const classNames = new Set();
    const visit = (n) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && ts.isIdentifier(n.right)) classNames.add(n.right.text);
        ts.forEachChild(n, visit);
    };
    visit(fn);
    if (!classNames.size) throw new Error(`source moved: resolveOrcadExitCode in ${EXIT_CODE_REL} tests no error class with instanceof`);
    const importOf = (file, src, name) => {
        for (const st of src.statements) {
            if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
                const el = st.importClause.namedBindings.elements.find((e) => e.name.text === name);
                if (el) return { file: resolveSpec(file, st.moduleSpecifier.text), name: (el.propertyName ?? el.name).text };
            }
        }
        return null;
    };
    const findClass = (file, name, depth = 0) => {
        const src = parseFile(file);
        if (!src || depth > 5) return null;
        for (const st of src.statements) {
            if (ts.isClassDeclaration(st) && st.name?.text === name) return { file, src, node: st };
            if (ts.isExportDeclaration(st) && st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
                const el = st.exportClause.elements.find((e) => e.name.text === name);
                if (el) return findClass(resolveSpec(file, st.moduleSpecifier.text), (el.propertyName ?? el.name).text, depth + 1);
            }
        }
        const imp = importOf(file, src, name);
        return imp && imp.file ? findClass(imp.file, imp.name, depth + 1) : null;
    };
    const literalOf = (e) => {
        let x = e;
        while (x && (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isSatisfiesExpression?.(x))) x = x.expression;
        return x && (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) ? x.text : null;
    };
    const out = [];
    for (const name of [...classNames].sort()) {
        const found = findClass(exitFile, name);
        if (!found) throw new Error(`source moved: the error class ${name} resolveOrcadExitCode tests cannot be found from ${EXIT_CODE_REL}`);
        const codes = new Set();
        for (const m of found.node.members) {
            if (ts.isPropertyDeclaration(m) && m.name.getText() === 'code') {
                const lit = literalOf(m.initializer);
                if (lit) codes.add(lit);
                else if (m.type) for (const c of unionMembers(ts, found.src.getFullText(), m.type.getText())) codes.add(c);
            }
            if (ts.isConstructorDeclaration(m)) {
                for (const p of m.parameters) {
                    if (p.name.getText() === 'code' && p.type) {
                        const members = ts.isTypeReferenceNode(p.type) ? unionMembers(ts, found.src.getFullText(), p.type.typeName.getText())
                            : ts.isUnionTypeNode(p.type) || ts.isLiteralTypeNode(p.type) ? unionMembers(ts, `type T = ${p.type.getText()}`, 'T') : [];
                        if (!members.length) throw new Error(`source moved: ${name}'s code parameter has a type this check cannot read (${p.type.getText()})`);
                        for (const c of members) codes.add(c);
                    }
                }
            }
        }
        out.push({ cls: name, codes: [...codes].sort() });
    }
    return out;
}

/** Runs every clause over `paths`. Resolves { fails, skips, counts }; skips name the clauses that did not run. */
export async function check(paths) {
    const fails = [];
    const skips = [];
    let env;
    try { env = await freshImport(paths.orcaEnv); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], skips, counts: {} }; }
    const service = read(paths.orcaService);
    if (service === null) return { fails: [`${paths.orcaService} is missing`], skips, counts: {} };
    for (const name of ['ORCA_FAILURE_CLASSES', 'ORCA_STEP_CLASSES', 'ORCA_CODE_CLASSES', 'ORCA_OFFER_UNAVAILABLE_REASONS', 'ORCA_CLIENT_REASONS', 'ORCA_BROWSER_HOST_REASON', 'failureClassOf']) {
        if (env[name] === undefined) fails.push(`OrcaEnv.sys.mjs exports no ${name}`);
    }
    if (fails.length) return { fails, skips, counts: {} };
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
    // harness-static-hosting-10: the list OrcaService treats as unrecoverable is the mapped code set.
    const fatal = serviceFatalCodes(service, env);
    const mapped = new Set(Object.keys(env.ORCA_CODE_CLASSES));
    if (!fatal) fails.push("source moved: OrcaService.sys.mjs has no [OrcaEnv.<code>, ...].find(c => text.includes(c)) list of unrecoverable orcad codes");
    else {
        for (const c of diff(mapped, fatal)) fails.push(`retried mapped code: ORCA_CODE_CLASSES maps '${c}', but OrcaService's unrecoverable code list lacks it, so it is retried`);
        for (const c of diff(fatal, mapped)) fails.push(`OrcaService treats '${c}' as unrecoverable, but ORCA_CODE_CLASSES has no class for it`);
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
    let pinnedFatal = 'SKIP';
    if (!existsSync(paths.orcaDir) || !ts) {
        skips.push(`the pinned-source clauses (3) did not run: ${!ts ? 'theia/node_modules/typescript is not installed. Next step: run yarn install in theia/ inside nix develop .#theia' : 'orca/ is not fetched. Next step: bash scripts/fetch-orca.sh'}`);
    } else {
        // harness-static-hosting-10: orcad's configuration refusals, from the pin.
        try {
            const refusals = pinnedFatalCodes(ts, paths.exitFile);
            let n = 0;
            for (const { cls, codes } of refusals) {
                for (const c of codes) {
                    n++;
                    if (!Object.hasOwn(env.ORCA_CODE_CLASSES, c)) fails.push(`unmapped orcad code: the pinned ${cls} refuses orcad's start with '${c}' (resolveOrcadExitCode), and ORCA_CODE_CLASSES has no class for it, so OrcaService retries it as recoverable`);
                }
            }
            const codeless = refusals.filter((r) => !r.codes.length).map((r) => r.cls);
            pinnedFatal = `${n} pinned configuration-refusal code(s)${codeless.length ? ` (codeless: ${codeless.join(', ')})` : ''}`;
        } catch (err) { fails.push(err.message); }
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
        skips.push('the copy-table and offer-refusal clauses did not run: theia/extensions/orca-panes/src/browser/failure is absent (lane p67-03 not merged). Next step: merge it');
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
    return { fails, skips, counts: { steps: steps.size, codes: codes.length, classes: classes.size, copy, pinnedFatal, serviceFatal: fatal?.size ?? 0 } };
}

// ---------------------------------------------------------------------------
// --self-test

const FIXTURE_AUTH = "export type WebRuntimeAuthFailureReason =\n  | 'unauthorized'\n  | 'device-revoked'\n  | 'device-downgraded'\n  | 'insecure-origin'\n";
const FIXTURE_PAIRING = "export type PairingOfferUnavailableReason =\n  | 'websocket_unavailable'\n  | 'device_registry_unavailable'\n  | 'e2ee_key_unavailable'\n  | 'invalid_advertised_endpoint'\n  | 'relay_mint_failed'\n  | 'network_exposure_failed'\n";
const FIXTURE_EXIT = "import { OrcadInstanceLockError } from './orcad-data-root-privacy'\nimport { OrcadBundledRuntimeError } from './orcad-bundled-runtime'\nexport function resolveOrcadExitCode(error: unknown): number {\n  return error instanceof OrcadInstanceLockError || error instanceof OrcadBundledRuntimeError ? 78 : 1\n}\n";
const FIXTURE_LOCK = "type OrcadInstanceLockCode =\n  | 'orcad_instance_lock_held'\n\nexport class OrcadInstanceLockError extends Error {\n  constructor(\n    readonly code: OrcadInstanceLockCode,\n    message: string\n  ) {\n    super(message)\n  }\n}\n";
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
    if (!ts) { console.log(skipLine(`${NAME} self-test`, 'theia/node_modules/typescript is not installed, so no plant can run. Next step: run yarn install in theia/ inside nix develop .#theia')); return SKIP_EXIT; }
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
        const orcadDir = dirname(paths.exitFile);
        mkdirSync(orcadDir, { recursive: true });
        writeFileSync(paths.exitFile, FIXTURE_EXIT);
        writeFileSync(join(orcadDir, 'orcad-data-root-privacy.ts'), FIXTURE_LOCK);
        writeFileSync(join(orcadDir, 'orcad-bundled-runtime.ts'), 'export class OrcadBundledRuntimeError extends Error {}\n');
        // A re-exported class, as the pin's profile-state-access.ts re-exports ProfileStateAccessError.
        writeFileSync(join(orcadDir, 'orcad-bind-address.ts'), "export { OrcadBindAddressError } from './orcad-bind-address-error'\n");
        writeFileSync(join(orcadDir, 'orcad-bind-address-error.ts'), "export class OrcadBindAddressError extends Error {\n  readonly code = 'orcad_invalid_bind_address' as const\n}\n");
        mkdirSync(paths.failureDir, { recursive: true });
        mkdirSync(dirname(paths.policyFile), { recursive: true });
        writeFileSync(paths.policyFile, FIXTURE_POLICY);
        writeFileSync(paths.copyFile, fixtureCopy(await freshImport(paths.orcaEnv)));

        const control = await check(paths);
        if (control.fails.length || control.skips.length) {
            console.error(`${NAME} self-test: FAIL -- the unmodified copies are not green: ${[...control.fails, ...control.skips].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green on copies (${control.counts.steps} steps, ${control.counts.codes} codes, ${control.counts.classes} classes, copy ${control.counts.copy}, ${control.counts.pinnedFatal})`);
        {
            const r = await check({ ...paths, orcaDir: join(tmp, 'no-orca') });
            if (r.fails.length || !r.skips.some((x) => x.includes('pinned-source clauses'))) { console.error(`${NAME} self-test: FAIL -- a tree without orca/ did not skip the pinned clauses: ${[...r.fails, ...r.skips].join(' | ') || 'green'}`); return 1; }
            console.log('  ok a tree without orca/ -> the pinned clauses are a SKIP, not a PASS');
        }

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
            // harness-static-hosting-10
            { name: 'a new fatal code in the pinned lock-error union', naming: "unmapped orcad code: the pinned OrcadInstanceLockError refuses orcad's start with 'orcad_data_root_shared'", file: join(orcadDir, 'orcad-data-root-privacy.ts'), edit: swap("  | 'orcad_instance_lock_held'\n", "  | 'orcad_instance_lock_held'\n  | 'orcad_data_root_shared'\n") },
            { name: 'a new re-exported refusal class tested by resolveOrcadExitCode', naming: "unmapped orcad code: the pinned OrcadBindAddressError refuses orcad's start with 'orcad_invalid_bind_address'", file: paths.exitFile, edit: (t) => `import { OrcadBindAddressError } from './orcad-bind-address'\n${t.replace('error instanceof OrcadBundledRuntimeError', 'error instanceof OrcadBundledRuntimeError || error instanceof OrcadBindAddressError')}` },
            { name: 'resolveOrcadExitCode renamed in the pin', naming: 'source moved: src/main/orcad/orcad-exit-code.ts no longer declares resolveOrcadExitCode', file: paths.exitFile, edit: swap('function resolveOrcadExitCode(', 'function resolveExitCode(') },
            { name: "OrcaService's unrecoverable list dropping the lock-held code", naming: 'retried mapped code', file: paths.orcaService, edit: swap('[OrcaEnv.ORCAD_PINNED_PORT_CODE, OrcaEnv.ORCAD_LOCK_HELD_CODE].find(', '[OrcaEnv.ORCAD_PINNED_PORT_CODE].find(') },
            { name: "OrcaService's unrecoverable list rewritten out of recognition", naming: 'source moved: OrcaService.sys.mjs has no', file: paths.orcaService, edit: swap('[OrcaEnv.ORCAD_PINNED_PORT_CODE, OrcaEnv.ORCAD_LOCK_HELD_CODE].find(c => text.includes(c))', 'FATAL.find(c => text.includes(c))') },
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
    for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
    const code = verdictExit(NAME, r.fails, r.skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${r.counts.steps} failed steps and ${r.counts.codes} codes each map to one of ${r.counts.classes} classes, every class is reached, OrcaService's ${r.counts.serviceFatal} unrecoverable codes are the mapped set, ${r.counts.pinnedFatal} all mapped, Orca's offer-unavailable and auth reasons match the pin; copy tables ${r.counts.copy}`);
    process.exit(code);
}
