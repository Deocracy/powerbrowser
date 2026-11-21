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
//     running-terminal confirmation (a dialog that was not there before the
//     key, titled as Orca's close-terminal dialog, as orca-tabs-live stage j
//     judges it); the check then cancels it (in that dialog) and closes the
//     terminal through the CLI. While theia/extensions/orca-panes is absent this
//     stage does not run: the row exits 77 (SKIP) once everything else is green.
//  2b. Paste (owner rulings 2026-11-17, "Limit the hook to Orca panes" and "Preset
//     it ON on Linux, in memory"). With a sentinel on the system selection, a
//     trusted middle-click into a contenteditable in the Theia document must insert
//     exactly the sentinel at PowerBrowser's default, after a terminal selection,
//     and after the user turns Orca's switch off. At the default Orca's Middle-click
//     Paste from Selection switch must read on on Linux (off elsewhere: Orca's web
//     default), with nothing written: a second CLI terminal prints a token alone on
//     its cleared first row; a trusted drag across that row selects it and a trusted
//     middle-click in the terminal must paste it there exactly once (orcad's read
//     holds it printed + 1), with no sentinel in the PTY. The user then turns the
//     switch off in Orca's hosted Settings: it must stay off (the preset yields), and
//     a second selection and middle-click must paste nothing (Orca's own off).
//  2c. Orca's app-wide listeners and Theia UI (owner ruling 2026-11-17, "Test and
//     scope if needed"). Leave: with Orca's 'orca.web.' storage writes failing,
//     Orca's checkpoint must report its failure (its failed event, the name read
//     from orca/src/shared/renderer-shutdown-events.ts) and the Theia browser's
//     own leave check (asyncPermitUnload('dontUnload'), what PowerBrowser's quit
//     veto asks) must still permit, after a trusted input gave the page user
//     activation. Large paste: 100 KiB through Gecko's paste command into an
//     untitled Theia editor must get past the document's capture listeners (where
//     Orca's claim stopped it) and arrive unchanged; 100 KiB of lines into Theia's
//     quick input must get past them too and equal
//     Gecko's single-line paste of it (editor.singleLine.pasteNewlines 2, read at
//     run time: trailing newlines dropped, the rest spaces); no Orca toast or
//     dialog appears. Activation focus: with an Orca terminal (shown once first, so
//     its own first-pane focus is spent) hidden behind a Theia editor, its worktree
//     is chosen in Orca's own worktree palette (the hosted
//     sidebar's search button, label read from SidebarNav.tsx), keyboard focus goes
//     to a second Theia editor and the terminal is revealed: keys typed before and
//     after must all land in the editor and none in the terminal's PTY; then, with
//     a web tab's input focused, a focus call into the terminal from the Theia
//     document (what the helper does) must leave the typed keys in the page.
//  2d. First-show focus (owner ruling 2026-11-17, "Fix now"). Background: keys typed into a Theia editor while the
//     CLI creates an Orca terminal (cat -v) that is then shown beside the editor with no activation must all land in
//     the editor, with keyboard focus still in it and nothing in the terminal's PTY; the terminal's xterm must exist
//     (its first pane was created). Restore: the same around the dock's restoreLayout showing a never-shown CLI terminal
//     beside the editor and the editor activated, as ApplicationShell.setLayoutData applies a stored layout. Click: a
//     trusted click on the first terminal's tab must give it keyboard focus and its keys must reach the PTY (the read's
//     control). Command: New Orca Terminal, run with an editor focused, must give its terminal keyboard focus and a
//     typed marker must reach its PTY.
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
// SKIP (SKIP-PROTOCOL.md): one line "orca-terminal-keys-live: SKIP -- <reason>" and
// exit 77 when no built PowerBrowser or Theia app exists, and also when stage 2
// did not run (a partial run) and nothing failed. A FAIL wins over a SKIP.
//
// The live lock: started without PB_LIVE_LOCK_HELD=1 (that is, not under
// scripts/verify-platform.sh) the row takes <git common dir>/pb-live.lock
// itself, before it launches anything. Do not wrap it in flock on that file.
// This shell's ORCA_* are removed from the session. It signals only identities
// it recorded; the Orca CLI gets an environment built from scratch. No pairing
// value, env value or token is printed; what is printed after the session is
// redacted with the session's own list.
//
// Side effects on the desktop it is run on, and what is undone: the run writes
// 100 KiB of text to the system clipboard and selection and puts sentinels on
// the selection. Both clipboards are read before the first write and written
// back at the end when they held text (a headed run is the case that matters);
// a clipboard that could not be read, or that held something other than text,
// is named in a note and not restored. The cat -v recorder files under
// .mozbuild/orca-terminal-keys-live are removed when the run ends.
//
// Tier: full. --self-test is quick and needs no browser: the pure verdicts over
// fixture observations, the derivations over fixture sources, the clipboard
// restore over an in-memory clipboard, the lock probe, plus a child Node that
// imports this module and must stay silent.
//
// Usage:
//   node scripts/verify-orca-terminal-keys-live.mjs
//   node scripts/verify-orca-terminal-keys-live.mjs --self-test
//   node scripts/verify-orca-terminal-keys-live.mjs --lock-probe   (prints whether this process holds the live lock; launches nothing)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

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
const SHUTDOWN_EVENTS_REL = 'orca/src/shared/renderer-shutdown-events.ts';
const SIDEBAR_NAV_REL = 'orca/src/renderer/src/components/sidebar/SidebarNav.tsx';
const WORK_REL = '.mozbuild/orca-terminal-keys-live';
// Raw mode so ^W reaches cat instead of the line discipline's word erase.
export const PROBE_COMMAND = 'stty -icanon -echo -isig -iexten; exec cat -v';
const sep = (i) => `@K${i}@`;
const READY_MARK = '@READY@';
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

