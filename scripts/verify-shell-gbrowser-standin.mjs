#!/usr/bin/env node
// scripts/verify-shell-gbrowser-standin.mjs
//
// G-14.1.1-19 gate (plan 14.1.1-04): the shell window's `gBrowser` stand-in
// implements exactly the member set upstream calls on it.
//
// The shell window is deliberately not Firefox chrome and has no tabbrowser,
// but privileged upstream code still reaches `win.gBrowser` and calls members
// on it. Those calls are optional-chained on the RECEIVER
// (`this?.documentGlobal?.gBrowser?.getTabForBrowser(this)`), so a non-nullish
// stand-in missing the member THROWS rather than short-circuiting -- once per
// overlay creation, burying the next real chrome-side error in the same log.
//
// This gate is a POSITIVE set-equality assertion, deliberately, and that
// choice is the point rather than an implementation detail. The reported
// defect is "no TypeError appears in the launch log", but CLAUDE.md's first
// verification rule forbids asserting on the ABSENCE of a log line whose
// emitter you do not control: an absence assertion over Gecko's console can
// never be shown to go red. So the invariant is restated as something the
// tree can prove -- the implemented member set EQUALS the set upstream calls
// -- which goes red on an upstream rebase that adds a call AND on a
// stand-in member that is deleted or added unreviewed.
//
// Both sides are DERIVED at check time (CLAUDE.md `## Verification` rule 2):
//
//   REQUIRED     -- every member name invoked on a `gBrowser` receiver in the
//                   upstream call-site files, optional chaining included. The
//                   file list is itself DERIVED (27-03): the one widget file in
//                   UPSTREAM_SCOPE plus every `*Parent.sys.mjs` directly under
//                   its actor directories, so an actor parent a rebase adds is
//                   in scope without an edit here. Read-only: this gate never
//                   writes to `upstream/`.
//   IMPLEMENTED  -- the top-level members of the `window.gBrowser` object
//                   literal in powerbrowser/shell/powerbrowser.js, parsed by
//                   brace matching with comment lines skipped the way the
//                   internals-boundary scan skips them, so a member named
//                   only in a comment cannot satisfy the set.
//
// The comparison is: REQUIRED == IMPLEMENTED methods ∪ DELIBERATELY_ABSENT.
// DELIBERATELY_ABSENT names the members upstream calls that the stand-in must
// NOT implement, each with its verified reason -- implementing them would mean
// fabricating a tab or a tabbrowser for a privileged actor to act on. Four
// failure kinds, each named: UNIMPLEMENTED (required, neither implemented nor
// absent -- the rebase case), STALE ABSENCE (listed absent, no longer called),
// CONTRADICTION (both implemented and listed absent), DEAD SURFACE
// (implemented, nobody calls it).
//
// DATA_MEMBERS below is the other hand-kept entry in this file, and it carries
// its reason: `tabs` is a data property no upstream `gBrowser`-receiver call
// site can derive (WebDriver reaches it through a local `tabBrowser` binding
// in remote/shared/TabManager.sys.mjs, never as `gBrowser.tabs(...)`). It is
// held OUT of the upstream-call comparison and asserted PRESENT separately,
// so deleting it is still red.
//
// An empty derivation on either side fails distinctly as a broken instrument.
// A negated or set-equality assertion over a walk that found nothing is not a
// clean tree.
//
// This file is exempt from its own scan by basename -- it must spell the
// shapes it matches, the same reason the internals-boundary guard exempts its
// boundary file.
//
// Honestly --quick: it reads text files only. No build, no browser, no
// display, no network.
//
// Self-test (--self-test): asserts the unmodified tree green first, then
// plants faults, each asserted to have LANDED and each required to go red
// NAMING the drift: (a) a staged stand-in with one implemented member
// removed; (b) a staged copy of one derived upstream file with a new member
// call added; (c) a staged stand-in carrying a surplus member nothing upstream
// calls; (d) an empty upstream file list; (e) a NEW caller file written into a
// copy of a scanned actor directory; (f) a stale entry added to a copy of
// DELIBERATELY_ABSENT; (g) an implemented member also listed absent.

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-shell-gbrowser-standin';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SELF_BASENAME = 'verify-shell-gbrowser-standin.mjs';

