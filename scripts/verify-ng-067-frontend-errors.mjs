#!/usr/bin/env node
// scripts/verify-ng-067-frontend-errors.mjs -- NG-067 (wave E): uncaught frontend errors and
// unhandled rejections reach the telemetry logger, subject to the level setting.
// One live session in the built app:
//   - spies on the DI-bound PowerBrowserTelemetryLogger.logError;
//   - gives the DI-bound sender a recording fetchFn and a placeholder endpoint, so an admitted
//     event is observed without any network;
//   - at level off (the manifest default): throws an uncaught error; the logger must be called
//     and nothing may be sent;
//   - sets telemetry.telemetryLevel = "error" through the DI-bound PreferenceService (a live
//     read, no restart);
//   - throws again and rejects a promise; both events must be sent.
// Tier: full (browser + sidecar). Marker: live-clone.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'ng067-frontend-errors-reach-telemetry';
const LEVEL_KEY = /TELEMETRY_LEVEL_PREFERENCE\s*=\s*'([^']+)'/.exec(readFileSync(join(REPO_ROOT, 'theia/extensions/telemetry/src/browser/telemetry-preferences.ts'), 'utf8'))?.[1];
const GET_BY_NAME = `
function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse(key => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found: ' + name);
    return container.get(found);
}`;
const failures = [];
let loggedAll = '[]';
if (!LEVEL_KEY) failures.push('broken instrument: TELEMETRY_LEVEL_PREFERENCE not found in telemetry-preferences.ts');
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'ng067-cfg-'));

if (failures.length === 0) await withFirefoxPage('', async ({ evaluate, waitFor }) => {
    await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 90000 });
    await waitFor('!!document.querySelector("#theia-app-shell")', { timeoutMs: 60000 });
    await evaluate(`(() => { ${GET_BY_NAME}
        const c = window.theia.container;
        const logger = __getByName(c, 'PowerBrowserTelemetryLogger');
        const sender = __getByName(c, 'PowerBrowserTelemetrySender');
        window.__ng067 = { logged: [], sent: [], sender, prefs: __getByName(c, 'PreferenceService') };
        const orig = logger.logError.bind(logger);
        logger.logError = (e, d) => { window.__ng067.logged.push(typeof e === 'string' ? e : String(e && e.message)); return orig(e, d); };
        sender.endpoint = 'https://ng067.invalid/collect';
        sender.fetchFn = (url, init) => { window.__ng067.sent.push(String(init.body)); return Promise.resolve({ ok: true }); };
        return 'ok'; })()`);
    const flush = async () => {
        await evaluate(`window.__ng067.flushed = false; window.__ng067.sender.flush().then(() => { window.__ng067.flushed = true; }); 'ok'`);
        await waitFor('window.__ng067.flushed === true', { timeoutMs: 10000 });
    };
    // Level off: reaches the logger, nothing is sent.
    await evaluate(`setTimeout(() => { throw new Error('ng067-at-off'); }, 0); 'ok'`);
    try {
        await waitFor(`window.__ng067.logged.includes('frontend.uncaught-error')`, { timeoutMs: 10000 });
    } catch {
        failures.push('an uncaught error at level off never reached PowerBrowserTelemetryLogger.logError');
    }
    await flush();
    if (JSON.parse(await evaluate('JSON.stringify(window.__ng067.sent)')).length) failures.push('an event was sent at level off');
    // Level error, set at runtime.
    await evaluate(`window.__ng067.prefs.set(${JSON.stringify(LEVEL_KEY)}, 'error', 1); 'ok'`);
    await waitFor(`window.__ng067.prefs.get(${JSON.stringify(LEVEL_KEY)}) === 'error'`, { timeoutMs: 10000 });
    // WINDOWS 42: wait on the entries logged after this mark. A session-wide count (>= 2) also counted the at-off
    // error, so one other frontend error let the wait pass before the at-error throw was logged and queued.
    await evaluate(`window.__ng067.mark = window.__ng067.logged.length; setTimeout(() => { throw new Error('ng067-at-error'); }, 0); Promise.reject(new Error('ng067-rejection')); 'ok'`);
    try {
        await waitFor(`(l => l.includes('frontend.uncaught-error') && l.includes('frontend.unhandled-rejection'))(window.__ng067.logged.slice(window.__ng067.mark))`, { timeoutMs: 10000 });
    } catch {
        failures.push(`at level error the logger saw only ${await evaluate('JSON.stringify(window.__ng067.logged.slice(window.__ng067.mark))')} after the throw`);
    }
    await flush();
    loggedAll = await evaluate('JSON.stringify(window.__ng067.logged)');
    const sent = JSON.parse(await evaluate('JSON.stringify(window.__ng067.sent)')).join('\n');
    for (const name of ['frontend.uncaught-error', 'frontend.unhandled-rejection']) {
        if (!sent.includes(name)) failures.push(`at level error no ${name} event was sent (logged ${await evaluate('JSON.stringify(window.__ng067.logged)')})`);
    }
});

if (failures.length) {
    console.error(`${NAME}: FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- both error kinds reach the logger; off sends nothing; error sends both (logged ${loggedAll})`);