/** With orca-panes present its passthrough list must equal the shell keys. */
export function passthroughVerdict(passthrough, shell) {
    return [...passthrough].sort().join() === [...shell].sort().join() ? [] : [`ORCA_TERMINAL_PASSTHROUGH_KEYS (${passthrough.join(', ')}) differs from the shell keys (${shell.join(', ')}); orca-terminal-keys is red`];
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
        const differs = passthroughVerdict(passthrough, d.shell);
        if (differs.length) throw new Error(differs.join('; '));
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

/** The failure event Orca's checkpoint dispatches, and the label of the hosted sidebar's palette button, from the pinned sources. */
export function readCheckpointFailedEvent(text) {
    return /ORCA_RENDERER_SHUTDOWN_CHECKPOINT_FAILED_EVENT\s*=\s*['"]([^'"]+)['"]/.exec(text ?? '')?.[1] ?? null;
}
export function readPaletteLabel(text) {
    return /openModal\('worktree-palette'\)\}\s*aria-label=\{translate\(\s*'[^']+',\s*'([^']+)'/.exec(text ?? '')?.[1] ?? null;
}

/** Gecko's paste of `text` into a single-line input under editor.singleLine.pasteNewlines 2: trailing newlines dropped, the rest spaces. */
export const singleLinePaste = (text) => text.replace(/[\r\n]+$/, '').replace(/\r\n|[\r\n]/g, ' ');

/**
 * Stage 2b. obs.paste: { platform, token, tab, printed, count, offCount, terminalSentinel, preset: { checked } | { error },
 * userOff: { before, checked, held } | { error }, theia: { default, on, off: { sentinel, clip, text } } }.
 */
export function pasteVerdict(obs) {
    const p = obs.paste;
    if (!p) return ['paste leg not measured'];
    const fails = [];
    const theiaLeg = (leg, state) => {
        if (!leg) fails.push(`paste leg: the Theia editable was not measured ${state}`);
        else if (leg.clip !== 'ok') fails.push(`paste leg: NOT SCORED -- the system selection could not be written (${leg.clip})`);
        else if ((leg.text ?? '').trim() !== leg.sentinel) fails.push(`paste leg: ${state}, a middle-click into a Theia editable inserted ${JSON.stringify(leg.text)}, not the system selection ${JSON.stringify(leg.sentinel)} (Orca's paste must act only in its panes)`);
    };
    theiaLeg(p.theia?.default, "at PowerBrowser's default");
    const wantOn = p.platform === 'linux';
    if (!p.preset || p.preset.error || p.preset.checked !== wantOn) {
        fails.push(`paste leg: at PowerBrowser's default Orca's Middle-click Paste from Selection switch reads ${JSON.stringify(p.preset)}, want ${wantOn ? 'on (the Linux preset)' : "off (Orca's web default)"}`);
        return fails;
    }
    if (!p.tab) return [...fails, 'paste leg: the CLI-created paste terminal produced no hosted widget'];
    if (!p.printed) return [...fails, 'paste leg: the token the paste terminal printed never reached orcad\'s terminal read, so a paste count proves nothing'];
    const pasted = p.count - p.printed;
    if (pasted !== 1) fails.push(`paste leg: at PowerBrowser's default a middle-click in the hosted Orca terminal after selecting its token pasted it ${pasted} time(s), want once (Orca's selection paste in its own terminal)`);
    if (p.terminalSentinel) fails.push('paste leg: the system selection reached the hosted Orca terminal\'s PTY');
    theiaLeg(p.theia?.on, 'after a terminal selection');
    const u = p.userOff;
    if (!u || u.error || u.before !== true || u.checked !== false) fails.push(`paste leg: the user could not turn Orca's switch off in its hosted Settings (${JSON.stringify(u)})`);
    else if (u.held !== false) fails.push(`paste leg: the user's off did not hold (the switch reads ${JSON.stringify(u.held)} again): the preset must yield to the user's choice`);
    else if (p.offCount - p.count !== 0) fails.push(`paste leg: with the user's switch off, a middle-click in the hosted Orca terminal pasted its selection ${p.offCount - p.count} time(s), want none`);
    theiaLeg(p.theia?.off, "with the user's switch off");
    return fails;
}

/**
 * Stage 2c. obs.listeners: { leave: { activated, failed, permit } , paste: { editor: { reached, equal, len }, quick: { reached,
 * value, expected, pref }, ui: { before, after } }, focus: { palette: { error? }, editor: { text, want, pty }, web: { text, want,
 * pty, chrome } } }.
 */
export function listenersVerdict(obs) {
    const l = obs.listeners;
    if (!l) return ['app-wide listener leg not measured'];
    const fails = [];
    const v = l.leave;
    if (!v?.activated) fails.push('leave check: NOT SCORED -- the Theia document had no user activation, so a leave prompt could not show');
    else if (!v.failed) fails.push("leave check: NOT SCORED -- Orca's checkpoint reported no failure under the failing storage writes");
    else if (v.permit !== true) fails.push(`leave check: with Orca's checkpoint failing the Theia browser's leave check answered ${JSON.stringify(v.permit)}: Orca must never hold PowerBrowser's quit or a reload`);
    const e = l.paste?.editor;
    if (!e) fails.push('large paste: the Theia editor was not measured');
    else {
        if (!e.reached) fails.push("large paste: a 100 KiB paste into the Theia editor never got past the document's capture listeners (Orca claimed it)");
        if (!e.equal) fails.push(`large paste: the Theia editor holds ${e.len} characters, not the 100 KiB pasted`);
    }
    const q = l.paste?.quick;
    if (!q) fails.push("large paste: Theia's quick input was not measured");
    else if (q.pref !== 2) fails.push(`large paste: NOT SCORED -- editor.singleLine.pasteNewlines is ${q.pref}, the oracle assumes 2`);
    else {
        if (!q.reached) fails.push("large paste: 100 KiB of lines into Theia's quick input never got past the document's capture listeners (Orca claimed it)");
        if (q.value !== q.expected) fails.push(`large paste: Theia's quick input holds ${JSON.stringify(String(q.value).slice(0, 40))}, not Gecko's single-line paste ${JSON.stringify(String(q.expected).slice(0, 40))} (${String(q.value).length} vs ${String(q.expected).length} characters)`);
    }
    const ui = l.paste?.ui;
    if (ui && ui.after > ui.before) fails.push(`large paste: ${ui.after - ui.before} Orca toast or dialog element(s) appeared`);
    const f = l.focus;
    if (!f || f.palette?.error) fails.push(`activation focus: NOT SCORED -- Orca's worktree palette did not activate the worktree (${JSON.stringify(f?.palette)})`);
    else if (!f.control) fails.push("activation focus: NOT SCORED -- keys typed into the Orca terminal itself never showed in orcad's read, so an empty read proves nothing");
    else {
        if (f.editor?.text !== f.editor?.want) fails.push(`activation focus: keys typed in a Theia editor after the palette activation landed as ${JSON.stringify(f.editor?.text)}, want ${JSON.stringify(f.editor?.want)}`);
        if (f.editor?.pty) fails.push(`activation focus: keys typed in a Theia editor reached the Orca terminal's PTY (${JSON.stringify(f.editor.pty)})`);
        if (f.web?.text !== f.web?.want) fails.push(`activation focus: keys typed in a web tab's input landed as ${JSON.stringify(f.web?.text)}, want ${JSON.stringify(f.web?.want)}`);
        if (f.web?.pty) fails.push(`activation focus: keys typed in a web tab reached the Orca terminal's PTY (${JSON.stringify(f.web.pty)})`);
    }
    return fails;
}

/**
 * Stage 2d. obs.focusGate: { background, restore: { hidden, mounted, visible, inEditor, text, want, pty }, click: { tab, focused,
 * reached }, command: { worktree, error, tab, focused, reached, editorText } }.
 */
export function focusGateVerdict(obs) {
    const g = obs.focusGate;
    if (!g) return ['focus gate leg not measured'];
    const fails = [];
    const shownLeg = (leg, what) => {
        if (!leg) return fails.push(`focus gate: ${what} not measured`);
        if (what === 'restore' && !leg.hidden) return fails.push('focus gate: restore NOT SCORED -- the terminal was already shown before the restored layout showed it');
        if (!leg.mounted || !leg.visible) return fails.push(`focus gate: ${what} NOT SCORED -- the terminal never showed its xterm (mounted ${leg.mounted}, visible ${leg.visible}), so its first pane was never created`);
        if (leg.text !== leg.want) fails.push(`focus gate: ${what}: keys typed in the Theia editor landed there as ${JSON.stringify(leg.text)}, want ${JSON.stringify(leg.want)} (the Orca terminal took focus when it was first shown)`);
        if (!leg.inEditor) fails.push(`focus gate: ${what}: keyboard focus left the Theia editor when the Orca terminal was first shown`);
        if (leg.pty) fails.push(`focus gate: ${what}: keys typed in the Theia editor reached the Orca terminal's PTY (${JSON.stringify(leg.pty)})`);
    };
    shownLeg(g.background, 'background');
    shownLeg(g.restore, 'restore');
    const c = g.click;
    if (!c?.tab) fails.push('focus gate: click NOT SCORED -- the terminal\'s tab was not found to click');
    else {
        if (!c.focused) fails.push('focus gate: a click on the Orca terminal\'s tab did not give it keyboard focus');
        if (!c.reached) fails.push('focus gate: keys typed after a click on the Orca terminal\'s tab did not reach its PTY');
    }
    const n = g.command;
    if (!n || n.error || !n.tab) fails.push(`focus gate: New Orca Terminal produced no hosted terminal (${JSON.stringify(n)})`);
    else {
        if (!n.focused) fails.push('focus gate: the terminal New Orca Terminal created did not get keyboard focus');
        if (!n.reached) fails.push('focus gate: keys typed after New Orca Terminal did not reach its PTY');
    }
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

/**
 * The two system clipboards through chrome scope: port.get(which) resolves { ok: true, text } (text null when the clipboard
 * holds no text) or { ok: false, error }; port.set(which, text) writes it. which: 'global' | 'selection'.
 */
export function clipboardPort(app) {
    const kind = (which) => (which === 'selection' ? 'kSelectionClipboard' : 'kGlobalClipboard');
    return {
        get: async (which) => JSON.parse(await app.evaluateIn(app.chrome, `(() => { try {
            const type = Ci.nsIClipboard.${kind(which)};
            if (!Services.clipboard.hasDataMatchingFlavors(['text/plain'], type)) return JSON.stringify({ ok: true, text: null });
            const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
            t.init(null); t.addDataFlavor('text/plain');
            Services.clipboard.getData(t, type, null);
            const v = {}; t.getTransferData('text/plain', v);
            return JSON.stringify({ ok: true, text: v.value.QueryInterface(Ci.nsISupportsString).data });
        } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); } })()`)),
        set: async (which, text) => {
            const r = await app.evaluateIn(app.chrome, `(() => { try { const h = Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper);
                ${which === 'selection' ? `h.copyStringToClipboard(${JSON.stringify(text)}, Ci.nsIClipboard.kSelectionClipboard);` : `h.copyString(${JSON.stringify(text)});`} return 'ok'; } catch (e) { return 'error: ' + e; } })()`);
            if (r !== 'ok') throw new Error(r);
        },
    };
}

/**
 * Runs fn with both clipboards read first and written back after (also when fn throws): a headed run must not leave its
 * 100 KiB of test text on the developer's clipboard. A clipboard that cannot be read is named in a note and left; one that held
 * no text is set to empty (the test text must not stay). log(line) takes the notes.
 */
export async function withClipboardsRestored(port, fn, log = () => {}) {
    const saved = {};
    for (const which of ['global', 'selection']) {
        try { saved[which] = await port.get(which); } catch (err) { saved[which] = { ok: false, error: String(err?.message ?? err) }; }
    }
    try {
        return await fn();
    } finally {
        for (const which of ['global', 'selection']) {
            const was = saved[which];
            if (!was?.ok) { log(`note -- the ${which} clipboard could not be read before the run (${was?.error ?? 'unreadable'}), so it was not restored`); continue; }
            try {
                await port.set(which, was.text ?? '');
                if (was.text === null) log(`note -- the ${which} clipboard held no text before the run; it was emptied of the run's text`);
            } catch (err) { log(`note -- the ${which} clipboard could not be written back (${String(err?.message ?? err)})`); }
        }
    }
}

/** Removes the recorder folder the run made; resolves whether it is gone. */
export function removeWorkDir(dir) {
    rmSync(dir, { recursive: true, force: true });
    return !existsSync(dir);
}

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

/** Sets Orca's own switch in its hosted Settings (Orca mode's Settings part), as a user does: { before, checked } or { error }; want null only reads it: { checked }. */
export async function setPasteSetting(ctx, want) {
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
            const want = ${JSON.stringify(want)};
            if (want === null) return { checked: before };
            if (before !== want) find().click();
            await until(() => on() === want, 5000);
            return { before, checked: on() };
        } finally {
            if (mode) await get('ModeService').activateMode(mode);
        }`);
}

/** Drag-selects row 0 of a hosted terminal's screen and middle-clicks it; resolves after the paste could land. */
export async function selectAndMiddleClick(ctx, theia, tab) {
    await ctx.focusTheiaFrame();
    await ctx.activate(tab);
    const screen = await ctx.probe(`const shell = get('ApplicationShell');
        const s = () => { const w = shell.getWidgetById(${JSON.stringify(tab)}); return w && w.isVisible && w.node.querySelector('.xterm-screen'); };
        if (!(await until(s, 15000))) { const w = shell.getWidgetById(${JSON.stringify(tab)}); return { error: 'no visible .xterm-screen', area: w ? shell.getAreaFor(w) : null, visible: !!(w && w.isVisible), mode: document.body.getAttribute('data-pb-mode') }; }
        const r = s().getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };`);
    if (screen?.error) throw new Error(`harness: ${tab}: ${JSON.stringify(screen)}`);
    // Row 0 holds only the token, so a drag across the row selects exactly the token.
    const y0 = screen.top + 4;
    await pointer(ctx.app, theia, [moveTo(screen.left + 2, y0), { type: 'pointerDown', button: 0 }, moveTo((screen.left + screen.right) / 2, y0), moveTo(screen.right - 4, y0), { type: 'pointerUp', button: 0 }]);
    await sleep(500); // Orca stores a terminal selection 100 ms after it settles
    await pointer(ctx.app, theia, middleClick((screen.left + screen.right) / 2, (screen.top + screen.bottom) / 2));
}

/** Stage 2b (header). Resolves pasteVerdict's observation; closes its terminal through the CLI. */
export async function pasteLeg(ctx, lib) {
    const n = String(Date.now()).slice(-6);
    const out = { platform: process.platform, token: `@P${n}P@`, tab: null, printed: 0, count: 0, offCount: 0, terminalSentinel: false, preset: null, userOff: null, theia: { default: null, on: null, off: null } };
    const href = await ctx.app.evaluate('location.href');
    const theia = (await ctx.app.contexts()).find((c) => c.url === href)?.context;
    if (!theia) throw new Error('harness: no BiDi context for the Theia frame');
    await ctx.focusTheiaFrame();
    out.theia.default = await theiaPaste(ctx, theia, `pb-paste-default-${n}`);
    out.preset = await setPasteSetting(ctx, null);
    if (out.preset?.checked !== (process.platform === 'linux')) return out;
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
        await selectAndMiddleClick(ctx, theia, out.tab);
        await ctx.pollFor(async () => tokens() > out.printed || null, 5000, 'the pasted token').catch(() => null);
        await sleep(700); // a second, native paste would have landed by now
        out.count = tokens();
        out.theia.on = await theiaPaste(ctx, theia, `pb-paste-on-${n}`);
        // The user turns the switch off; it must stay off after the store's next refresh.
        out.userOff = await setPasteSetting(ctx, false);
        if (out.userOff && !out.userOff.error) {
            await sleep(1500);
            out.userOff.held = (await setPasteSetting(ctx, null))?.checked ?? null;
            await selectAndMiddleClick(ctx, theia, out.tab);
            await sleep(1500);
            out.offCount = tokens();
        }
        out.theia.off = await theiaPaste(ctx, theia, `pb-paste-off-${n}`);
        const text = lib.terminalText(ctx, handle);
        out.terminalSentinel = Object.values(out.theia).some((leg) => leg && text.includes(leg.sentinel));
        return out;
    } finally {
        try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { ctx.log(`note -- the CLI close of the paste terminal failed: ${err.message}`); }
    }
}

/** Chrome scope: Gecko's own paste command into the focused element of the Theia frame (what its Paste prompt does once confirmed). */
const chromePaste = (app) => app.evaluateIn(app.chrome, `(() => { const b = document.getElementById('powerbrowser-content'); b.focus();
    const c = document.commandDispatcher.getControllerForCommand('cmd_paste'); if (!c) return 'no controller'; c.doCommand('cmd_paste'); return 'ok'; })()`);
const setClipboard = (app, text) => app.evaluateIn(app.chrome, `(() => { try { Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(${JSON.stringify(text)}); return 'ok'; } catch (e) { return 'error: ' + e; } })()`);
/**
 * Page-realm source: a once capture listener on <body> recording whether a paste got past the document's capture
 * listeners (Orca's claim stops it there) and whether its target is inside `within`. Monaco stops a paste at its own
 * textarea, so a listener on the target's ancestors in the bubble phase would never see it.
 */
const markPaste = (within) => `window.__pbPasteReached = false; document.body.addEventListener('paste', (e) => { window.__pbPasteReached = !!(e.target && e.target.closest && e.target.closest(${JSON.stringify(within)})); }, { capture: true, once: true }); return true;`;
const ORCA_UI = `return document.querySelectorAll('[data-sonner-toast], [data-sonner-toaster], body > [role="dialog"], body > [role="alertdialog"], body > div [role="alertdialog"]').length;`;
const typeKeys = async (ctx, text) => { for (const ch of text) await ctx.pressKey({ key: ch }); };

/** Stage 2c (header). Resolves listenersVerdict's observation; closes what it opened. */
export async function appWideLeg(ctx, lib, pages) {
    const out = { leave: null, paste: null, focus: null };
    const app = ctx.app;
    // Leave check first: nothing in this session has unloaded, so Orca's checkpoint has not latched a success.
    const failedEvent = readCheckpointFailedEvent(read(join(REPO_ROOT, SHUTDOWN_EVENTS_REL)));
    if (!failedEvent) throw new Error(`source moved: no ORCA_RENDERER_SHUTDOWN_CHECKPOINT_FAILED_EVENT in ${SHUTDOWN_EVENTS_REL}`);
    out.leave = await ctx.probe(`window.__pbCheckpointFailed = 0; window.addEventListener(${JSON.stringify(failedEvent)}, () => { window.__pbCheckpointFailed += 1; });
        window.__pbSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('orca.web.')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return window.__pbSetItem.call(this, k, v); };
        return { activated: !!(navigator.userActivation && navigator.userActivation.hasBeenActive) };`);
    try {
        out.leave.permit = JSON.parse(await app.evaluateIn(app.chrome, `(async () => { try { return JSON.stringify((await document.getElementById('powerbrowser-content').asyncPermitUnload('dontUnload')).permitUnload); } catch (e) { return JSON.stringify('error: ' + e); } })()`));
    } finally {
        out.leave.failed = await ctx.probe(`Storage.prototype.setItem = window.__pbSetItem; return window.__pbCheckpointFailed;`);
    }

    // Large paste into a Theia editor and into Theia's quick input.
    let code = ''; for (let i = 0; code.length < 100 * 1024; i++) code += `  if (x${i}) {\n\treturn [${i}, '(', "{"]; // ${'y'.repeat(30)}\n  }\n`;
    let lines = ''; for (let i = 0; lines.length < 100 * 1024; i++) lines += `line ${i} of a log\n`;
    out.paste = { ui: { before: await ctx.probe(ORCA_UI) } };
    const before = (await ctx.tabState()).ids;
    await ctx.command('workbench.action.files.newUntitledFile');
    const editor = await ctx.pollFor(async () => (await ctx.tabState()).ids.find((id) => !before.includes(id)) ?? null, 10000, 'the untitled editor');
    const model = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(id)}); return w && w.editor ? w.editor.getControl().getModel().getValue() : null;`);
    try {
        if ((await setClipboard(app, code)) !== 'ok') throw new Error('harness: the clipboard could not be written');
        await ctx.focusTheiaFrame();
        await ctx.activate(editor);
        await ctx.probe(markPaste('.monaco-editor'));
        await chromePaste(app);
        let value = null;
        for (let last = -1, i = 0; i < 40; i++) { await sleep(250); value = await model(editor); if (value !== null && value.length === last) break; last = value ? value.length : -1; }
        out.paste.editor = { reached: await ctx.probe('return window.__pbPasteReached;'), equal: value === code, len: value?.length ?? null };
    } finally {
        await ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(editor)}); if (w) { try { await w.editor.document.revert(); } catch {} w.close(); } return true;`);
    }
    await setClipboard(app, lines);
    await ctx.focusTheiaFrame();
    const opened = await ctx.probe(`get('QuickInputService').open(''); await until(() => document.querySelector('.quick-input-box input'), 5000);
        const i = document.querySelector('.quick-input-box input'); if (!i) return false; i.focus(); return document.activeElement === i;`);
    if (!opened) throw new Error("harness: Theia's quick input did not open");
    await ctx.probe(markPaste('.quick-input-widget'));
    await chromePaste(app);
    await sleep(2500);
    out.paste.quick = await ctx.probe(`const i = document.querySelector('.quick-input-box input'); return { reached: window.__pbPasteReached, value: i ? i.value : null };`);
    out.paste.quick.expected = singleLinePaste(lines);
    out.paste.quick.pref = await app.evaluateIn(app.chrome, `Services.prefs.getIntPref('editor.singleLine.pasteNewlines', -1)`);
    await ctx.pressKey({ key: 'Escape', code: 'Escape', keyCode: 27 });
    out.paste.ui.after = await ctx.probe(ORCA_UI);

    // Activation focus through Orca's own worktree palette.
    out.focus = { palette: null, editor: null, web: null };
    const label = readPaletteLabel(read(join(REPO_ROOT, SIDEBAR_NAV_REL)));
    if (!label) throw new Error(`source moved: no worktree-palette button label in ${SIDEBAR_NAV_REL}`);
    const ids0 = await lib.hostedIds(ctx);
    const t0 = Date.now();
    const handle = ctx.orca('terminal', 'create', '--worktree', ctx.worktree, '--command', PROBE_COMMAND)?.result?.terminal?.handle;
    if (!handle) throw new Error('the Orca CLI created the focus terminal but returned no handle');
    const opened2 = [];
    try {
        const T = (await lib.waitForHostedAdd(ctx, t0, ids0, 30000))?.id;
        if (!T) throw new Error('harness: the focus terminal produced no hosted widget');
        const fresh = async () => { const b = (await ctx.tabState()).ids; await ctx.command('workbench.action.files.newUntitledFile'); const id = await ctx.pollFor(async () => (await ctx.tabState()).ids.find((x) => !b.includes(x)) ?? null, 10000, 'an untitled editor'); opened2.push(id); return id; };
        const E = await fresh();
        const E2 = await fresh();
        const webTab = await ctx.openWebTab(pages.url('/type'));
        const W = await ctx.pollFor(async () => (await ctx.tabState()).ids.find((id) => id.endsWith(`:${webTab}`)) ?? null, 10000, 'the web tab widget');
        opened2.push(W);
        // Left: E with T behind it; right: E2 with W behind it.
        const layout = await ctx.probe(`const s = get('ApplicationShell'); const w = (id) => s.getWidgetById(id);
            s.addWidget(w(${JSON.stringify(T)}), { area: 'main', mode: 'tab-before', ref: w(${JSON.stringify(E)}) });
            s.addWidget(w(${JSON.stringify(E2)}), { area: 'main', mode: 'split-right', ref: w(${JSON.stringify(E)}) });
            s.addWidget(w(${JSON.stringify(W)}), { area: 'main', mode: 'tab-before', ref: w(${JSON.stringify(E2)}) });
            await s.activateWidget(${JSON.stringify(E)}); s.revealWidget(${JSON.stringify(E2)}); await sleep(400);
            return { T: w(${JSON.stringify(T)}).isVisible, E: w(${JSON.stringify(E)}).isVisible, E2: w(${JSON.stringify(E2)}).isVisible };`);
        if (layout.T || !layout.E || !layout.E2) throw new Error(`harness: the focus layout did not form: ${JSON.stringify(layout)}`);
        // T shown once first: Orca's TerminalPane creates its first pane when it is first shown and focuses it (its own
        // mount, not the activation helper), so the leg below judges the helper alone. Then T hidden behind E again.
        await ctx.focusTheiaFrame();
        await ctx.activate(T);
        await ctx.probe(`const s = get('ApplicationShell'); await until(() => s.getWidgetById(${JSON.stringify(T)}).node.querySelector('.xterm-helper-textarea'), 15000);
            await s.activateWidget(${JSON.stringify(E)}); s.revealWidget(${JSON.stringify(E2)}); await sleep(400); return !s.getWidgetById(${JSON.stringify(T)}).isVisible;`);
        out.focus.palette = await ctx.probe(`const mode = document.body.getAttribute('data-pb-mode');
            await get('ModeService').activateMode('orca');
            try {
                const wm = get('WidgetManager'); const c = wm.tryGetWidget('powerbrowser-orca-view-container'); const part = wm.tryGetWidget('powerbrowser-orca-sidebar-view');
                if (!c || !part) return { error: 'no hosted Orca sidebar part' };
                for (const p of c.getParts()) p.collapsed = false;
                c.activateWidget(part.id);
                await until(() => part.node.querySelector('[aria-label=${JSON.stringify(label)}]'), 15000);
                const button = part.node.querySelector('[aria-label=${JSON.stringify(label)}]');
                if (!button) return { error: 'no palette button' };
                button.click();
                await until(() => [...document.querySelectorAll('[cmdk-item]')].some((i) => (i.getAttribute('data-value') || '').includes(':worktree')), 15000);
                const item = [...document.querySelectorAll('[cmdk-item]')].find((i) => (i.getAttribute('data-value') || '').includes(':worktree'));
                if (!item) return { error: 'no worktree row in the palette' };
                item.click();
                if (!(await until(() => !document.querySelector('[cmdk-input]'), 5000))) return { error: 'the palette stayed open' };
                return { mode };
            } finally { if (mode) await get('ModeService').activateMode(mode); }`);
        if (out.focus.palette?.error) return out;
        // What cat -v printed after the shell's echo of the probe command: only keys that reached the PTY.
        const catOut = () => { const t = lib.terminalText(ctx, handle); const i = t.lastIndexOf('exec cat -v'); return i < 0 ? '' : t.slice(i + 'exec cat -v'.length).replace(/\s+/g, ''); };
        const pty0 = catOut();
        // A Theia editor: keyboard focus after the activation, then the terminal shown beside it.
        await ctx.focusTheiaFrame();
        await ctx.activate(E2);
        await typeKeys(ctx, 'abc');
        await ctx.probe(`get('ApplicationShell').revealWidget(${JSON.stringify(T)}); await sleep(800); return true;`);
        await typeKeys(ctx, 'xyz');
        await sleep(600);
        const pty1 = catOut();
        out.focus.editor = { text: await model(E2), want: 'abcxyz', pty: pty1.slice(pty0.length) };
        // A web tab: its input focused, then the helper's own action (a focus call into the terminal from the Theia document).
        await ctx.activate(W);
        await ctx.focusOverlay(webTab);
        const page = (await app.contexts()).find((c) => c.url.endsWith('/type'))?.context;
        if (!page) throw new Error('harness: no BiDi context for the typing page');
        await app.evaluateIn(page, `(document.getElementById('i').focus(), true)`);
        await typeKeys(ctx, 'def');
        await ctx.probe(`const t = get('ApplicationShell').getWidgetById(${JSON.stringify(T)}).node.querySelector('.xterm-helper-textarea'); if (t) t.focus(); return !!t;`);
        await typeKeys(ctx, 'ghi');
        await sleep(600);
        const pty2 = catOut();
        out.focus.web = { text: await app.evaluateIn(page, `document.getElementById('i').value`), want: 'defghi', pty: pty2.slice(pty1.length) };
        // The control: keys typed into the terminal itself must show in the same read, or an empty read proves nothing.
        await ctx.focusTheiaFrame();
        await ctx.activate(T);
        await typeKeys(ctx, 'qq');
        out.focus.control = await ctx.pollFor(async () => catOut().slice(pty2.length).includes('qq') || null, 5000, 'the control keys in the PTY read').then(() => true, () => false);
        return out;
    } finally {
        await ctx.probe(`const s = get('ApplicationShell'); for (const id of ${JSON.stringify(opened2)}) { const w = s.getWidgetById(id); if (!w) continue; if (w.editor) { try { await w.editor.document.revert(); } catch {} } w.close(); } return true;`);
        try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { ctx.log(`note -- the CLI close of the focus terminal failed: ${err.message}`); }
    }
}

