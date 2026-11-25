#!/usr/bin/env node
// scripts/verify-ng-018-scheduled-integrity-check.mjs -- NG-018 (non-GUI wave
// A): the runtime runs a full PRAGMA integrity_check on a schedule
// (SCHEMA.md:200-201). The store's index disagrees with its table -- a fault
// the startup quick_check cannot see -- and integrity_check_minutes is 0.1.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { newProfile, runCheck, waitUntil, withShell } from './lib/ng-a-live.mjs';
import { buildStore, integrityOk, plantIndexMismatch, readStore, schemaHead } from './lib/tab-store-fixtures.mjs';

await runCheck('verify-ng-018-scheduled-integrity-check', async ({ expect }) => {
    const profile = newProfile('ng018');
    const path = join(profile, 'tabs.sqlite');
    buildStore(path, schemaHead(), {
        tabs: [{ uri: 'terminal:ng018', url: '', title: 't', last_active: 77 }],
        settings: { integrity_check_minutes: '0.1' },
    });
    plantIndexMismatch(path);
    let quarantined;
    await withShell(profile, async () => {
        quarantined = await waitUntil(() => existsSync(`${path}.corrupt-1`), 45000);
        // The forensic copy lands before the rebuild migrates the new store (quarantineAndRebuildTabStore);
        // a shell torn down in between leaves the rebuild to the next launch (NG-085). Wait for the head.
        if (quarantined) await waitUntil(() => readStore(path).version === schemaHead(), 30000);
    });
    expect(quarantined, 'no scheduled integrity_check quarantined a store whose index disagrees with its table within 45s (the startup quick_check cannot see this fault)');
    if (quarantined) {
        expect(integrityOk(path), 'the store rebuilt after the scheduled check does not pass integrity_check');
        expect(readStore(path).version === schemaHead(), 'the store rebuilt after the scheduled check is not at the head');
    }
});
