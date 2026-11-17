#!/usr/bin/env node
// scripts/verify-orca-terminal-keys-live.mjs
//
// orca-terminal-keys-live (Phase 64, TERM-04 live, criterion 7; D-32, P64-33;
// interfaces C10', C13): D-32 measured in one PowerBrowser session. In a hosted
// Orca terminal and in a Theia t<n> terminal, Ctrl+W and Ctrl+T reach the shell
// with the tab count and the active tab unchanged; Ctrl+Tab, Ctrl+Shift+Tab,
// Ctrl+PageUp and Ctrl+PageDown switch the active PowerBrowser tab from both
// terminals and from a web tab, and reach neither PTY; Ctrl+Shift+W closes the
// current tab from Theia focus (a t<n> tab closes; a hosted Orca terminal running
// a process shows Orca's own running-terminal confirmation, or closes).
//
// Ported from refs/heads/ServerDestroyer/p63-05:scripts/verify-orca-terminal-keys-live.mjs
// by reading it and writing it again (never merged). Kept: the in-session
// control, keySpecFor, visibleFormFor, segmentsOf, the raw-mode cat -v probe
// command and the import-silence self-test.
//
// One PowerBrowser session (scripts/lib/orca-tabs-live.mjs):
//  1. Control, before any Orca terminal tab exists: each key is pressed in a t<n>
//     terminal tab running a raw-mode cat -v recorder and in a web tab; the
//     effect is recorded (tab count change over the main and bottom areas,
//     whether the active widget changed, and for t<n> the bytes the recorder
//     saw) and judged by D-32: in t<n> the shell keys put ^W and ^T in the
//     recorder with nothing switched, the switch keys switch with no recorder
//     bytes, the close key closes the tab; in the web tab the switch keys switch.
//  2. Only when the prerequisites hold (orca-panes merged and wired, orcad and
//     the pane bundle built): an Orca terminal created through orcad's CLI runs
//     the same recorder, its hosted tab is focused and each key is pressed with
//     a typed separator. orcad's terminal read must show ^W and ^T with the tab
//     count and active widget unchanged; each switch key must switch the active
//     widget with an empty segment, judged only when every shell-key segment was
//     read (the PTY read proven first, CLAUDE.md verification rule 1). The close
//     key, pressed last, must dispose the hosted widget or open Orca's
//     running-terminal confirmation (detected positively, as orca-tabs-live
//     stage j does); the check then cancels and closes the terminal through the
//     CLI. While theia/extensions/orca-panes is absent this stage prints its
//     named SKIP.
//  2b. Paste (owner ruling 2026-11-17, "Limit the hook to Orca panes"). With a
//     sentinel on the system selection, a trusted middle-click into a
//     contenteditable in the Theia document must insert exactly the sentinel,
//     first at Orca's default setting (the web client stores Middle-click Paste
//     from Selection off: its platform default reads process.platform, which a
//     browser lacks, so the hook's Linux opt-out path runs), then after Orca's
//     own switch is turned on in its hosted Settings. With it on, a second CLI
//     terminal prints a token alone on its cleared first row (the command line
//     holds only its halves); a trusted drag across that row selects it and a
//     trusted middle-click in the terminal must paste it there exactly once
//     (orcad's read holds it printed + 1), with no sentinel in the PTY.
//  3. The t<n> and web tabs are measured again and each key's effect must
//     equal the control.
//  Why an in-session control stands in for P63-25's control taken before the
//  Orca extension is loaded: orca-terminal-keys proves statically that every
//  passthrough row's when clause is the scoped key powerbrowser.orcaTerminalFocus,
//  created only on hosted terminal nodes, so outside one the rows are inert.
//  Measuring again after a hosted terminal had focus catches a key left set on
//  another widget. This substitution is an owner-review item (64-04-SUMMARY).
//
// Keys, derived at check time: the shell, switch and close keys from
// verify-orca-terminal-keys.mjs's derivation over the reserved PAGE_KEYS rows;
// with orca-panes present, ORCA_TERMINAL_PASSTHROUGH_KEYS must equal the shell
// keys. Each key's visible form from its name. TERMINAL_NAME_PATTERN from
// tab-uris' terminal-naming-contribution.ts.
//
// Run under the live lock with this shell's ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-terminal-keys-live.mjs
// It signals only identities it recorded; the Orca CLI gets an environment built
// from scratch. No pairing value, env value or token is printed.
//
// Tier: full. --self-test is quick: the pure verdicts over fixture
// observations, the derivations over fixture sources, plus a child Node that
// imports this module and must stay silent.
//
// Usage:
//   node scripts/verify-orca-terminal-keys-live.mjs
//   node scripts/verify-orca-terminal-keys-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-terminal-keys-live';
const SELF_REL = 'scripts/verify-orca-terminal-keys-live.mjs';
const PROTOCOL_REL = 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts';
const ORCA_PANES_REL = 'theia/extensions/orca-panes';
const NAMING_REL = 'theia/extensions/tab-uris/src/browser/terminal-naming-contribution.ts';
const PAGE_KEYS_REL = 'powerbrowser/shell/powerbrowser.js';
const INPUT_PANE_REL = 'orca/src/renderer/src/components/settings/input/InputPane.tsx';
const SETTINGS_SECTIONS_REL = 'orca/src/renderer/src/components/settings/page/settings-interface-secondary-section-renderers.tsx';
const WORK_REL = '.mozbuild/orca-terminal-keys-live';
// Raw mode so ^W reaches cat instead of the line discipline's word erase.
export const PROBE_COMMAND = 'stty -icanon -echo -isig -iexten; exec cat -v';
const sep = (i) => `@K${i}@`;
const READY_MARK = '@READY@';
/** Orca's confirmation dialog, as orca-tabs-live stage j detects it. */
const CONFIRMATION_SELECTOR = 'body > [data-radix-popper-content-wrapper] [role="dialog"], body > [data-radix-popper-content-wrapper] [role="alertdialog"], body > [role="dialog"], body > [role="alertdialog"], body > div [role="alertdialog"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// ---------------------------------------------------------------------------
// Check-time reads.

