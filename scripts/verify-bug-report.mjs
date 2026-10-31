#!/usr/bin/env node
// scripts/verify-bug-report.mjs
//
// The bug-report-affordance row (Phase 53, TEL-05). It derives everything from the
// tree at check time and compares the results:
//
//  prefill      the keys of the URLSearchParams in the Report-a-Bug contribution, minus the
//               template selector, are a subset of the field ids in .github/ISSUE_TEMPLATE/bug.yml
//               (the Phase 42 form). A missing form fails closed and names the file.
//  template     the template selector's value is bug.yml.
//  diagnostics  no query key carries diagnostics, log, stack, trace, paste or body content;
//               diagnostics travel by clipboard only.
//  origin       the prefill target's origin and path are the origin and the owner/repo path
//               of the manifest urls.release_notes key, plus /issues/new.
//  opener       the command the contribution executes is the GUI-01 opener id exported by
//               theia/extensions/tab-uris/src/browser/browser-window-command.ts.
//  disposition  the github.com row of powerbrowser/endpoint-allowlist.json is user-initiated.
//  install_format  the install_format prefill resolves to a derived value, or is empty with the
//               recorded deferral (a shortcut: install format comment) beside its constant.
//  copy         the diagnostics layer has a Copy button, and its click writes the clipboard.
//
// Every failure names the file, the rule and the drift, and ends with a next step. The
// self-test runs a green control on the unmodified tree first, then plants each fault in
// memory and requires each to go red naming the drift.

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'bug-report-affordance';
const SELF_REL = 'scripts/verify-bug-report.mjs';
const CONTRIB_REL = 'theia/extensions/branding/src/browser/powerbrowser-report-bug-contribution.ts';
const OPENER_REL = 'theia/extensions/tab-uris/src/browser/browser-window-command.ts';
const BUG_REL = '.github/ISSUE_TEMPLATE/bug.yml';
const XHTML_REL = 'powerbrowser/shell/powerbrowser.xhtml';
const SHELL_JS_REL = 'powerbrowser/shell/powerbrowser.js';
const COPY_ID = 'powerbrowser-diagnostics-copy';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const MANIFEST_REL = 'configuration.toml';
const TEMPLATE_KEY = 'template';
const DIAGNOSTIC_KEY = /diagnos|^log|stack|trace|paste|body/i;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rules discriminate.`);
        process.exit(2);
    }
}

const req = createRequire(import.meta.url);
let yaml;
let toml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
    toml = req(join(REPO_ROOT, 'scripts', 'lib', 'toml.cjs'));
} catch (e) {
    console.error(`${NAME}: FAIL -- broken instrument: ${e.message.split('\n')[0]} (run yarn install in theia/ first)`);
    process.exit(1);
}

function readTree(rel) {
    return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function constString(src, name) {
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']*)'`));
    return m ? m[1] : undefined;
}

