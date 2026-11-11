#!/usr/bin/env node
// scripts/verify-orca-failure-page-live.mjs
//
// orca-failure-page-live (67-03, RUN-06; P67-01, P67-06, P67-07, P67-29, P67-32, P67-36; A-7, A-12; CLAUDE.md
// verification rule 1). Every hosted Orca view shows the PowerBrowser failure page when orcad dies, its port is
// taken, pairing is lost or the browser host cannot attach, and comes back through Orca's own pairing path.
//
// One profile from makeProfile (repo-local once lane p67-04 is merged; a profile under a temporary folder is
// refused by OrcaService as temporary-profile), kept across launches by withShell. Launch 1: OrcaService ready,
// the pane bundle booted, a scratch repository registered with orcad, a hosted chat tab (New Orca Chat) and a
// hosted terminal tab (orca terminal create), and the Orca side panel revealed. Before EVERY induction the
// positive control reads each hosted tab's own pane root: it must show its own Orca content (an xterm, an
// editable field or text inside .pb-orca-pane-host) and no failure page, else the collector is blind.
//   1 restarting      kill -9 of orcad by recorded identity (pid plus start ticks): within 5 s every hosted tab
//                     and the side panel show the restarting sentence; within 60 s the page is gone and each pane
//                     shows its content again (the automatic re-pair, P67-06).
//   2 port-in-use     a clean quit (the layout is saved), a Node listener on 127.0.0.1:<Orca port>, relaunch: the
//                     restored hosted tabs show the port-in-use sentence with Restart Orca and Details; Details
//                     opens chrome's diagnostics layer with a row labelled "Orca failure code" (label read, value
//                     not printed); the listener closes, Restart Orca, the page is gone and content back in 60 s.
//   3 pairing-lost    (auth refusal, A-7) orca-devices.json rewritten as valid JSON without the hosted client's
//                     keyed rows (rows whose parentDeviceId or forkedFrom chain to the row holding the offer's
//                     deviceToken; that row is kept so Reconnect can recover), never deleted or corrupted; orcad
//                     stopped (SIGSTOP) for longer than the client's liveness timeout read from the pinned client
//                     source, then SIGCONT; the pairing-lost sentence with Reconnect; Reconnect brings content
//                     back. No refusal within 60 s is the note "auth-refusal induction not achieved at the pin:
//                     <what was seen>", not a red: induction 4 proves the class.
//   4 pairing-lost    (offer refusal, P67-09) the offer file chmod 0644, the Theia frontend reloaded: pairing-lost
//                     and the chrome row "Orca pairing failure" reading offer-mode; chmod 0600, Reconnect, content.
//   5 browser-not-attached (P67-36) the built pb-browser-host.js moved aside (restored in finally), relaunch: the
//                     sentence with Reconnect and Details and the chrome row labelled "Orca browser host"; the
//                     file restored, Reconnect: the page gone and OrcaBrowserHost attached.
// Every page text read must equal a table value; the expected texts come from orca-failure-copy.ts by type
// stripping, never spelled here.
//
// Runs under flock /home/chris/coding/Power-Browser/.git/pb-live.lock (re-execs itself under
// <git common dir>/pb-live.lock unless PB_LIVE_LOCK_HELD=1), removes every ORCA_* name from its own environment
// first, sets MOZ_PURGE_CACHES=1, prints through installOutputRedaction, signals only recorded identities, and
// reads the offer into memory only to find registry rows; the offer is never printed.
//
// SKIP (one named line, exit 0): no built PowerBrowser (objdir/dist/bin/powerbrowser or PB_FIREFOX_BIN), no built
// orca/ (orca/out/orcad/orcad.js or orca/out/web/assets/pb-panes), or no orca-panes failure folder.
//
// Tier: full. --self-test is quick and pure: pageVerdict, controlVerdict and recoveryVerdict over fixtures.
//
// Usage:
//   node scripts/verify-orca-failure-page-live.mjs
//   node scripts/verify-orca-failure-page-live.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'orca-failure-page-live';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COPY_REL = 'theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts';
const POLICY_REL = 'theia/extensions/orca-panes/src/node/offer-file-policy.ts';
const SIDE_MODULE_REL = 'theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts';
const HEARTBEAT_REL = 'orca/src/renderer/src/web/web-runtime-connection-heartbeat.ts';
const HOST_BUNDLE_REL = 'orca/out/web/assets/pb-panes/pb-browser-host.js';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const SHOW_MS = 5000;
const RECOVER_MS = 60000;