/** The string literals of ORCA_TERMINAL_PASSTHROUGH_KEYS, or null when the declaration is absent. */
export function readPassthroughKeys(text) {
    const at = String(text ?? '').search(/export\s+const\s+ORCA_TERMINAL_PASSTHROUGH_KEYS\b/);
    if (at < 0) return null;
    // After the '=', so a type annotation's brackets (readonly string[]) are not taken for the array.
    const open = text.indexOf('[', text.indexOf('=', at));
    const close = text.indexOf(']', open);
    if (open < 0 || close < 0) return null;
    return [...text.slice(open, close).matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
}

/** The exported regex literal `name` of a source, or null. */
export function readPattern(text, name) {
    const m = new RegExp(`export\\s+const\\s+${name}\\b[^=]*=\\s*\\/((?:\\\\.|[^/\\n])+)\\/([a-z]*)`).exec(String(text ?? ''));
    return m ? new RegExp(m[1], m[2]) : null;
}

const NAMED_KEYS = { tab: ['Tab', 'Tab', 9], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34] };
/** A Theia key string (ctrl+shift+tab) as a pressKey spec, or null when it cannot be mapped. */
export function keySpecFor(theiaKey) {
    const parts = String(theiaKey).toLowerCase().split('+');
    const base = parts.pop();
    const modifiers = parts.map((p) => (p === 'ctrl' ? 'control' : p));
    if (modifiers.some((m) => !['control', 'shift', 'alt', 'meta'].includes(m))) return null;
    if (/^[a-z]$/.test(base)) return { key: base, code: `Key${base.toUpperCase()}`, keyCode: base.toUpperCase().charCodeAt(0), modifiers };
    const named = NAMED_KEYS[base];
    return named ? { key: named[0], code: named[1], keyCode: named[2], modifiers } : null;
}

/** What cat -v prints for a ctrl+<letter> key (^W), or null when only a non-empty sequence is required. */
export function visibleFormFor(theiaKey) {
    const m = /^ctrl\+([a-z])$/.exec(String(theiaKey).toLowerCase());
    return m ? `^${m[1].toUpperCase()}` : null;
}

/** The text between separator i and i+1 for each key, from orcad's terminal read. A missing separator gives null. */
export function segmentsOf(text, keys) {
    return keys.map((_, i) => {
        const a = text.indexOf(sep(i));
        const b = text.indexOf(sep(i + 1), a + 1);
        return a < 0 || b < 0 ? null : text.slice(a + sep(i).length, b);
    });
}

/**
 * D-32's keys from the static check's derivation; with orca-panes present its passthrough list must equal the shell
 * keys. Resolves { keys (shell, switch, close in that order), shell, switch, close, userName }.
 */
export async function readKeys(root = REPO_ROOT) {
    const userName = readPattern(read(join(root, NAMING_REL)), 'TERMINAL_NAME_PATTERN');
    if (!userName) throw new Error(`${NAMING_REL} exports no TERMINAL_NAME_PATTERN`);
    const { loadTypeScript, deriveD32 } = await import('./verify-orca-terminal-keys.mjs');
    if (!loadTypeScript()) throw new Error('theia/node_modules/typescript is absent, so PAGE_KEYS cannot be derived; run the audited Theia install');
    const d = deriveD32(read(join(root, PAGE_KEYS_REL)) ?? '');
    if (d.fails.length) throw new Error(d.fails.join('; '));
    if (existsSync(join(root, ORCA_PANES_REL))) {
        const passthrough = readPassthroughKeys(read(join(root, PROTOCOL_REL)));
        if (!passthrough) throw new Error(`${PROTOCOL_REL} exports no ORCA_TERMINAL_PASSTHROUGH_KEYS while ${ORCA_PANES_REL} is present`);
        if ([...passthrough].sort().join() !== [...d.shell].sort().join()) throw new Error(`ORCA_TERMINAL_PASSTHROUGH_KEYS (${passthrough.join(', ')}) differs from the shell keys (${d.shell.join(', ')}); orca-terminal-keys is red`);
    }
    const keys = [...d.shell, ...d.switch, d.close];
    const unmapped = keys.filter((k) => !keySpecFor(k));
    if (unmapped.length) throw new Error(`unmapped key ${unmapped.join(', ')} in the D-32 keys`);
    return { keys, shell: d.shell, switch: d.switch, close: d.close, userName };
}

// ---------------------------------------------------------------------------
// Pure verdicts (the self-test's subject). Each returns red reasons.

/** Stage 1 (D-32 in t<n> and the web tab). obs: { keys, shell, switch, close, control: { term, web } }. */
export function controlVerdict(obs) {
    if (!obs.keys?.length) return ['no keys were read, so nothing was pressed'];
    const missing = obs.keys.filter((k) => !obs.control?.term?.[k] || !obs.control?.web?.[k]);
    if (missing.length) return [`control incomplete: no effect recorded for ${missing.join(', ')} in the t<n> terminal or the web tab`];
    const fails = [];
    const term = obs.control.term;
    for (const key of obs.shell) {
        const e = term[key];
        if (!String(e.bytes ?? '').includes(visibleFormFor(key) ?? '\0')) fails.push(`${visibleFormFor(key)} missing: ${key} pressed in the t<n> terminal did not reach its shell (recorder read ${JSON.stringify(e.bytes)})`);
        if (e.tabDelta !== 0 || e.activeChanged) fails.push(`${key} closed or switched a tab from the t<n> terminal (tab count change ${e.tabDelta}, active widget changed ${e.activeChanged})`);
    }
    for (const key of obs.switch) {
        const e = term[key];
        if (e.bytes) fails.push(`${key} reached the t<n> PTY (recorder read ${JSON.stringify(e.bytes)}); D-32 switch keys reach no PTY`);
        if (e.tabDelta !== 0 || !e.activeChanged) fails.push(`${key} did not switch the PowerBrowser tab from the t<n> terminal (tab count change ${e.tabDelta}, active widget changed ${e.activeChanged})`);
        const w = obs.control.web[key];
        if (w.tabDelta !== 0 || !w.activeChanged) fails.push(`${key} did not switch the PowerBrowser tab from the web tab (tab count change ${w.tabDelta}, active widget changed ${w.activeChanged})`);
    }
    if (term[obs.close].tabDelta !== -1) fails.push(`${obs.close} did not close the t<n> terminal tab (tab count change ${term[obs.close].tabDelta})`);
    return fails;
}

