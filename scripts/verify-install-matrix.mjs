#!/usr/bin/env node
// scripts/verify-install-matrix.mjs
//
// The install-matrix row (Phase 49, G-49b; promotes the 08-05 Linux matrix driver, which lived untracked
// under .mozbuild/matrix/). It runs the Linux cells of the per-OS install matrix in docs/BUILD.md over the
// release tarball (scripts/lib/built-tree.mjs packagePath, the objdir mozconfig.release builds into):
//
//   install                  the tarball extracts to a fresh prefix as one application dir that holds the
//                            identity.binary_name executable and application.ini
//   launch                   the packaged binary, started headless with its own profile and a fresh HOME, is
//                            still running after the wait
//   alongside stock Firefox  a stock Firefox, with its own profile and its own fresh HOME and no
//                            LD_LIBRARY_PATH, writes a headless screenshot while the fork keeps running
//   uninstall + no-residue   the fork's process group (the sidecar included) is stopped; the prefix, the
//                            profile and the two per-user roots are removed; and no path under the fork's
//                            HOME is named after an identity name in configuration.toml (app_basename,
//                            binary_name, remoting_name, distribution_id) or a Mozilla or Firefox root
//
// The per-user roots (owner ruling, Chris, 2026-11-26). A tarball install has no uninstaller, so the Linux
// uninstall is a documented procedure (docs/BUILD.md, under the install matrix): delete the application
// directory, then ~/.config/<vendor>/<name> and ~/.cache/<vendor>/<name>, where <vendor> and <name> are Vendor
// and Name of the packaged application.ini in lower case. Gecko creates both directories at every start,
// --profile or not (nsXREDirProvider::GetUserDataDirectory ends in EnsureDirectoryExists; a stock Firefox
// leaves ~/.config/mozilla/firefox and ~/.cache/mozilla/firefox the same way), so removing only the prefix
// and the test profile could never leave a clean HOME. The cell derives the two roots from the extracted
// application.ini, never from a typed name, removes exactly those, and then runs the residue scan over the
// whole HOME as before: a product-named path anywhere else is still red, and so is an application.ini the
// roots cannot be derived from.
//
// The cell set is derived at check time from the header of the Linux row's table in docs/BUILD.md and
// compared with the cells implemented here as set equality: a BUILD.md cell with no implementation, or an
// implementation with no BUILD.md cell, is red. The hop cell is covered by the mar-update-hop row (and the
// Phase 46 hop driver), not here, and is named so.
//
// The stock browser is PB_STOCK_FIREFOX, or `firefox` on PATH; build-linux resolves it from the flake's
// nixpkgs. An absent one is a FAIL naming the variable, never a skip.
//
// Tier: full (needs the container-built tarball, a stock Firefox and about 30 seconds). The --self-test is
// --quick: it runs the same driver over fixture tarballs and fixture browsers (shell scripts) in the OS temp
// directory, a green control first, then one planted fault per cell, each red naming its cell. It needs no
// build, no browser, no display and no network, and it removes everything it wrote.
//
// Usage:
//   node scripts/verify-install-matrix.mjs
//   node scripts/verify-install-matrix.mjs --self-test

import { execFileSync, spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { liveEnv } from './lib/firefox-bidi.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'install-matrix';
const SELF_REL = 'scripts/verify-install-matrix.mjs';
const BUILD_REL = 'docs/BUILD.md';
const MATRIX_HEADING = /^### Per-OS install matrix\b/;
const COVERED_ELSEWHERE = { 'N to N-plus-1 hop': 'mar-update-hop' };
const IMPLEMENTED = ['install', 'launch', 'alongside stock Firefox', 'uninstall + no-residue'];
const LAUNCH_WAIT_MS = 25000;
const STOCK_TIMEOUT_MS = 120000;
const STOP_GRACE_MS = 5000;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'. Next step: run: node ${SELF_REL} [--self-test]`);
        process.exit(2);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The cell names of the Linux row: the header of the first table under the install-matrix heading. */
export function deriveCells(buildText) {
    const lines = String(buildText ?? '').split('\n');
    const at = lines.findIndex(l => MATRIX_HEADING.test(l));
    if (at < 0) return null;
    const header = lines.slice(at + 1).find(l => /^\|/.test(l));
    if (!header) return null;
    return header.split('|').slice(2, -1).map(c => c.trim()).filter(Boolean);
}

function isExecutable(p) {
    try {
        accessSync(p, constants.X_OK);
        return statSync(p).isFile();
    } catch {
        return false;
    }
}

function walk(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        out.push(p);
        if (e.isDirectory() && !e.isSymbolicLink()) walk(p, out);
    }
    return out;
}

