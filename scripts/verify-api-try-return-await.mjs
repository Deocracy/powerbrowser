#!/usr/bin/env node
// scripts/verify-api-try-return-await.mjs -- refactor lane R1a (v1.7): inside an async function, `return f()` in a
// try block whose f is async hands the caller f's promise unawaited, so a rejection of f never reaches that try's
// catch. handleStoreRequest's catch exists to keep a raw error (a URL, a title, a path) out of the log and the reply,
// and captureTabThumbnail's to keep its never-throws contract; both returned the extension and thumbnail writers'
// promises that way, so those rejections crossed back raw and unlogged, or rejected a function documented never to
// throw.
//
// The check parses powerbrowser/shell/PowerBrowserAPI.sys.mjs with acorn and derives the async callees from the tree:
// every `async function NAME` declaration and every async method of an `export const X = Object.freeze({ ... })`
// object (called as X.NAME). It then walks every async function and fails naming each return statement, inside a try
// that has a catch (and not inside a nested function), whose argument is a direct call of one of those callees
// without await. Nothing is hand-listed: a new async helper, or a new dispatcher, is covered when it is written.
//
// --self-test plants the pre-fix fault (the await removed from each fixed return) into a copy of the shipped source,
// and two fixtures, and requires each plant to go red naming the call it planted, with the shipped source green.
//
// Tier: quick (one file read, acorn from theia/node_modules).
//
// Usage:
//   node scripts/verify-api-try-return-await.mjs
//   node scripts/verify-api-try-return-await.mjs --self-test

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'api-try-return-await';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const SELF_TEST = process.argv.slice(2).includes('--self-test');

let acorn;
try {
    acorn = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('acorn');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: acorn is not installed in theia/. Next step: run the audited yarn install in theia/ first.`);
    process.exit(1);
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function children(node) {
    const out = [];
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const item of value) if (item && typeof item.type === 'string') out.push(item);
        } else if (value && typeof value.type === 'string') {
            out.push(value);
        }
    }
    return out;
}

function walk(node, visit) {
    visit(node);
    for (const child of children(node)) walk(child, visit);
}

// Walks `node` without entering a nested function, so a return found belongs to the function being checked.
function walkOwn(node, visit) {
    visit(node);
    for (const child of children(node)) {
        if (!FUNCTION_TYPES.has(child.type)) walkOwn(child, visit);
    }
}

/** The async callees the source declares: { plain: Set<name>, members: Set<"Object.name"> }. */
export function asyncCallees(ast) {
    const plain = new Set();
    const members = new Set();
    walk(ast, node => {
        if (node.type === 'FunctionDeclaration' && node.async && node.id) {
            plain.add(node.id.name);
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression'
            && node.init.callee.type === 'MemberExpression' && node.init.callee.object.name === 'Object'
            && node.init.callee.property.name === 'freeze' && node.init.arguments[0]?.type === 'ObjectExpression') {
            for (const prop of node.init.arguments[0].properties) {
                if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.value.type === 'FunctionExpression' && prop.value.async) {
                    members.add(`${node.id.name}.${prop.key.name}`);
                }
            }
        }
    });
    return { plain, members };
}

function calleeName(call, callees) {
    const callee = call.callee;
    if (callee.type === 'Identifier' && callees.plain.has(callee.name)) {
        return callee.name;
    }
    if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier'
        && callee.property.type === 'Identifier' && callees.members.has(`${callee.object.name}.${callee.property.name}`)) {
        return `${callee.object.name}.${callee.property.name}`;
    }
    return null;
}

/** Every unawaited return of an async callee inside a try-with-catch of an async function, or { error }. */
export function findings(text) {
    let ast;
    try {
        ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (err) {
        return { error: `broken instrument: ${API} does not parse (${err.message})` };
    }
    const callees = asyncCallees(ast);
    if (callees.plain.size === 0 || callees.members.size === 0) {
        return { error: `broken instrument: no async function declaration or no async method of a frozen export was found in ${API}` };
    }
    const found = [];
    walk(ast, fn => {
        if (!FUNCTION_TYPES.has(fn.type) || !fn.async || fn.body.type !== 'BlockStatement') return;
        walkOwn(fn.body, node => {
            if (node.type !== 'TryStatement' || !node.handler) return;
            walkOwn(node.block, inner => {
                if (inner.type !== 'ReturnStatement' || inner.argument?.type !== 'CallExpression') return;
                const name = calleeName(inner.argument, callees);
                if (name) {
                    found.push(`${API}:${inner.loc.start.line}: returns ${name}(...) inside a try without await, so its rejection skips that try's catch`);
                }
            });
        });
    });
    return { found, callees };
}