/**
 * Stage 2. obs: { shell, switch, close, orca: { tab, text, effects: { key: { tabDelta, activeChanged } }, closed: { disposed, dialog } } }.
 * The text holds a separator before each shell and switch key and one after the last of them.
 */
export function orcaStageVerdict(obs) {
    const fails = [];
    if (!obs.orca) return ['stage 2 not measured'];
    if (!obs.orca.tab) return ['hosted terminal tab missing: the CLI-created Orca terminal produced no hosted widget'];
    const ptyKeys = [...obs.shell, ...obs.switch];
    const segments = segmentsOf(obs.orca.text ?? '', ptyKeys);
    obs.shell.forEach((key, i) => {
        const form = visibleFormFor(key);
        const seg = segments[i];
        if (seg === null) fails.push(`separators around ${key} are missing from orcad's terminal read, so the hosted terminal did not get the typed text`);
        else if (!seg.includes(form)) fails.push(`${form} missing: ${key} pressed in the hosted Orca terminal did not reach the PTY (read ${JSON.stringify(seg)})`);
        const e = obs.orca.effects?.[key];
        if (!e || e.tabDelta !== 0 || e.activeChanged) fails.push(`${key} closed or switched a tab in the hosted Orca terminal (tab count change ${e?.tabDelta}, active widget changed ${e?.activeChanged})`);
    });
    const proven = obs.shell.every((_, i) => segments[i] !== null);
    if (!proven) fails.push('switch keys not judged: the shell-key segments were not all read, so an empty switch-key segment would prove nothing');
    else {
        obs.switch.forEach((key, j) => {
            const seg = segments[obs.shell.length + j];
            if (seg === null) fails.push(`separators around ${key} are missing from orcad's terminal read`);
            else if (seg.length) fails.push(`${key} reached the hosted Orca terminal's PTY (read ${JSON.stringify(seg)}); D-32 switch keys reach no PTY`);
            const e = obs.orca.effects?.[key];
            if (!e || e.tabDelta !== 0 || !e.activeChanged) fails.push(`${key} did not switch the PowerBrowser tab from the hosted Orca terminal (tab count change ${e?.tabDelta}, active widget changed ${e?.activeChanged})`);
        });
    }
    const c = obs.orca.closed;
    if (!c || (!c.disposed && !c.dialog)) fails.push(`${obs.close} in the hosted Orca terminal neither closed it nor opened Orca's running-terminal confirmation`);
    return fails;
}

