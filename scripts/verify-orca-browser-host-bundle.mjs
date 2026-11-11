#!/usr/bin/env node
// scripts/verify-orca-browser-host-bundle.mjs
//
// The orca-browser-host-bundle gate (Phase 66, BRW-03; P66-02, P66-30, A3, A7, A9): the thin browser host that
// scripts/build-orca-browser-host.sh compiles with Orca's Vite into the pane bundle's served directory works end to
// end against a real orcad, from Node, as the Theia frontend will drive it (lane p66-02).
//
// Derived at check time, never hand-kept:
//  a. the served directory, from the outDir of orca-overlay/files/vite.pb-panes.config.ts;
//  b. the pairing offer, from the scratch orcad's own ready line, held in memory only.
//
// Static clauses (default mode, run before the attach clause; condition 1, A3, A9): the module list that
// vite.pb-browser-host.config.ts wrote (orca/out/pb-browser-host-meta/modules.json) is non-empty and reaches no
// renderer/src/web/web-runtime-client.ts; no overlay source line (comments stripped) writes
// WEB_RUNTIME_CLIENT_CAPABILITIES or names subscribeOnCurrentConnection; no data: URL in pb-browser-host.js decodes
// to a file Orca's build:web emitted under out/web/assets (that directory's file list and bytes, PB's pane directory
// excluded); the tracked Orca set equals the one build-orca-browser-host.sh recorded just before Vite ran
// (tracked-before.txt; recorded state, because the declared seams stay modified); the host creates a v2 handshake on
// the device-key branch only (structure of the parsed source); the link defines the Symbol.for key, assigns
// prepareBrowserClientHostPlacement, and the pane entry imports it.
//
// Attach clause (default mode): a scratch orcad (scripts/lib/orca-run.mjs startOrcad) in a mkdtemp profile on a
// free loopback port; output redaction is installed before orcad starts and re-installed with the offer's secrets
// before anything else prints. The built pb-browser-host.js is imported in Node and attached with the offer's token
// credential. Through the Orca CLI, with an environment built from scratch (never this session's ORCA_*): a scratch
// repository is added, `tab create` must arrive as exactly one createPage event within 1 s of the CLI's exit and its
// completed result must be acked; a CLI `goto` for that page must arrive as one automation command whose completed
// answer reaches the CLI as success; userClosedPage (browser.tabClose on the host's connection) must answer
// { closed: true }, the following closePage is answered completed and acked, and `tab list` no longer lists the
// page. Every judgment is an exported pure verdict function. Results carry codes and booleans only.
//
// Tier: default full (needs the Orca build, the Orca CLI and a free port; run under the live lock:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-browser-host-bundle);
// --self-test quick (hermetic mkdtemp fixtures: a module list, sources, an out/ tree, a porcelain pair; each planted
// fault must go red naming it). SKIP (exit 0, one named line) when orca/ has no pb-browser-host.js, no built orcad
// or no built CLI.
//
// Usage:
//   node scripts/verify-orca-browser-host-bundle.mjs
//   node scripts/verify-orca-browser-host-bundle.mjs --self-test
//
// Limit: the probe is Node, not the Theia document; the document-side wiring (the link global, the placement
// override, the renderer path) is 66-02's and 66-05's live rows.

import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    REPO_ROOT as LIB_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from './lib/orca-run.mjs';

const NAME = 'orca-browser-host-bundle';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORCA_DIR = join(REPO_ROOT, 'orca');
const PANES_CONFIG = join(REPO_ROOT, 'orca-overlay', 'files', 'vite.pb-panes.config.ts');
const BUNDLE_NAME = 'pb-browser-host.js';
const PROBE_TITLE = 'PB host probe';
const PROBE_URL = 'http://127.0.0.1:9/pb-host-probe';

// ---------------------------------------------------------------- derivation (pure)

/** The pane bundle's default outDir, relative to orca/, from the pane config's source text; null when absent. */
export function paneOutDirOf(configText) {
    const m = String(configText).match(/outDir:\s*resolve\(process\.env\.PB_PANES_OUT\s*\|\|\s*'([^']+)'\)/);
    return m ? m[1] : null;
}