/** Vendor and Name of the [App] section of an application.ini text; either is null when absent or empty. */
export function appIdentity(iniText) {
    const out = { vendor: null, name: null };
    let section = '';
    for (const raw of String(iniText ?? '').split('\n')) {
        const line = raw.trim();
        const head = /^\[(.+)\]$/.exec(line);
        if (head) {
            section = head[1];
            continue;
        }
        const kv = /^([^=]+)=(.*)$/.exec(line);
        if (!kv || section !== 'App') continue;
        if (kv[1].trim() === 'Vendor' && kv[2].trim() !== '') out.vendor = kv[2].trim();
        if (kv[1].trim() === 'Name' && kv[2].trim() !== '') out.name = kv[2].trim();
    }
    return out;
}

/**
 * The per-user roots the Linux uninstall procedure removes, relative to HOME: the XDG config and cache
 * directories Gecko derives from Vendor and Name (nsXREDirProvider::AppendProfilePath lower-cases both).
 * null when either is missing or is not one plain path segment.
 */
export function perUserRoots({ vendor, name }) {
    const segment = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(v) && !v.includes('..');
    if (!segment(vendor) || !segment(name)) return null;
    return ['.config', '.cache'].map(base => join(base, vendor.toLowerCase(), name.toLowerCase()));
}

