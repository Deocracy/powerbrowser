#!/usr/bin/env node
// scripts/verify-sidecar-no-symlinks.mjs -- PKG-18 (Phase 45): the staged
// Linux tree carries no symlink. Assertion only: the 2026-10-17 tarball held
// 0 symlinks and staging copies real files, so the row is the permanent guard
// against a future `cp -a` of a package dir reintroducing links (never the
// fix for a red tree -- the fix is staging real files).
//
// Universe: the extracted container-built tarball (same subject the
// portable-elf row walks). The check is `find <root> -type l` empty; the
// self-test plants one symlink in a fixture stage and requires red naming
// the link.
//
// Honestly --quick for the twin only: mkdtemp fixtures, no build, no browser,
// no display, no network. The full row needs the container-built tarball and
// FAILs naming the container-build procedure when it is absent (mar-hop
// precedent), never skips green.
//
// Usage:
//   node scripts/verify-sidecar-no-symlinks.mjs
//   node scripts/verify-sidecar-no-symlinks.mjs --self-test

import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-sidecar-no-symlinks';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build)';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

function checkTree(root) {
    let links;
    try {
        links = listLinks(root);
    } catch (err) {
        return { failures: [`cannot walk ${root}: ${err.message}`] };
    }
    if (links.length === 0) return { failures: [] };
    return { failures: links.map((l) => `${rel(root, l)}: staged tree carries a symlink (target ${safeTarget(l)}) -- stage real files, never links`) };
}

function listLinks(root) {
    const out = [];
    const walk = (dir) => {
        for (const n of readdirSync(dir)) {
            const p = join(dir, n);
            let st;
            try { st = lstatSync(p); } catch { continue; }
            if (st.isSymbolicLink()) out.push(p);
            else if (st.isDirectory()) walk(p);
        }
    };
    walk(root);
    return out.sort();
}

function rel(root, p) { return p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p; }

function safeTarget(p) {
    try { return readlinkSync(p); } catch { return '<unreadable>'; }
}

function selfTest() {
    let ok = true;
    const dir = mkdtempSync(join(tmpdir(), 'verify-sidecar-no-symlinks-selftest-'));
    try {
        // Control green first: an unplanted fixture stage passes.
        const clean = join(dir, 'clean-stage');
        mkdirSync(clean, { recursive: true });
        writeFileSync(join(clean, 'backend-main.js'), '"use strict";\n');
        const control = checkTree(clean);
        if (control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unplanted fixture stage is already red, so a red result after a plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unplanted fixture stage is GREEN`);
        }

        // Plant: one symlink in a fixture stage goes red naming the link.
        const planted = join(dir, 'planted-stage');
        mkdirSync(planted, { recursive: true });
        writeFileSync(join(planted, 'real-file.txt'), 'real bytes\n');
        symlinkSync(join(planted, 'real-file.txt'), join(planted, 'planted-link.node'));
        const res = checkTree(planted);
        const msg = res.failures.find((f) => f.includes('planted-link.node'));
        if (!msg) {
            console.error(`${NAME}: --self-test FAIL -- planted symlink was NOT rejected naming planted-link.node`);
            for (const f of res.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- planted symlink REJECTED: ${msg}`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then the planted fault behaved as pinned`);
}

if (SELF_TEST) {
    selfTest();
} else {
    import('./lib/built-tree.mjs').then(({ extractPackage }) => {
        let root;
        try {
            root = extractPackage();
        } catch (err) {
            console.error(`${NAME}: FAIL -- no container-built tarball: ${err.message}. Next step: run: ${BUILD_CMD}`);
            process.exit(1);
        }
        const { failures } = checkTree(root);
        rmSync(join(root, '..'), { recursive: true, force: true });
        if (failures.length) {
            console.error(`${NAME}: FAIL -- ${failures.length} symlink(s):\n  ${failures.join('\n  ')}`);
            process.exit(1);
        }
        console.log(`${NAME}: PASS -- find <stage> -type l is EMPTY over the staged tree`);
    }).catch((err) => {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run: ${BUILD_CMD}`);
        process.exit(1);
    });
}