const J = JSON.stringify;
/** What cat -v printed after the shell's echo of the probe command: only keys that reached the PTY. */
const catOutOf = (text) => { const i = text.lastIndexOf('exec cat -v'); return i < 0 ? '' : text.slice(i + 'exec cat -v'.length).replace(/\s+/g, ''); };

/** Stage 2d (header). Resolves focusGateVerdict's observation; closes what it opened. */
export async function focusGateLeg(ctx, lib) {
    const out = { background: null, restore: null, command: null, click: null };
    const href = await ctx.app.evaluate('location.href');
    const theia = (await ctx.app.contexts()).find((c) => c.url === href)?.context;
    if (!theia) throw new Error('harness: no BiDi context for the Theia frame');
    const opened = [];
    const handles = [];
    const model = (id) => ctx.probe(`const w = get('ApplicationShell').getWidgetById(${J(id)}); return w && w.editor ? w.editor.getControl().getModel().getValue() : null;`);
    const editor = async () => { const b = (await ctx.tabState()).ids; await ctx.command('workbench.action.files.newUntitledFile'); const id = await ctx.pollFor(async () => (await ctx.tabState()).ids.find((x) => !b.includes(x)) ?? null, 10000, 'an untitled editor'); opened.push(id); return id; };
    const listHandles = () => { const found = new Set(); const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'handle' && typeof v === 'string') found.add(v); else walk(v); } }; walk(ctx.orca('terminal', 'list', '--worktree', ctx.worktree)); return [...found]; };
    /** A CLI-created terminal running cat -v; the observer adds its widget in the background (never activated). */
    const cliTerminal = async () => {
        const ids0 = await lib.hostedIds(ctx);
        const t0 = Date.now();
        const handle = ctx.orca('terminal', 'create', '--worktree', ctx.worktree, '--command', PROBE_COMMAND)?.result?.terminal?.handle;
        if (!handle) throw new Error('the Orca CLI created a focus-gate terminal but returned no handle');
        handles.push(handle);
        const T = (await lib.waitForHostedAdd(ctx, t0, ids0, 30000))?.id;
        if (!T) throw new Error('harness: a CLI-created focus-gate terminal produced no hosted widget');
        opened.push(T);
        const hidden = await ctx.probe(`await sleep(500); const t = get('ApplicationShell').getWidgetById(${J(T)}); return !!t && !t.node.querySelector('.xterm-helper-textarea');`);
        return { T, handle, hidden, read: () => catOutOf(lib.terminalText(ctx, handle)) };
    };
    /** Keys typed into E before and after T is created (`make`) and then shown by `show` (page code naming s, w, E, T) unless
     * it already shows; T's xterm proves its first pane was created. */
    const typedWhileShown = async (E, make, show) => {
        await ctx.focusTheiaFrame();
        await ctx.activate(E);
        await typeKeys(ctx, 'abc');
        const t = await make();
        const shown = await ctx.probe(`const s = get('ApplicationShell'); const w = (id) => s.getWidgetById(id); const E = ${J(E)}, T = ${J(t.T)};
            if (!w(T).isVisible) { ${show} }
            const mounted = !!(await until(() => w(T) && w(T).isVisible && w(T).node.querySelector('.xterm-helper-textarea'), 20000));
            await sleep(1500); return { mounted, visible: !!(w(T) && w(T).isVisible) };`);
        await typeKeys(ctx, 'xyz');
        await sleep(600);
        const inEditor = await ctx.probe(`const e = get('ApplicationShell').getWidgetById(${J(E)}); return !!(e && e.node.contains(document.activeElement));`);
        return { t, obs: { hidden: t.hidden, ...shown, inEditor, text: await model(E), want: 'abcxyz', pty: t.read() } };
    };
    try {
        // (1) While the user types in an editor, the CLI creates a terminal (the observer adds it, never activated) and it is
        // shown beside the editor without an activation (an agent opening a terminal beside it).
        const E1 = await editor();
        const { t: t1, obs: background } = await typedWhileShown(E1, cliTerminal, `await s.addWidget(w(T), { area: 'main', mode: 'split-right', ref: w(E) });`);
        out.background = background;
        // A click on its tab is the user's activation: focus moves into the terminal and the keys reach its PTY.
        await ctx.focusTheiaFrame();
        const tab = await ctx.probe(`const el = document.getElementById('shell-tab-' + ${J(t1.T)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
        if (tab) await pointer(ctx.app, theia, [moveTo(tab.x, tab.y), { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 300 }]);
        const clickFocus = await ctx.probe(`const t = get('ApplicationShell').getWidgetById(${J(t1.T)}); return !!(await until(() => t && document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea') && t.node.contains(document.activeElement), 5000));`);
        const before = t1.read();
        await typeKeys(ctx, 'qq');
        const reached = await ctx.pollFor(async () => (t1.read().slice(before.length).includes('qq') ? true : null), 5000, 'the clicked terminal\'s keys').then(() => true, () => false);
        out.click = { tab: !!tab, focused: clickFocus, reached };

        // (2) A restored layout: the dock's restoreLayout (what ApplicationShell.setLayoutData applies) puts a never-shown
        // terminal beside the editor, and the stored active widget, the editor, is activated as setLayoutData does.
        const E2 = await editor();
        const t2 = await cliTerminal();
        out.restore = (await typedWhileShown(E2, async () => t2, `const mp = s.mainPanel; const others = [...mp.widgets()].filter((x) => x.id !== E && x.id !== T);
            mp.restoreLayout({ main: { type: 'split-area', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
                { type: 'tab-area', widgets: [w(E), ...others], currentIndex: 0 }, { type: 'tab-area', widgets: [w(T)], currentIndex: 0 }] } });
            await s.activateWidget(E);`)).obs;

        // (3) New Orca Terminal, the user's command: its terminal gets keyboard focus and the keys reach its PTY.
        const wt = await ctx.bundle(`(() => { const all = m.state().worktrees; const r = all.find((x) => x.path === ${J(ctx.repo)}) ?? (all.length === 1 ? all[0] : null); if (r) m.setActiveWorktree(r.id); return r ? r.id : null; })()`);
        const E3 = await editor();
        await ctx.focusTheiaFrame();
        await ctx.activate(E3);
        const handles0 = listHandles();
        const ids0 = await lib.hostedIds(ctx);
        const t0 = Date.now();
        const ran = await ctx.command('powerbrowser.orca.newTerminal');
        const T3 = (await lib.waitForHostedAdd(ctx, t0, ids0, 30000))?.id ?? null;
        if (T3) opened.push(T3);
        const focused = T3 ? await ctx.probe(`const t = get('ApplicationShell').getWidgetById(${J(T3)}); return !!(await until(() => t && document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea') && t.node.contains(document.activeElement), 20000));`) : false;
        const handle = await ctx.pollFor(async () => listHandles().find((h) => !handles0.includes(h)) ?? null, 10000, 'the command\'s terminal handle').catch(() => null);
        if (handle) handles.push(handle);
        const marker = `pbcmd${Date.now() % 100000}`;
        if (focused) await typeKeys(ctx, marker);
        const reached3 = handle && focused ? await ctx.pollFor(async () => (lib.terminalText(ctx, handle).includes(marker) ? true : null), 10000, 'the command terminal\'s keys').then(() => true, () => false) : false;
        out.command = { worktree: !!wt, error: ran?.error ?? null, tab: T3, focused, reached: reached3, editorText: await model(E3) };
        return out;
    } finally {
        await ctx.probe(`const s = get('ApplicationShell'); for (const id of ${J(opened)}) { const w = s.getWidgetById(id); if (!w || id.startsWith('orca-pane:')) continue; if (w.editor) { try { await w.editor.document.revert(); } catch {} } w.close(); } return true;`);
        for (const handle of handles) { try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { ctx.log(`note -- the CLI close of a focus-gate terminal failed: ${err.message}`); } }
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
    const body = async (ctx) => {
        const pages = await ctx.serveNavPages({ '/k': { title: 'keys control', body: '<p>keys control page</p>' }, '/type': { title: 'typing', body: '<input id="i">' } });
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
                    // Dialogs already open are marked first: only one the key raised counts, and only a close-terminal one (its title
                    // read from Orca's source), so another dialog in the document cannot stand in for Orca's confirmation.
                    await ctx.probe(lib.DIALOG_BASELINE);
                    const titles = lib.closeDialogTitles();
                    await ctx.pressKey(keySpecFor(sets.close));
                    obs.orca.closed = await ctx.pollFor(async () => {
                        const disposed = !(await lib.hostedIds(ctx)).includes(hosted);
                        const dialog = lib.confirmationAppeared(await ctx.probe(lib.DIALOG_NEW), titles);
                        return disposed || dialog ? { disposed, dialog } : null;
                    }, 5000, 'the close key\'s effect').catch(() => ({ disposed: false, dialog: false }));
                    log(`note -- the close key in the hosted terminal ${obs.orca.closed.dialog ? 'opened Orca\'s running-terminal confirmation' : obs.orca.closed.disposed ? 'disposed the hosted widget' : 'had no observed effect'}`);
                    if (obs.orca.closed.dialog) {
                        await ctx.probe(lib.DIALOG_CANCEL_NEW);
                    }
                    try { ctx.orca('terminal', 'close', '--terminal', handle); } catch (err) { log(`note -- the CLI close of the probe terminal failed: ${err.message}`); }
                    hosted = null;
                }
                obs.paste = await pasteLeg(ctx, lib);
                const pt = obs.paste.theia;
                log(`note -- paste leg: Orca's switch ${JSON.stringify(obs.paste.preset)} at the default, ${JSON.stringify(obs.paste.userOff)} turned off by the user; token ${obs.paste.printed} printed, ${obs.paste.count} after the default middle-click, ${obs.paste.offCount} after the off one; Theia editable ${JSON.stringify(pt.default?.text)}, ${JSON.stringify(pt.on?.text)}, ${JSON.stringify(pt.off?.text)}`);
                obs.listeners = await appWideLeg(ctx, lib, pages);
                const li = obs.listeners;
                log(`note -- app-wide listeners: leave ${JSON.stringify(li.leave)}; large paste editor ${JSON.stringify(li.paste?.editor)}, quick input reached ${li.paste?.quick?.reached} (${String(li.paste?.quick?.value ?? '').length} of ${String(li.paste?.quick?.expected ?? '').length} characters); activation focus ${JSON.stringify(li.focus)}`);
                obs.focusGate = await focusGateLeg(ctx, lib);
                log(`note -- focus gate: ${JSON.stringify(obs.focusGate)}`);
            }
            await measure(obs.after);
        } finally {
            await pages.close();
        }
    };
    try {
        // Both clipboards are read first and written back at the end; the recorder folder is removed when the run ends.
        await lib.withOrcaTabsSession({ log, needOrca: !orcaPrereq.skip && !orcaPrereq.fail }, (ctx) => withClipboardsRestored(clipboardPort(ctx.app), () => body(ctx), log));
    } finally {
        removeWorkDir(work);
    }
    if (stage2Fail) return { obs, panesPresent, stage2Skip: null, stage2: [stage2Fail] };
    return { obs, panesPresent, stage2Skip, stage2: stage2Skip ? [] : [...orcaStageVerdict(obs), ...pasteVerdict(obs), ...listenersVerdict(obs), ...focusGateVerdict(obs)] };
}