// READ ONLY. The SCOPE is reviewable here; the file list is derived from it.
// Never written by this gate: the upstream checkout must not change.
const UPSTREAM_SCOPE = {
  files: [
    [
      'upstream/toolkit/content/widgets/browser-custom-element.mjs',
      'the <browser> element resolves its owning tabbrowser through an optional chain on the gBrowser RECEIVER (getTabBrowser), so a missing member throws instead of short-circuiting -- once per overlay creation',
    ],
  ],
  dirs: [
    [
      'upstream/browser/actors',
      'browser-level JSWindowActor parents run in the parent process for every <browser>, the shell overlays included, and reach win.gBrowser of the window that embeds it',
    ],
    [
      'upstream/toolkit/actors',
      'toolkit-level JSWindowActor parents run for the same browsers; scanned so a rebase that adds a gBrowser call there is caught at check time',
    ],
  ],
};
const PARENT_SUFFIX = 'Parent.sys.mjs';

// The upstream call-site files: the scope's widget files plus every
// *Parent.sys.mjs directly under each scope directory, sorted. An unreadable
// directory is reported as unreadable, never as an empty clean list.
function deriveCallSiteFiles(scope = UPSTREAM_SCOPE) {
  const files = scope.files.map(([p]) => p);
  const unreadable = [];
  for (const [dir] of scope.dirs) {
    const abs = dir.startsWith('/') ? dir : join(REPO_ROOT, dir);
    let names;
    try {
      names = readdirSync(abs, { withFileTypes: true });
    } catch {
      unreadable.push(dir);
      continue;
    }
    for (const d of names) {
      if (d.isFile() && d.name.endsWith(PARENT_SUFFIX)) files.push(`${dir}/${d.name}`);
    }
  }
  return { files: files.sort(), unreadable };
}

// Members upstream calls that the stand-in deliberately does NOT implement.
// Each reason was checked against the pinned tag. Implementing any of them
// would mean handing a privileged actor a fabricated tab or tabbrowser.
const DELIBERATELY_ABSENT = new Map([
  [
    'getTabDialogBox',
    'PromptParent feature-detects it (`win?.gBrowser?.getTabDialogBox &&`) before calling it; absent keeps the window-modal prompt path, which needs no tab',
  ],
  [
    'setTabLabelForAuthPrompts',
    'PromptParent calls it only inside the getTabDialogBox branch, which an absent getTabDialogBox never enters',
  ],
  [
    'getNotificationBox',
    'BlockedSiteParent calls it on browser.getTabBrowser(), which is null for every shell overlay: getTabBrowser returns gBrowser only when gBrowser.getTabForBrowser(this) is truthy, and the stand-in returns null',
  ],
  [
    'removeTab',
    'AboutTabCrashedParent calls it on browser.getTabBrowser(), the same null receiver as getNotificationBox',
  ],
  [
    'refreshBlocked',
    'KNOWN GAP: RefreshBlockerParent calls it on the stand-in itself, but the actor is registered only while accessibility.blockautorefresh is on; with that pref on the call throws a TypeError, and the notification bar it would show belongs to Phase 37',
  ],
]);

const SHELL_FILE = 'powerbrowser/shell/powerbrowser.js';
const STANDIN_ANCHOR = 'window.gBrowser';

// The ONE hand-kept list in this file, each entry with its reason. A data
// property cannot be derived from a `gBrowser`-receiver CALL site, so it is
// held out of the set-equality comparison and asserted present on its own.
const DATA_MEMBERS = new Map([
  [
    'tabs',
    'WebDriver finds content browsing contexts through win.gBrowser.tabs and identifies each by its browser permanentKey; remote/shared/TabManager.sys.mjs reaches it through a local tabBrowser binding, so no gBrowser-receiver call site exists to derive it from',
  ],
]);

// A member CALL on a gBrowser receiver, optional chaining included. A bare
// `win.gBrowser` read or a `gBrowser` passed as an argument is not a member
// call and must not enter the required set.
const GBROWSER_CALL = /\bgBrowser\s*\??\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