async function importTs(rel) {
  const emit = process.emitWarning;
  process.emitWarning = () => {}; // stripTypeScriptTypes is flagged experimental on Node 24
  try {
    const js = stripTypeScriptTypes(readFileSync(join(REPO_ROOT, rel), 'utf8'));
    return await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  } finally {
    process.emitWarning = emit;
  }
}

// ---------------------------------------------------------------------------
// Pure verdicts (exported for --self-test). An observation of one hosted view:
// { id, kind, page: <class>|null, text: <the page's paragraphs joined by \n>|null, buttons: [labels], content: bool }.

/** The text and buttons a page of class cls must show, from the copy tables. */
export function expectedPage(table, cls) {
  const copy = table.ORCA_FAILURE_COPY[cls];
  if (!copy) return null;
  return {
    text: copy.protection ? `${copy.message}\n${table.ORCA_PROTECTION_SENTENCE}` : copy.message,
    buttons: table.ORCA_FAILURE_BUTTONS[cls].map(id => table.ORCA_BUTTON_LABELS[id]),
  };
}

/** Each view in views shows class cls: its text is a table value and equals the class's, its buttons are the class's, in order. */
export function pageVerdict(views, table, cls) {
  const fails = [];
  const want = expectedPage(table, cls);
  if (!want) return [`page: '${cls}' is not a class of the copy table`];
  if (!views.length) return [`page: no hosted view was read for ${cls}`];
  const tableTexts = new Set(Object.keys(table.ORCA_FAILURE_COPY).map(c => expectedPage(table, c).text));
  for (const v of views) {
    if (v.page === null || v.text === null) {
      fails.push(`page: ${v.id} shows no failure page (expected ${cls})`);
      continue;
    }
    if (!tableTexts.has(v.text)) fails.push(`page: ${v.id} shows a text not in the table`);
    else if (v.text !== want.text) fails.push(`page: ${v.id} shows the ${v.page} text, not ${cls}'s`);
    for (const label of want.buttons) if (!v.buttons.includes(label)) fails.push(`page: ${v.id} is missing the button "${label}" of ${cls}`);
    if (v.buttons.join('|') !== want.buttons.join('|')) {
      const extra = v.buttons.filter(b => !want.buttons.includes(b));
      if (extra.length) fails.push(`page: ${v.id} renders ${extra.map(b => `"${b}"`).join(', ')}, which ${cls} does not`);
      else if (!fails.some(f => f.startsWith(`page: ${v.id} is missing`))) fails.push(`page: ${v.id} renders the buttons of ${cls} out of order`);
    }
  }
  return fails;
}

/** The positive control before an induction: each named view shows its own Orca content and no page. */
export function controlVerdict(views, ids) {
  const fails = [];
  if (!ids.length) return ['control: collector blind -- no hosted view to read'];
  for (const id of ids) {
    const v = views.find(x => x.id === id);
    if (!v) fails.push(`control: collector blind -- ${id} was not found`);
    else if (v.page) fails.push(`control: ${id} already shows the ${v.page} page before the induction`);
    else if (!v.content) fails.push(`control: collector blind -- ${id} showed no Orca content before the induction`);
  }
  return fails;
}

/** Recovery: every named view lost its page and shows content again within boundMs of startedAt. */
export function recoveryVerdict({ label, startedAt, recoveredAt, boundMs }) {
  if (!Number.isFinite(recoveredAt)) return [`recovery: ${label} -- no recovery within ${boundMs} ms`];
  if (recoveredAt - startedAt > boundMs) return [`recovery: ${label} -- recovered after ${recoveredAt - startedAt} ms, over ${boundMs} ms`];
  return [];
}