/** The offer fields of a pairing input (orca://pair?code=..., or the bare code). Throws a reason word only. */
export function offerOf(pairingInput) {
    let code = String(pairingInput ?? '').trim();
    if (code.toLowerCase().startsWith('orca://')) {
        const u = new URL(code);
        code = u.searchParams.get('code') ?? u.hash.slice(1);
    }
    let offer;
    try { offer = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { throw new Error('offer unreadable'); }
    if (typeof offer?.endpoint !== 'string' || typeof offer?.deviceToken !== 'string' || typeof offer?.publicKeyB64 !== 'string') throw new Error('offer lacks endpoint, token or key');
    return { endpoint: offer.endpoint, deviceToken: offer.deviceToken, publicKeyB64: offer.publicKeyB64 };
}

// ---------------------------------------------------------------- verdicts (pure)

/** Red reasons for one attach run's observations (codes, counts and booleans only). */
export function attachVerdict(o) {
    const fails = [];
    if (o.attach !== 'accepted') return [`attach not accepted: ${o.attach ?? 'no outcome'}`];
    if (!o.cliTabCreateOk) fails.push('CLI tab create failed or returned no browserPageId');
    if (o.createPageCount !== 1) fails.push(`expected exactly one createPage event, saw ${o.createPageCount}`);
    else if (!(o.createPageAfterCliMs <= 1000)) fails.push(`createPage arrived ${o.createPageAfterCliMs} ms after the CLI exited (limit 1000)`);
    if (o.createPageAck !== true) fails.push('the createPage completed result was not acked');
    if (o.gotoEventCount !== 1) fails.push(`expected one browser.goto command event, saw ${o.gotoEventCount}`);
    if (o.gotoAck !== true) fails.push('the browser.goto completed result was not acked');
    if (!o.cliGotoOk || o.cliGotoTitleMatches !== true) fails.push('the CLI goto did not report the host\'s completed answer');
    if (o.userCloseClosed !== true) fails.push('userClosedPage (browser.tabClose) did not answer { closed: true }');
    if (o.closePageCount !== 1 || o.closePageAck !== true) fails.push(`the closePage after the user close was not answered and acked (events ${o.closePageCount})`);
    if (!o.tabListOk) fails.push('CLI tab list failed after the user close');
    else if (o.stillListed !== false) fails.push('tab list still lists the page after the user close');
    return fails;
}

/** Occurrences of any secret (the offer, its code, token, key, endpoint) in the given output text. */
export function redactionMatches(text, secrets) {
    let n = 0;
    for (const s of secrets) if (s && s.length >= 8) n += String(text).split(s).length - 1;
    return n;
}

// ---------------------------------------------------------------- static clauses (pure; condition 1, A3, A9)

const HOST_REL = 'src/renderer/src/pb/browser-host/pb-browser-host.ts';
const LINK_REL = 'src/renderer/src/pb/browser-host/pb-browser-host-link.ts';
const ENTRY_REL = 'src/renderer/src/pb/pb-pane-mount.tsx';
const LINK_KEY_TEXT = "Symbol.for('powerbrowser.orca-browser.link')";

/** Source text with // and block comments removed; string, template and regex-free scanning keeps 'ws://' intact. */
export function stripComments(text) {
    let out = '';
    let quote = null;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            out += c;
            if (c === '\\') { out += s[++i] ?? ''; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
        if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); const body = s.slice(i, end < 0 ? s.length : end + 2); out += body.replace(/[^\n]/g, ''); i = end < 0 ? s.length : end + 1; continue; }
        out += c;
    }
    return out;
}

/** The import-graph clause: a non-empty module list that reaches no renderer/src/web/web-runtime-client.ts. */
export function modulesVerdict(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return ['broken instrument: the module list is empty (vite.pb-browser-host.config.ts wrote no module id)'];
    return ids.filter((id) => String(id).replace(/\\/g, '/').endsWith('renderer/src/web/web-runtime-client.ts'))
        .map((id) => `the host bundle's module list reaches renderer/src/web/web-runtime-client.ts (${String(id).replace(/^.*\/src\//, 'src/')})`);
}

