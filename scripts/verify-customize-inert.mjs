#!/usr/bin/env node
// scripts/verify-customize-inert.mjs
//
// CUST-01's inertness proof: pixel comparison across three states of the
// same RUNNING page:
//   1. no `customize.css` present
//   2. an empty `customize.css` present
//   3. a `customize.css` containing one high-specificity rule with an
//      unmistakable effect
// States 1 and 2 must compare equal -- that is the inertness claim. State 3
// must differ from state 1 -- that is the hot-reload claim, and without it
// the inertness assertion would also pass against a layer that does
// nothing at all (an inert-because-broken layer must not pass).
//
// -- Step 0 (D-69's one open detail; settled empirically this session,
// 2026-08-20/21, not assumed) --
// Two captures of the SAME unchanged page are byte-identical PROVIDED they
// come from the same live BiDi session (`withFirefoxPage`'s `screenshot()`,
// `browsingContext.captureScreenshot` against the page already loaded and
// settled) -- confirmed by hashing repeated captures spaced 2-3s apart:
// identical SHA-256 every time. Byte-hashing is therefore safe on this
// host and this is branch one of D-69's fork (`node:crypto`, no image
// library, no python3 needed).
//
// That safety is conditional on the capture MECHANISM, which is itself a
// load-bearing finding: Plan 02's sibling `captureScreenshot` export
// (`--headless --screenshot`, a one-shot "load and screenshot" process
// launch with no scripting hook) was tried first and found unusable for
// this purpose -- it fires on the page's early `load` event, well before
// a Theia SPA's `startContributions()`/shell-attach sequence completes, so
// every capture it produced was a near-blank loading screen (~99.9% white
// pixels, sampled) regardless of what `customize.css` said, and repeated
// captures of that same near-blank state were NOT byte-identical (a small,
// stable, text-shaped region -- font-rasterization jitter across separate
// process launches -- differed run to run). Neither symptom reproduces
// with `withFirefoxPage`'s `screenshot()`: it runs inside the session
// `waitFor` already uses, so this script waits for `#theia-app-shell` (and
// settles past the CSS layer's debounce) before every capture, and reuses
// one Firefox process/page across all three states rather than relaunching
// per state -- which also makes this script a truer test of D-59/D-60's
// actual hot-reload claim (one running page, the file changing under it)
// than three independent fresh boots would have been.
// `scripts/lib/firefox-bidi.mjs` gained the `screenshot()` capability for
// this reason; see its own header for the mechanism note.
//
// No `import`/`require` of any package name (D-69): only Node built-ins
// and `scripts/lib/firefox-bidi.mjs`.

import { withFirefoxPage } from './lib/firefox-bidi.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// WINDOWS 14 (08-03): this check reads the shell's own supervised frontend
// and takes no URL argument -- a URL would open a redundant stock browser
// window beside the shell.

// Past the CSS layer's ~150ms hot-reload debounce, with margin.
const SETTLE_MS = 2000;

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