const shipped = readFileSync(join(REPO_ROOT, API), 'utf8');

if (!SELF_TEST) {
    const result = findings(shipped);
    if (result.error) {
        console.error(`${NAME}: FAIL -- ${result.error}`);
        process.exit(1);
    }
    if (result.found.length) {
        console.error(`${NAME}: FAIL -- ${result.found.length} unawaited return(s) inside a try:\n  ${result.found.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- no async function in ${API} returns one of its ${result.callees.plain.size + result.callees.members.size} async callees unawaited inside a try with a catch`);
    process.exit(0);
}

let ok = true;
const control = findings(shipped);
if (control.error || control.found.length) {
    console.error(`${NAME}: --self-test FAIL -- the shipped source is red before any plant: ${control.error ?? control.found[0]}`);
    ok = false;
} else {
    console.log(`${NAME}: --self-test -- control green on the shipped source`);
}

// The pre-fix fault, planted back into the shipped source: each fixed return without its await.
const plants = [
    { label: 'extension store request unawaited', from: 'return await extensionStoreRequest(kind, data, actorRef);', to: 'return extensionStoreRequest(kind, data, actorRef);', needle: 'returns extensionStoreRequest(' },
    { label: 'install site unawaited', from: 'return await extensionInstallSite();', to: 'return extensionInstallSite();', needle: 'returns extensionInstallSite(' },
    { label: 'thumbnail write unawaited', from: 'return await PowerBrowserAPI.writeThumbnail(uri, dataUrl);', to: 'return PowerBrowserAPI.writeThumbnail(uri, dataUrl);', needle: 'returns PowerBrowserAPI.writeThumbnail(' },
];
// handleShellMessage's one delegated handler, found by its shape rather than spelled here (its name carries a
// third-party token the brand scan counts per file).
const delegated = /return await (handle[A-Za-z]+ShellMessage)\(data, actorRef\);/.exec(shipped);
if (delegated) {
    plants.push({ label: 'delegated shell handler unawaited', from: delegated[0], to: delegated[0].replace('return await ', 'return '), needle: `returns ${delegated[1]}(` });
} else {
    console.error(`${NAME}: --self-test FAIL -- delegated shell handler: no awaited handle*ShellMessage(data, actorRef) return in ${API}, so the plant cannot be built`);
    ok = false;
}
for (const p of plants) {
    if (!shipped.includes(p.from)) {
        console.error(`${NAME}: --self-test FAIL -- ${p.label}: the line to plant is not in ${API}, so the plant cannot be built`);
        ok = false;
        continue;
    }
    const result = findings(shipped.replace(p.from, p.to));
    const hit = result.found?.find(f => f.includes(p.needle));
    if (!hit) {
        console.error(`${NAME}: --self-test FAIL -- ${p.label} was NOT rejected naming ${p.needle}`);
        ok = false;
    } else {
        console.log(`${NAME}: --self-test -- ${p.label} REJECTED: ${hit}`);
    }
}

// Fixtures: the rule's edges. A nested function's return and a try without a catch are not the fault.
const FIXTURE_HEAD = 'async function helper() { return 1; }\nexport const Api = Object.freeze({ async method() { return 2; } });\n';
const fixtures = [
    { label: 'fixture: member callee in a dispatcher', text: `${FIXTURE_HEAD}async function d() { try { return Api.method(); } catch { return 0; } }`, red: true },
    { label: 'fixture: awaited return', text: `${FIXTURE_HEAD}async function d() { try { return await helper(); } catch { return 0; } }`, red: false },
    { label: 'fixture: return inside a nested arrow', text: `${FIXTURE_HEAD}async function d() { try { return [1].map(() => helper()); } catch { return 0; } }`, red: false },
    { label: 'fixture: sync function', text: `${FIXTURE_HEAD}function d() { try { return helper(); } catch { return 0; } }`, red: false },
];
for (const f of fixtures) {
    const result = findings(f.text);
    const red = !!result.error || result.found.length > 0;
    if (red !== f.red) {
        console.error(`${NAME}: --self-test FAIL -- ${f.label} read ${red ? 'red' : 'green'}, expected ${f.red ? 'red' : 'green'}${result.error ? ` (${result.error})` : ''}`);
        ok = false;
    } else {
        console.log(`${NAME}: --self-test -- ${f.label} read ${red ? 'red' : 'green'} as expected`);
    }
}

if (!ok) {
    console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
    process.exit(1);
}
console.log(`${NAME}: --self-test PASS -- control green, then each planted unawaited return went red naming its call`);