function cleanEnv(home, work) {
    const env = { ...process.env, HOME: home, MOZ_HEADLESS: '1', PB_MATRIX_WORK: work };
    for (const k of ['LD_LIBRARY_PATH', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) delete env[k];
    return env;
}

const alive = pid => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * Runs the cells in order; a failed cell stops the run (later cells need its state). Returns
 * { cells: [{ cell, ok, detail }], work } and removes the work dir unless keep is set.
 */
export async function runMatrix({ tarball, binName, stock, residueNames, cells, waitMs = LAUNCH_WAIT_MS, stockTimeoutMs = STOCK_TIMEOUT_MS, graceMs = STOP_GRACE_MS }) {
    const results = [];
    const record = (cell, ok, detail) => results.push({ cell, ok, detail });

    // Derive-and-compare: every BUILD.md cell is implemented here or covered by a named row, and back.
    const wanted = cells.filter(c => !Object.hasOwn(COVERED_ELSEWHERE, c));
    const missing = wanted.filter(c => !IMPLEMENTED.includes(c));
    const extra = IMPLEMENTED.filter(c => !wanted.includes(c));
    if (cells.length === 0 || missing.length || extra.length) {
        record('cells', false, `${BUILD_REL} Linux row cells ${JSON.stringify(cells)} differ from the cells this row runs ${JSON.stringify(IMPLEMENTED)} plus ${JSON.stringify(Object.keys(COVERED_ELSEWHERE))} (no implementation for ${JSON.stringify(missing)}; not in ${BUILD_REL}: ${JSON.stringify(extra)}). Next step: implement the cell here, or correct the table header.`);
        return { cells: results };
    }

    const work = mkdtempSync(join(tmpdir(), 'pb-install-matrix-'));
    const prefix = join(work, 'prefix');
    const pbHome = join(work, 'home-fork');
    const ffHome = join(work, 'home-stock');
    const pbProfile = join(work, 'profile-fork');
    const ffProfile = join(work, 'profile-stock');
    const shot = join(work, 'stock-shot.png');
    for (const d of [prefix, pbHome, ffHome, pbProfile, ffProfile]) mkdirSync(d, { recursive: true });
    let fork = null;
    try {
        // install
        try {
            execFileSync('tar', ['-xf', tarball, '-C', prefix], { stdio: ['ignore', 'ignore', 'pipe'] });
        } catch (e) {
            record('install', false, `${tarball} does not extract: ${String(e.stderr || e.message).trim().split('\n').pop()}`);
            return { cells: results };
        }
        const top = readdirSync(prefix);
        const app = top.length === 1 ? join(prefix, top[0]) : null;
        const bin = app ? join(app, binName) : null;
        if (!app) {
            record('install', false, `the tarball holds ${top.length} top-level entries (${top.join(', ')}), not one application dir`);
            return { cells: results };
        }
        if (!isExecutable(bin) || !existsSync(join(app, 'application.ini'))) {
            record('install', false, `the application dir ${top[0]}/ lacks an executable ${binName} or application.ini`);
            return { cells: results };
        }
        // Read now: the uninstall cell removes the prefix before it needs Vendor and Name.
        const identity = appIdentity(readFileSync(join(app, 'application.ini'), 'utf8'));
        record('install', true, `extracted to a fresh prefix as ${top[0]}/ with ${binName} and application.ini`);

        // launch
        const forkLog = join(work, 'fork.log');
        writeFileSync(forkLog, '');
        fork = spawn(bin, ['--headless', '--no-remote', '--profile', pbProfile, 'about:blank'], {
            cwd: work, env: liveEnv(cleanEnv(pbHome, work)), detached: true, stdio: ['ignore', 'ignore', 'ignore'],
        });
        let exited = null;
        fork.on('exit', (code, signal) => { exited = { code, signal }; });
        await sleep(waitMs);
        if (exited || !alive(fork.pid)) {
            record('launch', false, `${binName} exited within ${waitMs} ms (${JSON.stringify(exited)})`);
            return { cells: results };
        }
        record('launch', true, `${binName} still running after ${waitMs} ms headless (pid ${fork.pid})`);

        // alongside stock Firefox
        let stockErr = null;
        try {
            execFileSync(stock, ['--headless', '--no-remote', '--profile', ffProfile, '--screenshot', shot, 'about:blank'], {
                cwd: work, env: liveEnv(cleanEnv(ffHome, work)), stdio: ['ignore', 'ignore', 'pipe'], timeout: stockTimeoutMs,
            });
        } catch (e) {
            stockErr = String(e.stderr || e.message).trim().split('\n').pop();
        }
        // The synchronous stock run blocked the event loop; yield so a fork that exited meanwhile is reaped
        // (an unreaped zombie still answers kill(pid, 0)).
        await sleep(300);
        const shotBytes = existsSync(shot) ? statSync(shot).size : 0;
        if (stockErr !== null || shotBytes === 0) {
            record('alongside stock Firefox', false, `the stock browser ${stock} ${stockErr !== null ? `failed (${stockErr})` : 'exited'} and wrote ${shotBytes} screenshot bytes; a remoting collision exits without one`);
            return { cells: results };
        }
        if (exited || !alive(fork.pid)) {
            record('alongside stock Firefox', false, `${binName} died while the stock browser ran (${JSON.stringify(exited)})`);
            return { cells: results };
        }
        record('alongside stock Firefox', true, `the stock browser wrote a ${shotBytes}-byte screenshot while ${binName} kept running, each with its own profile and HOME`);

        // uninstall + no-residue
        try { process.kill(-fork.pid, 'SIGTERM'); } catch { /* already gone */ }
        for (let t = 0; t < graceMs && alive(fork.pid); t += 100) await sleep(100);
        try { process.kill(-fork.pid, 'SIGKILL'); } catch { /* already gone */ }
        fork = null;
        // The documented Linux uninstall: the application directory, the profile, the two per-user roots.
        const roots = perUserRoots(identity);
        rmSync(prefix, { recursive: true, force: true });
        rmSync(pbProfile, { recursive: true, force: true });
        if (!roots) {
            record('uninstall + no-residue', false, `the packaged application.ini carries Vendor ${JSON.stringify(identity.vendor)} and Name ${JSON.stringify(identity.name)} in [App]; the per-user roots the uninstall removes cannot be derived from them`);
            return { cells: results };
        }
        for (const r of roots) rmSync(join(pbHome, r), { recursive: true, force: true });
        const pattern = new RegExp(`(^|[._-])(${[...residueNames, 'mozilla', 'firefox'].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})($|[._-])`, 'i');
        const residue = walk(pbHome).map(p => relative(pbHome, p)).filter(p => p.split('/').some(seg => pattern.test(seg)));
        if (existsSync(prefix) || residue.length) {
            record('uninstall + no-residue', false, `after the uninstall the fork HOME still holds ${JSON.stringify(residue.slice(0, 8))}${residue.length > 8 ? ` and ${residue.length - 8} more` : ''}`);
            return { cells: results };
        }
        record('uninstall + no-residue', true, `process group stopped, prefix, profile and the per-user roots ${JSON.stringify(roots)} (from application.ini) removed, no path under the fork HOME named after ${JSON.stringify(residueNames)} or a Mozilla or Firefox root`);
        return { cells: results };
    } finally {
        if (fork) {
            try { process.kill(-fork.pid, 'SIGKILL'); } catch { /* already gone */ }
        }
        rmSync(work, { recursive: true, force: true });
    }
}

function stockFromPath() {
    if (process.env.PB_STOCK_FIREFOX) return process.env.PB_STOCK_FIREFOX;
    for (const d of String(process.env.PATH ?? '').split(delimiter)) {
        if (d && isExecutable(join(d, 'firefox'))) return join(d, 'firefox');
    }
    return null;
}

function identityNames(config) {
    const id = config?.identity ?? {};
    return [...new Set([id.app_basename, id.binary_name, id.remoting_name, id.distribution_id].filter(v => typeof v === 'string' && v !== ''))];
}

function report(cells) {
    const bad = cells.filter(c => !c.ok);
    for (const c of cells) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.cell}: ${c.detail}`);
    return bad;
}

async function main() {
    const cells = deriveCells(readFileSync(join(REPO_ROOT, BUILD_REL), 'utf8')) ?? [];
    const { config, failures } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    if (!config || failures?.length) {
        console.error(`${NAME}: FAIL -- configuration.toml does not resolve: ${(failures ?? []).join('; ')}`);
        return 1;
    }
    const stock = stockFromPath();
    if (!stock || !isExecutable(stock)) {
        console.error(`${NAME}: FAIL -- no stock Firefox: PB_STOCK_FIREFOX is ${JSON.stringify(process.env.PB_STOCK_FIREFOX ?? null)} and no firefox is on PATH. Next step: export PB_STOCK_FIREFOX="$(nix build --no-link --print-out-paths --inputs-from . nixpkgs#firefox)/bin/firefox"`);
        return 1;
    }
    let tarball;
    try {
        tarball = (await import('./lib/built-tree.mjs')).packagePath();
    } catch (e) {
        console.error(`${NAME}: FAIL -- no release tarball: ${e.message}`);
        return 1;
    }
    const { cells: results } = await runMatrix({ tarball, binName: config.identity.binary_name, stock, residueNames: identityNames(config), cells });
    const bad = report(results);
    if (bad.length || results.length !== IMPLEMENTED.length) {
        console.error(`${NAME}: FAIL -- cell ${bad[0]?.cell ?? '(incomplete)'} is red over ${tarball}`);
        return 1;
    }
    console.log(`${NAME}: PASS -- ${IMPLEMENTED.join(', ')} green over ${tarball} beside ${stock}; the ${Object.keys(COVERED_ELSEWHERE).join(', ')} cell is the ${Object.values(COVERED_ELSEWHERE).join(', ')} row`);
    return 0;
}

// --- self-test: the same driver over fixtures ---

// Mixed case, so the control proves the roots are lower-cased the way Gecko lower-cases them. The fixture
// Name is the binary name with its first letter in upper case: its per-user roots are then product-named, so
// the residue scan itself is red for a root the uninstall did not remove.
const FIXTURE_VENDOR = 'FixtureVendor';
const fixtureName = bin => String(bin ?? 'fixture').replace(/^./, c => c.toUpperCase());
function fixtureTarball(dir, { topDirs = ['powerbrowser'], bin = 'powerbrowser', forkBody = 'exec sleep 600', ini = `[App]\nVendor=${FIXTURE_VENDOR}\nName=${fixtureName(bin)}\nVersion=0.0.0\n` } = {}) {
    const src = join(dir, `src-${Math.random().toString(36).slice(2)}`);
    for (const t of topDirs) {
        mkdirSync(join(src, t), { recursive: true });
        writeFileSync(join(src, t, 'application.ini'), ini);
        if (bin) {
            writeFileSync(join(src, t, bin), `#!/bin/sh\n${forkBody}\n`);
            chmodSync(join(src, t, bin), 0o755);
        }
    }
    const out = join(dir, `${src.split('/').pop()}.tar.xz`);
    execFileSync('tar', ['-cJf', out, '-C', src, ...topDirs]);
    return out;
}