function isCommentLine(line) {
  const trimmed = line.replace(/^\s+/, '');
  return trimmed.startsWith('//') || trimmed.startsWith('*');
}

function stripCommentLines(src) {
  return src
    .split('\n')
    .map(line => (isCommentLine(line) ? '' : line))
    .join('\n');
}

function readSource(path) {
  const abs = path.startsWith('/') ? path : join(REPO_ROOT, path);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function deriveRequired(files) {
  const members = new Set();
  const unreadable = [];
  for (const path of files) {
    if (path.split('/').pop() === SELF_BASENAME) continue;
    const src = readSource(path);
    if (src === null) {
      unreadable.push(path);
      continue;
    }
    const code = stripCommentLines(src);
    let m;
    GBROWSER_CALL.lastIndex = 0;
    while ((m = GBROWSER_CALL.exec(code)) !== null) {
      members.add(m[1]);
    }
  }
  return { members, unreadable };
}

// Top-level member names of the object literal that follows `anchor`, by
// brace matching over comment-stripped source with string literals skipped.
// Returns null when the anchor or its literal cannot be found at all -- a
// distinct broken-instrument outcome, never an empty clean set.
function objectLiteralMembers(code, anchor) {
  const at = code.indexOf(anchor);
  if (at === -1) return null;
  const open = code.indexOf('{', at);
  if (open === -1) return null;

  const members = new Set();
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) return members;
      continue;
    }
    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < code.length && /\s/.test(code[k])) k++;
      // A key is an identifier followed by `:` (property) or `(` (method
      // shorthand). Anything else at depth 1 is not a member name.
      if (code[k] === ':' || code[k] === '(') members.add(word);
      i = j - 1;
    }
  }
  return null; // unbalanced literal -- broken instrument, not a clean set
}

function deriveImplemented(shellFile) {
  const src = readSource(shellFile);
  if (src === null) return { members: null, reason: 'unreadable' };
  const members = objectLiteralMembers(stripCommentLines(src), STANDIN_ANCHOR);
  if (members === null) return { members: null, reason: 'no-literal' };
  return { members, reason: '' };
}

function sorted(set) {
  return [...set].sort();
}

function runScan(upstreamFiles, shellFile, absent = DELIBERATELY_ABSENT) {
  if (upstreamFiles.length === 0) {
    return { ok: false, reason: 'empty-upstream', detail: 'no upstream call-site files were supplied' };
  }
  const { members: required, unreadable } = deriveRequired(upstreamFiles);
  if (unreadable.length) {
    return { ok: false, reason: 'unreadable-upstream', detail: unreadable.join(', ') };
  }
  if (required.size === 0) {
    return { ok: false, reason: 'empty-required', detail: 'derived zero gBrowser member calls from the upstream call sites' };
  }

  const impl = deriveImplemented(shellFile);
  if (impl.members === null) {
    return { ok: false, reason: `implemented-${impl.reason}`, detail: shellFile };
  }
  if (impl.members.size === 0) {
    return { ok: false, reason: 'empty-implemented', detail: shellFile };
  }

  const missingData = [...DATA_MEMBERS.keys()].filter(k => !impl.members.has(k));
  const methods = new Set([...impl.members].filter(m => !DATA_MEMBERS.has(m)));
  const unimplemented = sorted(new Set([...required].filter(m => !methods.has(m) && !absent.has(m))));
  const staleAbsent = sorted(new Set([...absent.keys()].filter(m => !required.has(m))));
  const contradiction = sorted(new Set([...absent.keys()].filter(m => methods.has(m))));
  const surplus = sorted(new Set([...methods].filter(m => !required.has(m))));

  return {
    ok:
      unimplemented.length === 0 &&
      staleAbsent.length === 0 &&
      contradiction.length === 0 &&
      surplus.length === 0 &&
      missingData.length === 0,
    reason: '',
    fileCount: upstreamFiles.length,
    required: sorted(required),
    implemented: sorted(impl.members),
    methods: sorted(methods),
    absent: sorted(new Set(absent.keys())),
    unimplemented,
    staleAbsent,
    contradiction,
    surplus,
    missingData,
  };
}

