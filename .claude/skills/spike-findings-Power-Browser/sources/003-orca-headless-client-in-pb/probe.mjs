// Spike 003 probe: opens orcad's webClientUrl in a PB web tab (token gate on),
// reads what the Orca client renders, screenshots it, then repeats in a stock
// window (GUI-01 control). Usage: node probe.mjs /tmp/orca-spike/serve.out
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withProbeShell, openWebTab, pollFor } from '../../../scripts/lib/pb-live-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const serve = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const url = serve.pairing.webClientUrl;
const origin = new URL(url).origin;
const out = { url: url.split('#')[0], gateDisabled: process.env.POWERBROWSER_TOKEN_DISABLE === '1' };

// What the page shows: visible text head, the client's storage keys, whether a pairing prompt is up.
const READ = `JSON.stringify({ href: location.href.split('#')[0], hash: location.hash.slice(0, 20),
    title: document.title, text: document.body ? document.body.innerText.slice(0, 1500) : null,
    storage: Object.keys(localStorage), pairPrompt: /pair|code/i.test(document.body?.innerText ?? '') })`;

async function contentOn(app, timeoutMs = 30000) {
    return pollFor(async () => (await app.contexts()).find(c => c.url.startsWith(origin)), timeoutMs, `a content context on ${origin}`);
}

async function settle(app, ctx, label) {
    // The client is a SPA: wait until it has rendered something beyond the boot shell.
    let last;
    try {
        await pollFor(async () => {
            last = JSON.parse(await app.evaluateIn(ctx.context, READ));
            return last.text && last.text.trim().length > 20;
        }, 30000, 'the client to render');
    } catch (e) { last = { ...(last || {}), settleError: String(e.message).slice(0, 300) }; }
    await new Promise(r => setTimeout(r, 6000));
    try { last = JSON.parse(await app.evaluateIn(ctx.context, READ)); } catch (e) { last.readError = String(e); }
    const shot = await app.send('browsingContext.captureScreenshot', { context: ctx.context });
    writeFileSync(join(HERE, `${label}.png`), Buffer.from(shot.data, 'base64'));
    return last;
}

// Opens the throwaway repo's workspace and its agent terminal; reports what xterm shows.
const OPEN_TERMINAL = `(async () => {
    const hit = [...document.querySelectorAll('button, [role=button], [role=treeitem], a, div')]
        .filter(e => /^(master|repo)$/.test(e.innerText?.trim() ?? '')).pop();
    if (!hit) return JSON.stringify({ clicked: false });
    hit.click();
    await new Promise(r => setTimeout(r, 8000));
    const rows = [...document.querySelectorAll('.xterm-rows, .xterm-accessibility')].map(e => e.innerText).join('\\n');
    return JSON.stringify({ clicked: true, xterms: document.querySelectorAll('.xterm').length,
        sawPwd: rows.includes('/tmp/orca-spike/repo'), rowsTail: rows.slice(-600) });
})()`;

await withProbeShell(async app => {
    out.sidecarPort = app.port;
    const tabId = await openWebTab(app, url);
    const webCtx = await contentOn(app);
    out.webTab = { tabId, ...(await settle(app, webCtx, 'web-tab')) };
    try {
        out.webTab.terminal = JSON.parse(await app.evaluateIn(webCtx.context, OPEN_TERMINAL));
        const shot = await app.send('browsingContext.captureScreenshot', { context: webCtx.context });
        writeFileSync(join(HERE, 'web-tab-terminal.png'), Buffer.from(shot.data, 'base64'));
        // Client -> agent input: type a prompt into the agent's xterm from the web tab.
        const marker = `pb-web-tab-${Date.now()}`;
        await app.evaluateIn(webCtx.context, `document.querySelector('.xterm-helper-textarea').focus(); true`);
        const keys = [...`Run the shell command: echo ${marker}`].flatMap(k => [{ type: 'keyDown', value: k }, { type: 'keyUp', value: k }]);
        await app.send('input.performActions', { context: webCtx.context, actions: [{ type: 'key', id: 'kb', actions: keys }] });
        await new Promise(r => setTimeout(r, 1000));
        await app.send('input.performActions', { context: webCtx.context, actions: [{ type: 'key', id: 'kb',
            actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }] });
        out.webTab.typed = await pollFor(async () => {
            const rows = await app.evaluateIn(webCtx.context, `[...document.querySelectorAll('.xterm-rows')].map(e => e.innerText).join('\\n')`);
            return rows.split(marker).length >= 3 ? { marker, echoed: true } : undefined;  // prompt line + command output
        }, 90000, 'the agent to echo the marker').catch(e => ({ marker, echoed: false, error: String(e.message).slice(0, 200) }));
        const shot2 = await app.send('browsingContext.captureScreenshot', { context: webCtx.context });
        writeFileSync(join(HERE, 'web-tab-typed.png'), Buffer.from(shot2.data, 'base64'));
    } catch (e) { out.webTab.terminal = { ...(out.webTab.terminal || {}), error: String(e.message).slice(0, 300) }; }

    // Control: a stock window (GUI-01). The client strips the #pairing fragment, so match on origin.
    await app.evaluate(`window.open(${JSON.stringify(url)}, '_blank'); true`);
    try {
        const ctx = await pollFor(async () => (await app.contexts())
            .find(c => c.url.startsWith(origin) && c.context !== webCtx.context), 30000, 'a stock-window context');
        out.stock = await settle(app, ctx, 'stock-window');
    } catch (e) { out.stock = { error: String(e.message).slice(0, 400) }; }
});

writeFileSync(join(HERE, `probe-${out.gateDisabled ? 'gate-off' : 'gate-on'}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
