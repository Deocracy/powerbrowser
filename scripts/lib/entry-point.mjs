// scripts/lib/entry-point.mjs
//
// Is this module the script node was started on? (harness-static-structure-08)
//
// Node realpaths the ESM main module, so import.meta.url names the real file, while process.argv[1] stays as typed.
// A guard that compares the two by text is false whenever a component of the checkout path is a symlink, and a
// check guarded that way then does nothing and exits 0, for the check and for --self-test alike.
//
//   const how = entryPoint(import.meta.url);
//   if (how === 'mismatch') { console.error(`${NAME}: FAIL -- ...`); process.exit(2); }
//   if (how === 'entry') { ...run... }
//
// 'entry'    both sides are the same file once their symlinks are resolved;
// 'imported' argv[1] is some other script, or none: this module is a library of it;
// 'mismatch' argv[1] has this file's name but is not this file once resolved, or cannot be resolved at all. The script
//            was run as a script and the guard cannot tell: the caller reports FAIL and exits 2, it never falls through.
//
// No top-level side effects.

import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function entryPoint(importMetaUrl, argv1 = process.argv[1]) {
    if (!argv1) return 'imported';
    const selfPath = fileURLToPath(importMetaUrl);
    let self;
    try { self = realpathSync(selfPath); } catch { return 'mismatch'; }
    let arg;
    try { arg = realpathSync(resolve(argv1)); } catch { return basename(argv1) === basename(selfPath) ? 'mismatch' : 'imported'; }
    if (arg === self) return 'entry';
    return basename(arg) === basename(self) ? 'mismatch' : 'imported';
}

/** The message of the 'mismatch' verdict, for the one line a caller prints before exit 2. */
export function mismatchMessage(name, importMetaUrl, argv1 = process.argv[1]) {
    return `${name}: FAIL -- this file was run as ${argv1} but resolves to ${fileURLToPath(importMetaUrl)}, which is not the same file once symlinks are resolved, so the entry-point guard cannot tell it was run as a script. Next step: run it by the checkout's real path.`;
}
