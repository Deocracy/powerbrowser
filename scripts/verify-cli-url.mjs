#!/usr/bin/env node
// scripts/verify-cli-url.mjs -- WR-04 (Phase 45): the command-line URL admission
// (admitCliUrlSpec in powerbrowser/shell/PowerBrowserAPI.sys.mjs) admits only
// http/https URLs and the literal about:newtab. The shell module is Firefox chrome
// code that Node cannot import, so this check reads the function's source out of
// the file and evaluates that source. The verdict is about the shipped code.
// The --self-test mode runs the same probes against two planted mutants (one
// admits every scheme, one drops the non-string guard); each must go red.
//
// Usage:
//   node scripts/verify-cli-url.mjs
//   node scripts/verify-cli-url.mjs --self-test
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO_ROOT, 'powerbrowser', 'shell', 'PowerBrowserAPI.sys.mjs');
const NAME = 'verify-cli-url';
const SELF_TEST = process.argv.slice(2).includes('--self-test');

// Planted shapes an argv element can take. Each refused shape must return null.
const REFUSED = [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'chrome://browser/content/browser.xhtml',
    'about:blank',
    'ftp://example.org/x',
    '--flag',
    '',
    ' https://example.org',
    123,
    null,
    undefined,
    ['https://example.org'],
    {},
];
// Each admitted shape must come back unchanged.
const ADMITTED = ['https://example.org/', 'http://127.0.0.1:4000/', 'HTTPS://EXAMPLE.ORG/', 'about:newtab'];

// The function's own source, cut from the file. Plants apply to this body only:
// the same regex text occurs in other functions of the file.
function admitBody(text) {
    const start = text.indexOf('export function admitCliUrlSpec(spec) {');
    if (start < 0) return null;
    const end = text.indexOf('\n}\n', start);
    if (end < 0) return null;
    return text.slice(start, end + 3).replace(/^export /, '');
}

// Evaluates the committed function source. The input is this repo's own
// shell module, read from disk, never external input.
function evalAdmit(body) {
    return new Function(`${body}\nreturn admitCliUrlSpec;`)();
}

function probe(admit) {
    const failures = [];
    for (const v of REFUSED) {
        let got;
        try { got = admit(v); } catch (err) { got = `threw ${err.name}`; }
        if (got !== null) failures.push(`refused shape ${JSON.stringify(v)} was admitted as ${JSON.stringify(got)}`);
    }
    for (const v of ADMITTED) {
        if (admit(v) !== v) failures.push(`admitted shape ${JSON.stringify(v)} was refused`);
    }
    return failures;
}

const text = readFileSync(SOURCE, 'utf8');
const body = admitBody(text);
const admit = body ? evalAdmit(body) : null;
if (!admit) {
    console.error(`${NAME}: FAIL -- admitCliUrlSpec is not an exported function in ${SOURCE}`);
    process.exit(1);
}

if (!SELF_TEST) {
    const failures = probe(admit);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- ${failures.length} admission failure(s):\n  ${failures.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${REFUSED.length} refused and ${ADMITTED.length} admitted shapes behave as pinned`);
} else {
    let ok = true;
    const control = probe(admit);
    if (control.length) {
        console.error(`${NAME}: --self-test FAIL -- the shipped predicate is red before any plant: ${control[0]}`);
        ok = false;
    } else {
        console.log(`${NAME}: --self-test -- control green on the shipped predicate`);
    }
    const plants = [
        {
            label: 'admit-every-scheme mutant',
            from: '/^https?:\\/\\//i.test(spec)',
            to: 'true',
            needle: 'javascript:alert(1)',
        },
        {
            label: 'no-non-string-guard mutant',
            from: 'if (typeof spec !== "string") {',
            to: 'if (false) {',
            needle: '["https://example.org"]',
        },
    ];
    for (const p of plants) {
        if (!body.includes(p.from)) {
            console.error(`${NAME}: --self-test FAIL -- ${p.label}: the needle is not in admitCliUrlSpec, so the plant cannot be built`);
            ok = false;
            continue;
        }
        const mutantAdmit = evalAdmit(body.replace(p.from, p.to));
        const failures = probe(mutantAdmit);
        const hit = failures.find((f) => f.includes(p.needle));
        if (!hit) {
            console.error(`${NAME}: --self-test FAIL -- ${p.label} was NOT rejected naming ${p.needle}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- ${p.label} REJECTED: ${hit}`);
        }
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green, then each planted mutant went red naming the shape it admits`);
}
