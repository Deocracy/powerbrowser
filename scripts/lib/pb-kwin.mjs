// scripts/lib/pb-kwin.mjs
//
// Phase 39 (39-01): the two KWin needs of the close-out on the owner's KDE
// Wayland desktop -- a capture of the PowerBrowser shell window (999.14) and
// real OS input for the real-input rows -- behind one gate: no ydotool key
// and no capture is sent unless KWin reports, immediately before it, that
// the active window's resourceClass contains 'powerbrowser' AND its pid is
// a browser this run launched (firefox-bidi.mjs launchedBrowserPids;
// 39-REVIEW CR-01: a PowerBrowser the owner has open has the same class)
// (39-RESEARCH Pitfall 5: ydotool types into whatever has focus). The read
// and the send are separate processes, so focus can move between them; a
// capture is gated again once spectacle returns and its PNG is deleted when
// that second read refuses (39-REVIEW WR-01).
//
// Read-back mechanism (assumption A1, measured 2026-11-05 on KWin 6.6.6): a
// KWin script print()s a unique marker line and the caller reads it from
// `journalctl --user -o cat`. Every call here needs the Bash sandbox off
// (session D-Bus, the user journal, /run/ydotoold/socket).
//
// A session for these calls must be HEADED: launch with PB_LIVE_HEADED=1
// (scripts/lib/firefox-bidi.mjs); a --headless session has no window.
//
// Node built-ins and firefox-bidi.mjs (which imports neither this module nor
// pb-live-probe) at module scope; the self-test imports ./pb-live-probe.mjs
// dynamically so a static import of this module from pb-live-probe creates
// no cycle.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchedBrowserPids } from './firefox-bidi.mjs';

