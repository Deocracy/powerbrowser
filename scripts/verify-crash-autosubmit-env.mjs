#!/usr/bin/env node
// scripts/verify-crash-autosubmit-env.mjs
//
// TEL-13 prerequisite (Phase 57, plan 57-08; BLOCKED.md B6, review WR-05): the
// stock crash client skips its per-crash dialog and submits on its own when
// MOZ_CRASHREPORTER_AUTO_SUBMIT is non-empty in the environment it inherits
// from the browser at crash time. PowerBrowserSingleInstanceHandler clears it,
// through the internals boundary, before anything else. Three steps:
//
//  1. The variable name is DERIVED at check time, never a literal kept here:
//     the prefix from the ekey! macro in upstream/.../client/app/src/main.rs
//     (concat!("<prefix>", $name)) joined to the key of the auto_submit
//     assignment in upstream/.../client/app/src/config.rs
//     (self.auto_submit = env_bool(ekey!("<key>"))).
//  2. env_bool in config.rs still reads an empty value as false
//     (std::env::var(name).map(|s| !s.is_empty()).unwrap_or(false)). The clear
//     sets "", so it disables auto-submit only while this rule holds.
//  3. powerbrowser/shell/PowerBrowserAPI.sys.mjs: clearEnv(<param>) in the
//     PowerBrowserAPI object is exactly Services.env.set(<param>, ""), and
//     PowerBrowserSingleInstanceHandler.handle starts with its try, whose first
//     statement is PowerBrowserAPI.clearEnv("<derived name>").
//
// Limit (docs/CRASH-POLICY.md): a crash before the command-line handler runs
// still sees the variable. The live proof (a reporter-enabled build started
// with the variable set still shows the dialog) belongs to the TEL-13
// reporter build, not to this gate.
//
// Honestly --quick: text reads over the existing upstream/ checkout and the
// tree. No build, browser, display or network.
//
// Usage:
//   node scripts/verify-crash-autosubmit-env.mjs
//   node scripts/verify-crash-autosubmit-env.mjs --self-test

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-crash-autosubmit-env';
const SELF_REL = 'scripts/verify-crash-autosubmit-env.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const MAIN_REL = 'upstream/toolkit/crashreporter/client/app/src/main.rs';
const CONFIG_REL = 'upstream/toolkit/crashreporter/client/app/src/config.rs';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const UPSTREAM_NEXT = 'Next step: bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh, or find the new reader and update this gate.';