function runSelfTest(table) {
  const rs = expectedPage(table, 'restarting');
  const pl = expectedPage(table, 'pairing-lost');
  const view = (over = {}) => ({ id: 'orca-pane:chat1', kind: 'agent-session', page: 'restarting', text: rs.text, buttons: rs.buttons, content: false, ...over });
  const content = (over = {}) => ({ id: 'orca-pane:chat1', kind: 'agent-session', page: null, text: null, buttons: [], content: true, ...over });
  const cases = [
    ['a correct restarting page is green', pageVerdict([view()], table, 'restarting'), null],
    ['a text not in the table', pageVerdict([view({ text: 'Orca stopped' })], table, 'restarting'), 'not in the table'],
    ['another class\'s text', pageVerdict([view({ page: 'pairing-lost', text: pl.text })], table, 'restarting'), 'not restarting'],
    ['a missing button', pageVerdict([view({ page: 'pairing-lost', text: pl.text, buttons: ['Details'] })], table, 'pairing-lost'), 'missing the button "Reconnect"'],
    ['an extra button', pageVerdict([view({ buttons: ['Restart Orca', 'Details'] })], table, 'restarting'), 'renders "Restart Orca"'],
    ['no page where one is due', pageVerdict([content()], table, 'restarting'), 'shows no failure page'],
    ['a seeing control is green', controlVerdict([content()], ['orca-pane:chat1']), null],
    ['a blind control', controlVerdict([content({ content: false })], ['orca-pane:chat1']), 'collector blind'],
    ['a control that never found its view', controlVerdict([], ['orca-pane:term1']), 'collector blind'],
    ['a page up before the induction', controlVerdict([content({ page: 'restarting' })], ['orca-pane:chat1']), 'already shows'],
    ['recovery within the bound is green', recoveryVerdict({ label: 'x', startedAt: 0, recoveredAt: 1000, boundMs: 60000 }), null],
    ['no recovery within the bound', recoveryVerdict({ label: 'x', startedAt: 0, recoveredAt: NaN, boundMs: 60000 }), 'no recovery'],
    ['a recovery after the bound', recoveryVerdict({ label: 'x', startedAt: 0, recoveredAt: 61000, boundMs: 60000 }), 'over 60000 ms'],
  ];
  let bad = 0;
  for (const [label, fails, naming] of cases) {
    const ok = naming === null ? fails.length === 0 : fails.some(f => f.includes(naming));
    if (ok) console.log(`  ok  ${label}${naming ? ` -> red: ${fails.find(f => f.includes(naming))}` : ' -> green'}`);
    else {
      console.log(`  FAIL ${label}: ${fails.join(' | ') || 'green'}`);
      bad += 1;
    }
  }
  console.log(bad ? `${NAME} self-test: FAIL -- ${bad} of ${cases.length} case(s)` : `${NAME} self-test: PASS -- ${cases.length} verdict cases, each red naming its fault, controls green`);
  return bad ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Live run.

/** Page-realm source: every view carrying the hosted-pane scope attribute, read as an observation. */
const READ_VIEWS = `return [...document.querySelectorAll('[data-pb-orca-pane]')].filter(el => el.id).map(el => {
    const host = el.querySelector('.pb-orca-pane-host');
    const page = el.querySelector('[data-pb-orca-failure]');
    return {
      id: el.id, kind: el.getAttribute('data-pb-orca-pane'),
      page: page ? page.getAttribute('data-pb-orca-failure') : null,
      text: page ? [...page.querySelectorAll('p')].map(p => p.textContent).join('\\n') : null,
      buttons: page ? [...page.querySelectorAll('button[data-pb-orca-failure-button]')].map(b => b.textContent) : [],
      content: !!host && host.style.display !== 'none' && (host.querySelector('.xterm, textarea, [contenteditable="true"]') !== null || host.textContent.trim().length > 0),
    };
  });`;

const sourceConst = (rel, name) => new RegExp(`${name}\\s*=\\s*'([^']+)'`).exec(readFileSync(join(REPO_ROOT, rel), 'utf8'))?.[1];

/** The client's liveness bound from the pinned source: idle plus probe grace. */
function livenessMs() {
  const src = readFileSync(join(REPO_ROOT, HEARTBEAT_REL), 'utf8');
  const n = name => Number(new RegExp(`${name}\\s*=\\s*([0-9_]+)`).exec(src)?.[1]?.replace(/_/g, ''));
  const ms = n('HEARTBEAT_IDLE_MS') + n('HEARTBEAT_PROBE_GRACE_MS');
  if (!Number.isFinite(ms)) throw new Error(`the client's liveness constants are not in ${HEARTBEAT_REL}`);
  return ms;
}

async function live(table) {
  const { installOutputRedaction, ensurePbNode } = await import('./lib/orca-run.mjs');
  const secrets = [];
  const restoreOutput = installOutputRedaction(secrets);
  const fails = [];
  const notes = [];
  const fail = list => fails.push(...list);
  const hostAside = join(REPO_ROOT, `${HOST_BUNDLE_REL}.pb-aside`);
  let releasePort = null;
  try {
    const OrcaEnv = await import('../powerbrowser/shell/OrcaEnv.sys.mjs');
    const policy = await importTs(POLICY_REL);
    const { makeProfile, withShell, probe, pollFor, holdPort } = await import('./lib/pb-relaunch.mjs');
    const { freePort, startTicks, signalIdentity } = await import('./verify-orca-hidden-electron.mjs');
    process.env.MOZ_PURGE_CACHES = '1';
    const port = await freePort(OrcaEnv);
    const profile = await makeProfile({
      'powerbrowser.orca.root': join(REPO_ROOT, 'orca'),
      'powerbrowser.orca.port': port,
      'powerbrowser.sidecar.nodePath': (await ensurePbNode()).path,
    });
    const containerId = sourceConst(SIDE_MODULE_REL, 'ORCA_LEFT_CONTAINER_ID');
    let chatId = null;
    let termId = null;
    const hostedIds = () => [chatId, termId].filter(Boolean);
    try {
      const session = async fn => withShell(profile, async app => {
        const chromeJson = async expr => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`));
        const orcaState = () => chromeJson(`ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`);
        const views = () => probe(app, READ_VIEWS);
        const click = (id, button) => probe(app, `const b = document.getElementById(${JSON.stringify(id)})?.querySelector('button[data-pb-orca-failure-button=${JSON.stringify(button)}]'); if (!b) return false; b.click(); return true;`);
        const diagnosticsRow = async label => chromeJson(`(() => { const layer = document.getElementById('powerbrowser-diagnostics');
          const rows = [...document.querySelectorAll('#powerbrowser-diagnostics-fields > div')].map(d => d.textContent);
          const row = rows.find(t => t.startsWith(${JSON.stringify(`${label}: `)}));
          return { visible: getComputedStyle(layer).display !== 'none', found: !!row, value: row ? row.slice(${label.length + 2}) : null }; })()`);
        const pagesShow = async (cls, ids, ms) => {
          let last = [];
          try {
            await pollFor(async () => { last = (await views()).filter(v => ids.includes(v.id)); return ids.every(id => last.some(v => v.id === id && v.page === cls)); }, ms, `the ${cls} page`);
          } catch { /* judged below */ }
          return last;
        };
        const recovered = async (label, ids, startedAt) => {
          let at = NaN;
          try {
            await pollFor(async () => { const v = await views(); return ids.every(id => v.some(x => x.id === id && !x.page && x.content)); }, RECOVER_MS, label);
            at = Date.now();
          } catch { /* judged below */ }
          return recoveryVerdict({ label, startedAt, recoveredAt: at, boundMs: RECOVER_MS });
        };
        const ctx = { app, orcaState, views, click, diagnosticsRow, pagesShow, recovered };
        try {
          return await fn(ctx);
        } finally {
          await app.quit().catch(() => undefined);
        }
      });
      const readyOrca = async ctx => {
        const s = await pollFor(async () => { const st = await ctx.orcaState(); return st.state === 'ready' ? st : null; }, 90000, 'OrcaService to reach ready');
        return { ...s, ticks: startTicks(s.pid) };
      };
      const offerPath = async s => OrcaEnv.bridgeFileFor(await OrcaEnv.bridgeDirFor(s.dataRoot, n => process.env[n], 'linux'), 'web-pairing', 'linux');
      const control = async (ctx, label) => {
        const c = controlVerdict(await ctx.views(), hostedIds());
        if (c.length) fail(c.map(f => `${label}: ${f}`));
        return c.length === 0;
      };

      // Launch 1: inductions 1, 3 and 4.
      await session(async ctx => {
        const s = await readyOrca(ctx);
        await probe(ctx.app, `return await until(() => globalThis[Symbol.for('powerbrowser.orca-panes.module')]?.state().booted, 120000);`, 150000);
        const cli = join(s.effectiveRoot, 'cli', 'bin', 'orca');
        const repo = join(profile.profileDir, 'repo');
        execFileSync('bash', ['-c', 'mkdir -p "$1" && cd "$1" && git init -q && git -c user.name=f -c user.email=f@invalid commit -q --allow-empty -m f', '_', repo]);
        const cliEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ORCA_USER_DATA: s.effectiveRoot, ORCA_USER_DATA_PATH: s.effectiveRoot };
        const orca = (...a) => JSON.parse(execFileSync(cli, [...a, '--json'], { env: cliEnv, cwd: repo, encoding: 'utf8', timeout: 60000 }));
        orca('repo', 'add', '--path', repo);
        orca('terminal', 'create', '--worktree', `path:${repo}`);
        await probe(ctx.app, `await get('CommandService').executeCommand('powerbrowser.orca.newChat'); return true;`);
        await probe(ctx.app, `await get('ApplicationShell').revealWidget(${JSON.stringify(containerId)}); return true;`);
        const kinds = await pollFor(async () => {
          const v = await ctx.views();
          const chat = v.find(x => x.kind === 'agent-session' && x.content);
          const term = v.find(x => x.kind === 'terminal' && x.content);
          return chat && term ? { chat: chat.id, term: term.id } : null;
        }, 60000, 'a hosted chat and a hosted terminal with content');
        chatId = kinds.chat;
        termId = kinds.term;

        // 1 restarting
        if (await control(ctx, 'restarting')) {
          // The side panel's views with their own content, read before the induction (their positive control).
          const sideIds = (await ctx.views()).filter(v => !hostedIds().includes(v.id) && v.content).map(v => v.id);
          const t0 = Date.now();
          signalIdentity(s.pid, s.ticks, 'SIGKILL');
          const seen = await ctx.pagesShow('restarting', [...hostedIds(), ...sideIds.slice(0, 1)], SHOW_MS);
          fail(pageVerdict(seen, table, 'restarting').map(f => `restarting: ${f}`));
          if (!sideIds.length) fail(['restarting: the Orca side panel showed no view to read']);
          fail(await ctx.recovered('restarting', hostedIds(), t0));
        }

        // 3 pairing-lost through an auth refusal
        if (await control(ctx, 'auth-refusal')) {
          const st = await readyOrca(ctx);
          const offerText = readFileSync(await offerPath(st), 'utf8').trim();
          secrets.push(offerText);
          const token = policy.decodeOffer(offerText)?.deviceToken;
          if (token) secrets.push(token);
          const registryPath = join(st.dataRoot, 'orca-devices.json');
          const raw = JSON.parse(readFileSync(registryPath, 'utf8'));
          const rows = Array.isArray(raw) ? raw : raw.devices;
          const offerRow = rows?.find(r => r.token === token);
          if (!rows || !offerRow) fail(['auth-refusal: harness -- no registry row holds the offer\'s device token']);
          else {
            const drop = new Set();
            for (let grew = true; grew;) {
              grew = false;
              for (const r of rows) {
                const parent = r.parentDeviceId ?? r.forkedFrom;
                if (!drop.has(r.deviceId) && r !== offerRow && (parent === offerRow.deviceId || drop.has(parent))) { drop.add(r.deviceId); grew = true; }
              }
            }
            const kept = rows.filter(r => !drop.has(r.deviceId));
            writeFileSync(registryPath, JSON.stringify(Array.isArray(raw) ? kept : { ...raw, devices: kept }, null, 2));
            signalIdentity(st.pid, st.ticks, 'SIGSTOP');
            await new Promise(r => setTimeout(r, livenessMs() + 5000));
            signalIdentity(st.pid, st.ticks, 'SIGCONT');
            const seen = await ctx.pagesShow('pairing-lost', hostedIds(), RECOVER_MS);
            if (!seen.every(v => v.page === 'pairing-lost') || !seen.length) {
              notes.push(`auth-refusal induction not achieved at the pin: ${seen.map(v => `${v.id}=${v.page ?? (v.content ? 'content' : 'empty')}`).join(', ') || 'no view read'} (rows removed: ${drop.size})`);
            } else {
              fail(pageVerdict(seen, table, 'pairing-lost').map(f => `auth-refusal: ${f}`));
              const t0 = Date.now();
              await ctx.click(chatId, 'reconnect');
              fail(await ctx.recovered('auth-refusal Reconnect', hostedIds(), t0));
            }
          }
        }

        // 4 pairing-lost through an offer refusal
        if (await control(ctx, 'offer-refusal')) {
          const st = await readyOrca(ctx);
          const file = await offerPath(st);
          try {
            chmodSync(file, 0o644);
            await ctx.app.evaluate('location.reload(); true').catch(() => undefined);
            await pollFor(async () => (await probe(ctx.app, `return get('FrontendApplicationStateService').state === 'ready';`, 20000).catch(() => false)) === true, 120000, 'the reloaded frontend');
            const ids = await pollFor(async () => { const v = await ctx.views(); return v.length ? v.map(x => x.id) : null; }, 60000, 'hosted views after the reload');
            const seen = await ctx.pagesShow('pairing-lost', ids, RECOVER_MS);
            fail(pageVerdict(seen, table, 'pairing-lost').map(f => `offer-refusal: ${f}`));
            await ctx.app.evaluateIn(ctx.app.chrome, 'window.powerbrowserOpenDiagnostics(); true');
            const row = await ctx.diagnosticsRow('Orca pairing failure');
            if (!row.found) fail(['offer-refusal: the diagnostics layer has no "Orca pairing failure" row']);
            else if (row.value !== 'offer-mode') fail([`offer-refusal: the "Orca pairing failure" row reads ${row.value}, not offer-mode`]);
            await ctx.app.evaluateIn(ctx.app.chrome, 'window.powerbrowserHideDiagnostics(); true');
            chmodSync(file, 0o600);
            const t0 = Date.now();
            await ctx.click(ids[0], 'reconnect');
            fail(await ctx.recovered('offer-refusal Reconnect', ids.filter(id => hostedIds().includes(id)), t0));
          } finally {
            if (existsSync(file)) chmodSync(file, 0o600);
          }
        }
      });

      // 2 port-in-use (launch 2, the layout restored)
      releasePort = await holdPort(port);
      await session(async ctx => {
        const ids = await pollFor(async () => { const v = await ctx.views(); return hostedIds().every(id => v.some(x => x.id === id)) ? hostedIds() : null; }, 120000, 'the restored hosted tabs').catch(() => []);
        if (!ids.length) {
          fail(['port-in-use: control: collector blind -- the hosted tabs were not restored']);
          return;
        }
        const seen = await ctx.pagesShow('port-in-use', ids, 90000);
        fail(pageVerdict(seen, table, 'port-in-use').map(f => `port-in-use: ${f}`));
        await ctx.click(ids[0], 'details');
        const row = await pollFor(async () => { const r = await ctx.diagnosticsRow('Orca failure code'); return r.visible ? r : null; }, 5000, 'the diagnostics layer').catch(() => ({ visible: false, found: false }));
        if (!row.visible) fail(['port-in-use: Details did not open the diagnostics layer']);
        else if (!row.found) fail(['port-in-use: the diagnostics layer has no "Orca failure code" row']);
        await ctx.app.evaluateIn(ctx.app.chrome, 'window.powerbrowserHideDiagnostics(); true');
        await releasePort();
        releasePort = null;
        const t0 = Date.now();
        await ctx.click(ids[0], 'restart');
        fail(await ctx.recovered('port-in-use Restart Orca', ids, t0));
      });

      // 5 browser-not-attached (launch 3, the host bundle moved aside)
      renameSync(join(REPO_ROOT, HOST_BUNDLE_REL), hostAside);
      await session(async ctx => {
        await readyOrca(ctx);
        const ids = await pollFor(async () => { const v = await ctx.views(); return v.length ? v.map(x => x.id) : null; }, 120000, 'hosted views').catch(() => []);
        const seen = await ctx.pagesShow('browser-not-attached', ids, 90000);
        fail(pageVerdict(seen, table, 'browser-not-attached').map(f => `browser-not-attached: ${f}`));
        await ctx.app.evaluateIn(ctx.app.chrome, 'window.powerbrowserOpenDiagnostics(); true');
        if (!(await ctx.diagnosticsRow('Orca browser host')).found) fail(['browser-not-attached: the diagnostics layer has no "Orca browser host" row']);
        await ctx.app.evaluateIn(ctx.app.chrome, 'window.powerbrowserHideDiagnostics(); true');
        renameSync(hostAside, join(REPO_ROOT, HOST_BUNDLE_REL));
        const t0 = Date.now();
        if (ids.length) await ctx.click(ids[0], 'reconnect');
        fail(await ctx.recovered('browser-not-attached Reconnect', ids.filter(id => hostedIds().includes(id)), t0));
        const host = await probe(ctx.app, `return get('OrcaBrowserHost').state;`);
        if (host !== 'attached') fail([`browser-not-attached: OrcaBrowserHost is ${JSON.stringify(host)} after Reconnect, not attached`]);
      });
    } finally {
      await profile.dispose();
    }
  } catch (err) {
    fails.push(`harness: ${err?.message ?? err}`);
  } finally {
    if (releasePort) await releasePort();
    if (existsSync(hostAside)) renameSync(hostAside, join(REPO_ROOT, HOST_BUNDLE_REL));
    for (const n of notes) console.log(`${NAME}: note -- ${n}`);
    for (const f of fails) console.log(`${NAME}: FAIL -- ${f}`);
    console.log(fails.length ? `${NAME}: FAIL -- ${fails.length} failure(s)` : `${NAME}: PASS -- every hosted view showed the PowerBrowser page for each induced class and recovered`);
    restoreOutput();
  }
  return fails.length ? 1 : 0;
}

function skipReason() {
  const bin = process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser');
  if (!existsSync(bin)) return 'no built PowerBrowser (objdir/dist/bin/powerbrowser or PB_FIREFOX_BIN)';
  if (!existsSync(join(REPO_ROOT, 'orca/out/orcad/orcad.js')) || !existsSync(join(REPO_ROOT, 'orca/out/web/assets/pb-panes'))) return 'no built orca/ (orca/out/orcad/orcad.js, orca/out/web/assets/pb-panes)';
  if (!existsSync(join(REPO_ROOT, COPY_REL))) return `no ${COPY_REL}`;
  return null;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--self-test')) {
    console.log(`${NAME}: FAIL -- unknown argument ${args.find(a => a !== '--self-test')}`);
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(runSelfTest(await importTs(COPY_REL)));
  const skip = skipReason();
  if (skip) {
    console.log(`${NAME}: SKIP -- ${skip}`);
    process.exit(0);
  }
  if (process.env.PB_LIVE_LOCK_HELD !== '1') {
    const common = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const r = spawnSync('flock', [join(common, 'pb-live.lock'), process.execPath, fileURLToPath(import.meta.url), ...args],
      { stdio: 'inherit', env: { ...process.env, PB_LIVE_LOCK_HELD: '1' } });
    process.exit(r.status ?? 1);
  }
  for (const key of Object.keys(process.env)) if (key.startsWith('ORCA_')) delete process.env[key];
  process.exit(await live(await importTs(COPY_REL)));
}
