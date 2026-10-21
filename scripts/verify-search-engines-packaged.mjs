#!/usr/bin/env node
// scripts/verify-search-engines-packaged.mjs -- Phase 29 (BAR-04): the shipped package
// offers exactly the configuration.toml engines, with the first as the default.
//   1. The extracted Linux package's distribution/policies.json is byte-equal to the
//      tracked powerbrowser/distribution/policies.json (else the package is stale).
//   2. The PACKAGED binary is driven over BiDi on a fresh profile. Through the Theia
//      page realm's ChromeStoreClient, listSearchEngines() lists exactly the configured
//      engine names in manifest order (so Firefox's own engines are hidden by the bar),
//      defaultName is the first, and resolveTypedAddress('hello world') replies a search
//      on the first engine whose url begins with its template up to {searchTerms}.
//      Reply only: nothing loads, no network.
// Expectations derive from resolveConfig, never restated. Tier: full. Marker: live-main.
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { extractPackage, REPO_ROOT } from './lib/built-tree.mjs';
import { resolveConfig } from './generate.mjs';

const NAME = 'search-engines-packaged';
const failures = [];
const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'), undefined);
const configured = Array.isArray(config.search_engines) ? config.search_engines : [];
let prefix;
try {
    if (!configured.length) throw new Error('configuration.toml declares no [[search_engines]], so there is no engine set to prove');
    prefix = extractPackage();
    const packaged = join(prefix, 'distribution', 'policies.json');
    const tracked = readFileSync(join(REPO_ROOT, 'powerbrowser/distribution/policies.json'));
    if (!existsSync(packaged) || !readFileSync(packaged).equals(tracked)) {
        throw new Error('the package is stale: run powerbrowser/packaging/package-linux.sh');
    }
    const bin = join(prefix, config.identity.binary_name);
    if (!existsSync(bin)) throw new Error(`the package lacks its binary ${config.identity.binary_name}`);
    // Set before the driver is imported: firefox-bidi.mjs reads PB_FIREFOX_BIN at load.
    process.env.PB_FIREFOX_BIN = bin;
    delete process.env.PB_BACKEND_MAIN; // the packaged sidecar, never the checkout's
    const { withProbeShell } = await import('./lib/pb-live-probe.mjs');
    const { probe } = await import('./lib/pb-relaunch.mjs');
    await withProbeShell(async app => {
        const list = await probe(app, `return await get('ChromeStoreClient').listSearchEngines();`);
        const names = Array.isArray(list?.engines) ? list.engines.map(e => e.name) : null;
        const want = configured.map(e => e.name);
        if (JSON.stringify(names) !== JSON.stringify(want)) {
            failures.push(`listSearchEngines() must list exactly ${JSON.stringify(want)} in manifest order; got ${JSON.stringify(names ?? list)}`);
        }
        if (list?.defaultName !== want[0]) {
            failures.push(`listSearchEngines().defaultName must be ${JSON.stringify(want[0])}; got ${JSON.stringify(list?.defaultName)}`);
        }
        const reply = await probe(app, `return await get('ChromeStoreClient').resolveTypedAddress('hello world');`);
        const head = configured[0].url.slice(0, configured[0].url.indexOf('{searchTerms}'));
        if (reply?.kind !== 'search' || reply.engineName !== want[0] || !String(reply.url).startsWith(head)) {
            failures.push(`resolveTypedAddress('hello world') must reply kind search on ${JSON.stringify(want[0])} with a url beginning ${head}; got ${JSON.stringify(reply)}`);
        }
    });
} catch (err) {
    failures.push(`harness: ${err.message}`);
} finally {
    if (prefix) rmSync(dirname(prefix), { recursive: true, force: true });
}
if (failures.length) {
    for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- the packaged bar offers exactly the ${configured.length} configured engines, the first as default`);