function reportFailure(result, absent = DELIBERATELY_ABSENT) {
  switch (result.reason) {
    case 'empty-upstream':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. A set comparison over an empty upstream file list proves nothing.`);
      return;
    case 'unreadable-upstream':
      console.error(`${NAME}: FAIL -- broken instrument: unreadable upstream call site(s): ${result.detail}`);
      return;
    case 'empty-required':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. An empty required set is a broken derivation, not a clean tree.`);
      return;
    case 'implemented-unreadable':
      console.error(`${NAME}: FAIL -- broken instrument: cannot read ${result.detail}`);
      return;
    case 'implemented-no-literal':
      console.error(`${NAME}: FAIL -- broken instrument: no balanced '${STANDIN_ANCHOR} = { ... }' object literal found in ${result.detail}`);
      return;
    case 'empty-implemented':
      console.error(`${NAME}: FAIL -- broken instrument: the ${STANDIN_ANCHOR} literal in ${result.detail} has no members at all`);
      return;
    default:
      break;
  }
  console.error(`${NAME}: FAIL -- the shell gBrowser stand-in does not match what upstream calls on it`);
  console.error(`  required (derived from ${result.fileCount} upstream files): ${result.required.join(', ')}`);
  console.error(`  implemented (derived from ${SHELL_FILE}): ${result.implemented.join(', ')}`);
  console.error(`  deliberately absent: ${result.absent.join(', ')}`);
  for (const m of result.unimplemented) {
    console.error(`  UNIMPLEMENTED: '${m}' is called on a gBrowser receiver upstream but the stand-in neither implements it nor records it in DELIBERATELY_ABSENT -- implement it, or record why it must stay absent`);
  }
  for (const m of result.staleAbsent) {
    console.error(`  STALE ABSENCE: '${m}' is in DELIBERATELY_ABSENT but nothing upstream calls it any more -- remove the entry (${absent.get(m)})`);
  }
  for (const m of result.contradiction) {
    console.error(`  CONTRADICTION: '${m}' is implemented on the stand-in AND listed in DELIBERATELY_ABSENT -- one of the two is wrong`);
  }
  for (const m of result.surplus) {
    console.error(`  DEAD SURFACE: '${m}' is implemented on the stand-in but nothing upstream calls it -- remove it rather than carry it`);
  }
  for (const m of result.missingData) {
    console.error(`  MISSING DATA MEMBER: '${m}' -- ${DATA_MEMBERS.get(m)}`);
  }
}

// Resolve the scope to files, failing distinctly on an unreadable directory.
function scopeFilesOrExit(scope, label) {
  const { files, unreadable } = deriveCallSiteFiles(scope);
  if (unreadable.length) {
    console.error(`${NAME}${label}: FAIL -- broken instrument: unreadable upstream actor director${unreadable.length > 1 ? 'ies' : 'y'}: ${unreadable.join(', ')}`);
    process.exit(1);
  }
  return files;
}

function main() {
  const files = scopeFilesOrExit(UPSTREAM_SCOPE, '');
  const result = runScan(files, SHELL_FILE);
  if (!result.ok) {
    reportFailure(result);
    process.exit(1);
  }
  console.log(
    `${NAME}: PASS -- required {${result.required.join(', ')}} derived from ${result.fileCount} upstream files equals implemented {${result.methods.join(', ')}} plus deliberately absent {${result.absent.join(', ')}}; data member(s) {${[...DATA_MEMBERS.keys()].join(', ')}} present`
  );
}