async function main() {
    // WINDOWS 34: the layer reads $THEIA_CONFIG_DIR/customize.css, and with a profile present
    // TheiaService._resolveConfigDir() sets that to <profile>/powerbrowser-theia, so this check
    // owns the launch's profile and writes there; no XDG path is ever read on this launch.
    // A fresh profile also makes state 1 (absent) true by construction, with nothing to restore.
    const profileDir = await mkdtemp(join(tmpdir(), 'powerbrowser-customize-inert-'));
    const CSS_PATH = join(profileDir, 'powerbrowser-theia', 'customize.css');
    await mkdir(join(profileDir, 'powerbrowser-theia'));

    // CR-03: this used to register its own `restore().finally(() =>
    // process.exit(130))`, racing withFirefoxPage's own internal SIGINT
    // handler -- restore() (a couple of small fs writes) resolves in low
    // single-digit milliseconds, so its process.exit(130) fired while the
    // driver's Firefox kill/SIGKILL-escalation/rm(profileDir, ...)
    // sequence was still mid-flight, orphaning the browser process and
    // leaking its temp profile directory. Just record that SIGINT arrived
    // and let the existing try/finally below unwind naturally: closing
    // the driver's own WebSocket (its SIGINT handler, firefox-bidi.mjs)
    // rejects any in-flight BiDi call, which propagates out of
    // withFirefoxPage() and reaches this function's own `finally` --
    // where the profile is removed, after the driver has killed the
    // browser -- deterministically, not racing anything.
    let sigintReceived = false;
    process.on('SIGINT', () => { sigintReceived = true; });

    try {
        const surfacesRun = [];

        // WINDOWS 14: empty URL -- this check reads the shell, never a URL page.
        await withFirefoxPage('', async ({ waitFor, screenshot }) => {
            // The shell is attached before the layout initializes and the boot spinner fades; Theia
            // removes .theia-preload as its last step before 'ready' (FrontendApplication.revealShell).
            // Found live (WINDOWS 34): a capture 2 s after attach still showed the spinner, so state 1
            // differed from state 2 with no CSS involved.
            await waitFor("document.getElementById('theia-app-shell') && !document.querySelector('.theia-preload') ? true : false", { timeoutMs: 20000 });

            // State 1: no customize.css.
            await new Promise(r => setTimeout(r, SETTLE_MS));
            const state1 = await screenshot();
            surfacesRun.push('state1-absent');

            // State 2: empty customize.css.
            await writeFile(CSS_PATH, '');
            await new Promise(r => setTimeout(r, SETTLE_MS));
            const state2 = await screenshot();
            surfacesRun.push('state2-empty');

            // State 3: one high-specificity rule with an unmistakable
            // effect. A full-viewport fixed overlay at the maximum z-index
            // is used rather than a `body`/`html` background or border --
            // both were tried live and found invisible in the capture,
            // because Theia's `#theia-app-shell` is an opaque, absolutely
            // positioned element covering the entire viewport and painting
            // over anything behind it. A `position: fixed` overlay paints
            // in the viewport's own stacking context, above the shell
            // regardless of what the shell itself renders.
            await writeFile(
                CSS_PATH,
                "body::before { content: ''; position: fixed; inset: 0; background: rgb(255, 0, 0); z-index: 2147483647; pointer-events: none; }"
            );
            await new Promise(r => setTimeout(r, SETTLE_MS));
            const state3 = await screenshot();
            surfacesRun.push('state3-styled');

            const inertness = sha256(state1) === sha256(state2);
            const hotReload = sha256(state1) !== sha256(state3);

            if (!inertness) {
                throw new Error('state 1 (absent) vs state 2 (empty) -- pixels differ, the inertness claim failed');
            }
            if (!hotReload) {
                throw new Error('state 1 (absent) vs state 3 (styled) -- pixels identical, the CSS layer had no effect');
            }
        }, { profileDir });

        const EXPECTED = ['state1-absent', 'state2-empty', 'state3-styled'];
        const missing = EXPECTED.filter(s => !surfacesRun.includes(s));
        if (missing.length > 0) {
            throw new Error(`coverage guard: state(s) never captured: ${missing.join(', ')}`);
        }

        console.log('verify-customize-inert: PASS -- state 1 (absent) == state 2 (empty)');
        console.log('verify-customize-inert: PASS -- state 1 (absent) != state 3 (styled)');
    } catch (err) {
        console.error(`verify-customize-inert: FAIL -- ${err.message}`);
        process.exitCode = 1;
    } finally {
        // withFirefoxPage leaves a caller-owned profile in place; the browser is already dead here.
        await rm(profileDir, { recursive: true, force: true });
        // Set last so a SIGINT-triggered failure reports the conventional
        // 130 rather than whatever the catch block above set.
        if (sigintReceived) process.exitCode = 130;
    }
}

main();
