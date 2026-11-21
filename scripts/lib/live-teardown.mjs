// scripts/lib/live-teardown.mjs
//
// One teardown for a live row (audit harness-live-panels-10): a function that stops the processes the row started and
// removes the directories it made, run exactly once whichever way the row ends: normally, after a throw, on process
// exit, or when SIGINT, SIGTERM or SIGHUP ends it.
//
//   const teardown = registerTeardown(() => { killRecorded(); rmSync(scratch, { recursive: true, force: true }); });
//   try { ... } finally { teardown(); }     // teardown() also runs from the 'exit' event and from the signals
//
// The function must be synchronous (an 'exit' listener cannot wait) and must tolerate being run after a partial setup.
// A signal handler removes itself and re-raises the signal only when no other listener is left, so firefox-bidi.mjs's
// scratch-HOME handler and the run helper's own process handler, which follow the same rule, still end the process.
//
// No top-level side effects. Node built-ins only.

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Registers fn; returns run(), which runs fn once and detaches every hook. */
export function registerTeardown(fn) {
    let done = false;
    const handlers = [];
    const detach = () => {
        process.off('exit', onExit);
        for (const [sig, h] of handlers) process.off(sig, h);
    };
    const run = () => {
        if (done) return;
        done = true;
        detach();
        try { fn(); } catch (e) { console.error(`live-teardown: ${String(e?.message ?? e).split('\n')[0]}`); }
    };
    const onExit = () => run();
    process.on('exit', onExit);
    for (const sig of SIGNALS) {
        const h = () => {
            run();
            if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
        };
        handlers.push([sig, h]);
        process.on(sig, h);
    }
    return run;
}