async function main() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    // What is printed after the session ended goes through the session's own redaction (a recorder read or page text could carry a value).
    const say = (line) => console.log(lib.redactAfterSession(`${NAME}: ${line}`));
    let r;
    try { r = await run({ log: say }); } catch (err) {
        console.error(lib.redactAfterSession(`${NAME}: FAIL -- harness: ${err.message}`));
        return 1;
    }
    if (r.skip) { console.log(skipLine(NAME, `${r.skip}. Next step: build what that names, then run scripts/verify-platform.sh --only orca-terminal-keys-live`)); return SKIP_EXIT; }
    const control = controlVerdict(r.obs);
    const repeat = repeatVerdict(r.obs);
    say(control.length ? `control: FAIL -- ${control.join('; ')}` : 'control: PASS -- in t<n> the shell keys reached the shell, the switch keys switched with no PTY bytes and the close key closed the tab; in the web tab the switch keys switched');
    if (r.stage2Skip) say(`stage 2: not run -- ${r.stage2Skip}`);
    else say(r.stage2.length ? `stage 2: FAIL -- ${r.stage2.join('; ')}` : 'stage 2: PASS -- the shell keys reached the hosted terminal\'s PTY with nothing switched; the switch keys switched the tab and reached no PTY; the close key requested Orca\'s close; a terminal selection pasted once into that terminal at PowerBrowser\'s default and not after the user turned it off, and a Theia editable got the system selection; Orca\'s checkpoint held no leave check, Theia\'s large pastes stayed Theia\'s and Orca\'s activation focus took no keys');
    say(repeat.length ? `stage 3: FAIL -- ${repeat.join('; ')}` : 'stage 3: equal to the control');
    say(`note -- control effects t<n> ${JSON.stringify(r.obs.control.term)}, web ${JSON.stringify(r.obs.control.web)}`);
    const fails = overallVerdict({ control, stage2: r.stage2, stage2Skip: r.stage2Skip, panesPresent: r.panesPresent, repeat });
    // Stage 2 not run is a partial run: SKIP unless something failed (SKIP-PROTOCOL.md).
    const code = verdictExit(NAME, fails, skipsOf(r));
    if (fails.length) { for (const f of fails) console.error(lib.redactAfterSession(`${NAME}: FAIL -- ${f}`)); console.log(`${NAME}: FAIL`); return 1; }
    if (code === 0) say('PASS -- D-32 control in t<n> and the web tab; stage 2 PASS; the t<n> and web tab effects equal the in-session control');
    return code;
}