/** Orca's "Middle-click Paste from Selection" switch label and its Settings section title, from the pinned sources. */
export function readPasteSetting(inputPane, sections) {
    return {
        label: /aria-label=\{translate\(\s*'[^']+',\s*'([^']+)'/.exec(inputPane ?? '')?.[1] ?? null,
        section: /id="input"\s+title=\{translate\(\s*'[^']+',\s*'([^']+)'/.exec(sections ?? '')?.[1] ?? null,
    };
}

/**
 * Stage 2b. obs.paste: { token, tab, printed, count, terminalSentinel, setting: { before, checked } | { error },
 * theia: { off: { sentinel, clip, text }, on: { sentinel, clip, text } } }.
 */
export function pasteVerdict(obs) {
    const p = obs.paste;
    if (!p) return ['paste leg not measured'];
    const fails = [];
    const theiaLeg = (leg, state) => {
        if (!leg) fails.push(`paste leg: the Theia editable was not measured with Orca's setting ${state}`);
        else if (leg.clip !== 'ok') fails.push(`paste leg: NOT SCORED -- the system selection could not be written (${leg.clip})`);
        else if ((leg.text ?? '').trim() !== leg.sentinel) fails.push(`paste leg: with Orca's selection paste ${state}, a middle-click into a Theia editable inserted ${JSON.stringify(leg.text)}, not the system selection ${JSON.stringify(leg.sentinel)} (Orca's paste must act only in its panes)`);
    };
    theiaLeg(p.theia?.off, 'at its default');
    if (!p.setting || p.setting.error || p.setting.checked !== true) {
        fails.push(`paste leg: Orca's Middle-click Paste from Selection switch could not be turned on in its hosted Settings (${JSON.stringify(p.setting)})`);
        return fails;
    }
    if (!p.tab) return [...fails, 'paste leg: the CLI-created paste terminal produced no hosted widget'];
    if (!p.printed) return [...fails, 'paste leg: the token the paste terminal printed never reached orcad\'s terminal read, so a paste count proves nothing'];
    const pasted = p.count - p.printed;
    if (pasted !== 1) fails.push(`paste leg: a middle-click in the hosted Orca terminal after selecting its token pasted it ${pasted} time(s), want once (Orca's selection paste in its own terminal)`);
    if (p.terminalSentinel) fails.push('paste leg: the system selection reached the hosted Orca terminal\'s PTY');
    theiaLeg(p.theia?.on, 'on');
    return fails;
}

const sameEffect = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Stage 3. obs: { keys, control: { term, web }, after: { term, web } }. */
export function repeatVerdict(obs) {
    const fails = [];
    for (const key of obs.keys) {
        if (!sameEffect(obs.after?.term?.[key], obs.control?.term?.[key])) fails.push(`${key} in the t<n> tab differs from the control: ${JSON.stringify(obs.after?.term?.[key])} now, ${JSON.stringify(obs.control?.term?.[key])} in the control`);
        if (!sameEffect(obs.after?.web?.[key], obs.control?.web?.[key])) fails.push(`${key} in the web tab differs from the control: ${JSON.stringify(obs.after?.web?.[key])} now, ${JSON.stringify(obs.control?.web?.[key])} in the control`);
    }
    return fails;
}

/** The last line: a stage-2 SKIP counts only while orca-panes is absent; a SKIP with it present is red. */
export function overallVerdict({ control, stage2, stage2Skip, panesPresent, repeat }) {
    const fails = [...control, ...repeat];
    if (stage2Skip) {
        if (panesPresent) fails.push(`stage 2 skipped while ${ORCA_PANES_REL} is present (${stage2Skip})`);
    } else fails.push(...stage2);
    return fails;
}

/** obs: { exitCode, stdout, stderr, timedOut, startedProcess } of a child Node that only imported this module. */
export function importSilenceVerdict(obs) {
    const what = [];
    if (obs.timedOut) what.push('did not finish within 10 s');
    if (obs.exitCode !== 0) what.push(`exited ${obs.exitCode}`);
    if (obs.stdout) what.push(`printed ${JSON.stringify(String(obs.stdout).slice(0, 80))}`);
    if (obs.stderr) what.push(`wrote ${JSON.stringify(String(obs.stderr).slice(0, 80))} to stderr`);
    if (obs.startedProcess) what.push('started a process');
    return what.length ? [`side effect on import: importing ${SELF_REL} ${what.join(', ')}`] : [];
}

// ---------------------------------------------------------------------------
// Live.

/** One key's effect in the active tab: tab count change, active change and (t<n>) the bytes the recorder saw. */
async function effectOf(ctx, spec, recorderFile) {
    const before = await ctx.tabState();
    const size = recorderFile ? (read(recorderFile) ?? '').length : 0;
    await ctx.pressKey(spec);
    await sleep(400);
    const after = await ctx.tabState();
    const effect = { tabDelta: after.ids.length - before.ids.length, activeChanged: after.active !== before.active };
    if (recorderFile) effect.bytes = (read(recorderFile) ?? '').slice(size);
    return effect;
}

/** Trusted pointer input (BiDi) in `context`, released after. */
async function pointer(app, context, actions) {
    await app.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'pb-paste-mouse', parameters: { pointerType: 'mouse' }, actions }] });
    await app.send('input.releaseActions', { context });
}
const moveTo = (x, y) => ({ type: 'pointerMove', x: Math.round(x), y: Math.round(y) });
const middleClick = (x, y) => [moveTo(x, y), { type: 'pointerDown', button: 1 }, { type: 'pointerUp', button: 1 }, { type: 'pause', duration: 300 }];

/** Chrome scope: puts `text` on the system selection, the source of a native middle-click paste; 'ok' or 'error: ...'. */
const setSelection = (app, text) => app.evaluateIn(app.chrome, `(() => {
    try {
        Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper)
            .copyStringToClipboard(${JSON.stringify(text)}, Ci.nsIClipboard.kSelectionClipboard);
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})()`);

/** Middle-clicks a fresh contenteditable in the Theia document with `sentinel` on the system selection; { sentinel, clip, text }. */
async function theiaPaste(ctx, theia, sentinel) {
    const clip = await setSelection(ctx.app, sentinel);
    const ed = await ctx.probe(`const ed = document.createElement('div');
        ed.id = 'pb-paste-theia'; ed.contentEditable = 'true';
        Object.assign(ed.style, { position: 'fixed', left: '40%', top: '60%', width: '240px', height: '40px', zIndex: '99999', background: '#fff' });
        document.body.appendChild(ed); ed.focus();
        const r = ed.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    await pointer(ctx.app, theia, middleClick(ed.x, ed.y));
    await sleep(500);
    const text = await ctx.probe(`const ed = document.getElementById('pb-paste-theia'); const t = ed ? ed.textContent : null; if (ed) ed.remove(); return t;`);
    return { sentinel, clip, text };
}

/** Sets Orca's own switch in its hosted Settings (Orca mode's Settings part), as a user does; { before, checked } or { error }. */
async function setPasteSetting(ctx, want) {
    const { label, section } = readPasteSetting(read(join(REPO_ROOT, INPUT_PANE_REL)), read(join(REPO_ROOT, SETTINGS_SECTIONS_REL)));
    if (!label || !section) return { error: `source moved: no switch label in ${INPUT_PANE_REL} or no input section title in ${SETTINGS_SECTIONS_REL}` };
    return ctx.probe(`const mode = document.body.getAttribute('data-pb-mode');
        await get('ModeService').activateMode('orca');
        try {
            const wm = get('WidgetManager');
            const c = wm.tryGetWidget('powerbrowser-orca-view-container');
            const part = wm.tryGetWidget('powerbrowser-orca-settings-view');
            if (!c || !part) return { error: 'no hosted Orca Settings part' };
            for (const p of c.getParts()) p.collapsed = false;
            c.activateWidget(part.id);
            const find = () => part.node.querySelector('[aria-label=${JSON.stringify(label)}]');
            if (!find()) {
                await until(() => [...part.node.querySelectorAll('button, a')].some(e => e.textContent.trim() === ${JSON.stringify(section)}), 15000);
                const nav = [...part.node.querySelectorAll('button, a')].find(e => e.textContent.trim() === ${JSON.stringify(section)});
                if (nav) nav.click();
            }
            if (!(await until(find, 10000))) return { error: 'switch not found' };
            const on = () => find().getAttribute('aria-checked') === 'true';
            const before = on();
            if (before !== ${want}) find().click();
            await until(() => on() === ${want}, 5000);
            return { before, checked: on() };
        } finally {
            if (mode) await get('ModeService').activateMode(mode);
        }`);
}

/** Stage 2b (header). Resolves pasteVerdict's observation; closes its terminal through the CLI. */
export async function pasteLeg(ctx, lib) {
    const n = String(Date.now()).slice(-6);
    const out = { token: `@P${n}P@`, tab: null, printed: 0, count: 0, terminalSentinel: false, setting: null, theia: { off: null, on: null } };
    const href = await ctx.app.evaluate('location.href');
    const theia = (await ctx.app.contexts()).find((c) => c.url === href)?.context;
    if (!theia) throw new Error('harness: no BiDi context for the Theia frame');
    await ctx.focusTheiaFrame();
    out.theia.off = await theiaPaste(ctx, theia, `pb-paste-default-${n}`);
    out.setting = await setPasteSetting(ctx, true);
    if (out.setting?.checked !== true) return out;
    const before = await lib.hostedIds(ctx);
    const t0 = Date.now();
    const created = ctx.orca('terminal', 'create', '--worktree', ctx.worktree, '--command', `printf '\\033[2J\\033[H@P%sP@\\n' ${n}; ${PROBE_COMMAND}`);
    const handle = created?.result?.terminal?.handle;
    if (!handle) throw new Error('the Orca CLI created the paste terminal but returned no handle');
    try {
        out.tab = (await lib.waitForHostedAdd(ctx, t0, before, 30000))?.id ?? null;
        if (!out.tab) return out;
        const tokens = () => lib.terminalText(ctx, handle).split(out.token).length - 1;
        out.printed = await ctx.pollFor(async () => tokens() || null, 15000, 'the printed token').catch(() => 0);
        await ctx.focusTheiaFrame();
        await ctx.activate(out.tab);
        const screen = await ctx.probe(`const shell = get('ApplicationShell');
            const s = () => { const w = shell.getWidgetById(${JSON.stringify(out.tab)}); return w && w.isVisible && w.node.querySelector('.xterm-screen'); };
            if (!(await until(s, 15000))) { const w = shell.getWidgetById(${JSON.stringify(out.tab)}); return { error: 'no visible .xterm-screen', area: w ? shell.getAreaFor(w) : null, visible: !!(w && w.isVisible), mode: document.body.getAttribute('data-pb-mode') }; }
            const r = s().getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };`);
        if (screen?.error) throw new Error(`harness: ${out.tab}: ${JSON.stringify(screen)} (Orca's switch ${JSON.stringify(out.setting)})`);
        // Row 0 holds only the token, so a drag across the row selects exactly the token.
        const y0 = screen.top + 4;
        await pointer(ctx.app, theia, [moveTo(screen.left + 2, y0), { type: 'pointerDown', button: 0 }, moveTo((screen.left + screen.right) / 2, y0), moveTo(screen.right - 4, y0), { type: 'pointerUp', button: 0 }]);
        await sleep(500); // Orca stores a terminal selection 100 ms after it settles
        await pointer(ctx.app, theia, middleClick((screen.left + screen.right) / 2, (screen.top + screen.bottom) / 2));
        await ctx.pollFor(async () => tokens() > out.printed || null, 5000, 'the pasted token').catch(() => null);
        await sleep(700); // a second, native paste would have landed by now
        out.count = tokens();
        out.theia.on = await theiaPaste(ctx, theia, `pb-paste-on-${n}`);
        const text = lib.terminalText(ctx, handle);
        out.terminalSentinel = text.includes(out.theia.off.sentinel) || text.includes(out.theia.on.sentinel);
        return out;
    } finally {
        try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { ctx.log(`note -- the CLI close of the paste terminal failed: ${err.message}`); }
    }
}

async function waitForWidget(ctx, pattern, except, ms = 30000) {
    return ctx.pollFor(async () => (await ctx.tabState()).ids.find((id) => pattern.test(id) && !except.includes(id)) ?? null, ms, `a main-area widget matching ${pattern}`);
}

async function run({ log }) {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const base = lib.prerequisites({ needPanes: false });
    if (base.skip) return { skip: base.skip };
    const orcaPrereq = lib.prerequisites({ needOrca: true });
    const panesPresent = existsSync(join(REPO_ROOT, ORCA_PANES_REL));
    const { keys, userName, ...sets } = await readKeys();
    const obs = { keys, shell: sets.shell, switch: sets.switch, close: sets.close, control: { term: {}, web: {} }, orca: null, after: { term: {}, web: {} } };
    const work = join(REPO_ROOT, WORK_REL);
    mkdirSync(work, { recursive: true });
    let stage2Skip = orcaPrereq.skip;
    let stage2Fail = orcaPrereq.fail;
    await lib.withOrcaTabsSession({ log, needOrca: !orcaPrereq.skip && !orcaPrereq.fail }, async (ctx) => {
        const pages = await ctx.serveNavPages({ '/k': { title: 'keys control', body: '<p>keys control page</p>' } });
        try {
            let term = null;
            let web = null;
            let webTabId = null;
            let recorder = null;
            let hosted = null;
            // The tabs the session opened with; a key's stray tab is anything else.
            const baseline = (await ctx.tabState()).ids;
            // (Re)creates the t<n> recorder and the web tab when a key closed one, and closes any tab a key opened.
            const fixtures = async () => {
                const ids = (await ctx.tabState()).ids;
                if (!term || !ids.includes(term)) {
                    const before = (await ctx.tabState()).ids;
                    await ctx.command('terminal:new');
                    term = await waitForWidget(ctx, userName, before);
                    recorder = join(work, `${term}-${Date.now()}.bytes`);
                    if (!(await ctx.sendText(term, `stty -icanon -echo -isig -iexten; cat -v > ${recorder}\r`))) throw new Error(`harness: ${term} takes no text`);
                    await ctx.pollFor(async () => existsSync(recorder), 10000, 'the t<n> recorder file');
                }
                if (!web || !ids.includes(web)) {
                    webTabId = await ctx.openWebTab(pages.url('/k'));
                    web = (await ctx.tabState()).ids.find((id) => id.endsWith(`:${webTabId}`)) ?? null;
                    if (!web) throw new Error('harness: the opened web tab has no main-area widget');
                }
                const known = [...baseline, term, web, ...(hosted ? [hosted] : [])];
                await ctx.probe(`const shell = get('ApplicationShell');
                    for (const w of [...shell.getWidgets('main'), ...shell.getWidgets('bottom')]) if (!${JSON.stringify(known)}.includes(w.id)) w.close();
                    return true;`);
            };
            const measure = async (into) => {
                for (const key of keys) {
                    await fixtures();
                    await ctx.focusTheiaFrame();
                    await ctx.activate(term);
                    into.term[key] = await effectOf(ctx, keySpecFor(key), recorder);
                    await fixtures();
                    await ctx.activate(web);
                    await ctx.focusOverlay(webTabId);
                    into.web[key] = await effectOf(ctx, keySpecFor(key), null);
                }
            };
            await measure(obs.control);
            log(`control: ${keys.length} keys measured in a t<n> terminal and a web tab (shell ${sets.shell.join(', ')}; switch ${sets.switch.join(', ')}; close ${sets.close})`);

            if (!stage2Skip && !stage2Fail) {
                obs.orca = { tab: null, text: '', effects: {}, closed: null };
                const before = await lib.hostedIds(ctx);
                const t0 = Date.now();
                const created = ctx.orca('terminal', 'create', '--worktree', ctx.worktree, '--command', PROBE_COMMAND);
                const handle = created?.result?.terminal?.handle;
                if (!handle) throw new Error('the Orca CLI created a terminal but returned no handle');
                const added = await lib.waitForHostedAdd(ctx, t0, before, 30000);
                hosted = added?.id ?? null;
                obs.orca.tab = hosted;
                if (hosted) {
                    // The recorder must be reading before the first separator: until the shell has run the probe command,
                    // typed text lands on the shell's command line. A ready marker is typed until cat -v echoes it.
                    let ready = false;
                    for (let attempt = 0; attempt < 15 && !ready; attempt++) {
                        await ctx.focusTheiaFrame();
                        await ctx.activate(hosted);
                        await ctx.typeText(READY_MARK);
                        // After the shell's echo of the probe command, only cat -v (raw, -echo) can print the marker.
                        const echoed = () => { const t = lib.terminalText(ctx, handle); return t.slice(t.lastIndexOf('exec cat -v') + 1).includes(READY_MARK); };
                        ready = await ctx.pollFor(async () => echoed(), 2000, 'the ready marker').then(() => true, () => false);
                    }
                    if (!ready) log('note -- the hosted recorder never echoed the ready marker within 30 s');
                    const ptyKeys = [...sets.shell, ...sets.switch];
                    for (const [i, key] of ptyKeys.entries()) {
                        await ctx.focusTheiaFrame();
                        await ctx.activate(hosted);
                        await ctx.typeText(sep(i));
                        obs.orca.effects[key] = await effectOf(ctx, keySpecFor(key), null);
                    }
                    await ctx.focusTheiaFrame();
                    await ctx.activate(hosted);
                    await ctx.typeText(sep(ptyKeys.length));
                    await ctx.pollFor(async () => lib.terminalText(ctx, handle).includes(sep(ptyKeys.length)), 15000, 'the last separator in orcad\'s terminal read').catch(() => false);
                    obs.orca.text = lib.terminalText(ctx, handle);
                    // The close key last: the recorder keeps the terminal busy, so Orca's own close asks first.
                    await ctx.pressKey(keySpecFor(sets.close));
                    obs.orca.closed = await ctx.pollFor(async () => {
                        const disposed = !(await lib.hostedIds(ctx)).includes(hosted);
                        const dialog = await ctx.probe(`return !!document.querySelector(${JSON.stringify(CONFIRMATION_SELECTOR)});`);
                        return disposed || dialog ? { disposed, dialog } : null;
                    }, 5000, 'the close key\'s effect').catch(() => ({ disposed: false, dialog: false }));
                    log(`note -- the close key in the hosted terminal ${obs.orca.closed.dialog ? 'opened Orca\'s running-terminal confirmation' : obs.orca.closed.disposed ? 'disposed the hosted widget' : 'had no observed effect'}`);
                    if (obs.orca.closed.dialog) {
                        await ctx.probe(`const d = document.querySelector('[role="dialog"], [role="alertdialog"]'); const btn = d && [...d.querySelectorAll('button')].find(b => /cancel/i.test(b.textContent)); if (btn) btn.click(); await sleep(500); return !!btn;`);
                    }
                    try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { log(`note -- the CLI close of the probe terminal failed: ${err.message}`); }
                    hosted = null;
                }
                obs.paste = await pasteLeg(ctx, lib);
                const pt = obs.paste.theia;
                log(`note -- paste leg: Orca's switch ${JSON.stringify(obs.paste.setting)}; token ${obs.paste.printed} printed, ${obs.paste.count} after the terminal middle-click; Theia editable ${JSON.stringify(pt.off?.text)} at Orca's default, ${JSON.stringify(pt.on?.text)} with it on`);
            }
            await measure(obs.after);
        } finally {
            await pages.close();
        }
    });
    if (stage2Fail) return { obs, panesPresent, stage2Skip: null, stage2: [stage2Fail] };
    return { obs, panesPresent, stage2Skip, stage2: stage2Skip ? [] : [...orcaStageVerdict(obs), ...pasteVerdict(obs)] };
}

async function main() {
    const say = (line) => console.log(`${NAME}: ${line}`);
    let r;
    try { r = await run({ log: say }); } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    if (r.skip) { say(`SKIP -- ${r.skip}`); return 0; }
    const control = controlVerdict(r.obs);
    const repeat = repeatVerdict(r.obs);
    say(control.length ? `control: FAIL -- ${control.join('; ')}` : 'control: PASS -- in t<n> the shell keys reached the shell, the switch keys switched with no PTY bytes and the close key closed the tab; in the web tab the switch keys switched');
    if (r.stage2Skip) say(`stage 2: SKIP -- ${r.stage2Skip}`);
    else say(r.stage2.length ? `stage 2: FAIL -- ${r.stage2.join('; ')}` : 'stage 2: PASS -- the shell keys reached the hosted terminal\'s PTY with nothing switched; the switch keys switched the tab and reached no PTY; the close key requested Orca\'s close; a terminal selection pasted once into that terminal and a Theia editable got the system selection');
    say(repeat.length ? `stage 3: FAIL -- ${repeat.join('; ')}` : 'stage 3: equal to the control');
    say(`note -- control effects t<n> ${JSON.stringify(r.obs.control.term)}, web ${JSON.stringify(r.obs.control.web)}`);
    const fails = overallVerdict({ control, stage2: r.stage2, stage2Skip: r.stage2Skip, panesPresent: r.panesPresent, repeat });
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); console.log(`${NAME}: FAIL`); return 1; }
    say(`PASS -- D-32 control in t<n> and the web tab; stage 2 ${r.stage2Skip ? 'SKIP (orca-panes absent)' : 'PASS'}; the t<n> and web tab effects equal the in-session control`);
    return 0;
}

