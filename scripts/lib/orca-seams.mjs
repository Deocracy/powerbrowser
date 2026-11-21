// scripts/lib/orca-seams.mjs
//
// What an Orca seam file must hold once the overlay is applied (harness-static-structure-05).
//
// orca-overlay/seams.json records, per seam, the upstream blob the patch was cut against and the patch that changes it.
// The blob the seam file must have after the build is therefore derivable: read the recorded blob out of orca/'s object
// database, apply the patch to a copy of it, hash the result. The build-shape and pane-entry checks compare that blob
// with `git hash-object` of the file in orca/, so a seam file rewritten to different content (a build step, a postinstall
// script) goes red even though `git status` still lists the same path.
//
// No top-level side effects.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { fixtureGitEnv } from './fixture-git.mjs';

const hashFile = (path, cwd) => execFileSync('git', ['hash-object', '--no-filters', '--', path], { cwd, encoding: 'utf8', env: fixtureGitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The seam rows of orca-overlay/seams.json; null when the file is absent or unreadable. */
export function readSeamRows(overlayDir) {
    try {
        const doc = JSON.parse(readFileSync(join(overlayDir, 'seams.json'), 'utf8'));
        return Array.isArray(doc?.seams) ? doc.seams : null;
    } catch { return null; }
}

/** The blob that applying the row's patch to the recorded upstream blob gives: { blob } or { error }. */
export function expectedSeamBlob({ orcaDir, overlayDir, row }) {
    const patch = join(overlayDir, row.patch);
    if (!existsSync(patch)) return { error: `the patch ${row.patch} of seam ${row.path} is absent from orca-overlay/` };
    let content;
    try {
        content = execFileSync('git', ['-C', orcaDir, 'cat-file', 'blob', row.upstream_blob], { env: fixtureGitEnv(), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
    } catch {
        return { error: `the recorded upstream blob ${row.upstream_blob} of seam ${row.path} is not in orca/'s object database (orca/ is not at the pin)` };
    }
    const tmp = mkdtempSync(join(tmpdir(), 'orca-seam-'));
    try {
        mkdirSync(dirname(join(tmp, row.path)), { recursive: true });
        writeFileSync(join(tmp, row.path), content);
        const ap = spawnSync('git', ['apply', '--whitespace=nowarn', patch], { cwd: tmp, encoding: 'utf8', env: fixtureGitEnv() });
        if (ap.status !== 0) return { error: `${row.patch} does not apply to the recorded upstream blob ${row.upstream_blob} of ${row.path}: ${(ap.stderr || '').trim().split('\n')[0]}` };
        return { blob: hashFile(row.path, tmp) };
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

/**
 * Red lines for every seam whose file in orca/ is not the patch result. Empty when seams.json is absent (an absent
 * overlay is the overlay check's finding), and one line per seam otherwise.
 */
export function seamContentFails({ orcaDir, overlayDir }) {
    const rows = readSeamRows(overlayDir);
    if (!rows) return [];
    const fails = [];
    for (const row of rows) {
        const want = expectedSeamBlob({ orcaDir, overlayDir, row });
        if (want.error) { fails.push(want.error); continue; }
        const file = join(orcaDir, row.path);
        if (!existsSync(file)) { fails.push(`seam ${row.path} is absent from orca/ (run scripts/build-orca.sh)`); continue; }
        const have = hashFile(row.path, orcaDir);
        if (have !== want.blob) {
            fails.push(`seam ${row.path} holds blob ${have}, but applying ${row.patch} to the recorded upstream blob ${row.upstream_blob} gives ${want.blob} (the file was rewritten after the overlay applied; run scripts/build-orca.sh)`);
        }
    }
    return fails;
}
