#!/usr/bin/env node
/**
 * Refactor lane R4 (2026-11-21): no Theia widget subclass replaces BaseWidget's `toDispose`.
 *
 * BaseWidget builds `toDispose` in its constructor with the widget's own disposables in it (the onDidDispose
 * emitter and its fire, toDisposeOnDetach, the scroll and visibility emitters), and ReactWidget pushes the React
 * root's unmount into it. A subclass field initializer `toDispose = new DisposableCollection()` runs after that
 * constructor and replaces the collection, so on dispose onDidDispose never fires and the React root is never
 * unmounted. TabStripWidget carried exactly that field until this check's commit.
 *
 * Derived from the tree at check time: every class in the Theia extensions' src trees (tests excluded) whose
 * `extends` names a Theia widget class (an identifier ending in `Widget`, other than Lumino's bare `Widget`, which
 * has no toDispose) is read, and a `toDispose` field initializer
 * in its body is red, named by file, line and class.
 *
 * --self-test: the tree must be green first, then the pre-fix field is planted back into TabStripWidget in
 * memory and must go red naming that class.
 *
 * Honestly --quick: text reads only. No build, no browser, no display.
 *
 * Usage:
 *   node scripts/verify-widget-dispose-collection.mjs
 *   node scripts/verify-widget-dispose-collection.mjs --self-test
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-widget-dispose-collection';
const EXTENSIONS = join(REPO_ROOT, 'theia/extensions');
const STRIP = 'theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx';
const SKIP_DIRS = new Set(['node_modules', 'lib', '__tests__', 'test']);

/** Every .ts/.tsx source under each extension's src tree, as { rel, text }. */
function readSources() {
    const sources = [];
    const walk = dir => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) {
                    walk(path);
                }
            } else if (/\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
                sources.push({ rel: relative(REPO_ROOT, path), text: readFileSync(path, 'utf8') });
            }
        }
    };
    for (const extension of readdirSync(EXTENSIONS, { withFileTypes: true })) {
        if (extension.isDirectory()) {
            try {
                walk(join(EXTENSIONS, extension.name, 'src'));
            } catch {
                // An extension with no src tree has no classes to read.
            }
        }
    }
    return sources;
}

function stripComments(text) {
    // Block comments keep their newlines, so a line number read off the stripped text is the file's.
    return text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The text between the brace at `open` and its match. */
function braceBody(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') {
            depth++;
        } else if (text[i] === '}' && --depth === 0) {
            return text.slice(open + 1, i);
        }
    }
    return '';
}

function check(sources) {
    const failures = [];
    let widgets = 0;
    for (const { rel, text } of sources) {
        const code = stripComments(text);
        for (const m of code.matchAll(/\bclass\s+(\w+)(?:<[^>{]*>)?\s+extends\s+([\w.]+)(?:<[^{]*>)?[^{]*\{/g)) {
            // Lumino's own Widget has no toDispose, so a class extending it may keep a collection of its own.
            if (!/Widget$/.test(m[2]) || m[2] === 'Widget') {
                continue;
            }
            widgets++;
            const open = m.index + m[0].length - 1;
            const body = braceBody(code, open);
            const field = /^\s*(?:(?:public|protected|private|readonly|override|declare)\s+)*toDispose\s*(?::[^=;]+)?=(?!=)/m.exec(body);
            if (field) {
                const line = code.slice(0, open + 1 + field.index + field[0].indexOf('toDispose')).split('\n').length;
                failures.push(`${rel}:${line}: ${m[1]} (extends ${m[2]}) declares its own toDispose -- the field replaces BaseWidget's collection, so onDidDispose never fires and the React root is never unmounted`);
            }
        }
    }
    if (widgets === 0) {
        failures.push('derived ZERO widget classes from theia/extensions/*/src -- the check proves nothing');
    }
    return { failures, widgets };
}

function run() {
    const { failures, widgets } = check(readSources());
    if (failures.length) {
        for (const failure of failures) {
            console.error(`${NAME}: FAIL -- ${failure}`);
        }
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- ${widgets} widget classes read; none replaces BaseWidget's toDispose`);
}

function selfTest() {
    const clean = readSources();
    const base = check(clean);
    if (base.failures.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is not green: ${base.failures[0]}`);
        process.exit(1);
    }
    const plants = [
        {
            name: 'strip-shadows-todispose',
            expect: 'TabStripWidget (extends ReactWidget) declares its own toDispose',
            rel: STRIP,
            mutate: s => s.replace('    @postConstruct()', '    protected readonly toDispose = new DisposableCollection();\n\n    @postConstruct()'),
        },
    ];
    for (const plant of plants) {
        const sources = clean.map(source => {
            if (source.rel !== plant.rel) {
                return source;
            }
            const text = plant.mutate(source.text);
            if (text === source.text) {
                console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' changed nothing in ${plant.rel}`);
                process.exit(1);
            }
            return { rel: source.rel, text };
        });
        const named = check(sources).failures.find(f => f.includes(plant.expect));
        if (!named) {
            console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' did not go red naming '${plant.expect}'`);
            process.exit(1);
        }
        console.log(`${NAME} --self-test: plant '${plant.name}' went red: ${named}`);
    }
    console.log(`${NAME} --self-test: PASS -- ${plants.length} plant went red naming its drift`);
}

if (process.argv.includes('--self-test')) {
    selfTest();
} else {
    run();
}
