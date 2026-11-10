#!/usr/bin/env node
// Spike 005 (BRW-01, P61-05 as widened by P61-13): one ability, navigate plus
// read title, through the S2 seam.
//
//   PB half   adapter goto(url) -> WebTabChannel.widgetOf(tabId).navigate(url)
//             (webTabNavigate) -> {url, title} from the PowerBrowserWebTabState push.
//   S2 half   Orca CLI `goto` -> orcad browser.goto -> automation command on the
//             client-host stream -> the PB runtime client in the Theia frame
//             (pb-s2-host.js, built by build-s2-host.sh) -> the PB half -> result
//             back through browser.clientHost.commandResult -> CLI JSON.
//
// The PB half always runs alone first, so a refused attach still yields the
// PB-side number. WebDriver BiDi is the test harness only (D-11): the ability
// path is webTabNavigate. orcad binds loopback only. The pairing input is held
// in memory and stdout/stderr are redacted (T-61-07).
//
// Run (headless, under the live lock, after build-orca.sh and build-s2-host.sh):
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
//     node .planning/spikes/005-orca-browser-parity/provider-proof.mjs
// Writes results-proof.json beside this file. Last line: provider-proof: PASS -- ...
// or provider-proof: FAIL -- naming the half.

import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    REPO_ROOT, ensurePbNode, installOutputRedaction, orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from '../../../scripts/lib/orca-run.mjs';
import {
    WEB_TAB_STATE_EVENT, loadedAt, openWebTab, probe, pushes, serveNavPages, waitForPush, withProbeShell,
} from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCA_DIR = join(REPO_ROOT, 'orca');
const CLI = join(ORCA_DIR, 'out', 'cli', 'index.js');
// orcad's static handler serves only web-index.html and four prefixes; assets/ is one of them.
const BUNDLE_REL = 'assets/pb-s2/pb-s2-host.js';
const WORK = join(REPO_ROOT, '.mozbuild', 'p61-02');
// orcad's Unix socket sits in the profile directory; the worktree path is too long for sun_path (60-EXT01-RECORD note 1).
const PROFILE_ALIAS = join(homedir(), '.cache', 'pb-p61-02-orca');

const nonce = randomUUID().slice(0, 8);
const titles = { pb: `P61 PB half ${nonce}`, s2: `P61 S2 half ${nonce}` };
const out = {
    date: new Date().toISOString(),
    command: 'flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/spikes/005-orca-browser-parity/provider-proof.mjs',
    attachOutcome: 'not attempted',
    halvesEndToEnd: [],
    gotoResult: null,
    pbHalf: null,
    s2Half: null,
    notes: [],
};

function prepare() {
    for (const f of [join(ORCA_DIR, 'out', 'orcad', 'orcad.js'), CLI, join(ORCA_DIR, 'out', 'web', BUNDLE_REL)]) {
        if (!existsSync(f)) throw new Error(`${f} is absent. Next step: scripts/build-orca.sh, the CLI build in README "How to Run", then build-s2-host.sh`);
    }
    const profile = join(WORK, 'powerbrowser-orca');
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(profile, { recursive: true });
    mkdirSync(dirname(PROFILE_ALIAS), { recursive: true });
    rmSync(PROFILE_ALIAS, { force: true });
    symlinkSync(profile, PROFILE_ALIAS);
    // A throwaway repository: client-hosted pages need a workspace.
    const repo = join(WORK, 'scratch-repo');
    if (!existsSync(join(repo, '.git'))) {
        mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, 'README.md'), 'spike 005 scratch repository\n');
        const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=spike', '-c', 'user.email=spike@invalid', ...a], { stdio: 'ignore' });
        git('init', '-q', '-b', 'main');
        git('add', '.');
        git('commit', '-q', '-m', 'scratch');
    }
    return repo;
}

/**
 * The Orca CLI against the spike orcad. Returns { ok, json, text, ms }; text is redacted.
 * Asynchronous on purpose: the fixture HTTP server lives in this process, and a
 * blocking spawn would stop it answering the page load the command waits for.
 */
function cli(nodeBin, env, cwd, secrets, args) {
    const started = Date.now();
    return new Promise((resolveP) => {
        execFile(nodeBin, [CLI, ...args, '--json'], { env, cwd, encoding: 'utf8', timeout: 90000 }, (error, stdout, stderr) => {
            let json = null;
            try { json = JSON.parse(stdout); } catch { /* reported through text */ }
            resolveP({ ok: !error && json !== null, json, text: redact(`${stdout}${stderr}`, secrets).trim().slice(0, 600), ms: Date.now() - started });
        });
    });
}

/** The value a CLI --json envelope carries, whichever of the two shapes it uses. */
const payload = (json) => json?.result ?? json;