/** The parts of the run that did not run because an input is absent. */
export function skipsOf(r) {
    return r.stage2Skip ? [`stage 2 (the hosted Orca terminal, paste, listener and focus legs) did not run: ${r.stage2Skip}. Next step: build what that names, then run scripts/verify-platform.sh --only orca-terminal-keys-live`] : [];
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
            platform: 'linux', token: '@P1P@', tab: 'orca-pane:term2', printed: 1, count: 2, offCount: 2, terminalSentinel: false,
            preset: { checked: true }, userOff: { before: true, checked: false, held: false },
            theia: { default: { sentinel: 'pb-paste-default-1', clip: 'ok', text: 'pb-paste-default-1' }, on: { sentinel: 'pb-paste-on-1', clip: 'ok', text: 'pb-paste-on-1' }, off: { sentinel: 'pb-paste-off-1', clip: 'ok', text: 'pb-paste-off-1' } },
        },
        listeners: {
            leave: { activated: true, failed: 1, permit: true },
            paste: { editor: { reached: true, equal: true, len: 102455 }, quick: { reached: true, value: 'line 0 line 1', expected: 'line 0 line 1', pref: 2 }, ui: { before: 0, after: 0 } },
            focus: { palette: { mode: 'coding' }, control: true, editor: { text: 'abcxyz', want: 'abcxyz', pty: '' }, web: { text: 'defghi', want: 'defghi', pty: '' } },
        },
        focusGate: {
            background: { hidden: true, mounted: true, visible: true, inEditor: true, text: 'abcxyz', want: 'abcxyz', pty: '' },
            restore: { hidden: true, mounted: true, visible: true, inEditor: true, text: 'abcxyz', want: 'abcxyz', pty: '' },
            click: { tab: true, focused: true, reached: true },
            command: { worktree: true, error: null, tab: 'orca-pane:term5', focused: true, reached: true, editorText: '' },
        },
        after: { term: structuredClone(term), web: structuredClone(web) },
    };
}
const all = (o) => overallVerdict({ control: controlVerdict(o), stage2: [...orcaStageVerdict(o), ...pasteVerdict(o), ...listenersVerdict(o), ...focusGateVerdict(o)], stage2Skip: null, panesPresent: true, repeat: repeatVerdict(o) });
const withGate = (f) => { const o = fixtureObs(); f(o.focusGate); return all(o); };
const withPaste = (patch) => { const o = fixtureObs(); Object.assign(o.paste, patch); return all(o); };
const withTheia = (state, patch) => { const o = fixtureObs(); Object.assign(o.paste.theia[state], patch); return all(o); };
const both = (o, f) => { f(o.control); f(o.after); return o; };
const withListeners = (f) => { const o = fixtureObs(); f(o.listeners); return all(o); };

