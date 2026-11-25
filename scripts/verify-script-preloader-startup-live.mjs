#!/usr/bin/env node
// scripts/verify-script-preloader-startup-live.mjs
//
// WINDOWS 72: Gecko's script preloader must be told startup is complete before
// the topic that starts its cache write. Otherwise its save thread writes the
// script table while the main thread still adds to it, and the main process
// crashes. The preloader removes itself from the startup-complete topic when
// told, so in the running shell no observer may remain on that topic together
// with startupcache-invalidate, and the shell window is the only window (a
// stock window would send the topic itself).
//
// The run also plants one observer on both topics and requires the same probe
// to report it, so a probe that can find nothing is red, not green.
//
// Live: launches the built binary headless on a throwaway profile.
import { newProfile, runCheck, withShellQuit as withShell } from './lib/ng-a-live.mjs';

const PROBE = `(() => {
    const on = topic => new Set([...Services.obs.enumerateObservers(topic)]);
    const left = () => { const inv = on('startupcache-invalidate'); return [...on('browser-delayed-startup-finished')].filter(o => inv.has(o)).length; };
    const result = { left: left(), invalidate: on('startupcache-invalidate').size, stock: [...Services.wm.getEnumerator('navigator:browser')].length };
    const planted = { observe() {} };
    Services.obs.addObserver(planted, 'startupcache-invalidate');
    Services.obs.addObserver(planted, 'browser-delayed-startup-finished');
    result.planted = left() - result.left;
    Services.obs.removeObserver(planted, 'startupcache-invalidate');
    Services.obs.removeObserver(planted, 'browser-delayed-startup-finished');
    return JSON.stringify(result);
})()`;

await runCheck('script-preloader-startup-live', async ({ expect }) => {
    const profile = newProfile('script-preloader');
    const seen = await withShell(profile, async ({ send, evaluateIn }) => {
        const tree = await send('browsingContext.getTree', { 'moz:scope': 'chrome' });
        const shell = tree.contexts.find(c => c.url.startsWith('chrome://powerbrowser/'));
        return JSON.parse(await evaluateIn(shell.context, PROBE));
    });
    expect(seen.stock === 0, `${seen.stock} stock window(s) open, so the result would not be the shell's own`);
    expect(seen.invalidate > 0 && seen.planted === 1, `the probe cannot see observers: ${JSON.stringify(seen)}`);
    expect(seen.left === 0, `${seen.left} script preloader observer(s) never received browser-delayed-startup-finished before the cache write topic`);
});