// Derives every expectation from the inputs, then compares them.
function check(inputs) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });
    const { contrib, opener, bugYml, allowlist, manifestText, shellXhtml, shellJs } = inputs;

    // Derive the prefill object literal and its keys.
    const lit = contrib.match(/new\s+URLSearchParams\(\s*\{([\s\S]*?)\}\s*\)/);
    if (!lit) {
        fail(CONTRIB_REL, 'prefill', 'builds no URLSearchParams object literal, so the prefill set cannot be derived. Next step: build the query from one object literal.');
        return failures;
    }
    const keys = [...new Set([...lit[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map(m => m[1]))];

    // template selector
    const templateRef = (lit[1].match(new RegExp(`${TEMPLATE_KEY}\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*|'[^']*')`)) ?? [])[1];
    const templateValue = templateRef && templateRef.startsWith("'") ? templateRef.slice(1, -1) : constString(contrib, templateRef ?? '');
    if (templateValue !== 'bug.yml') {
        fail(CONTRIB_REL, 'template', `the template selector is '${templateValue ?? 'unset'}', not bug.yml. Next step: point the selector at the bug.yml form.`);
    }

    // diagnostics
    for (const k of keys) {
        if (DIAGNOSTIC_KEY.test(k) && k !== TEMPLATE_KEY) {
            fail(CONTRIB_REL, 'diagnostics', `the query carries the '${k}' key, which can hold diagnostics in a URL. Next step: remove it; diagnostics travel by clipboard only.`);
        }
    }

    // prefill subset of the Phase 42 form field ids
    if (bugYml === null) {
        fail(BUG_REL, 'prefill', `is absent, so the prefill set cannot be checked against the Phase 42 form. Next step: land the Phase 42 bug form before this row runs.`);
    } else {
        let doc;
        try {
            doc = yaml.load(bugYml);
        } catch (e) {
            fail(BUG_REL, 'prefill', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the form.`);
        }
        const ids = new Set((doc?.body ?? []).filter(b => b && b.type !== 'markdown' && b.id).map(b => String(b.id)));
        for (const k of keys) {
            if (k === TEMPLATE_KEY) continue;
            if (!ids.has(k)) {
                fail(CONTRIB_REL, 'prefill', `prefills '${k}', which is not a field id in ${BUG_REL} (ids: ${[...ids].sort().join(', ')}). Next step: prefill only bug.yml field ids, or add the field to the form.`);
            }
        }
    }

    // origin and path against the manifest
    const issuesUrl = constString(contrib, 'ISSUES_NEW_URL');
    let target;
    try {
        target = new URL(issuesUrl ?? '');
    } catch {
        target = undefined;
    }
    let release;
    try {
        release = new URL(toml.parse(manifestText).urls.release_notes);
    } catch (e) {
        fail(MANIFEST_REL, 'origin', `[urls] release_notes could not be read (${e.message.split('\n')[0]}). Next step: restore the key.`);
    }
    if (target && release) {
        const repoPath = release.pathname.replace(/\/releases\/?$/, '');
        if (target.origin !== release.origin || target.pathname !== `${repoPath}/issues/new`) {
            fail(CONTRIB_REL, 'origin', `the prefill target is ${target.origin}${target.pathname}, but urls.release_notes names ${release.origin}${repoPath}; the report must land in the same repository. Next step: point ISSUES_NEW_URL at ${release.origin}${repoPath}/issues/new.`);
        }
    } else if (!target) {
        fail(CONTRIB_REL, 'origin', 'declares no ISSUES_NEW_URL literal, so the target cannot be checked. Next step: keep the issues URL as one literal constant.');
    }

    // install_format: derived, or empty with the recorded deferral beside the constant. The gate names the
    // deferral; removing the record while the value stays empty turns it red.
    const installRef = (lit[1].match(/install_format\s*:\s*([A-Za-z_][A-Za-z0-9_]*|'[^']*')/) ?? [])[1];
    const installValue = installRef && installRef.startsWith("'") ? installRef.slice(1, -1) : constString(contrib, installRef ?? '');
    if (installValue === undefined) {
        fail(CONTRIB_REL, 'install_format', 'prefills install_format from a name this row cannot resolve to a literal. Next step: pass a derived string or a literal constant.');
    } else if (installValue === '' && !/\/\/\s*shortcut:\s*install format/.test(contrib)) {
        fail(CONTRIB_REL, 'install_format', 'sends install_format empty with no recorded deferral. TEL-05 requires the install format, so either derive it from an in-tree source or keep the shortcut: install format comment beside the constant. Next step: restore the deferral record.');
    }

    // copy: the diagnostics layer's Copy button exists and its click writes the clipboard.
    if (!shellXhtml.includes(`id="${COPY_ID}"`)) {
        fail(XHTML_REL, 'copy', `the diagnostics layer has no Copy button (id ${COPY_ID}). Next step: add the button beside the Close button.`);
    }
    if (!shellJs.includes(`getElementById("${COPY_ID}")`) || !shellJs.includes('navigator.clipboard.writeText(')) {
        fail(SHELL_JS_REL, 'copy', 'the diagnostics Copy button is not wired to the clipboard write. Next step: bind its click to navigator.clipboard.writeText.');
    }

    // opener id, derived from the call's first argument
    const call = contrib.match(/executeCommand\(\s*([A-Za-z_][A-Za-z0-9_]*|'[^']*')/);
    const callee = call ? call[1] : '';
    const openerId = callee.startsWith("'") ? callee.slice(1, -1) : constString(contrib, callee);
    const exported = opener.match(/export\s+const\s+OPEN_BROWSER_WINDOW_COMMAND_ID\s*=\s*'([^']*)'/);
    if (!exported) {
        fail(OPENER_REL, 'opener', 'exports no OPEN_BROWSER_WINDOW_COMMAND_ID literal, so the GUI-01 opener cannot be derived. Next step: restore the export.');
    } else if (openerId !== exported[1]) {
        fail(CONTRIB_REL, 'opener', `runs command '${openerId ?? 'none'}', not the GUI-01 opener '${exported[1]}' that owns the stock window path. Next step: route the target through the opener id.`);
    }

    // github.com disposition
    const rows = (allowlist.hosts ?? allowlist.endpoints ?? allowlist.entries ?? []).filter(r => r && r.host === 'github.com');
    if (rows.length !== 1) {
        fail(ALLOWLIST_REL, 'disposition', `has ${rows.length} github.com row(s), not one. Next step: keep one github.com row.`);
    } else if (rows[0].disposition !== 'user-initiated') {
        fail(ALLOWLIST_REL, 'disposition', `the github.com row is '${rows[0].disposition}', not user-initiated, so an unattended fetch would not fail like deny. Next step: set the row to user-initiated.`);
    }
    return failures;
}

function defaultInputs(root) {
    return {
        contrib: readFileSync(join(root, CONTRIB_REL), 'utf8'),
        opener: readFileSync(join(root, OPENER_REL), 'utf8'),
        bugYml: existsSync(join(root, BUG_REL)) ? readFileSync(join(root, BUG_REL), 'utf8') : null,
        shellXhtml: readFileSync(join(root, XHTML_REL), 'utf8'),
        shellJs: readFileSync(join(root, SHELL_JS_REL), 'utf8'),
        allowlist: JSON.parse(readFileSync(join(root, ALLOWLIST_REL), 'utf8')),
        manifestText: readFileSync(join(root, MANIFEST_REL), 'utf8'),
    };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

function main() {
    if (args.includes('--self-test')) return selfTest();
    let inputs;
    try {
        inputs = defaultInputs(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: FAIL -- an input could not be read (${e.message.split('\n')[0]}). Next step: run the row inside the repository.`);
        return 1;
    }
    const failures = check(inputs).sort((a, b) => fmt(a).localeCompare(fmt(b)));
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in the Report-a-Bug affordance.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    const keys = [...new Set([...inputs.contrib.match(/new\s+URLSearchParams\(\s*\{([\s\S]*?)\}\s*\)/)[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map(m => m[1]))];
    console.log(`${NAME}: PASS -- ${CONTRIB_REL} prefills ${keys.filter(k => k !== TEMPLATE_KEY).join(', ')} (a subset of ${BUG_REL} field ids), its target agrees with urls.release_notes, it runs the GUI-01 opener, and github.com is user-initiated. install_format is the named deferral (shortcut: install format has no in-tree source), and the diagnostics layer has a Copy button wired to the clipboard`);
    return 0;
}

function selfTest() {
    const base = defaultInputs(REPO_ROOT);
    const baseline = check(base);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log('  ok  baseline -> green (contribution, opener, bug.yml, allowlist, manifest)');

    const anchor = (text, from) => {
        if (!text.includes(from)) throw new Error(`self-test anchor ${JSON.stringify(from)} is absent from the contribution source`);
        return text;
    };
    const planted = [
        ['diagnostics-bearing query key', { ...base, contrib: anchor(base.contrib, 'install_format: INSTALL_FORMAT_UNKNOWN,').replace('install_format: INSTALL_FORMAT_UNKNOWN,', "install_format: INSTALL_FORMAT_UNKNOWN,\n            diagnostics: 'pasted log line',") }, CONTRIB_REL, 'diagnostics', 'diagnostics'],
        ['origin mismatch', { ...base, contrib: base.contrib.replace("'https://github.com/Deocracy/powerbrowser/issues/new'", "'https://gitlab.com/Deocracy/powerbrowser/issues/new'") }, CONTRIB_REL, 'origin', 'gitlab.com'],
        ['extra prefill id outside bug.yml', { ...base, contrib: base.contrib.replace('install_format: INSTALL_FORMAT_UNKNOWN,', "install_format: INSTALL_FORMAT_UNKNOWN,\n            extra_id: 'x',") }, CONTRIB_REL, 'prefill', "'extra_id'"],
        ['Phase 42 bug form absent', { ...base, bugYml: null }, BUG_REL, 'prefill', 'absent'],
        ['opener id respelled', { ...base, contrib: base.contrib.replace("const OPEN_BROWSER_WINDOW_ID = 'powerbrowser.open-browser-window';", "const OPEN_BROWSER_WINDOW_ID = 'powerbrowser.open-window';") }, CONTRIB_REL, 'opener', 'powerbrowser.open-window'],
        ['github.com widened to allow', { ...base, allowlist: { ...base.allowlist, ...widenGithub(base.allowlist) } }, ALLOWLIST_REL, 'disposition', 'allow'],
        ['install_format deferral record removed', { ...base, contrib: anchor(base.contrib, 'shortcut: install format').replace('shortcut: install format', 'note: install channel') }, CONTRIB_REL, 'install_format', 'install_format'],
        ['Copy button removed from the layer', { ...base, shellXhtml: anchor(base.shellXhtml, `id="${COPY_ID}"`).replace(`id="${COPY_ID}"`, 'id="powerbrowser-diagnostics-x"') }, XHTML_REL, 'copy', COPY_ID],
        ['Copy handler does not write the clipboard', { ...base, shellJs: anchor(base.shellJs, 'navigator.clipboard.writeText(').replace('navigator.clipboard.writeText(', 'window.console.log(') }, SHELL_JS_REL, 'copy', 'clipboard'],
    ];

    let failed = 0;
    for (const [name, inputs, file, rule, fragment] of planted) {
        const failures = check(inputs);
        if (failures.some(f => f.file === file && f.rule === rule && f.msg.includes(fragment))) {
            console.log(`  ok  ${name} -> red, naming ${file} [${rule}] '${fragment}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${file} [${rule}] '${fragment}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${planted.length} planted faults went red naming the drift, and the green control stayed green`);
    return 0;
}

// Rewrites the github.com row's disposition in memory, keeping every other field.
function widenGithub(allowlist) {
    const key = Object.keys(allowlist).find(k => Array.isArray(allowlist[k]));
    return {
        [key]: allowlist[key].map(r => (r && r.host === 'github.com' ? { ...r, disposition: 'allow' } : r)),
    };
}

process.exit(main());
