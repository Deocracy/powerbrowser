#!/usr/bin/env node
// scripts/apply-repo-controls.mjs
//
// Applies the declared repository controls (Phase 41, GH-02). It defines no
// endpoint of its own: it executes exactly what planWrites in
// scripts/verify-repo-controls.mjs returns, in that table's order, so the
// endpoint a body is written through and the one the repo-controls row reads
// it back from are the same table entry.
//
//   node scripts/apply-repo-controls.mjs        dry-run: reads, prints the
//                                               ordered writes and any BLOCKED line
//   node scripts/apply-repo-controls.mjs --yes  executes them; only from a terminal
//
// --yes writes to the live org and repo. It refuses before any gh call when
// stdin is not a terminal, so an agent or CI shell cannot apply the settings;
// the owner runs it at plan 41-04's checkpoint. Every write is an idempotent
// PUT or PATCH, or a POST only for a ruleset found absent by name, so a
// second run makes no change.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'apply-repo-controls';
const SELF_REL = 'scripts/apply-repo-controls.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--yes') {
        console.error(`${NAME}: unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL} for the dry-run, or add --yes from the owner's terminal to apply.`);
        process.exit(2);
    }
}
const apply = args.includes('--yes');
if (apply && process.stdin.isTTY !== true) {
    console.error(`${NAME}: refusing -- --yes writes to the live org and repo and runs only from the owner's terminal (plan 41-04 checkpoint)`);
    process.exit(2);
}

const { API_VERSION_HEADER, SETTINGS_REL, ghGet, planWrites } = await import('./verify-repo-controls.mjs');

const { writes, blocked, errors, ownerSteps } = planWrites(REPO_ROOT, ghGet);
// No API exists for these; --yes never acts on them.
if (ownerSteps.length > 0) {
    console.log('Owner UI steps (no API):');
    ownerSteps.forEach(s => console.log(`  - ${s}`));
    console.log('Writes:');
}
writes.forEach((w, i) => {
    const body = w.body === null ? '(no body)' : `(body: ${SETTINGS_REL}/${w.file})`;
    console.log(`${i + 1}. ${w.method} ${w.path} ${body}`);
});
for (const b of blocked) console.log(`BLOCKED: ${b}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (!apply) process.exit(errors.length > 0 ? 1 : 0);

if (errors.length > 0 || blocked.length > 0) {
    console.error(`${NAME}: refusing -- ${errors.length} read error(s) and ${blocked.length} blocked write(s); nothing was written.`);
    console.error(`  Next step: resolve every ERROR and BLOCKED line above, then re-run.`);
    process.exit(1);
}

for (const w of writes) {
    const ghArgs = ['api', '-X', w.method, '-H', API_VERSION_HEADER, w.path];
    const opts = { encoding: 'utf8' };
    if (w.body !== null) {
        ghArgs.push('--input', '-');
        opts.input = JSON.stringify(w.body);
    }
    const r = spawnSync('gh', ghArgs, opts);
    if (r.status !== 0) {
        console.error(`${NAME}: ${w.method} ${w.path} failed (exit ${r.status ?? r.signal ?? r.error?.code}):`);
        console.error(String(r.stderr || r.error?.message || '').trim());
        console.error(`  Next step: fix the cause and re-run; every write is idempotent.`);
        process.exit(1);
    }
    console.log(`applied: ${w.method} ${w.path}`);
}
console.log(`${NAME}: ${writes.length} write(s) applied. Next step: scripts/verify-platform.sh --only repo-controls`);
