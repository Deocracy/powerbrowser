#!/usr/bin/env node
// scripts/verify-ng-072-policies-webextension.mjs -- NG-072 (wave E): policies.json is
// packaged, and a WebExtension declared in it installs and loads.
//   1. The extracted Linux package must carry distribution/policies.json, byte-equal to the
//      tracked powerbrowser/distribution/policies.json.
//   2. A fixture WebExtension is declared in the extracted copy's policy (force_installed,
//      file:// install_url). The PACKAGED binary is launched headless on a fresh profile,
//      and the extension's background script must call a loopback probe.
// Tier: full. Marker: live-main.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { extractPackage, REPO_ROOT } from './lib/built-tree.mjs';
import { resolveConfig } from './generate.mjs';
import { liveEnv } from './lib/firefox-bidi.mjs';

const NAME = 'ng072-policies-packaged-webextension';
const ID = 'ng072-probe@powerbrowser.test';
const failures = [];
const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'), undefined);
const userPref = (k, v) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});\n`;
let prefix;
const dir = mkdtempSync(join(tmpdir(), 'ng072-'));
try {
    prefix = extractPackage();
    const packaged = join(prefix, 'distribution', 'policies.json');
    const tracked = readFileSync(join(REPO_ROOT, 'powerbrowser/distribution/policies.json'));
    if (!existsSync(packaged)) throw new Error('the package carries no distribution/policies.json');
    if (!readFileSync(packaged).equals(tracked)) failures.push('the packaged distribution/policies.json differs from powerbrowser/distribution/policies.json');

    let hit = false;
    const server = createServer((req, res) => { if (req.url === '/ng072-loaded') hit = true; res.end('ok'); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const src = join(dir, 'xpi');
    mkdirSync(src);
    writeFileSync(join(src, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'ng072 probe', version: '1.0',
        browser_specific_settings: { gecko: { id: ID } }, background: { scripts: ['bg.js'] }, permissions: [`http://127.0.0.1:${port}/*`] }));
    writeFileSync(join(src, 'bg.js'), `fetch('http://127.0.0.1:${port}/ng072-loaded');\n`);
    const xpi = join(dir, 'ng072.xpi');
    execFileSync('python3', ['-c', 'import os,sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); [z.write(os.path.join(sys.argv[2],f),f) for f in os.listdir(sys.argv[2])]; z.close()', xpi, src]);
    const policy = JSON.parse(readFileSync(packaged, 'utf8'));
    policy.policies.ExtensionSettings = { ...(policy.policies.ExtensionSettings ?? {}), [ID]: { installation_mode: 'force_installed', install_url: `file://${xpi}` } };
    writeFileSync(packaged, JSON.stringify(policy, null, 2));
    const profile = join(dir, 'profile');
    mkdirSync(profile);
    writeFileSync(join(profile, 'user.js'), userPref('xpinstall.signatures.required', false));
    const browser = spawn(join(prefix, config.identity.binary_name), ['--headless', '--no-remote', '--profile', profile, 'about:blank'],
        { env: liveEnv({ ...process.env, XDG_CONFIG_HOME: join(dir, 'xdg') }), stdio: 'ignore', detached: true });
    const deadline = Date.now() + 90000;
    while (!hit && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
    try { process.kill(-browser.pid, 'SIGTERM'); } catch { /* gone */ }
    server.close();
    if (!hit) failures.push('the WebExtension declared in the packaged policies.json did not load within 90 s (its loopback probe was never called)');
} catch (err) {
    failures.push(err.message);
} finally {
    if (prefix) rmSync(dirname(prefix), { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
}
if (failures.length) {
    console.error(`${NAME}: FAIL -- ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- policies.json is packaged and a policy-declared WebExtension loads`);