function fixtureStock(dir, body) {
    const p = join(dir, `stock-${Math.random().toString(36).slice(2)}`);
    // Writes the file after --screenshot, the way the stock headless screenshot does.
    writeFileSync(p, `#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = --screenshot ] && SHOT="$2"; shift; done\n${body}\n`);
    chmodSync(p, 0o755);
    return p;
}

async function selfTest() {
    const realCells = deriveCells(readFileSync(join(REPO_ROOT, BUILD_REL), 'utf8'));
    if (!realCells || realCells.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- ${BUILD_REL} carries no install-matrix table header under '### Per-OS install matrix'`);
        return 1;
    }
    const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    const names = identityNames(config);
    const binName = config.identity.binary_name;
    const dir = mkdtempSync(join(tmpdir(), 'pb-install-matrix-self-'));
    const goodStock = 'printf png > "$SHOT"; touch "$PB_MATRIX_WORK/stock-ran"';
    const base = { binName, residueNames: names, cells: realCells, waitMs: 700, stockTimeoutMs: 10000, graceMs: 500 };
    let failed = 0;
    try {
        const run = o => runMatrix({ ...base, tarball: fixtureTarball(dir, o.tar), stock: o.stock ?? fixtureStock(dir, goodStock), ...(o.cells ? { cells: o.cells } : {}) });
        // The control fork writes into both per-user roots, as Gecko does, so a green control proves the
        // uninstall removes them (a fork that wrote nothing would be green without it).
        const fixtureRoots = perUserRoots({ vendor: FIXTURE_VENDOR, name: fixtureName(binName) });
        const writeRoots = fixtureRoots.map(r => `mkdir -p "$HOME/${r}/sub"; echo x > "$HOME/${r}/sub/file"`).join('; ');
        const control = await run({ tar: { bin: binName, forkBody: `${writeRoots}; exec sleep 600` } });
        const bad = control.cells.filter(c => !c.ok);
        if (bad.length || control.cells.length !== IMPLEMENTED.length) {
            console.error(`${NAME}: --self-test FAIL -- the fixture control is not green: ${JSON.stringify(control.cells)}`);
            return 1;
        }
        console.log(`  ok  control -> ${IMPLEMENTED.length} cells green over the fixture package (cells from ${BUILD_REL}: ${realCells.join(', ')})`);
        const plants = [
            ['two top-level dirs in the tarball', { tar: { bin: binName, topDirs: ['powerbrowser', 'extra'] } }, 'install', '2 top-level entries'],
            ['packaged binary absent', { tar: { bin: null } }, 'install', `executable ${binName}`],
            ['fork exits at once', { tar: { bin: binName, forkBody: 'exit 1' } }, 'launch', 'exited within'],
            ['stock browser writes no screenshot', { tar: { bin: binName }, stock: fixtureStock(dir, 'exit 0') }, 'alongside stock Firefox', '0 screenshot bytes'],
            ['stock browser fails', { tar: { bin: binName }, stock: fixtureStock(dir, 'exit 3') }, 'alongside stock Firefox', 'failed'],
            ['fork dies during the stock run', { tar: { bin: binName, forkBody: 'while [ ! -e "$PB_MATRIX_WORK/stock-ran" ]; do sleep 0.05; done; exit 0' }, stock: fixtureStock(dir, `${goodStock}; sleep 0.5`) }, 'alongside stock Firefox', 'died while'],
            [`residue named after ${binName}`, { tar: { bin: binName, forkBody: `mkdir -p "$HOME/.${binName}"; exec sleep 600` } }, 'uninstall + no-residue', `.${binName}`],
            ['residue in a Mozilla root', { tar: { bin: binName, forkBody: 'mkdir -p "$HOME/.mozilla/x"; exec sleep 600' } }, 'uninstall + no-residue', '.mozilla'],
            ['residue under XDG config', { tar: { bin: binName, forkBody: `mkdir -p "$HOME/.config/${names.at(-1)}"; exec sleep 600` } }, 'uninstall + no-residue', names.at(-1)],
            // Owner ruling 2026-11-26: only the two derived roots are removed. A product-named path anywhere
            // else is residue, whether or not the roots were written too.
            ['residue under another product-named path beside written per-user roots', { tar: { bin: binName, forkBody: `${writeRoots}; mkdir -p "$HOME/.local/share/${binName}"; exec sleep 600` } }, 'uninstall + no-residue', `.local/share/${binName}`],
            ['product-named sibling of a per-user root', { tar: { bin: binName, forkBody: `mkdir -p "$HOME/${dirname(fixtureRoots[0])}/${binName}-extra"; exec sleep 600` } }, 'uninstall + no-residue', `${binName}-extra`],
            // The same fork as the control, over a package whose application.ini names another product: the
            // roots it wrote are not the derived ones, so they stay and the scan names them.
            ['per-user roots written but not the ones application.ini derives', { tar: { bin: binName, forkBody: `${writeRoots}; exec sleep 600`, ini: `[App]\nVendor=${FIXTURE_VENDOR}\nName=Other\nVersion=0.0.0\n` } }, 'uninstall + no-residue', fixtureRoots[0]],
            ['application.ini with no Vendor', { tar: { bin: binName, ini: `[App]\nName=${fixtureName(binName)}\nVersion=0.0.0\n` } }, 'uninstall + no-residue', 'Vendor null'],
            ['BUILD.md cell with no implementation', { tar: { bin: binName }, cells: [...realCells, 'reboot survives'] }, 'cells', 'reboot survives'],
            ['BUILD.md cell removed', { tar: { bin: binName }, cells: realCells.filter(c => c !== 'launch') }, 'cells', 'launch'],
        ];
        for (const [name, o, cell, needle] of plants) {
            const { cells } = await run(o);
            const hit = cells.find(c => !c.ok);
            if (hit && hit.cell === cell && hit.detail.includes(needle)) {
                console.log(`  ok  ${name} -> red, cell '${cell}' naming '${needle}'`);
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red in cell '${cell}' naming '${needle}'; got ${JSON.stringify(hit ?? cells)}`);
                failed += 1;
            }
        }
        if (failed) return 1;
        console.log(`${NAME}: --self-test PASS -- the fixture control is green and ${plants.length} planted faults each went red naming the cell; everything it wrote under the OS temp directory is removed`);
        return 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

process.exitCode = await (args.includes('--self-test') ? selfTest() : main());