const SHELL_CLASS = 'powerbrowser';
// The shell window's caption; a stock browser window reads "<page> — PowerBrowser".
const SHELL_CAPTION = 'PowerBrowser';
const YDOTOOL_SOCKET = '/run/ydotoold/socket';
// Linux input-event codes (linux/input-event-codes.h) for the short sequences the real-input rows send.
const KEY_CODES = {
    esc: 1, backspace: 14, tab: 15, enter: 28, ctrl: 29, shift: 42, alt: 56, space: 57,
    f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
    home: 102, up: 103, pageup: 104, left: 105, right: 106, end: 107, down: 108, pagedown: 109, delete: 111,
    meta: 125, menu: 127, back: 158, forward: 159,
    ...Object.fromEntries([...'1234567890'].map((d, i) => [d, 2 + i])),
    ...Object.fromEntries([...'qwertyuiop'].map((c, i) => [c, 16 + i])),
    ...Object.fromEntries([...'asdfghjkl'].map((c, i) => [c, 30 + i])),
    ...Object.fromEntries([...'zxcvbnm'].map((c, i) => [c, 44 + i])),
};
// ydotool click codes: the button in the low bits, 0x40 down, 0x80 up (ydotool 1.0.4 `click --help`).
const BUTTON_CODES = { left: 0x00, right: 0x01, middle: 0x02, back: 0x03, forward: 0x04 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const qdbus = (...args) => execFileSync('qdbus', ['org.kde.KWin', ...args], { encoding: 'utf8', timeout: 10000 }).trim();

/** Loads, runs and unloads a KWin script; returns the unique marker its print() lines carry. */
function runKwinScript(body) {
    const marker = `pb-kwin-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = mkdtempSync(join(tmpdir(), 'pb-kwin-'));
    const file = join(dir, 'script.js');
    writeFileSync(file, body.replaceAll('__MARKER__', marker));
    try {
        const id = qdbus('/Scripting', 'org.kde.kwin.Scripting.loadScript', file, marker);
        qdbus(`/Scripting/Script${id}`, 'org.kde.kwin.Script.run');
    } finally {
        try { qdbus('/Scripting', 'org.kde.kwin.Scripting.unloadScript', marker); } catch { /* never loaded */ }
        rmSync(dir, { recursive: true, force: true });
    }
    return marker;
}

/** The text after `marker` on its journal line, polled for up to 3 s; '' when it never appears. */
function readMarker(marker, sinceEpochS) {
    const deadline = Date.now() + 3000;
    for (;;) {
        const out = execFileSync('journalctl', ['--user', '--since', `@${sinceEpochS}`, '-o', 'cat'], { encoding: 'utf8', timeout: 10000 });
        const line = out.split('\n').find(l => l.includes(marker));
        if (line) {
            return line.slice(line.indexOf(marker) + marker.length).trim();
        }
        if (Date.now() > deadline) {
            return '';
        }
        execFileSync('sleep', ['0.1']);
    }
}

/**
 * Activates the PowerBrowser shell window of a browser this run launched (not a stock browser window, a dialog, or
 * another PowerBrowser process's window); true when one was found.
 */
export function raiseShell() {
    const since = Math.floor(Date.now() / 1000) - 1;
    const marker = runKwinScript(`let hit = false;
const pids = ${JSON.stringify(launchedBrowserPids())};
for (const w of workspace.windowList()) {
    if (String(w.resourceClass).toLowerCase().includes(${JSON.stringify(SHELL_CLASS)}) && w.normalWindow && !w.transient
        && String(w.caption) === ${JSON.stringify(SHELL_CAPTION)} && pids.includes(w.pid)) { workspace.activeWindow = w; hit = true; }
}
print("__MARKER__ " + hit);
`);
    return readMarker(marker, since) === 'true';
}

/**
 * `{ resourceClass, caption, pid, x, y, width, height, scale }` of KWin's active window: frameGeometry in logical
 * pixels and its output's devicePixelRatio (a capture is frame size times scale in device pixels), or null.
 */
export function activeWindow() {
    const since = Math.floor(Date.now() / 1000) - 1;
    const marker = runKwinScript(`const w = workspace.activeWindow;
print("__MARKER__ " + JSON.stringify(w ? { resourceClass: String(w.resourceClass), caption: String(w.caption), pid: w.pid,
    x: w.frameGeometry.x, y: w.frameGeometry.y, width: w.frameGeometry.width, height: w.frameGeometry.height,
    scale: w.output ? w.output.devicePixelRatio : 1 } : null));
`);
    const text = readMarker(marker, since);
    return text ? JSON.parse(text) : null;
}

/**
 * The gate: reads the active window through `readActive` and returns it when its class contains `expectClass` and
 * its pid is one of `expectPids` (the browsers this run launched); otherwise throws "refused: active window ...".
 * An empty read-back, or no launched browser, refuses.
 */
function gate({ expectClass = SHELL_CLASS, expectPids = launchedBrowserPids(), readActive = activeWindow } = {}) {
    const w = readActive();
    const cls = w && typeof w === 'object' ? String(w.resourceClass ?? '') : String(w ?? '');
    if (!expectClass || !cls.toLowerCase().includes(expectClass.toLowerCase())) {
        throw new Error(`refused: active window class ${JSON.stringify(cls)} does not contain ${JSON.stringify(expectClass)}`);
    }
    const pid = w && typeof w === 'object' ? w.pid : undefined;
    if (!expectPids.includes(pid)) {
        throw new Error(`refused: active window pid ${JSON.stringify(pid ?? null)} is not a browser this run launched (${JSON.stringify(expectPids)})`);
    }
    return w;
}

/** True when `w`, an activeWindow() read, passes the gate: a PowerBrowser-class window of a browser this run launched. */
export function isRunWindow(w) {
    try {
        gate({ readActive: () => w });
        return true;
    } catch {
        return false;
    }
}

/**
 * Raises the shell, waits up to 5 s for it to be the active window, then captures the active window with
 * spectacle into `out`, without the drop shadow so the PNG is the window frame alone. Returns `{ path, ...geometry }`;
 * throws "refused: active window ..." if the shell never became active, or if the gate refuses once the grab returns
 * (the PNG is then deleted). `opts` exists for the self-test plants.
 */
export async function captureShell(out, opts = {}) {
    try { raiseShell(); } catch { /* the poll below decides */ }
    const deadline = Date.now() + 5000;
    let w;
    for (;;) {
        try {
            w = gate(opts);
            break;
        } catch (e) {
            if (Date.now() > deadline) {
                throw e;
            }
        }
        await sleep(100);
    }
    // spectacle -b returns after about 25 s on this host (measured 2026-11-05), with the file written.
    execFileSync('spectacle', ['-b', '-n', '-a', '-S', '-o', out], { timeout: 60000 });
    if (!existsSync(out)) {
        throw new Error(`spectacle wrote no file at ${out}`);
    }
    gateAfterGrab(out, opts);
    return { path: out, ...w };
}

/** WR-01: the gate read again once spectacle returns; a refusal deletes the PNG, which may hold another window. */
function gateAfterGrab(out, opts) {
    try {
        gate(opts);
    } catch (e) {
        rmSync(out, { force: true });
        throw new Error(`${e.message} once the grab returned; ${out} deleted`);
    }
}

/**
 * Captures KWin's active window into `out` without raising anything: for a PowerBrowser-class window other than the
 * shell (the GTK print dialog, a DevTools toolbox window). The same gate refuses unless the active window's class
 * contains 'powerbrowser' and its pid is a browser this run launched, before the grab and again once it returns.
 * Returns `{ path, ...geometry }`. shortcut: the gate is read before and after the grab, not with it, so a window
 * that takes focus and gives it back during the grab is not seen; every PNG is opened before it is committed.
 */
export function captureActive(out, opts = {}) {
    const w = gate(opts);
    execFileSync('spectacle', ['-b', '-n', '-a', '-S', '-o', out], { timeout: 60000 });
    if (!existsSync(out)) {
        throw new Error(`spectacle wrote no file at ${out}`);
    }
    gateAfterGrab(out, opts);
    return { path: out, ...w };
}

/**
 * Sends one short chord through ydotool: every key down in order, then up in reverse (no text typing).
 * The active window is read back immediately before the send, as a separate step (focus can move in between), and
 * the send is refused unless it is a PowerBrowser window of a browser this run launched.
 */
export function osKeys(keys, opts = {}) {
    const codes = keys.map(k => {
        if (!(k in KEY_CODES)) {
            throw new Error(`osKeys: unknown key ${JSON.stringify(k)}; known: ${Object.keys(KEY_CODES).join(', ')}`);
        }
        return KEY_CODES[k];
    });
    const window = gate(opts);
    const args = [...codes.map(c => `${c}:1`), ...codes.slice().reverse().map(c => `${c}:0`)];
    execFileSync('ydotool', ['key', ...args], { env: { ...process.env, YDOTOOL_SOCKET }, timeout: 10000 });
    return { sent: keys, window };
}

/** KWin's pointer position in logical screen pixels, `{ x, y }`, or null when the read-back is empty. */
export function cursorPos() {
    const since = Math.floor(Date.now() / 1000) - 1;
    const marker = runKwinScript('print("__MARKER__ " + JSON.stringify({ x: workspace.cursorPos.x, y: workspace.cursorPos.y }));');
    const text = readMarker(marker, since);
    return text ? JSON.parse(text) : null;
}

const ydotool = args => execFileSync('ydotool', args.map(String), { env: { ...process.env, YDOTOOL_SOCKET }, timeout: 10000 });

/**
 * Moves the real pointer to logical screen (x, y) by relative ydotool moves, each read back through KWin: pointer
 * acceleration applies to the virtual device, so an absolute move does not land (measured 2026-11-06: `mousemove
 * --absolute 500 400` ended at 2,0). Large errors are halved so the accelerated step cannot overshoot far.
 */
function movePointer(x, y) {
    let at = cursorPos();
    const trace = [];
    for (let i = 0; i < 30 && at; i++) {
        const dx = Math.round(x - at.x);
        const dy = Math.round(y - at.y);
        if (dx === 0 && dy === 0) {
            return at;
        }
        // Gain is above 1 on large moves and below 1 on 1-3 px ones (measured: 31 -> 44, 3 -> 1 or 2).
        const step = d => (Math.abs(d) > 6 ? Math.round(d / 2) : d);
        ydotool(['mousemove', '--', step(dx), step(dy)]);
        at = cursorPos();
        trace.push(`${step(dx)},${step(dy)}->${at?.x},${at?.y}`);
    }
    throw new Error(`osPointer: the pointer did not settle on ${x},${y} (KWin reads ${JSON.stringify(at)}; moves ${trace.slice(-6).join(' ')})`);
}

/**
 * Waits until nobody else is moving the pointer: KWin reads the same position for 750 ms. The pointer is shared with
 * the owner's live desktop (measured 2026-11-06: a 2 px move read back 12 px off while the mouse was in use), so a
 * real-input step never races a hand on the mouse. Throws "pointer busy" after `timeoutMs`.
 */
export async function waitPointerIdle(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    let last = cursorPos();
    let still = 0;
    while (still < 3) {
        if (Date.now() > deadline) {
            throw new Error(`pointer busy: KWin read the pointer moving for ${timeoutMs / 1000} s (someone is using the mouse)`);
        }
        await sleep(250);
        const now = cursorPos();
        still = now && last && now.x === last.x && now.y === last.y ? still + 1 : 0;
        last = now;
    }
}

/**
 * Real pointer input at logical screen (x, y): `action` is move, click, double, down, up or hold (down, `holdMs`,
 * up); `button` is left, middle, right, back or forward. The gate runs before the move and again before the button
 * event, which is sent only while KWin still reads the pointer on the target (someone moving the mouse refuses it)
 * and the target lies inside the gated window's frame.
 */
export async function osPointer({ x, y, button = 'left', action = 'click', holdMs = 600 }, opts = {}) {
    if (!(button in BUTTON_CODES)) {
        throw new Error(`osPointer: unknown button ${JSON.stringify(button)}; known: ${Object.keys(BUTTON_CODES).join(', ')}`);
    }
    gate(opts);
    await waitPointerIdle();
    movePointer(x, y);
    if (action === 'move') {
        return { x, y, action };
    }
    const window = gate(opts);
    const at = cursorPos();
    if (!at || Math.round(at.x) !== Math.round(x) || Math.round(at.y) !== Math.round(y)) {
        throw new Error(`refused: the pointer left ${x},${y} before the ${button} ${action} (KWin reads ${JSON.stringify(at)})`);
    }
    // CR-02: a button event goes to the window under the pointer, not the active one, so the point must be inside
    // the gated window's frame. shortcut: a window stacked over the shell inside its frame is not seen; upgrade to a
    // stackingOrder read if a real-input row ever clicks under a popup or notification.
    const f = window;
    if (!(x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height)) {
        throw new Error(`refused: active window frame ${JSON.stringify({ x: f.x, y: f.y, width: f.width, height: f.height })} does not hold the pointer at ${x},${y} for the ${button} ${action}`);
    }
    const b = BUTTON_CODES[button];
    const hex = n => `0x${n.toString(16)}`;
    if (action === 'click') {
        ydotool(['click', hex(0xc0 | b)]);
    } else if (action === 'double') {
        ydotool(['click', '-D', 40, hex(0xc0 | b), hex(0xc0 | b)]);
    } else if (action === 'down') {
        ydotool(['click', hex(0x40 | b)]);
    } else if (action === 'up') {
        ydotool(['click', hex(0x80 | b)]);
    } else if (action === 'hold') {
        ydotool(['click', hex(0x40 | b)]);
        try { await sleep(holdMs); } finally { ydotool(['click', hex(0x80 | b)]); }
    } else {
        throw new Error(`osPointer: unknown action ${JSON.stringify(action)}`);
    }
    return { x, y, button, action, window };
}

/**
 * WR-02: releases `button` with no gate, for a `finally` after a gated press. The release goes to the surface that took
 * the press (the pointer's implicit grab), so a refused gate must never leave the button held on the owner's desktop.
 */
export function releaseButton(button = 'left') {
    if (!(button in BUTTON_CODES)) {
        throw new Error(`releaseButton: unknown button ${JSON.stringify(button)}`);
    }
    ydotool(['click', `0x${(0x80 | BUTTON_CODES[button]).toString(16)}`]);
}

// Each plant must refuse all four sends with a "refused: active window" error naming `expect`.
const PLANTS = [
    { name: 'class-mismatch', opts: { expectClass: 'pb-gate-plant-absent' }, expect: 'does not contain' },
    { name: 'readback-empty', opts: { readActive: () => '' }, expect: 'does not contain' },
    // CR-01: the right class, another process's pid (this node process launched no window of its own).
    { name: 'pid-mismatch', opts: { readActive: () => ({ ...activeWindow(), resourceClass: SHELL_CLASS, pid: process.pid }) }, expect: 'is not a browser this run launched' },
];

async function selfTest() {
    process.env.PB_LIVE_HEADED = '1';
    const { withProbeShell } = await import('./pb-live-probe.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'pb-kwin-self-test-'));
    let failed = 0;
    try {
        await withProbeShell(async () => {
            const raised = raiseShell();
            let active = null;
            for (let i = 0; i < 50 && !isRunWindow(active); i++) {
                await sleep(100);
                active = activeWindow();
            }
            console.log(`clean control: raiseShell ${raised}, active ${JSON.stringify(active)}`);
            try {
                const r = osKeys(['shift']);
                console.log(`ok  clean-control -> sent ${r.sent.join('+')} to ${r.window.resourceClass}`);
            } catch (e) {
                failed++;
                console.log(`FAIL clean-control -> ${e.message}`);
            }
            try {
                const r = await osPointer({ x: Math.round(active.x + active.width / 2), y: Math.round(active.y + active.height / 2), action: 'move' });
                const at = cursorPos();
                if (!at || Math.round(at.x) !== r.x || Math.round(at.y) !== r.y) throw new Error(`KWin reads the pointer at ${JSON.stringify(at)}, not ${r.x},${r.y}`);
                console.log(`ok  clean-pointer -> moved to ${r.x},${r.y}`);
            } catch (e) {
                failed++;
                console.log(`FAIL clean-pointer -> ${e.message}`);
            }
            try {
                const shot = await captureShell(join(dir, 'clean.png'));
                console.log(`ok  clean-capture -> ${shot.resourceClass} ${shot.width}x${shot.height}`);
            } catch (e) {
                failed++;
                console.log(`FAIL clean-capture -> ${e.message}`);
            }
            try {
                const shot = captureActive(join(dir, 'clean-active.png'));
                console.log(`ok  clean-capture-active -> ${shot.resourceClass} ${shot.width}x${shot.height}`);
            } catch (e) {
                failed++;
                console.log(`FAIL clean-capture-active -> ${e.message}`);
            }
            for (const plant of PLANTS) {
                const verdicts = [];
                const refused = e => e.message.startsWith('refused: active window') && e.message.includes(plant.expect);
                try { osKeys(['shift'], plant.opts); verdicts.push('osKeys sent'); } catch (e) { if (!refused(e)) verdicts.push(`osKeys ${e.message}`); }
                try { await osPointer({ x: 0, y: 0, action: 'move' }, plant.opts); verdicts.push('osPointer moved'); } catch (e) { if (!refused(e)) verdicts.push(`osPointer ${e.message}`); }
                try { await captureShell(join(dir, `${plant.name}.png`), plant.opts); verdicts.push('captureShell captured'); } catch (e) { if (!refused(e)) verdicts.push(`captureShell ${e.message}`); }
                try { captureActive(join(dir, `${plant.name}-active.png`), plant.opts); verdicts.push('captureActive captured'); } catch (e) { if (!refused(e)) verdicts.push(`captureActive ${e.message}`); }
                if (verdicts.length) {
                    failed++;
                    console.log(`FAIL ${plant.name} -> ${verdicts.join('; ')}`);
                } else {
                    console.log(`ok  ${plant.name} -> refused`);
                }
            }
            // WR-01: the window passes the gate before the grab and is foreign once it returns: refused, PNG deleted.
            let reads = 0;
            const afterGrab = { readActive: () => (reads++ === 0 ? activeWindow() : { ...activeWindow(), pid: process.pid }) };
            const afterGrabOut = join(dir, 'after-grab.png');
            try {
                captureActive(afterGrabOut, afterGrab);
                failed++;
                console.log('FAIL after-grab-refused -> captureActive kept the capture');
            } catch (e) {
                if (e.message.startsWith('refused: active window pid') && e.message.includes('once the grab returned') && !existsSync(afterGrabOut)) {
                    console.log('ok  after-grab-refused -> refused, PNG deleted');
                } else {
                    failed++;
                    console.log(`FAIL after-grab-refused -> ${e.message} (PNG left: ${existsSync(afterGrabOut)})`);
                }
            }
            // CR-02: the gated window's frame moved off the point, so the button event must be refused. The action is a
            // release at the shell's centre, the one event that is harmless if the check is missing.
            try {
                const opts = { readActive: () => { const w = activeWindow(); return w && { ...w, x: w.x + w.width + 10 }; } };
                await osPointer({ x: Math.round(active.x + active.width / 2), y: Math.round(active.y + active.height / 2), action: 'up' }, opts);
                failed++;
                console.log('FAIL pointer-outside-frame -> osPointer sent the release');
            } catch (e) {
                if (e.message.startsWith('refused: active window frame')) {
                    console.log('ok  pointer-outside-frame -> refused');
                } else {
                    failed++;
                    console.log(`FAIL pointer-outside-frame -> ${e.message}`);
                }
            }
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    console.log(failed ? `pb-kwin --self-test: FAIL (${failed})` : 'pb-kwin --self-test: PASS');
    return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--self-test')) {
        selfTest().then(code => process.exit(code), e => { console.log(`pb-kwin --self-test: FAIL (harness: ${e.message})`); process.exit(1); });
    } else {
        console.log('usage: node scripts/lib/pb-kwin.mjs --self-test');
        process.exit(2);
    }
}