async function main() {
    let restore = installOutputRedaction([]);
    const repo = prepare();
    const node = await ensurePbNode();
    const orcaVersion = orcaVersionFromPins();
    const env = orcadEnv(process.env, { profileDir: PROFILE_ALIAS, orcaVersion });
    Object.assign(out, { orca: orcaVersion, node: node.version, pbBinary: process.env.PB_FIREFOX_BIN ?? '(default objdir)' });

    const run = await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir: PROFILE_ALIAS, env });
    const { ready } = run;
    restore();
    restore = installOutputRedaction(ready.secrets);
    const pages = await serveNavPages({
        '/start': { title: 'P61 start', body: '<p>start</p>' },
        '/pb': { title: titles.pb, body: '<p>pb half</p>' },
        '/s2': { title: titles.s2, body: '<p>s2 half</p>' },
    });
    try {
        if (!ready.boundEndpoint?.startsWith('ws://127.0.0.1:')) throw new Error(`orcad bound ${ready.boundEndpoint}, not ws://127.0.0.1:`);
        if (!ready.webClientUrl) throw new Error('the ready line carries no pairing.webClientUrl');
        const web = new URL(ready.webClientUrl);
        const pairingInput = decodeURIComponent(web.hash.replace(/^#pairing=/, ''));
        const added = await cli(node.path, env, repo, ready.secrets, ['repo', 'add', '--path', repo]);
        if (!added.ok) out.notes.push(`repo add: ${added.text}`);

        await withProbeShell(async (app) => {
            const tabId = await openWebTab(app, pages.url('/start'));
            if (await waitForPush(app, loadedAt(tabId, '/start')) < 0) throw new Error('PB half: the web tab never loaded its start page');

            // PB half alone: the adapter, inline.
            let from = (await pushes(app)).length;
            let t0 = Date.now();
            const nav = await probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).navigate(${JSON.stringify(pages.url('/pb'))});`);
            const at = await waitForPush(app, loadedAt(tabId, '/pb'), { from });
            const push = at < 0 ? null : (await pushes(app))[at];
            out.pbHalf = { gotoResult: push ? { url: push.url, title: push.title } : null, ms: Date.now() - t0, navigateReply: nav };
            if (push?.title === titles.pb) out.halvesEndToEnd.push('pb');

            // S2 half: the PB runtime client in the Theia frame becomes orcad's client host.
            t0 = Date.now();
            const attach = await probe(app, `
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = ${JSON.stringify(`${web.origin}/${BUNDLE_REL}`)};
                    s.onload = () => resolve(); s.onerror = () => reject(new Error('the S2 bundle did not load from the orcad origin'));
                    document.head.appendChild(s);
                });
                const tabId = ${JSON.stringify(tabId)};
                const onGoto = url => new Promise((resolve, reject) => {
                    const timer = setTimeout(() => { window.removeEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on); reject(new Error('no loaded state push')); }, 20000);
                    const on = event => {
                        const d = event.detail;
                        if (d && d.kind === 'state' && d.tabId === tabId && d.loading === false && d.url === url && d.title) {
                            clearTimeout(timer); window.removeEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on);
                            resolve({ url: d.url, title: d.title });
                        }
                    };
                    window.addEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, on);
                    get('WebTabChannel').widgetOf(tabId).navigate(url).then(reply => { window.__pbS2NavigateReply = reply; }, reject);
                });
                window.__pbS2 = await PbS2.start({ pairingInput: ${JSON.stringify(pairingInput)}, onGoto });
                return { outcome: window.__pbS2.outcome, secure: window.isSecureContext, origin: location.origin };
            `, 60000);
            out.attachOutcome = redact(String(attach?.outcome ?? attach?.error ?? 'no reply'), ready.secrets);
            out.s2Half = { attachMs: Date.now() - t0, theiaOrigin: attach?.origin, secureContext: attach?.secure };
            if (attach?.outcome !== 'accepted') return;

            const selector = `path:${repo}`;
            const created = await cli(node.path, env, repo, ready.secrets, ['tab', 'create', '--worktree', selector]);
            const pageId = payload(created.json)?.browserPageId;
            Object.assign(out.s2Half, { tabCreate: created.ok ? 'created' : created.text, tabCreateMs: created.ms });
            if (pageId) {
                const went = await cli(node.path, env, repo, ready.secrets, ['goto', '--url', pages.url('/s2'), '--page', pageId]);
                const value = payload(went.json);
                Object.assign(out.s2Half, { gotoResult: went.ok ? { url: value?.url, title: value?.title } : null, gotoMs: went.ms, ...(went.ok ? {} : { gotoError: went.text }) });
                if (went.ok && value?.title === titles.s2) out.halvesEndToEnd.push('s2');
            }
            out.s2Half.hostCommands = (await probe(app, 'return { commands: window.__pbS2.commands };'))?.commands ?? [];
            if (!out.halvesEndToEnd.includes('s2')) {
                // Diagnosis only: what the host saw after the goto command.
                out.s2Half.navigateReply = (await probe(app, 'return { reply: window.__pbS2NavigateReply ?? null };'))?.reply;
                out.s2Half.lastPushes = (await pushes(app)).filter(p => p.tabId === tabId).slice(-8).map(p => ({ kind: p.kind, loading: p.loading, url: p.url, title: p.title }));
            }
        });
    } finally {
        await pages.close();
        const { survivors } = await stopOrcad(run.child, ready.daemonPid);
        if (survivors?.length) out.notes.push(`orcad survivors after teardown: ${survivors.join(', ')}`);
        restore();
    }
}

let failure = null;
try { await main(); } catch (e) { failure = redact(e.message ?? String(e)).slice(0, 400); out.notes.push(`error: ${failure}`); }
out.expectedTitles = titles;
out.gotoResult = out.s2Half?.gotoResult ?? out.pbHalf?.gotoResult ?? null;
writeFileSync(join(HERE, 'results-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
const pb = out.halvesEndToEnd.includes('pb');
const s2 = out.halvesEndToEnd.includes('s2');
if (!pb) {
    console.error(`provider-proof: FAIL -- PB half: ${failure ?? `title ${JSON.stringify(out.pbHalf?.gotoResult?.title ?? null)}, expected ${JSON.stringify(titles.pb)}`}`);
    process.exit(1);
}
console.log(`provider-proof: PASS -- PB half end to end (${out.pbHalf.ms} ms); S2 attach ${out.attachOutcome}; S2 half ${s2 ? `end to end through orcad (${out.s2Half.gotoMs} ms)` : `NOT end to end: ${out.s2Half?.gotoError ?? out.s2Half?.tabCreate ?? failure ?? 'attach not accepted'}`}`);
process.exit(0);