// ---------------------------------------------------------------------------
// --self-test

/** Imports this module in a child Node and observes it. Exit 3 from the child means it had a child process. */
export function observeImport() {
    const script = `await import(${JSON.stringify(pathToFileURL(SELF).href)});
await new Promise((r) => setTimeout(r, 200));
let kids = '';
try { kids = (await import('node:fs')).readFileSync('/proc/self/task/' + process.pid + '/children', 'utf8').trim(); } catch {}
process.exit(kids ? 3 : 0);`;
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000, env, cwd: REPO_ROOT });
    return { exitCode: r.status === 3 ? 0 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT', startedProcess: r.status === 3 };
}

const SHELL = ['ctrl+w', 'ctrl+t'];
const SWITCH = ['ctrl+tab', 'ctrl+shift+tab', 'ctrl+pagedown', 'ctrl+pageup'];
const CLOSE = 'ctrl+shift+w';
const KEYS = [...SHELL, ...SWITCH, CLOSE];
const FORMS = { 'ctrl+w': '^W', 'ctrl+t': '^T' };
function fixtureObs() {
    const term = {
        'ctrl+w': { tabDelta: 0, activeChanged: false, bytes: '^W' }, 'ctrl+t': { tabDelta: 0, activeChanged: false, bytes: '^T' },
        ...Object.fromEntries(SWITCH.map((k) => [k, { tabDelta: 0, activeChanged: true, bytes: '' }])),
        [CLOSE]: { tabDelta: -1, activeChanged: true, bytes: '' },
    };
    const web = { 'ctrl+w': { tabDelta: -1, activeChanged: true }, 'ctrl+t': { tabDelta: 1, activeChanged: true }, ...Object.fromEntries(SWITCH.map((k) => [k, { tabDelta: 0, activeChanged: true }])), [CLOSE]: { tabDelta: 0, activeChanged: false } };
    const pty = [...SHELL, ...SWITCH];
    return {
        keys: KEYS, shell: SHELL, switch: SWITCH, close: CLOSE,
        control: { term: structuredClone(term), web: structuredClone(web) },
        orca: {
            tab: 'orca-pane:term1', text: `${pty.map((k, i) => `${sep(i)}${FORMS[k] ?? ''}`).join('')}${sep(pty.length)}`,
            effects: { ...Object.fromEntries(SHELL.map((k) => [k, { tabDelta: 0, activeChanged: false }])), ...Object.fromEntries(SWITCH.map((k) => [k, { tabDelta: 0, activeChanged: true }])) },
            closed: { disposed: false, dialog: true },
        },
        paste: {
            token: '@P1P@', tab: 'orca-pane:term2', printed: 1, count: 2, terminalSentinel: false, setting: { before: false, checked: true },
            theia: { off: { sentinel: 'pb-paste-default-1', clip: 'ok', text: 'pb-paste-default-1' }, on: { sentinel: 'pb-paste-on-1', clip: 'ok', text: 'pb-paste-on-1' } },
        },
        after: { term: structuredClone(term), web: structuredClone(web) },
    };
}
const all = (o) => overallVerdict({ control: controlVerdict(o), stage2: [...orcaStageVerdict(o), ...pasteVerdict(o)], stage2Skip: null, panesPresent: true, repeat: repeatVerdict(o) });
const withPaste = (patch) => { const o = fixtureObs(); Object.assign(o.paste, patch); return all(o); };
const withTheia = (state, patch) => { const o = fixtureObs(); Object.assign(o.paste.theia[state], patch); return all(o); };
const both = (o, f) => { f(o.control); f(o.after); return o; };