/** An in-memory clipboard pair behind the port the run uses. */
function memoryPort(initial, failRead = false) {
    const state = { global: initial.global, selection: initial.selection };
    return { state, get: async (w) => { if (failRead) throw new Error('denied'); return { ok: true, text: state[w] }; }, set: async (w, t) => { state[w] = t; } };
}
async function clipboardRestoreCase() {
    const port = memoryPort({ global: 'my copy', selection: 'my selection' });
    await withClipboardsRestored(port, async () => { await port.set('global', 'x'.repeat(100 * 1024)); await port.set('selection', 'pb-paste-default-1'); });
    return port.state.global === 'my copy' && port.state.selection === 'my selection' ? [] : [`the clipboards were left as ${JSON.stringify(port.state).slice(0, 80)}`];
}
async function clipboardRestoreThrowCase() {
    const port = memoryPort({ global: 'my copy', selection: 'my selection' });
    try { await withClipboardsRestored(port, async () => { await port.set('global', 'run text'); throw new Error('run failed'); }); } catch { /* the run's own failure */ }
    return port.state.global === 'my copy' ? [] : ['the clipboard was not restored after a failed run'];
}
async function clipboardUnreadableCase() {
    const port = memoryPort({ global: 'a', selection: 'b' }, true);
    const notes = [];
    await withClipboardsRestored(port, async () => { await port.set('global', 'run text'); }, (n) => notes.push(n));
    return notes.filter((n) => /could not be read before the run \(denied\), so it was not restored/.test(n)).map((n) => n.replace(/^note -- /, ''));
}
async function clipboardUnreadableLeftCase() {
    const port = memoryPort({ global: 'a', selection: 'b' }, true);
    await withClipboardsRestored(port, async () => { await port.set('global', 'run text'); });
    return port.state.global === 'run text' ? [] : ['an unreadable clipboard was written to by the restore'];
}
async function clipboardEmptyCase() {
    const port = memoryPort({ global: null, selection: null });
    await withClipboardsRestored(port, async () => { await port.set('global', 'run text'); });
    return port.state.global === '' ? [] : [`a clipboard that held no text kept ${JSON.stringify(port.state.global)}`];
}
function recorderCase() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-keys-work-'));
    writeFileSync(join(dir, 't1-1.bytes'), '^W');
    if (!existsSync(dir)) return ['the control folder was not created'];
    return removeWorkDir(dir) ? [] : ['the recorder folder is still there'];
}
/** The real main on a tree with no built PowerBrowser: exit 77 and the one SKIP line (no browser is started). */
function skipRun() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    const r = spawnSync(process.execPath, [SELF], { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT, env: { ...env, PB_LIVE_LOCK_HELD: '1', PB_FIREFOX_BIN: '/nonexistent/pb-self-test/powerbrowser' } });
    const fails = [];
    if (r.status !== SKIP_EXIT) fails.push(`exit ${r.status}, want ${SKIP_EXIT} (${String(r.stdout).trim().slice(0, 120)} ${String(r.stderr).trim().slice(0, 120)})`);
    if (!new RegExp(`^${NAME}: SKIP -- .+`, 'm').test(r.stdout ?? '')) fails.push('no "<name>: SKIP -- <reason>" line on stdout');
    return fails;
}

