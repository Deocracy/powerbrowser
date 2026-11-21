// Loads one TypeScript source of this tree as a CommonJS module in Node, for checks that drive a
// class's own methods without a browser (verify-orca-pane-hosting, verify-mode-store-migration).
//
// The file is transpiled in memory with the tree's own TypeScript (theia/node_modules/typescript,
// experimentalDecorators, classic JSX) and evaluated with a require that:
//   - returns overrides[specifier] (or overrides[<repo-relative path>] for a relative import) first;
//   - loads a relative import for real only when its repo-relative path is in `real`;
//   - returns Node's own module for a node: builtin (fs, path, os);
//   - returns an inert stub for everything else: any property, call or construct gives another
//     stub, and it is never a thenable, so awaiting one cannot hang a check.
// inversify's decorators are stubbed to no-ops so a class keeps its own constructor.
// Sources come from `sources` (repo-relative path -> text) when given, so a self-test can plant a
// fault in memory without touching the tree.

import { readFileSync } from 'node:fs';
import { createRequire, builtinModules } from 'node:module';
import { dirname, join, posix } from 'node:path';

export const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');

let ts;
export function typescript() {
    if (ts === undefined) {
        try {
            ts = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('typescript');
        } catch {
            ts = null;
        }
    }
    return ts;
}

function makeStub() {
    const target = function stub() { /* inert */ };
    const proxy = new Proxy(target, {
        get(_t, key) {
            if (key === 'then' || key === Symbol.toPrimitive || key === Symbol.iterator || key === Symbol.asyncIterator) {
                return undefined;
            }
            if (key === 'prototype') {
                return target.prototype;
            }
            if (key === '__esModule') {
                return true;
            }
            return makeStub();
        },
        apply() {
            return makeStub();
        },
        construct(_t, _args, newTarget) {
            return Reflect.construct(function base() { /* inert */ }, [], newTarget);
        },
    });
    return proxy;
}

export const INVERSIFY_STUB = {
    __esModule: true,
    inject: () => () => undefined,
    injectable: () => () => undefined,
    postConstruct: () => () => undefined,
    optional: () => () => undefined,
    named: () => () => undefined,
    ContainerModule: class ContainerModule { constructor(registry) { this.registry = registry; } },
    interfaces: {},
};

/** A small event emitter with the shape of Theia's Emitter (event, fire, dispose). */
export class StubEmitter {
    constructor() {
        this.listeners = [];
        this.event = listener => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
        };
    }
    fire(value) {
        for (const listener of [...this.listeners]) listener(value);
    }
    dispose() {
        this.listeners = [];
    }
}

const BASE_OVERRIDES = {
    '@theia/core/shared/inversify': INVERSIFY_STUB,
    '@theia/core/lib/common/event': { __esModule: true, Emitter: StubEmitter },
};

/**
 * load(rel, { overrides, real, sources }) -> module exports. rel is repo-relative.
 * Throws an Error naming the file when it does not transpile or evaluate.
 */
export function loadTs(rel, { overrides = {}, real = [], sources = {} } = {}, cache = new Map()) {
    if (cache.has(rel)) {
        return cache.get(rel);
    }
    const tsc = typescript();
    if (!tsc) {
        throw new Error('theia/node_modules/typescript is not installed');
    }
    const text = Object.prototype.hasOwnProperty.call(sources, rel) ? sources[rel] : readFileSync(join(REPO_ROOT, rel), 'utf8');
    const js = tsc.transpileModule(text, {
        fileName: rel,
        compilerOptions: {
            module: tsc.ModuleKind.CommonJS,
            target: tsc.ScriptTarget.ES2020,
            experimentalDecorators: true,
            jsx: tsc.JsxEmit.React,
            esModuleInterop: true,
        },
    }).outputText;
    const module = { exports: {} };
    cache.set(rel, module.exports);
    const all = { ...BASE_OVERRIDES, ...overrides };
    const requireFor = spec => {
        if (Object.prototype.hasOwnProperty.call(all, spec)) {
            return all[spec];
        }
        if (spec.startsWith('.')) {
            const base = posix.normalize(posix.join(posix.dirname(rel), spec));
            for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
                if (Object.prototype.hasOwnProperty.call(all, candidate)) {
                    return all[candidate];
                }
                if (real.includes(candidate)) {
                    return loadTs(candidate, { overrides, real, sources }, cache);
                }
            }
            return makeStub();
        }
        const bare = spec.replace(/^node:/, '');
        if (builtinModules.includes(bare)) {
            return createRequire(import.meta.url)(bare);
        }
        return makeStub();
    };
    try {
        // eslint-disable-next-line no-new-func
        new Function('exports', 'require', 'module', '__filename', '__dirname', js)(module.exports, requireFor, module, rel, posix.dirname(rel));
    } catch (err) {
        throw new Error(`${rel} did not evaluate: ${err?.message ?? err}`);
    }
    cache.set(rel, module.exports);
    return module.exports;
}

/** Lets queued promise callbacks and zero-delay timers run. */
export async function flush(rounds = 8) {
    for (let i = 0; i < rounds; i += 1) {
        await new Promise(resolve => setImmediate(resolve));
    }
}