function selfTest() {
  const realUpstream = scopeFilesOrExit(UPSTREAM_SCOPE, ' --self-test');
  const baseline = runScan(realUpstream, SHELL_FILE);
  if (!baseline.ok) {
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
    reportFailure(baseline);
    process.exit(1);
  }
  console.log(`${NAME} --self-test: unmodified tree green -- required {${baseline.required.join(', ')}} == implemented {${baseline.methods.join(', ')}} + absent {${baseline.absent.join(', ')}} over ${baseline.fileCount} files; planting faults`);

  const methods = baseline.methods;
  const victim = methods[0];
  const stage = mkdtempSync(join(tmpdir(), 'pb-gbrowser-standin-'));
  if (/\s/.test(stage)) throw new Error(`${NAME}: FAIL -- stage path contains a space: ${stage}`);
  let failed = 0;

  // A stand-in fixture built from a member list, so a plant is unambiguous
  // and exercises the same literal parser the real check uses.
  const writeStandIn = (path, members) => {
    const body = members.map(m => (m === 'tabs' ? '  tabs: [{ linkedBrowser: b }],' : `  ${m}() { return null; },`)).join('\n');
    writeFileSync(path, `window.gBrowser = {\n${body}\n};\n`);
  };

  try {
    // Plant (a): an implemented member removed from the stand-in.
    {
      const path = join(stage, 'standin-missing.js');
      writeStandIn(path, ['tabs', ...methods.filter(m => m !== victim)]);
      const impl = deriveImplemented(path);
      if (!impl.members || impl.members.has(victim)) {
        console.error(`${NAME} --self-test: FAIL -- 'missing member' plant did not land (${victim} still parsed as implemented)`);
        failed++;
      } else {
        const r = runScan(realUpstream, path);
        if (r.ok || !r.unimplemented?.includes(victim)) {
          console.error(`${NAME} --self-test: FAIL -- removing '${victim}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented, surplus: r.surplus })}`);
          failed++;
        } else {
          console.log(`  ok  stand-in missing '${victim}' -> red, naming it UNIMPLEMENTED`);
        }
      }
    }

    // Plant (b): a staged copy of one derived upstream file gaining a new
    // gBrowser member call; the rest of the derived list passes unchanged.
    {
      const planted = 'zzzPlantedRebaseMember';
      const source = realUpstream.find(p => p.endsWith('/LinkHandlerParent.sys.mjs')) ?? realUpstream[0];
      const path = join(stage, 'upstream-new-call.sys.mjs');
      writeFileSync(path, `${readSource(source)}\nfunction plantedRebase(gBrowser, tab) {\n  return gBrowser.${planted}(tab);\n}\n`);
      const landed = readFileSync(path, 'utf8').includes(`gBrowser.${planted}(`);
      if (!landed) {
        console.error(`${NAME} --self-test: FAIL -- 'new upstream call' plant did not land`);
        failed++;
      } else {
        const r = runScan([path, ...realUpstream.filter(p => p !== source)], SHELL_FILE);
        if (r.ok || !r.unimplemented?.includes(planted)) {
          console.error(`${NAME} --self-test: FAIL -- a new upstream member call did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
          failed++;
        } else {
          console.log(`  ok  upstream rebase adding '${planted}' to ${source.split('/').pop()} -> red, naming it UNIMPLEMENTED`);
        }
      }
    }

    // Plant (c): a surplus stand-in member nothing upstream calls.
    {
      const planted = 'zzzDeadSurfaceMember';
      const path = join(stage, 'standin-surplus.js');
      writeStandIn(path, ['tabs', ...methods, planted]);
      const impl = deriveImplemented(path);
      if (!impl.members || !impl.members.has(planted)) {
        console.error(`${NAME} --self-test: FAIL -- 'surplus member' plant did not land`);
        failed++;
      } else {
        const r = runScan(realUpstream, path);
        if (r.ok || !r.surplus?.includes(planted)) {
          console.error(`${NAME} --self-test: FAIL -- a surplus stand-in member did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, surplus: r.surplus })}`);
          failed++;
        } else {
          console.log(`  ok  stand-in surplus '${planted}' -> red, naming it DEAD SURFACE`);
        }
      }
    }

    // Plant (d): an empty upstream file list is a broken instrument, never clean.
    {
      const r = runScan([], SHELL_FILE);
      if (r.ok || r.reason !== 'empty-upstream') {
        console.error(`${NAME} --self-test: FAIL -- an empty upstream file list did not fail distinctly as a broken instrument; got reason='${r.reason}'`);
        failed++;
      } else {
        console.log(`  ok  empty upstream file list -> distinct broken-instrument failure, not clean`);
      }
    }

    // Plant (e): a NEW caller file in a copy of a scanned actor directory.
    // Proves the file list is derived: no edit here brings the file into scope.
    {
      const planted = 'zzzNewActorParentMember';
      const [dir] = UPSTREAM_SCOPE.dirs[0];
      const copy = join(stage, 'actors-copy');
      cpSync(join(REPO_ROOT, dir), copy, { recursive: true });
      const newFile = `ZzzPlanted${PARENT_SUFFIX}`;
      writeFileSync(
        join(copy, newFile),
        `export class ZzzPlantedParent extends JSWindowActorParent {\n  receiveMessage() {\n    this.browsingContext.top.embedderElement.documentGlobal.gBrowser.${planted}(this);\n  }\n}\n`
      );
      const scope = { files: UPSTREAM_SCOPE.files, dirs: [[copy, 'self-test copy'], ...UPSTREAM_SCOPE.dirs.slice(1)] };
      const { files } = deriveCallSiteFiles(scope);
      if (!files.includes(`${copy}/${newFile}`)) {
        console.error(`${NAME} --self-test: FAIL -- 'new caller file' plant did not land (${newFile} not in the derived file list)`);
        failed++;
      } else {
        const r = runScan(files, SHELL_FILE);
        if (r.ok || !r.unimplemented?.includes(planted)) {
          console.error(`${NAME} --self-test: FAIL -- a new actor parent calling '${planted}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
          failed++;
        } else {
          console.log(`  ok  new caller file ${newFile} in a copy of ${dir} -> red, naming '${planted}' UNIMPLEMENTED`);
        }
      }
    }

    // Plant (f): a stale entry in a copy of DELIBERATELY_ABSENT.
    {
      const planted = 'zzzStaleAbsentMember';
      const absent = new Map([...DELIBERATELY_ABSENT, [planted, 'self-test stale entry']]);
      if (!absent.has(planted)) {
        console.error(`${NAME} --self-test: FAIL -- 'stale absence' plant did not land`);
        failed++;
      } else {
        const r = runScan(realUpstream, SHELL_FILE, absent);
        if (r.ok || !r.staleAbsent?.includes(planted)) {
          console.error(`${NAME} --self-test: FAIL -- a stale DELIBERATELY_ABSENT entry did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, staleAbsent: r.staleAbsent })}`);
          failed++;
        } else {
          console.log(`  ok  DELIBERATELY_ABSENT carrying '${planted}' -> red, naming it STALE ABSENCE`);
        }
      }
    }

    // Plant (g): an implemented member also listed absent.
    {
      const absent = new Map([...DELIBERATELY_ABSENT, [victim, 'self-test contradiction']]);
      const r = runScan(realUpstream, SHELL_FILE, absent);
      if (r.ok || !r.contradiction?.includes(victim)) {
        console.error(`${NAME} --self-test: FAIL -- '${victim}' both implemented and listed absent did not go red naming it; got: ${JSON.stringify({ reason: r.reason, contradiction: r.contradiction })}`);
        failed++;
      } else {
        console.log(`  ok  '${victim}' implemented and listed absent -> red, naming it CONTRADICTION`);
      }
    }

    // Positive control on the data member: dropping `tabs` is red too, so the
    // hold-out is not a blanket exemption.
    {
      const path = join(stage, 'standin-no-tabs.js');
      writeStandIn(path, methods);
      const r = runScan(realUpstream, path);
      if (r.ok || !r.missingData?.includes('tabs')) {
        console.error(`${NAME} --self-test: FAIL -- dropping the 'tabs' data member did not go red naming it; got: ${JSON.stringify({ reason: r.reason, missingData: r.missingData })}`);
        failed++;
      } else {
        console.log(`  ok  stand-in missing 'tabs' -> red, naming it MISSING DATA MEMBER`);
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  if (failed) process.exit(1);
  console.log(`${NAME} --self-test: PASS -- every planted fault landed and went red naming its drift (missing member, new upstream call, surplus member, new caller file, stale absence, contradiction, missing data member); the empty file list failed distinctly`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main();
}
