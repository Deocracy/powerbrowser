#!/usr/bin/env node
// scripts/verify-sidecar-state-migration.mjs -- WR-03 (Phase 45): a pre-45 sidecar
// state file moves from the XDG config dir into the ProfD state dir exactly once,
// and a failed move keeps the old file findable as a reap target. TheiaService.sys.mjs
// is Firefox chrome code that Node cannot import, so this check reads
// migrateLegacyStateFile out of the file and runs it against an in-memory store.
// The --self-test mode plants two mutants (copy order inverted; the existing-new-record
// guard removed); each must go red naming the case it breaks.
//
// Usage:
//   node scripts/verify-sidecar-state-migration.mjs
//   node scripts/verify-sidecar-state-migration.mjs --self-test
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO_ROOT, 'powerbrowser', 'shell', 'TheiaService.sys.mjs');
const NAME = 'verify-sidecar-state-migration';
const SELF_TEST = process.argv.slice(2).includes('--self-test');

const LEGACY = '/home/u/.config/powerbrowser/sidecar-state-K.json';
const NEW = '/home/u/.mozilla/profile/powerbrowser-theia/sidecar-state-K.json';
const RECORD = { pid: 4242, startTicks: '99' };
const OTHER = { pid: 7, startTicks: '1' };

// A store over a Map, with an op log so the write-before-remove order is checked.
function fakeStore(initial, { failWrite = false } = {}) {
    const files = new Map(Object.entries(initial));
    const ops = [];
    return {
        files,
        ops,
        store: {
            read: async (p) => { ops.push(`read ${p}`); return files.has(p) ? structuredClone(files.get(p)) : null; },
            write: async (p, v) => {
                ops.push(`write ${p}`);
                if (failWrite) throw new Error('disk full (planted)');
                files.set(p, structuredClone(v));
            },
            remove: async (p) => { ops.push(`remove ${p}`); files.delete(p); },
        },
    };
}

// The function's own source, cut from the file. Plants apply to this body only.
function migrateBody(text) {
    const start = text.indexOf('export async function migrateLegacyStateFile(');
    if (start < 0) return null;
    const end = text.indexOf('\n}\n', start);
    if (end < 0) return null;
    return text.slice(start, end + 3).replace(/^export /, '');
}

// Evaluates the committed function source. The input is this repo's own shell
// module, read from disk, never external input.
function evalMigrate(body) {
    return new Function(`${body}\nreturn migrateLegacyStateFile;`)();
}

// Each case returns a failure string, or null when the behaviour is pinned.
async function probe(migrate) {
    const failures = [];
    const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };

    {   // legacy only: the record moves, the legacy file goes.
        const f = fakeStore({ [LEGACY]: RECORD });
        const moved = await migrate(f.store, LEGACY, NEW);
        check('legacy-only moves', moved === true && f.files.has(NEW) && !f.files.has(LEGACY),
            `moved=${moved} new=${f.files.has(NEW)} legacy=${f.files.has(LEGACY)}`);
        check('legacy-only copy is written before the old file is removed',
            f.ops.indexOf(`write ${NEW}`) > -1 && f.ops.indexOf(`write ${NEW}`) < f.ops.indexOf(`remove ${LEGACY}`),
            f.ops.join(' | '));
    }
    {   // no legacy file: nothing is written or removed.
        const f = fakeStore({});
        const moved = await migrate(f.store, LEGACY, NEW);
        check('no-legacy is a no-op', moved === false && !f.ops.some((o) => o.startsWith('write') || o.startsWith('remove')), f.ops.join(' | '));
    }
    {   // both files present: the new record is authoritative and both stay reap targets.
        const f = fakeStore({ [LEGACY]: RECORD, [NEW]: OTHER });
        const moved = await migrate(f.store, LEGACY, NEW);
        check('both-present leaves both files',
            moved === false && f.files.has(LEGACY) && f.files.has(NEW) && f.files.get(NEW).pid === OTHER.pid,
            `moved=${moved} legacy=${f.files.has(LEGACY)} newPid=${f.files.get(NEW)?.pid}`);
    }
    {   // the copy fails: the call rejects and the legacy file is still findable.
        const f = fakeStore({ [LEGACY]: RECORD }, { failWrite: true });
        let threw = false;
        try { await migrate(f.store, LEGACY, NEW); } catch { threw = true; }
        check('failed copy keeps the legacy file', threw && f.files.has(LEGACY) && !f.files.has(NEW),
            `threw=${threw} legacy=${f.files.has(LEGACY)} new=${f.files.has(NEW)}`);
    }
    {   // a malformed or absent legacy record (read resolves null): no writes.
        const f = fakeStore({ [LEGACY]: null });
        const moved = await migrate(f.store, LEGACY, NEW);
        check('null legacy record is a no-op', moved === false && !f.ops.some((o) => o.startsWith('write')), f.ops.join(' | '));
    }
    {   // legacy path equal to the new path: nothing happens.
        const f = fakeStore({ [NEW]: RECORD });
        const moved = await migrate(f.store, NEW, NEW);
        check('same path is a no-op', moved === false && f.ops.length === 0, f.ops.join(' | '));
    }
    return failures;
}

const text = readFileSync(SOURCE, 'utf8');
const body = migrateBody(text);
const migrate = body ? evalMigrate(body) : null;
if (!migrate) {
    console.error(`${NAME}: FAIL -- migrateLegacyStateFile is not an exported async function in ${SOURCE}`);
    process.exit(1);
}

if (!SELF_TEST) {
    const failures = await probe(migrate);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- ${failures.length} migration behaviour(s) broken:\n  ${failures.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the legacy record moves once (copy before remove), the both-present and failed-copy cases keep the old file findable`);
} else {
    let ok = true;
    const control = await probe(migrate);
    if (control.length) {
        console.error(`${NAME}: --self-test FAIL -- the shipped migration is red before any plant: ${control[0]}`);
        ok = false;
    } else {
        console.log(`${NAME}: --self-test -- control green on the shipped migration`);
    }
    const plants = [
        {
            label: 'remove-before-copy mutant',
            from: '  await store.write(newPath, record);\n  await store.remove(legacyPath);',
            to: '  await store.remove(legacyPath);\n  await store.write(newPath, record);',
            needle: 'failed copy keeps the legacy file',
        },
        {
            label: 'no-existing-record-guard mutant',
            from: '  if (await store.read(newPath)) {',
            to: '  if (false) {',
            needle: 'both-present leaves both files',
        },
    ];
    for (const p of plants) {
        if (!body.includes(p.from)) {
            console.error(`${NAME}: --self-test FAIL -- ${p.label}: the needle is not in migrateLegacyStateFile, so the plant cannot be built`);
            ok = false;
            continue;
        }
        const failures = await probe(evalMigrate(body.replace(p.from, p.to)));
        const hit = failures.find((f) => f.startsWith(p.needle));
        if (!hit) {
            console.error(`${NAME}: --self-test FAIL -- ${p.label} was NOT rejected naming "${p.needle}"`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- ${p.label} REJECTED: ${hit}`);
        }
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green, then each planted mutant went red naming the case it breaks`);
}
