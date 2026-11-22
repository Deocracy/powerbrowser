#!/usr/bin/env node
// scripts/verify-modes-notice-timer.mjs
//
// The modes extension's status-bar notices share one element id per service,
// so a notice shown while an earlier one is still up replaces its text. Each
// notice removes the element 4 s after it was set. Unless a newer notice
// cancels the older one's removal timer, that older timer removes the newer
// notice early: "Setup saved." followed two seconds later by a restore error
// shows the error for two seconds, not four.
//
// It DERIVES at check time from the tree: every `flash(` method in
// theia/extensions/modes/src/browser/*.ts that removes its notice on a
// `window.setTimeout(` must first call `window.clearTimeout(this.<field>)` and
// assign the new timer to that same `this.<field>`. Each method is reported BY
// FILE. Finding no such method fails as a broken anchor, never passes as clean.
//
// Honestly --quick: reads text sources only. No build, no browser, no
// display, no network.
//
// Usage:
//   node scripts/verify-modes-notice-timer.mjs
//   node scripts/verify-modes-notice-timer.mjs --self-test

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-modes-notice-timer';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const MODES_BROWSER_REL = 'theia/extensions/modes/src/browser';

/** Text from `head` to the brace closing the body that opens after it, or ''. */
function methodBody(src, head) {
    const at = src.indexOf(head);
    if (at < 0) {
        return '';
    }
    const open = src.indexOf('{', at + head.length);
    if (open < 0) {
        return '';
    }
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
        if (src[i] === '{') {
            depth += 1;
        } else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return src.slice(at, i + 1);
            }
        }
    }
    return '';
}

/** Every notice method in the sources: a `flash(` definition whose body schedules a removeElement. */
function derivedNoticeMethods(sources) {
    const found = [];
    for (const [rel, src] of Object.entries(sources)) {
        const head = /(?:protected|private|public)?\s*async\s+flash\(/.exec(src);
        if (!head) {
            continue;
        }
        const body = methodBody(src, head[0]);
        if (body.includes('removeElement(') && body.includes('setTimeout(')) {
            found.push({ rel, body });
        }
    }
    return found;
}

/** @returns {string[]} failure messages -- empty means the gate holds. */
function checkStatic(sources) {
    const failures = [];
    const methods = derivedNoticeMethods(sources);
    if (!methods.length) {
        failures.push(`${MODES_BROWSER_REL}: derived ZERO notice methods -- the flash( anchor drifted`);
        return failures;
    }
    for (const { rel, body } of methods) {
        const cleared = /window\.clearTimeout\(this\.([A-Za-z_]\w*)\)/.exec(body);
        const armed = /this\.([A-Za-z_]\w*)\s*=\s*window\.setTimeout\(/.exec(body);
        if (!cleared || !armed || cleared[1] !== armed[1] || cleared.index > armed.index) {
            failures.push(`${rel}: flash() arms its removal timer without first clearing the previous notice's timer on the same field -- an older notice removes a newer one early`);
        }
    }
    return failures;
}

function readSources() {
    const sources = {};
    for (const file of readdirSync(join(REPO_ROOT, MODES_BROWSER_REL))) {
        if (file.endsWith('.ts')) {
            const rel = `${MODES_BROWSER_REL}/${file}`;
            sources[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
        }
    }
    return sources;
}

function main() {
    const sources = readSources();
    const failures = checkStatic(sources);
    if (failures.length) {
        for (const failure of failures) {
            console.error(`${NAME}: FAIL -- ${failure}`);
        }
        process.exit(1);
    }
    const files = derivedNoticeMethods(sources).map(method => method.rel.split('/').pop());
    console.log(`${NAME}: PASS -- ${files.length} notice method(s) restart their removal timer: ${files.join(', ')}`);
}

/** The pre-fix body: the removal timer is armed bare, never cleared. */
const unfix = src => src
    .replace(/\n\s*\/\/ A newer notice restarts the timer, so an older one cannot remove it early\.\n(\s*)window\.clearTimeout\(this\.flashTimer\);\n\s*this\.flashTimer = window\.setTimeout\(/, '\n$1window.setTimeout(');

function selfTest() {
    const real = readSources();
    const clean = checkStatic(real);
    if (clean.length) {
        throw new Error(`${NAME} --self-test: FAIL -- the unmodified tree is not green: ${clean.join(' | ')}`);
    }
    console.log(`${NAME} --self-test: unmodified tree green, planting faults`);
    const plants = derivedNoticeMethods(real).map(({ rel }) => ({ id: `bare removal timer in ${rel.split('/').pop()}`, file: rel, apply: unfix }));
    plants.push({
        id: 'notice method renamed away',
        file: null,
        apply: null,
    });
    let failed = 0;
    for (const plant of plants) {
        let mutated;
        let expect;
        if (plant.file === null) {
            mutated = Object.fromEntries(Object.entries(real).map(([rel, src]) => [rel, src.replace(/async\s+flash\(/g, 'async notify(')]));
            expect = /derived ZERO notice methods/;
        } else {
            const text = plant.apply(real[plant.file]);
            if (text === real[plant.file]) {
                console.error(`${NAME} --self-test: FAIL -- '${plant.id}' did not land: the fixed body drifted`);
                failed += 1;
                continue;
            }
            mutated = { ...real, [plant.file]: text };
            expect = new RegExp(plant.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
        const hit = checkStatic(mutated).find(f => expect.test(f));
        if (!hit) {
            console.error(`${NAME} --self-test: FAIL -- '${plant.id}' did not go red naming ${expect}`);
            failed += 1;
        } else {
            console.log(`  ok  ${plant.id} -> ${hit}`);
        }
    }
    if (failed) {
        process.exit(1);
    }
    console.log(`${NAME} --self-test: PASS -- ${plants.length} planted faults went red naming the drift`);
}

if (process.argv.includes('--self-test')) {
    try {
        selfTest();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
} else {
    try {
        main();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}
