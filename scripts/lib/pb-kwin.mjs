// scripts/lib/pb-kwin.mjs
//
// Phase 39 (39-01): the two KWin needs of the close-out on the owner's KDE
// Wayland desktop -- a capture of the PowerBrowser shell window (999.14) and
// real OS input for the real-input rows -- behind one gate: no ydotool key
// and no capture is sent unless KWin reports, in the same step, that the
// active window's resourceClass contains 'powerbrowser' (39-RESEARCH
// Pitfall 5: ydotool types into whatever has focus).
//
// Read-back mechanism (assumption A1, measured 2026-11-05 on KWin 6.6.6): a
// KWin script print()s a unique marker line and the caller reads it from
// `journalctl --user -o cat`. Every call here needs the Bash sandbox off
// (session D-Bus, the user journal, /run/ydotoold/socket).
//
// A session for these calls must be HEADED: launch with PB_LIVE_HEADED=1
// (scripts/lib/firefox-bidi.mjs); a --headless session has no window.
//
// Node built-ins only at module scope; the self-test imports
// ./pb-live-probe.mjs dynamically so a static import of this module from
// pb-live-probe creates no cycle.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_CLASS = 'powerbrowser';
// The shell window's caption; a stock browser window reads "<page> — PowerBrowser".
const SHELL_CAPTION = 'PowerBrowser';
const YDOTOOL_SOCKET = '/run/ydotoold/socket';
// Linux input-event codes (linux/input-event-codes.h) for the short sequences the real-input rows send.
const KEY_CODES = {
    esc: 1, tab: 15, enter: 28, ctrl: 29, shift: 42, alt: 56, space: 57,
    f10: 68, up: 103, left: 105, right: 106, down: 108, menu: 127,
};

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

/** Activates the PowerBrowser shell window (not a stock browser window or a dialog); true when one was found. */
export function raiseShell() {
    const since = Math.floor(Date.now() / 1000) - 1;
    const marker = runKwinScript(`let hit = false;
for (const w of workspace.windowList()) {
    if (String(w.resourceClass).toLowerCase().includes(${JSON.stringify(SHELL_CLASS)}) && w.normalWindow && !w.transient
        && String(w.caption) === ${JSON.stringify(SHELL_CAPTION)}) { workspace.activeWindow = w; hit = true; }
}
print("__MARKER__ " + hit);
`);
    return readMarker(marker, since) === 'true';
}

/**
 * `{ resourceClass, caption, x, y, width, height, scale }` of KWin's active window: frameGeometry in logical pixels and
 * its output's devicePixelRatio (a capture is frame size times scale in device pixels), or null.
 */
export function activeWindow() {
    const since = Math.floor(Date.now() / 1000) - 1;
    const marker = runKwinScript(`const w = workspace.activeWindow;
print("__MARKER__ " + JSON.stringify(w ? { resourceClass: String(w.resourceClass), caption: String(w.caption),
    x: w.frameGeometry.x, y: w.frameGeometry.y, width: w.frameGeometry.width, height: w.frameGeometry.height,
    scale: w.output ? w.output.devicePixelRatio : 1 } : null));
`);
    const text = readMarker(marker, since);
    return text ? JSON.parse(text) : null;
}

/**
 * The gate: reads the active window through `readActive` and returns it when its class contains
 * `expectClass`; otherwise throws "refused: active window ...". An empty read-back refuses.
 */
function gate({ expectClass = SHELL_CLASS, readActive = activeWindow } = {}) {
    const w = readActive();
    const cls = w && typeof w === 'object' ? String(w.resourceClass ?? '') : String(w ?? '');
    if (!expectClass || !cls.toLowerCase().includes(expectClass.toLowerCase())) {
        throw new Error(`refused: active window class ${JSON.stringify(cls)} does not contain ${JSON.stringify(expectClass)}`);
    }
    return w;
}

/**
 * Raises the shell, waits up to 5 s for it to be the active window, then captures the active window with
 * spectacle into `out`, without the drop shadow so the PNG is the window frame alone. Returns `{ path, ...geometry }`; throws "refused: active window ..." if the shell never
 * became active. `opts` exists for the self-test plants.
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
    return { path: out, ...w };
}

/**
 * Sends one short chord through ydotool: every key down in order, then up in reverse (no text typing).
 * The active window is read back in the same step and the send is refused unless it is the shell.
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

const PLANTS = [
    { name: 'class-mismatch', opts: { expectClass: 'pb-gate-plant-absent' } },
    { name: 'readback-empty', opts: { readActive: () => '' } },
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
            for (let i = 0; i < 50 && !String(active?.resourceClass ?? '').toLowerCase().includes(SHELL_CLASS); i++) {
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
                const shot = await captureShell(join(dir, 'clean.png'));
                console.log(`ok  clean-capture -> ${shot.resourceClass} ${shot.width}x${shot.height}`);
            } catch (e) {
                failed++;
                console.log(`FAIL clean-capture -> ${e.message}`);
            }
            for (const plant of PLANTS) {
                const verdicts = [];
                try { osKeys(['shift'], plant.opts); verdicts.push('osKeys sent'); } catch (e) { if (!e.message.startsWith('refused: active window')) verdicts.push(`osKeys ${e.message}`); }
                try { await captureShell(join(dir, `${plant.name}.png`), plant.opts); verdicts.push('captureShell captured'); } catch (e) { if (!e.message.startsWith('refused: active window')) verdicts.push(`captureShell ${e.message}`); }
                if (verdicts.length) {
                    failed++;
                    console.log(`FAIL ${plant.name} -> ${verdicts.join('; ')}`);
                } else {
                    console.log(`ok  ${plant.name} -> refused`);
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