/** No overlay source line writes WEB_RUNTIME_CLIENT_CAPABILITIES or names subscribeOnCurrentConnection (comments stripped). */
export function sourcesVerdict(sources) {
    const fails = [];
    for (const [rel, text] of Object.entries(sources)) {
        stripComments(text).split('\n').forEach((line, i) => {
            if (/\bWEB_RUNTIME_CLIENT_CAPABILITIES\b\s*(?:\[[^\]]*\]\s*)?(?:=(?!=)|\.\s*(?:push|unshift|splice|length\s*=)\b)/.test(line)
                || /Object\.assign\(\s*WEB_RUNTIME_CLIENT_CAPABILITIES\b/.test(line)) fails.push(`${rel}:${i + 1} writes WEB_RUNTIME_CLIENT_CAPABILITIES`);
            if (/\bsubscribeOnCurrentConnection\b/.test(line)) fails.push(`${rel}:${i + 1} names subscribeOnCurrentConnection, a private WebRuntimeClient member`);
        });
    }
    return fails;
}

/** Each data: URL in the bundle whose decoded payload equals a file Orca's build:web emitted under out/web/assets. */
export function inlinedAssetVerdict(bundleText, assets) {
    const bySize = new Map();
    for (const [rel, buf] of assets) {
        if (!buf.length) continue;
        if (!bySize.has(buf.length)) bySize.set(buf.length, []);
        bySize.get(buf.length).push([rel, buf]);
    }
    const fails = [];
    for (const m of String(bundleText).matchAll(/data:[A-Za-z0-9.+\/-]*((?:;[A-Za-z0-9=._-]+)*),([A-Za-z0-9+\/=%._~-]+)/g)) {
        let payload;
        try { payload = /;base64/i.test(m[1]) ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]), 'utf8'); } catch { continue; }
        for (const [rel, buf] of bySize.get(payload.length) ?? []) if (buf.equals(payload)) fails.push(`the host bundle inlines Orca build asset out/web/assets/${rel} as a data: URL`);
    }
    return fails;
}

/** The tracked Orca set after the host build equals the one build-orca-browser-host.sh recorded just before Vite. */
export function trackedVerdict(before, after) {
    const norm = (t) => String(t ?? '').split('\n').map((l) => l.trimEnd()).filter(Boolean).sort().join('\n');
    if (norm(before) === norm(after)) return [];
    const b = new Set(norm(before).split('\n').filter(Boolean));
    const a = new Set(norm(after).split('\n').filter(Boolean));
    const diff = [...[...a].filter((l) => !b.has(l)).map((l) => `+${l}`), ...[...b].filter((l) => !a.has(l)).map((l) => `-${l}`)];
    return [`tracked Orca set changed since the host build recorded it: ${diff.join(', ')}`];
}