const PREFIX_RE = /macro_rules!\s*ekey\s*\{[\s\S]*?concat!\(\s*"(\w+)"\s*,\s*\$name\s*\)/;
const KEY_RE = /self\.auto_submit\s*=\s*env_bool\(\s*ekey!\(\s*"(\w+)"\s*\)\s*\)/;
const ENV_BOOL_RE = /fn env_bool\b[^{]*\{([\s\S]*?)\n\}/;
const EMPTY_IS_FALSE_RE = /^std::env::var\(\s*\w+\s*\)\s*\.map\(\s*\|\s*(\w+)\s*\|\s*!\s*\1\.is_empty\(\)\s*\)\s*\.unwrap_or\(\s*false\s*\);?$/;

function readText(root, rel) {
    const p = join(root, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Code lines only: trimmed, with blank and comment lines dropped.
const codeLines = (lines) => lines.map(l => l.trim()).filter(l => l !== '' && !/^(\/\/|\/\*|\*)/.test(l));

// The body lines of the first two-space-indented method in lines[from, to) whose header matches re.
function methodIn(lines, from, to, re) {
    for (let i = from; i >= 0 && i < to; i += 1) {
        const m = re.exec(lines[i]);
        if (!m) continue;
        const end = lines.findIndex((l, j) => j > i && /^ {2}\},?$/.test(l));
        return end < 0 ? null : { param: m[1], body: lines.slice(i + 1, end) };
    }
    return null;
}

// The [first, last) line span of the block opened by the line starting with head and closed by the line close.
function spanOf(lines, head, close) {
    const start = lines.findIndex(l => l.startsWith(head));
    const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && l === close);
    return start < 0 || end < 0 ? null : [start, end];
}

function runChecks(root, overrides = {}) {
    const read = overrides.read ?? (rel => readText(root, rel));
    const failures = [];

    // 1. the variable the client reads, derived from its source
    const prefix = read(MAIN_REL)?.match(PREFIX_RE)?.[1] ?? null;
    if (prefix === null) {
        failures.push(`${MAIN_REL}: no macro_rules! ekey expanding to concat!("<prefix>", $name), so the variable prefix cannot be derived (or upstream/ is absent). ${UPSTREAM_NEXT}`);
    }
    const config = read(CONFIG_REL);
    const key = config?.match(KEY_RE)?.[1] ?? null;
    if (key === null) {
        failures.push(`${CONFIG_REL}: no self.auto_submit = env_bool(ekey!("<key>")) assignment, so the auto-submit variable cannot be derived (or upstream/ is absent). ${UPSTREAM_NEXT}`);
    }
    const variable = prefix !== null && key !== null ? `${prefix}${key}` : null;

    // 2. env_bool reads an empty value as false, which is what the clear relies on
    if (config !== null) {
        const envBool = config.match(ENV_BOOL_RE)?.[1];
        const body = envBool === undefined ? [] : codeLines(envBool.split('\n'));
        if (!(body.length === 1 && EMPTY_IS_FALSE_RE.test(body[0]))) {
            failures.push(`${CONFIG_REL}: env_bool's body is ${JSON.stringify(body.join(' ') || '(absent)')}, not std::env::var(name).map(|s| !s.is_empty()).unwrap_or(false), so an empty value may read as true and an empty clear no longer disables auto-submit. Next step: re-derive the clear for the new rule (unset instead of empty, or a patch) and update this gate.`);
        }
    }

    // 3. the boundary clear, and its call as the handler's first statement
    const api = read(API_REL);
    if (api === null) {
        failures.push(`${API_REL}: absent, so nothing clears the variable. Next step: restore it from git.`);
        return { failures, variable, prefix, key, config, api };
    }
    const lines = api.split('\n');
    const obj = spanOf(lines, 'export const PowerBrowserAPI = Object.freeze({', '});');
    const clear = obj === null ? null : methodIn(lines, obj[0], obj[1], /^ {2}clearEnv\((\w+)\) \{$/);
    if (clear === null) {
        failures.push(`${API_REL}: no clearEnv(<name>) method in the PowerBrowserAPI object, so nothing clears ${variable ?? 'the auto-submit variable'}. Next step: restore it (plan 57-08).`);
    } else {
        const code = codeLines(clear.body);
        const want = new RegExp(`^Services\\.env\\.set\\(\\s*${clear.param}\\s*,\\s*(""|'')\\s*\\);?$`);
        if (!(code.length === 1 && want.test(code[0]))) {
            failures.push(`${API_REL}: PowerBrowserAPI.clearEnv(${clear.param}) runs ${JSON.stringify(code.join(' ') || '(nothing)')}, not exactly Services.env.set(${clear.param}, ""); the empty value is what ${CONFIG_REL} env_bool reads as false. Next step: restore that body.`);
        }
    }
    const cls = spanOf(lines, 'export class PowerBrowserSingleInstanceHandler {', '}');
    const handle = cls === null ? null : methodIn(lines, cls[0], cls[1], /^ {2}handle\((\w+)\) \{$/);
    if (handle === null) {
        failures.push(`${API_REL}: no PowerBrowserSingleInstanceHandler.handle(<cmdLine>) method, so the clear cannot be shown to run. Next step: restore it.`);
    } else {
        const code = codeLines(handle.body);
        const call = variable === null ? null : `PowerBrowserAPI.clearEnv(${JSON.stringify(variable)});`;
        if (code[0] !== 'try {') {
            failures.push(`${API_REL}: the first statement of PowerBrowserSingleInstanceHandler.handle is ${JSON.stringify(code[0] ?? '(none)')}, not its try block, so the clear is not first and a throw could skip it. Next step: make ${call ?? 'the clearEnv call'} the first statement inside that try.`);
        } else if (call !== null && code[1] !== call) {
            failures.push(`${API_REL}: the first statement inside PowerBrowserSingleInstanceHandler.handle's try is ${JSON.stringify(code[1] ?? '(none)')}, not ${call} (the variable ${CONFIG_REL} reads, through the ekey! prefix in ${MAIN_REL}). Next step: make that call the first statement, before any other work.`);
        }
    }

    return { failures, variable, prefix, key, config, api };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, variable } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the crash auto-submit environment clear.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- PowerBrowserSingleInstanceHandler.handle sets ${variable} (derived from ${CONFIG_REL} and the ekey! prefix in ${MAIN_REL}) to "" through PowerBrowserAPI.clearEnv before anything else, and env_bool reads an empty value as false`);
    return 0;
}

function selfTest() {
    const baseline = runChecks(REPO_ROOT);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const { variable, prefix, key, config, api } = baseline;
    const realRead = rel => readText(REPO_ROOT, rel);
    const swap = (file, text) => rel => (rel === file ? text : realRead(rel));
    const call = `PowerBrowserAPI.clearEnv(${JSON.stringify(variable)});`;
    const lines = api.split('\n');
    const at = lines.findIndex(l => l.trim() === call);
    const next = lines.findIndex((l, i) => i > at && codeLines([l]).length === 1);
    const without = lines.filter((_, i) => i !== at);
    const moved = [...lines.slice(0, at), ...lines.slice(at + 1, next + 1), lines[at], ...lines.slice(next + 1)];
    const otherName = `${prefix}DUMP_ALL_THREADS`;
    const renamedKey = `${key}_V2`;

    const plants = [
        ['call-removed', API_REL, 'first statement inside', { read: swap(API_REL, without.join('\n')) }],
        ['call-moved-after-other-work', API_REL, 'first statement inside', { read: swap(API_REL, moved.join('\n')) }],
        ['different-name', API_REL, otherName, { read: swap(API_REL, api.replace(call, `PowerBrowserAPI.clearEnv(${JSON.stringify(otherName)});`)) }],
        ['non-empty-value', API_REL, 'not exactly Services.env.set', { read: swap(API_REL, api.replace(/(^ {2}clearEnv\(\w+\) \{\n\s*Services\.env\.set\(\w+, )""/m, '$1"0"')) }],
        ['config-key-renamed', CONFIG_REL, `${prefix}${renamedKey}`, { read: swap(CONFIG_REL, config.replace(`env_bool(ekey!("${key}"))`, `env_bool(ekey!("${renamedKey}"))`)) }],
        ['env-bool-any-set-value-true', CONFIG_REL, 'env_bool', { read: swap(CONFIG_REL, config.replace(/(fn env_bool\b[^{]*\{\s*std::env::var\(\s*\w+\s*\))\.map\([^)]*\)\)\.unwrap_or\(false\)/, '$1.is_ok()')) }],
    ];

    let failed = 0;
    for (const [name, file, marker, overrides] of plants) {
        if (at < 0 || next < 0 || overrides.read(file) === realRead(file)) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault.`);
            failed += 1;
            continue;
        }
        const { failures } = runChecks(REPO_ROOT, overrides);
        const text = failures.join(' | ');
        if (failures.some(f => f.includes(file) && f.includes(marker)) && !text.includes(REPO_ROOT)) {
            console.log(`  ok  ${name} -> red, naming '${file}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${marker}'; got: ${text || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the drifted file, with the unmodified tree green first`);
    return 0;
}

process.exit(main());