async function runSelfTest() {
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
        if (readCheckpointFailedEvent("export const ORCA_RENDERER_SHUTDOWN_CHECKPOINT_FAILED_EVENT =\n  'orca:x-failed'\n") !== 'orca:x-failed') fails.push('readCheckpointFailedEvent');
        if (readPaletteLabel("onClick={() => openModal('worktree-palette')}\n        aria-label={translate(\n          'auto.x.SidebarNav.1',\n          'Search things'\n        )}") !== 'Search things') fails.push('readPaletteLabel');
        if (singleLinePaste('a\nb\r\nc\n\n') !== 'a b c') fails.push(`singleLinePaste gave ${JSON.stringify(singleLinePaste('a\nb\r\nc\n\n'))}`);
        if (existsSync(join(REPO_ROOT, SHUTDOWN_EVENTS_REL)) && (!readCheckpointFailedEvent(read(join(REPO_ROOT, SHUTDOWN_EVENTS_REL))) || !readPaletteLabel(read(join(REPO_ROOT, SIDEBAR_NAV_REL))))) fails.push('the failed-event name or the palette label reads nothing from the pinned sources');
        return fails;
    };
    const lib = await import('./lib/orca-tabs-live.mjs');
    const cases = [
        ['all stages control', null, () => all(fixtureObs())],
        ['passthrough equals the shell keys', null, () => passthroughVerdict(['ctrl+t', 'ctrl+w'], SHELL)],
        ['a passthrough list differing from the shell keys', 'ORCA_TERMINAL_PASSTHROUGH_KEYS (ctrl+w) differs from the shell keys (ctrl+w, ctrl+t)', () => passthroughVerdict(['ctrl+w'], SHELL)],
        ['a click on a tab that was not found', "click NOT SCORED -- the terminal's tab was not found to click", () => withGate((g) => { g.click.tab = false; })],
        ['a restored layout that put keys into the PTY', "restore: keys typed in the Theia editor reached the Orca terminal's PTY", () => withGate((g) => { g.restore.pty = 'x'; })],
        ['a restored layout whose editor text changed', 'restore: keys typed in the Theia editor landed there as "ab"', () => withGate((g) => { g.restore.text = 'ab'; })],
        ['a restore leg whose terminal never mounted', 'restore NOT SCORED -- the terminal never showed its xterm', () => withGate((g) => { g.restore.mounted = false; })],
        ['the focus gate leg whose command reports an error', 'New Orca Terminal produced no hosted terminal', () => withGate((g) => { g.command.error = 'x'; })],
        ['a New Orca Terminal whose keys did not reach the PTY', 'keys typed after New Orca Terminal did not reach its PTY', () => withGate((g) => { g.command.reached = false; })],
        ['clipboards restored over an in-memory clipboard (harness-live-tabs-13)', null, () => clipboardRestoreCase()],
        ['a clipboard restored even when the run throws', null, () => clipboardRestoreThrowCase()],
        ['a clipboard that cannot be read is named and left', 'the global clipboard could not be read before the run (denied)', () => clipboardUnreadableCase()],
        ['an unreadable clipboard is not written by the restore', null, () => clipboardUnreadableLeftCase()],
        ['a clipboard that held no text is emptied of the run\'s text', null, () => clipboardEmptyCase()],
        ['the recorder folder is removed', null, () => recorderCase()],
        ['the confirmation judged against a baseline (a dialog that was already open is not the close key\'s)', null, () => (lib.confirmationAppeared(null, ['Stop running command?']) === false && lib.confirmationAppeared({ count: 1, text: 'Stop running command? x' }, ['Stop running command?']) === true ? [] : ['the baseline rule is wrong'])],
        ['another dialog is not Orca\'s close confirmation', 'not the close confirmation', () => (lib.confirmationAppeared({ count: 1, text: 'Delete file?' }, ['Stop running command?']) ? [] : ['not the close confirmation'])],
        ['stage 2 not run is a skip', null, () => (skipsOf({ stage2Skip: 'no built orca/' }).length === 1 && skipsOf({ stage2Skip: null }).length === 0 ? [] : ['skipsOf is wrong'])],
        ['stage 2 not run exits 77 when nothing failed', null, () => (lib.verdictExitQuiet(NAME, [], skipsOf({ stage2Skip: 'no built orca/' })) === SKIP_EXIT ? [] : ['a partial run did not exit 77'])],
        ['a failure wins over the skipped stage 2', null, () => (lib.verdictExitQuiet(NAME, ['control failed'], skipsOf({ stage2Skip: 'no built orca/' })) === 1 ? [] : ['a failure did not win over a skip'])],
        ['the live lock is taken by a row started outside the driver (harness-live-tabs-14)', null, () => lib.lockProbeVerdict(SELF, NAME)],
        ['the real main with no built PowerBrowser exits 77 with the one SKIP line', null, () => skipRun()],
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
        ["Orca's selection pasted into a Theia editable after a terminal selection", 'after a terminal selection, a middle-click into a Theia editable inserted "@P1P@"', () => withTheia('on', { text: '@P1P@' })],
        ['nothing pasted into a Theia editable at the default', 'at PowerBrowser\'s default, a middle-click into a Theia editable inserted ""', () => withTheia('default', { text: '' })],
        ['nothing pasted into a Theia editable with the user\'s switch off', 'with the user\'s switch off, a middle-click into a Theia editable inserted ""', () => withTheia('off', { text: '' })],
        ['the Theia editable not measured at the default', 'not measured at PowerBrowser\'s default', () => withPaste({ theia: { ...fixtureObs().paste.theia, default: null } })],
        ["Orca's switch not found", "switch reads {\"error\":\"switch not found\"}", () => withPaste({ preset: { error: 'switch not found' } })],
        ['the Linux preset not applied', 'want on (the Linux preset)', () => withPaste({ preset: { checked: false } })],
        ["the preset overriding the user's off", "the user's off did not hold", () => withPaste({ userOff: { before: true, checked: false, held: true } })],
        ["the user's switch not turned off", 'the user could not turn Orca\'s switch off', () => withPaste({ userOff: { error: 'switch not found' } })],
        ["a paste with the user's switch off", "with the user's switch off, a middle-click in the hosted Orca terminal pasted its selection 1 time(s), want none", () => withPaste({ offCount: 3 })],
        ['Orca holding the leave check', 'Orca must never hold PowerBrowser\'s quit', () => withListeners((l) => { l.leave.permit = false; })],
        ['a leave check without user activation', 'leave check: NOT SCORED -- the Theia document had no user activation', () => withListeners((l) => { l.leave.activated = false; })],
        ["a leave check with Orca's checkpoint not failing", "leave check: NOT SCORED -- Orca's checkpoint reported no failure", () => withListeners((l) => { l.leave.failed = 0; })],
        ['Orca claiming the editor paste', "into the Theia editor never got past the document's capture listeners", () => withListeners((l) => { l.paste.editor.reached = false; })],
        ['an editor paste arriving changed', 'the Theia editor holds 5 characters', () => withListeners((l) => { l.paste.editor.equal = false; l.paste.editor.len = 5; })],
        ['Orca claiming the quick input paste', "into Theia's quick input never got past the document's capture listeners", () => withListeners((l) => { l.paste.quick.reached = false; })],
        ['newlines stripped in the quick input', "Theia's quick input holds \"line 0line 1\"", () => withListeners((l) => { l.paste.quick.value = 'line 0line 1'; })],
        ['an unexpected newline pref', 'editor.singleLine.pasteNewlines is 3', () => withListeners((l) => { l.paste.quick.pref = 3; })],
        ['an Orca toast after a paste', '1 Orca toast or dialog element(s) appeared', () => withListeners((l) => { l.paste.ui.after = 1; })],
        ['the palette not activating the worktree', "activation focus: NOT SCORED -- Orca's worktree palette", () => withListeners((l) => { l.focus.palette = { error: 'no worktree row in the palette' }; })],
        ['an unproven terminal read', 'activation focus: NOT SCORED -- keys typed into the Orca terminal itself', () => withListeners((l) => { l.focus.control = false; })],
        ['editor keys taken by the Orca terminal', 'keys typed in a Theia editor reached the Orca terminal\'s PTY ("xyz")', () => withListeners((l) => { l.focus.editor.text = 'abc'; l.focus.editor.pty = 'xyz'; })],
        ['web-tab keys taken by the Orca terminal', 'keys typed in a web tab reached the Orca terminal\'s PTY ("ghi")', () => withListeners((l) => { l.focus.web.text = 'def'; l.focus.web.pty = 'ghi'; })],
        ['background-created terminal taking the editor keys', 'background: keys typed in the Theia editor landed there as "abc"', () => withGate((g) => { g.background.text = 'abc'; g.background.pty = 'xyz'; g.background.inEditor = false; })],
        ['the background terminal reaching the PTY only', "background: keys typed in the Theia editor reached the Orca terminal's PTY", () => withGate((g) => { g.background.pty = 'x'; })],
        ['focus left the editor on a restored layout', 'restore: keyboard focus left the Theia editor', () => withGate((g) => { g.restore.inEditor = false; })],
        ['a restore leg over a terminal already shown', 'restore NOT SCORED -- the terminal was already shown', () => withGate((g) => { g.restore.hidden = false; })],
        ['a background leg whose terminal never mounted', 'background NOT SCORED -- the terminal never showed its xterm', () => withGate((g) => { g.background.mounted = false; })],
        ['a tab click giving no focus', "a click on the Orca terminal's tab did not give it keyboard focus", () => withGate((g) => { g.click.focused = false; })],
        ['a tab click whose keys never reached the PTY', "keys typed after a click on the Orca terminal's tab did not reach its PTY", () => withGate((g) => { g.click.reached = false; })],
        ['New Orca Terminal not focusing its terminal', 'the terminal New Orca Terminal created did not get keyboard focus', () => withGate((g) => { g.command.focused = false; })],
        ['New Orca Terminal creating nothing', 'New Orca Terminal produced no hosted terminal', () => withGate((g) => { g.command.tab = null; })],
        ['the focus gate leg not run', 'focus gate leg not measured', () => { const o = fixtureObs(); o.focusGate = null; return all(o); }],
        ['the app-wide listener leg not run', 'app-wide listener leg not measured', () => { const o = fixtureObs(); o.listeners = null; return all(o); }],
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
        try { fails = await runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
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
    const unknown = args.find((a) => a !== '--self-test' && a !== '--lock-probe');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test | --lock-probe])`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    // A live row started outside the driver takes the live lock itself, before it launches anything.
    const lib = await import('./lib/orca-tabs-live.mjs');
    let held;
    try { held = lib.reexecUnderLiveLock(SELF, args); } catch (err) {
        console.error(`${NAME}: FAIL -- ${err.message}`);
        process.exit(1);
    }
    if (held !== null) process.exit(held);
    if (args.includes('--lock-probe')) { console.log(lib.lockProbeLine(NAME)); process.exit(0); }
    process.exit(await main());
}
