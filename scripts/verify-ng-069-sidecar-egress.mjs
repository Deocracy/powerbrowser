#!/usr/bin/env node
// scripts/verify-ng-069-sidecar-egress.mjs -- NG-069 (wave E), run as verify-endpoints.sh
// layer 4: open-vsx.org and the AI provider hosts have allowlist rows, and the egress
// check covers the SIDECAR's traffic (layers 1-3 read Gecko only).
//   Static: the hosts are derived from the tree:
//     - VSX_REGISTRY_URL in powerbrowser/shell/TheiaService.sys.mjs;
//     - the default https://api.* endpoints in the top-level .js files of each non-@theia
//       dependency of every @theia/ai-* package the app composes.
//     Each derived host needs a row.
//   Live: a NODE_OPTIONS preload records every hostname any sidecar Node process resolves
//     (dns.lookup and dns.promises.lookup). The session installs one extension through the
//     DI-bound PluginServer (the backend's Open VSX download). Every recorded host must pass
//     the shared verdict in scripts/lib/endpoint-verdict.mjs for an unattended request, as
//     layer 3 does: an `allow` row passes; no row, a `deny` row or a `user-initiated` row fails
//     (WR-03, UPD-33). The registry host must have been seen (anti-vacuity). The session runs with no AI key and
//     sends no AI request, so a derived AI provider host in the log fails (R15: those hosts
//     are contacted only after the user configures a key and sends a request).
// Tier: full. Marker: live-clone.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';
import { violations } from './lib/endpoint-verdict.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'ng069-sidecar-egress';
const NM = join(REPO_ROOT, 'theia/node_modules');
const PROBE_EXTENSION = 'vscode-extension://akamud.vscode-theme-onedark'; // VSCodeExtensionUri.SCHEME in @theia/plugin-ext-vscode
const failures = [];

const vsx = /VSX_REGISTRY_URL:\s*"([^"]+)"/.exec(readFileSync(join(REPO_ROOT, 'powerbrowser/shell/TheiaService.sys.mjs'), 'utf8'))?.[1];
if (!vsx) failures.push('broken instrument: VSX_REGISTRY_URL is not derivable from TheiaService.sys.mjs');
const derived = new Map(vsx ? [[new URL(vsx).host, 'VSX_REGISTRY_URL (TheiaService.sys.mjs)']] : []);
const app = JSON.parse(readFileSync(join(REPO_ROOT, 'theia/applications/browser/package.json'), 'utf8'));
for (const ai of Object.keys(app.dependencies).filter(d => d.startsWith('@theia/ai-'))) {
    const deps = JSON.parse(readFileSync(join(NM, ai, 'package.json'), 'utf8')).dependencies ?? {};
    for (const sdk of Object.keys(deps).filter(d => !d.startsWith('@theia/') && existsSync(join(NM, d)))) {
        for (const f of readdirSync(join(NM, sdk)).filter(n => n.endsWith('.js'))) {
            for (const m of readFileSync(join(NM, sdk, f), 'utf8').matchAll(/https:\/\/(api\.[a-z0-9.-]+\.[a-z]+)/g)) derived.set(m[1], `${ai} -> ${sdk}/${f}`);
        }
    }
}
if (![...derived.values()].some(v => v.startsWith('@theia/ai-'))) failures.push('broken instrument: no AI provider host derived from the composed @theia/ai-* packages');
const allow = JSON.parse(readFileSync(join(REPO_ROOT, 'powerbrowser/endpoint-allowlist.json'), 'utf8')).hosts;
const covered = h => allow.some(a => a.host === h || (a.host.startsWith('.') && h.endsWith(a.host)));
for (const [h, why] of derived) if (!covered(h)) failures.push(`${h} (${why}) has no endpoint-allowlist row`);

if (failures.length === 0) {
    const dir = mkdtempSync(join(tmpdir(), 'ng069-'));
    try {
        const log = join(dir, 'lookups.log');
        const hook = join(dir, 'hook.cjs');
        writeFileSync(hook, `const dns = require('dns'); const fs = require('fs'); const net = require('net');
const rec = h => { if (typeof h === 'string' && h && !net.isIP(h)) { try { fs.appendFileSync(${JSON.stringify(log)}, h + '\\n'); } catch {} } };
const l = dns.lookup; dns.lookup = function (h, ...a) { rec(h); return l.call(this, h, ...a); };
const pl = dns.promises.lookup; dns.promises.lookup = function (h, ...a) { rec(h); return pl.call(this, h, ...a); };
`);
        process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim();
        process.env.XDG_CONFIG_HOME = join(dir, 'xdg');
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        await withFirefoxPage('', async ({ evaluate, waitFor }) => {
            await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 90000 });
            await evaluate(`(() => {
                let found; const c = window.theia.container;
                c._bindingDictionary.traverse(k => { if (!found && typeof k === 'symbol' && k.toString() === 'Symbol(PluginServer)') found = k; });
                window.__ng069 = 'pending';
                c.get(found).install(${JSON.stringify(PROBE_EXTENSION)}).then(() => { window.__ng069 = 'done'; }, e => { window.__ng069 = 'error: ' + e.message; });
                return 'ok'; })()`);
            await waitFor(`window.__ng069 !== 'pending'`, { timeoutMs: 120000 });
            const outcome = await evaluate('window.__ng069');
            if (outcome !== 'done') failures.push(`the probe install did not complete: ${outcome}`);
        });
        const seen = existsSync(log) ? [...new Set(readFileSync(log, 'utf8').split('\n').filter(Boolean))].filter(h => h !== 'localhost') : [];
        if (!seen.includes(new URL(vsx).host)) failures.push(`instrument: the sidecar never resolved ${new URL(vsx).host} during an extension install -- nothing was observed`);
        for (const h of violations(allow, seen, { userAction: false })) failures.push(`the sidecar resolved ${h} unattended, which the endpoint allowlist does not allow (no row, a deny row, or a user-initiated row)`);
        for (const h of seen) if (derived.get(h)?.startsWith('@theia/ai-')) failures.push(`the sidecar resolved ${h} (${derived.get(h)}) with no AI key configured and no AI request sent`);
    } finally {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    }
}

if (failures.length) {
    console.error(`verify-endpoints: layer 4 FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log(`verify-endpoints: layer 4 PASS -- every host the sidecar resolved is allowlisted (${NAME})`);