function runSelfTest() {
    const keysTs = `export const ORCA_TERMINAL_PASSTHROUGH_KEYS: readonly string[] = Object.freeze([\n    'ctrl+w', 'ctrl+t',\n]);\n`;
    const namingTs = 'export const TERMINAL_NAME_PATTERN = /^t(\\d+)$/;\n';
    const derive = () => {
        const fails = [];
        if (JSON.stringify(readPassthroughKeys(keysTs)) !== JSON.stringify(SHELL)) fails.push(`readPassthroughKeys gave ${JSON.stringify(readPassthroughKeys(keysTs))}`);
        const t = readPattern(namingTs, 'TERMINAL_NAME_PATTERN');
        if (!t?.test('t3') || t.test('orca-pane:term3')) fails.push('readPattern did not read TERMINAL_NAME_PATTERN');
        if (KEYS.some((k) => !keySpecFor(k)) || keySpecFor('ctrl+f13') !== null) fails.push('keySpecFor maps a key it cannot press or drops one of the seven');
        if (visibleFormFor('ctrl+w') !== '^W' || visibleFormFor('ctrl+tab') !== null) fails.push('visibleFormFor');
        const ps = readPasteSetting("<Switch\n  aria-label={translate(\n    'auto.x.InputPane.a1',\n    'Middle-click Paste from Selection'\n  )}", '<SettingsSection\n      id="input"\n      title={translate(\'auto.x.Settings.b2\', \'Input & Editing\')}');
        if (ps.label !== 'Middle-click Paste from Selection' || ps.section !== 'Input & Editing') fails.push(`readPasteSetting gave ${JSON.stringify(ps)}`);
        const real = readPasteSetting(read(join(REPO_ROOT, INPUT_PANE_REL)), read(join(REPO_ROOT, SETTINGS_SECTIONS_REL)));
        if (existsSync(join(REPO_ROOT, INPUT_PANE_REL)) && (!real.label || !real.section)) fails.push(`readPasteSetting reads nothing from the pinned sources (${JSON.stringify(real)})`);
        return fails;
    };
    const cases = [
        ['all stages control', null, () => all(fixtureObs())],
        ['pre-merge run: stage 2 SKIP while orca-panes is absent', null, () => { const o = fixtureObs(); o.orca = null; return overallVerdict({ control: controlVerdict(o), stage2: [], stage2Skip: 'lane p64-02 not merged', panesPresent: false, repeat: repeatVerdict(o) }); }],
        ['derivations over fixture sources', null, derive],
        ['real module import (child Node, 10 s)', null, () => importSilenceVerdict(observeImport())],
        ['stage 2 SKIP with orca-panes present', 'stage 2 skipped while', () => { const o = fixtureObs(); return overallVerdict({ control: controlVerdict(o), stage2: [], stage2Skip: 'no built orca/', panesPresent: true, repeat: repeatVerdict(o) }); }],
        ['control missing a key', 'control incomplete', () => { const o = fixtureObs(); delete o.control.web['ctrl+t']; delete o.after.web['ctrl+t']; return all(o); }],
        ['hosted terminal tab missing', 'hosted terminal tab missing', () => { const o = fixtureObs(); o.orca.tab = null; return all(o); }],
        ['^W missing', '^W missing', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace('^W', ''); return all(o); }],
        ['a separator missing', 'separators around ctrl+shift+tab are missing', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace(sep(4), ''); return all(o); }],
        ['ctrl+tab reaching the hosted PTY', 'ctrl+tab reached the hosted Orca terminal\'s PTY', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace(`${sep(2)}${sep(3)}`, `${sep(2)}\t${sep(3)}`); return all(o); }],
        ['ctrl+w closing the hosted tab', 'ctrl+w closed or switched a tab in the hosted Orca terminal', () => { const o = fixtureObs(); o.orca.effects['ctrl+w'] = { tabDelta: -1, activeChanged: true }; return all(o); }],
        ['a switch key that switched nothing from the hosted terminal', 'ctrl+pagedown did not switch the PowerBrowser tab from the hosted Orca terminal', () => { const o = fixtureObs(); o.orca.effects['ctrl+pagedown'] = { tabDelta: 0, activeChanged: false }; return all(o); }],
        ['ctrl+pagedown bytes in the t<n> recorder', 'ctrl+pagedown reached the t<n> PTY', () => all(both(fixtureObs(), (m) => { m.term['ctrl+pagedown'].bytes = '^[[6;5~'; }))],
        ['ctrl+shift+w leaving t<n> open', 'ctrl+shift+w did not close the t<n> terminal tab', () => all(both(fixtureObs(), (m) => { m.term[CLOSE] = { tabDelta: 0, activeChanged: false, bytes: '' }; }))],
        ['ctrl+w closing t<n>', 'ctrl+w closed or switched a tab from the t<n> terminal', () => all(both(fixtureObs(), (m) => { m.term['ctrl+w'] = { tabDelta: -1, activeChanged: true, bytes: '' }; }))],
        ['a switch key not switching from the web tab', 'ctrl+tab did not switch the PowerBrowser tab from the web tab', () => all(both(fixtureObs(), (m) => { m.web['ctrl+tab'] = { tabDelta: 0, activeChanged: false }; }))],
        ['the close key doing nothing in the hosted terminal', 'neither closed it nor opened Orca\'s running-terminal confirmation', () => { const o = fixtureObs(); o.orca.closed = { disposed: false, dialog: false }; return all(o); }],
        ['a switch key judged with no proven PTY read', 'switch keys not judged', () => { const o = fixtureObs(); o.orca.text = o.orca.text.replace(sep(0), ''); return orcaStageVerdict(o); }],
        ['a t<n> effect differing from the control', 't<n> tab differs from the control', () => { const o = fixtureObs(); o.after.term['ctrl+tab'] = { tabDelta: 0, activeChanged: false, bytes: '\t' }; return all(o); }],
        ['a web-tab effect differing from the control', 'web tab differs from the control', () => { const o = fixtureObs(); o.after.web['ctrl+t'] = { tabDelta: 0, activeChanged: false }; return all(o); }],
        ['no paste in the hosted terminal', 'pasted it 0 time(s), want once', () => withPaste({ count: 1 })],
        ['a doubled paste in the hosted terminal', 'pasted it 2 time(s), want once', () => withPaste({ count: 3 })],
        ['the system selection in the hosted terminal', 'the system selection reached the hosted Orca terminal', () => withPaste({ terminalSentinel: true })],
        ["Orca's selection pasted into a Theia editable with the setting on", 'with Orca\'s selection paste on, a middle-click into a Theia editable inserted "@P1P@"', () => withTheia('on', { text: '@P1P@' })],
        ['nothing pasted into a Theia editable at the default', 'with Orca\'s selection paste at its default, a middle-click into a Theia editable inserted ""', () => withTheia('off', { text: '' })],
        ['the Theia editable not measured at the default', 'not measured with Orca\'s setting at its default', () => withPaste({ theia: { off: null, on: fixtureObs().paste.theia.on } })],
        ["Orca's switch not found", 'switch could not be turned on', () => withPaste({ setting: { error: 'switch not found' } })],
        ["Orca's switch left off", 'switch could not be turned on', () => withPaste({ setting: { before: false, checked: false } })],
        ['the token never read back', 'never reached orcad\'s terminal read', () => withPaste({ printed: 0 })],
        ['the paste terminal never hosted', 'paste terminal produced no hosted widget', () => withPaste({ tab: null })],
        ['the system selection unwritable', 'NOT SCORED -- the system selection could not be written', () => withTheia('off', { clip: 'error: x' })],
        ['the paste leg not run', 'paste leg not measured', () => { const o = fixtureObs(); o.paste = null; return all(o); }],
        ['an import that printed a line', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: 'orca-terminal-keys-live: SKIP\n', stderr: '', timedOut: false, startedProcess: false })],
        ['an import that started a process', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: '', stderr: '', timedOut: false, startedProcess: true })],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${label} -> not green: ${text}`); failures++; } else console.log(`  control ${label} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${label} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${label} -> red, but not naming '${naming}': ${text}`); failures++; }
        else { console.log(`  ok ${label} -> red, naming '${naming}'`); ok++; }
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${ok} planted faults each went red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await main());
}