/** Index just past the expression that starts at `from` (balanced brackets, strings skipped), ended by `stop` at depth 0. */
function scanExpression(s, from, stop) {
    let depth = 0;
    let quote = null;
    let entered = false;
    for (let i = from; i < s.length; i++) {
        const c = s[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if ('([{'.includes(c)) { depth++; entered = true; continue; }
        if (')]}'.includes(c)) { depth--; if (depth < 0) return i; if (depth === 0 && entered && stop === 'call') return i + 1; continue; }
        if (depth === 0 && c === stop) return i;
    }
    return s.length;
}

/**
 * A9 as structure: the host chooses its handshake with `keyed ? <v2> : <legacy>` where keyed is the device-key test;
 * the consequent uses framing 'v2' with transport 'direct', the alternate framing 'legacy', and no other handshake
 * exists. Never v2 with a token.
 */
export function framingVerdict(hostSource) {
    const s = stripComments(hostSource);
    const fails = [];
    if (!/const\s+keyed\s*=\s*credential\.kind\s*===\s*'device-key'/.test(s)) return ["no device-key guard (const keyed = credential.kind === 'device-key') in the host source"];
    const q = s.search(/=\s*keyed\s*\?/);
    if (q < 0) return ['the host does not choose its handshake with keyed ? ... : ...'];
    const start = s.indexOf('?', q) + 1;
    const colon = scanExpression(s, start, ':');
    const consequent = s.slice(start, colon);
    const altEnd = scanExpression(s, colon + 1, 'call');
    const alternate = s.slice(colon + 1, altEnd);
    if (!/createPairedE2EEClientHandshake\(/.test(consequent) || !/framing:\s*'v2'/.test(consequent) || !/transport:\s*'direct'/.test(consequent)) fails.push("the device-key branch does not create a framing 'v2' handshake with transport 'direct'");
    if (!/createPairedE2EEClientHandshake\(/.test(alternate) || !/framing:\s*'legacy'/.test(alternate)) fails.push("the token branch does not create a framing 'legacy' handshake");
    if (/framing:\s*'v2'/.test(alternate)) fails.push("the token branch creates a v2 handshake (a token over v2 sends no capabilities, A9)");
    const rest = s.slice(0, q) + s.slice(altEnd);
    if (/createPairedE2EEClientHandshake\(/.test(rest) || /framing:\s*'v2'/.test(rest)) fails.push('a handshake is created outside the credential branch');
    return fails;
}

/** A3: the link defines the Symbol.for key, assigns the placement, and the pane entry imports it. */
export function linkVerdict(linkSource, entrySource) {
    const s = stripComments(linkSource ?? '');
    const fails = [];
    if (!linkSource) return ['the link module pb-browser-host-link.ts is absent'];
    if (!s.includes(LINK_KEY_TEXT)) fails.push(`the link does not define ${LINK_KEY_TEXT}`);
    if (!/\.prepareBrowserClientHostPlacement\s*=(?!=)/.test(s)) fails.push('the link never sets prepareBrowserClientHostPlacement (A3 a)');
    if (!/^import\s+['"]\.\/browser-host\/pb-browser-host-link['"]/m.test(stripComments(entrySource ?? ''))) fails.push('the pane entry does not import ./browser-host/pb-browser-host-link');
    return fails;
}

function listFiles(root, skip = () => false) {
    const out = [];
    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        let entries;
        try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const p = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { if (!skip(p)) stack.push(p); } else if (e.isFile()) out.push(p);
        }
    }
    return out.sort();
}

/**
 * Every static clause over one tree: { overlayFiles, bundle, assetsDir, servedRel, metaDir, trackedNow }.
 * servedRel (the pane directory relative to assetsDir) is skipped when the asset set is derived: PB's own output.
 */
export function staticClauses(ctx) {
    const fails = [];
    let ids = null;
    try { ids = JSON.parse(readFileSync(join(ctx.metaDir, 'modules.json'), 'utf8')); } catch { ids = []; }
    fails.push(...modulesVerdict(ids));
    const sources = {};
    for (const rel of listFiles(ctx.overlayFiles)) if (/\.(m?[jt]sx?)$/.test(rel)) sources[rel] = readFileSync(join(ctx.overlayFiles, rel), 'utf8');
    fails.push(...sourcesVerdict(sources));
    const assets = new Map();
    for (const rel of listFiles(ctx.assetsDir, (p) => p === ctx.servedRel)) assets.set(rel, readFileSync(join(ctx.assetsDir, rel)));
    fails.push(...inlinedAssetVerdict(readFileSync(ctx.bundle, 'utf8'), assets));
    let before = null;
    try { before = readFileSync(join(ctx.metaDir, 'tracked-before.txt'), 'utf8'); } catch { fails.push('broken instrument: no tracked-before.txt (build-orca-browser-host.sh records it before Vite runs)'); }
    if (before !== null) fails.push(...trackedVerdict(before, ctx.trackedNow()));
    fails.push(...(sources[HOST_REL] ? framingVerdict(sources[HOST_REL]) : [`the host source ${HOST_REL} is absent`]));
    fails.push(...linkVerdict(sources[LINK_REL], sources[ENTRY_REL]));
    return { fails, modules: ids.length, assets: assets.size };
}

// ---------------------------------------------------------------- self-test (quick, hermetic)

export function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-self-`));
    const lines = [];
    let failed = 0;
    const real = (rel) => readFileSync(join(REPO_ROOT, 'orca-overlay', 'files', rel), 'utf8');
    const ASSET = 'pdf-cmap.bcmap';
    const assetBytes = Buffer.from('orca build asset bytes for the fixture\n'.repeat(4));
    const base = () => ({
        modules: ['/x/orca/src/renderer/src/pb/browser-host/pb-browser-host.ts', '/x/orca/src/shared/paired-e2ee-client-handshake.ts'],
        // The control mentions the private member in a comment only: comment stripping must keep it green.
        files: {
            [HOST_REL]: `${real(HOST_REL)}\n// subscribeOnCurrentConnection is never called here\n`,
            [LINK_REL]: real(LINK_REL),
            [ENTRY_REL]: real(ENTRY_REL),
        },
        bundle: `/* banner */\nconst ok = "data:text/plain,hello";\n`,
        assets: { [ASSET]: assetBytes, 'pb-panes/pb-panes.js': Buffer.from('const host = 1;\n') },
        before: ' M src/main/orcad/orcad-browser-provider.ts\n',
        after: ' M src/main/orcad/orcad-browser-provider.ts\n',
    });
    const run = (fx) => {
        const root = mkdtempSync(join(dir, 'fx-'));
        const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
        for (const [rel, body] of Object.entries(fx.files)) write(join(root, 'files', rel), body);
        for (const [rel, body] of Object.entries(fx.assets)) write(join(root, 'out', 'web', 'assets', rel), body);
        write(join(root, 'out', 'web', 'assets', 'pb-panes', BUNDLE_NAME), fx.bundle);
        write(join(root, 'meta', 'modules.json'), JSON.stringify(fx.modules));
        write(join(root, 'meta', 'tracked-before.txt'), fx.before);
        return staticClauses({
            overlayFiles: join(root, 'files'), bundle: join(root, 'out', 'web', 'assets', 'pb-panes', BUNDLE_NAME),
            assetsDir: join(root, 'out', 'web', 'assets'), servedRel: 'pb-panes', metaDir: join(root, 'meta'), trackedNow: () => fx.after,
        }).fails;
    };
    try {
        const control = run(base());
        if (control.length) { failed++; lines.push(`  FAIL control went red: ${control.join('; ')}`); } else lines.push('  ok control green (the real host, link and entry sources; a comment-only mention stays green)');
        const plants = [
            { name: 'web-runtime-client-reach', naming: 'reaches renderer/src/web/web-runtime-client.ts', apply: (f) => { f.modules.push('/x/orca/src/renderer/src/web/web-runtime-client.ts'); } },
            { name: 'capabilities-constant-write', naming: 'writes WEB_RUNTIME_CLIENT_CAPABILITIES', apply: (f) => { f.files[HOST_REL] += "\nWEB_RUNTIME_CLIENT_CAPABILITIES.push('browser.clientHost.v1')\n"; } },
            { name: 'private-subscribe', naming: 'names subscribeOnCurrentConnection', apply: (f) => { f.files[LINK_REL] += '\nclient.subscribeOnCurrentConnection(method, params)\n'; } },
            { name: 'inlined-asset', naming: `inlines Orca build asset out/web/assets/${ASSET}`, apply: (f) => { f.bundle += `const a = "data:application/octet-stream;base64,${assetBytes.toString('base64')}";\n`; } },
            { name: 'tracked-edit', naming: 'tracked Orca set changed', apply: (f) => { f.after += ' M src/renderer/src/web/web-runtime-client.ts\n'; } },
            { name: 'token-over-v2', naming: 'the token branch creates a v2 handshake', apply: (f) => { f.files[HOST_REL] = f.files[HOST_REL].replace("framing: 'legacy'", "framing: 'v2'"); } },
            { name: 'link-without-placement', naming: 'never sets prepareBrowserClientHostPlacement', apply: (f) => { f.files[LINK_REL] = f.files[LINK_REL].replace(/\.prepareBrowserClientHostPlacement\s*=/, '.placementUnused ='); } },
            { name: 'empty-module-list', naming: 'broken instrument: the module list is empty', apply: (f) => { f.modules = []; } },
            { name: 'entry-without-link', naming: 'the pane entry does not import ./browser-host/pb-browser-host-link', apply: (f) => { f.files[ENTRY_REL] = f.files[ENTRY_REL].replace(/^import '\.\/browser-host\/pb-browser-host-link'\n/m, ''); } },
        ];
        for (const p of plants) {
            const fx = base();
            p.apply(fx);
            const red = run(fx);
            if (red.some((f) => f.includes(p.naming))) lines.push(`  ok ${p.name} went red naming the drift`);
            else { failed++; lines.push(`  FAIL ${p.name} did not go red naming "${p.naming}" (got: ${red.join('; ') || 'green'})`); }
        }
        // The attach verdict on a recorded green run and one drift each, so its judgments are exercised too.
        const green = { attach: 'accepted', cliTabCreateOk: true, createPageCount: 1, createPageAfterCliMs: 0, createPageAck: true, gotoEventCount: 1, gotoAck: true, cliGotoOk: true, cliGotoTitleMatches: true, userCloseClosed: true, closePageCount: 1, closePageAck: true, tabListOk: true, stillListed: false };
        const attachPlants = [
            ['attach-refused', { attach: 'attach_refused:browser_client_host_capability_required' }, 'attach not accepted'],
            ['two-createPage', { createPageCount: 2 }, 'exactly one createPage'],
            ['page-still-listed', { stillListed: true }, 'still lists the page'],
        ];
        if (attachVerdict(green).length) { failed++; lines.push('  FAIL attach verdict control went red'); } else lines.push('  ok attach verdict control green');
        for (const [name, patch, naming] of attachPlants) {
            const red = attachVerdict({ ...green, ...patch });
            if (red.some((f) => f.includes(naming))) lines.push(`  ok ${name} went red naming the drift`);
            else { failed++; lines.push(`  FAIL ${name} did not go red naming "${naming}"`); }
        }
        const planted = plants.length + attachPlants.length;
        lines.push(failed ? `${NAME} self-test: FAIL -- ${failed} expectation(s) unmet` : `${NAME} self-test: PASS -- ${planted} planted faults each went red naming the drift`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    for (const l of lines) console.log(l);
    return failed ? 1 : 0;
}

// ---------------------------------------------------------------- attach clause (live, Node)

const payload = (json) => json?.result ?? json;

function cli(nodeBin, env, cwd, secrets, args) {
    const started = Date.now();
    return new Promise((resolveP) => {
        execFile(nodeBin, [join(ORCA_DIR, 'out', 'cli', 'index.js'), ...args, '--json'], { env, cwd, encoding: 'utf8', timeout: 90000 }, (error, stdout, stderr) => {
            let json = null;
            try { json = JSON.parse(stdout); } catch { /* reported as not ok */ }
            resolveP({ ok: !error && json !== null && json.ok !== false, json, code: json?.error?.code ?? null, text: redact(`${stdout}${stderr}`, secrets).trim().slice(0, 300), started, ended: Date.now() });
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(20); }
    return pred();
}

/** A profile path short enough for orcad's Unix socket (sun_path). */
function scratchDir() {
    const base = tmpdir().length > 40 ? '/tmp' : tmpdir();
    return mkdtempSync(join(base, 'pb-hb-'));
}

async function attachClause(bundlePath, notes) {
    const obs = { attach: null };
    let restore = installOutputRedaction([]);
    const work = scratchDir();
    const profile = join(work, 'p');
    const repo = join(work, 'repo');
    mkdirSync(profile, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'orca-browser-host-bundle scratch repository\n');
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-q', '-m', 'scratch');

    const node = await ensurePbNode(LIB_ROOT);
    const orcaVersion = orcaVersionFromPins(LIB_ROOT);
    const env = orcadEnv(process.env, { profileDir: profile, orcaVersion });
    // The CLI's environment from scratch: PATH and HOME only, plus Orca's documented profile names.
    const cliEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ORCA_USER_DATA: profile, ORCA_USER_DATA_PATH: profile, ORCA_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' };
    let run = null;
    let session = null;
    let secrets = [];
    try {
        run = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: profile, env });
        const { ready } = run;
        if (!ready.boundEndpoint?.startsWith('ws://127.0.0.1:')) throw new Error('orcad did not bind loopback');
        if (!ready.webClientUrl) throw new Error('the ready line offers no web-client pairing');
        const hash = new URL(ready.webClientUrl).hash.replace(/^#/, '').replace(/^pairing=/, '');
        const offer = offerOf(decodeURIComponent(hash));
        secrets = [...ready.secrets, offer.deviceToken, offer.publicKeyB64, offer.endpoint, ready.boundEndpoint].filter((s) => typeof s === 'string' && s.length >= 8);
        restore();
        restore = installOutputRedaction(secrets);

        // The bundle reads window (btoa in Orca's web e2ee) and self (tweetnacl's PRNG, self.crypto); Node's globals
        // stand in for both, as the browser document provides them.
        globalThis.window ??= globalThis;
        globalThis.self ??= globalThis;
        // A .mjs copy, so Node loads it as the ES module it is without a typeless-package warning.
        const copy = join(work, 'pb-browser-host.mjs');
        copyFileSync(bundlePath, copy);
        const host = await import(pathToFileURL(copy).href);
        if (host.PB_BROWSER_HOST_API !== 1 || typeof host.attachBrowserHost !== 'function') throw new Error('the bundle does not export PB_BROWSER_HOST_API 1 and attachBrowserHost');

        const events = [];
        const acks = [];
        const settle = (event, outcome) => session.commandResult(event, outcome).then(
            (r) => acks.push({ type: event.command.type, method: event.command.method ?? null, accepted: r?.accepted === true }),
            (e) => acks.push({ type: event.command.type, method: event.command.method ?? null, accepted: false, code: String(e?.message ?? e).slice(0, 80) }));
        const onCommand = (event) => {
            const cmd = event.command;
            events.push({ type: cmd.type, method: cmd.method ?? null, at: Date.now(), page: event.browserPageId });
            const answer = () => {
                if (cmd.type === 'createPage' || cmd.type === 'closePage') return settle(event, { status: 'completed' });
                if (cmd.type === 'automation' && cmd.method === 'browser.goto') return settle(event, { status: 'completed', result: { url: String(cmd.params?.url ?? ''), title: PROBE_TITLE } });
                return settle(event, { status: 'failed', errorCode: 'browser_command_unavailable' });
            };
            // session is set by the time orcad can send a command (ready precedes every command).
            if (session) answer(); else setTimeout(answer, 0);
        };
        const detached = [];
        try {
            session = await host.attachBrowserHost({
                connection: { endpoint: offer.endpoint, hostPublicKeyB64: offer.publicKeyB64 },
                credential: { kind: 'token', deviceToken: offer.deviceToken },
                browserHostClientId: `pb-host-${randomUUID()}`,
                inventory: () => [],
                onCommand,
                onDetached: (reason) => detached.push(reason),
            });
            obs.attach = 'accepted';
        } catch (e) {
            obs.attach = redact(String(e?.message ?? e), secrets).slice(0, 120);
            return obs;
        }

        const sel = `path:${repo}`;
        const added = await cli(node.path, cliEnv, repo, secrets, ['repo', 'add', '--path', repo]);
        if (!added.ok) notes.repoAdd = added.code ?? 'failed';
        const created = await cli(node.path, cliEnv, repo, secrets, ['tab', 'create', '--worktree', sel]);
        const pageId = payload(created.json)?.browserPageId;
        obs.cliTabCreateOk = created.ok && typeof pageId === 'string';
        if (!obs.cliTabCreateOk) notes.tabCreate = created.code ?? 'no browserPageId';
        await until(() => events.some((e) => e.type === 'createPage'), 1000);
        await sleep(300);
        const creates = events.filter((e) => e.type === 'createPage');
        obs.createPageCount = creates.length;
        obs.createPageMs = creates[0] ? creates[0].at - created.started : null;
        obs.createPageAfterCliMs = creates[0] ? Math.max(0, creates[0].at - created.ended) : null;
        await until(() => acks.some((a) => a.type === 'createPage'), 2000);
        obs.createPageAck = acks.find((a) => a.type === 'createPage')?.accepted === true;
        if (!pageId) return obs;

        const went = await cli(node.path, cliEnv, repo, secrets, ['goto', '--url', PROBE_URL, '--page', pageId]);
        obs.cliGotoOk = went.ok;
        obs.cliGotoTitleMatches = payload(went.json)?.title === PROBE_TITLE;
        if (!went.ok) notes.goto = went.code ?? 'failed';
        obs.gotoEventCount = events.filter((e) => e.type === 'automation' && e.method === 'browser.goto').length;
        obs.gotoAck = acks.find((a) => a.method === 'browser.goto')?.accepted === true;

        const before = events.length;
        try {
            const reply = await session.userClosedPage(sel, pageId);
            obs.userCloseClosed = reply?.closed === true;
        } catch (e) {
            obs.userCloseClosed = false;
            notes.userClose = redact(String(e?.message ?? e), secrets).slice(0, 80);
        }
        await until(() => acks.some((a) => a.type === 'closePage'), 3000);
        obs.closePageCount = events.slice(before).filter((e) => e.type === 'closePage').length;
        obs.closePageAck = acks.find((a) => a.type === 'closePage')?.accepted === true;
        const list = await cli(node.path, cliEnv, repo, secrets, ['tab', 'list', '--worktree', sel]);
        obs.tabListOk = list.ok;
        const tabs = payload(list.json)?.tabs ?? [];
        obs.stillListed = tabs.some((t) => t.browserPageId === pageId);
        obs.detachedEarly = detached.length > 0 ? detached[0] : null;
        return obs;
    } finally {
        try { session?.detach(); } catch { /* closed */ }
        if (run) {
            const { survivors } = await stopOrcad(run.child, run.ready?.daemonPid);
            if (survivors?.length) notes.survivors = survivors.length;
        }
        restore();
        obs.secrets = secrets;
        rmSync(work, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- main

function newestBuildLog() {
    const dir = join(REPO_ROOT, '.mozbuild', 'orca-build');
    let names = [];
    try { names = readdirSync(dir).filter((n) => /^build-.*\.log$/.test(n)); } catch { return null; }
    names.sort();
    return names.length ? join(dir, names[names.length - 1]) : null;
}

async function main() {
    const outRel = existsSync(PANES_CONFIG) ? paneOutDirOf(readFileSync(PANES_CONFIG, 'utf8')) : null;
    if (!outRel) {
        console.log(`${NAME}: FAIL -- orca-overlay/files/vite.pb-panes.config.ts has no outDir line (the pane config moved)`);
        return 1;
    }
    const bundle = join(ORCA_DIR, outRel, BUNDLE_NAME);
    for (const [path, what] of [[bundle, `orca/${outRel}/${BUNDLE_NAME}`], [join(ORCA_DIR, 'out', 'orcad', 'orcad.js'), 'orca/out/orcad/orcad.js'], [join(ORCA_DIR, 'out', 'cli', 'index.js'), 'orca/out/cli/index.js']]) {
        if (!existsSync(path)) {
            console.log(`${NAME}: SKIP -- ${what} is absent (nix develop .#orca --command bash scripts/build-orca.sh; the CLI as docs/BUILD.md "Browser host bundle" records)`);
            return 0;
        }
    }
    const bytes = statSync(bundle).size;
    const stat = staticClauses({
        overlayFiles: join(REPO_ROOT, 'orca-overlay', 'files'), bundle, assetsDir: join(ORCA_DIR, 'out', 'web', 'assets'),
        servedRel: outRel.replace(/^out\/web\/assets\//, ''), metaDir: join(ORCA_DIR, 'out', 'pb-browser-host-meta'),
        trackedNow: () => execFileSync('git', ['-C', ORCA_DIR, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }),
    });
    const notes = {};
    let obs;
    try {
        obs = await attachClause(bundle, notes);
    } catch (e) {
        console.log(`${NAME}: FAIL -- attach probe: ${redact(String(e?.message ?? e)).slice(0, 200)}`);
        return 1;
    }
    const fails = [...stat.fails, ...attachVerdict(obs)];
    const lines = fails.map((f) => `${NAME}: FAIL -- ${f}`);
    if (Object.keys(notes).length) lines.unshift(`${NAME}: note -- ${JSON.stringify(notes)}`);
    const log = newestBuildLog();
    const matches = redactionMatches(lines.join('\n'), obs.secrets) + (log ? redactionMatches(readFileSync(log, 'utf8'), obs.secrets) : 0);
    if (matches) lines.push(`${NAME}: FAIL -- redaction: ${matches} offer field occurrence(s) in the output or the newest build log`);
    if (!lines.some((l) => l.includes(': FAIL -- '))) {
        lines.push(`${NAME}: PASS -- attach accepted, createPage in ${obs.createPageMs} ms, user close reported, ${bytes} bytes; static clauses green over ${stat.modules} modules and ${stat.assets} Orca assets (redaction 0 matches)`);
    }
    for (const l of lines) console.log(redact(l, obs.secrets));
    return lines.some((l) => l.includes(': FAIL -- ')) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--self-test') process.exit(selfTest());
    if (args.length) { console.error(`${NAME}: unknown argument ${args[0]}`); process.exit(2); }
    process.exit(await main());
}
