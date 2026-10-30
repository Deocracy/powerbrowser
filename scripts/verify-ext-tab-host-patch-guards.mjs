#!/usr/bin/env node
// scripts/verify-ext-tab-host-patch-guards.mjs
//
// EXT-05 gate (plan 31.1-01, Task 2). Patch 050 is the tracker gate the
// extension tab host stands on. Its guards are correctness requirements (a
// zero-tab page_action start, a null frame loader, a sidebar key the shell does
// not have), so this gate proves each guard is present in its exact shape and at
// its site, and that the D-74 logic-patch list names exactly the patches that
// touch a JavaScript file.
//
// What is derived, and from what:
//   - Each guard's anchor and site are read from the PRISTINE upstream bytes
//     (git -C upstream show HEAD:<path>), so the check gives the same answer
//     whether or not 050 is applied in upstream/.
//   - Each guard's `+` line is located in the POST-IMAGE: the patch is applied
//     to those pristine bytes inside a mktemp -d directory. A patch that does not
//     apply is a broken instrument, never a clean tree.
//   - A guard's site is derived by an indentation-ancestor walk over the
//     post-image. Git's hunk funcname is not used: for an indented method it is
//     the class line, so it cannot tell two methods of one class apart.
//   - The D-74 set is the patches/*.patch files with a `+++ b/` target ending in
//     .js or .mjs. It is compared with the bullets under one heading in
//     docs/BUILD.md.
//
// The GUARDS table is the one hand-kept list. Each row carries its reason.
//
// Honestly --quick: it reads text, runs read-only git show, and applies the
// patch only inside a mktemp -d directory. It never writes patches/, docs/ or
// upstream/, and --self-test plants only into mktemp -d directories.
//
// --self-test first requires the clean tree to be green, then plants, for each
// guard, a removed guard (MISSING), a weakened guard (WEAKENED) and a guard
// moved to another method (MISPLACED). It also plants two anchor-drift faults,
// a second logic patch, a removed BUILD.md bullet, a removed BUILD.md heading,
// a missing patch and a hunk-free patch. Each plant must land and must go red
// naming its guard and kind. A plant that does not land is a failure too.

import {
  mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, copyFileSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-ext-tab-host-patch-guards';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATCH = join(ROOT, 'patches', '050-extension-tab-host.patch');
const PATCHES_DIR = join(ROOT, 'patches');
const BUILD_MD = join(ROOT, 'docs', 'BUILD.md');
const UPSTREAM = join(ROOT, 'upstream');
const LOGIC_HEADING = '### Logic patches (D-74 as amended 2026-10-21)';
const PLANT_SITE = 'zzzPlantedSite';

const PARENT = 'browser/components/extensions/parent/';
const PAGE_ACTION = PARENT + 'ext-pageAction.js';
const BROWSER = PARENT + 'ext-browser.js';
const TABS = PARENT + 'ext-tabs.js';
const SHORTCUTS = 'toolkit/components/extensions/ExtensionShortcuts.sys.mjs';

// mode: 'replace' = the anchor is a `-` line and the guard is its `+` change block;
//       'after'   = the anchor is a context line and the guard is the `+` block after it;
//       'before'  = the anchor is a context line and the guard is the `+` block before it.
// site: the Outer.inner definition the guard must sit in (derived, then compared).
const GUARDS = [
  { id: 'G1', file: PAGE_ACTION, mode: 'replace',
    anchor: 'if (this.action.isShownForTab(tab)) {', site: 'onManifestEntry',
    regexes: [/^\s*if \(tab && this\.action\.isShownForTab\(tab\)\) \{\s*$/],
    why: 'a zero-tab page_action show_matches loop must not pass a null tab' },
  { id: 'G2', file: PAGE_ACTION, mode: 'after',
    anchor: 'updateButton(window) {', site: 'updateButton',
    regexes: [/^\s*if \(windowTracker\.isTabHostWindow\(window\)\) \{\s*$/, /^\s*return;\s*$/, /^\s*\}\s*$/],
    why: 'a tab host window has no page-action UI (PageActions throws for it)' },
  { id: 'G3', file: BROWSER, mode: 'replace',
    anchor: 'const { frameLoader } = currentTab.linkedBrowser;', site: 'TabTracker.handleEvent',
    regexes: [/^\s*const frameLoader = currentTab\?\.linkedBrowser\?\.frameLoader;\s*$/],
    why: 'a TabOpen with no tab or no frame loader must not throw' },
  { id: 'G4', file: BROWSER, mode: 'replace',
    anchor: 'this.emitActivated(window.gBrowser.tabs[0]);', site: 'TabTracker._handleWindowOpen',
    regexes: [/^\s*if \(window\.gBrowser\.tabs\.length\) \{\s*$/],
    why: 'a window opened with zero tabs has no tabs[0]' },
  { id: 'G5', file: BROWSER, mode: 'replace',
    anchor: 'return tabManager.getWrapper(this.window.gBrowser.selectedTab);', site: 'Window.activeTab',
    regexes: [/^\s*return selectedTab \? tabManager\.getWrapper\(selectedTab\) : null;\s*$/],
    why: 'a zero-tab activeTab resolves to null, not to a wrapper of null' },
  { id: 'G6', file: SHORTCUTS, mode: 'replace',
    anchor: 'if (sidebarKey) {', site: 'ExtensionShortcuts.registerKeysToDocument',
    regexes: [/^\s*if \(sidebarKey && !lazy\.global\.windowTracker\.isTabHostWindow\(window\)\) \{\s*$/],
    why: 'the sidebar shortcut needs SidebarController, which the shell lacks' },
  { id: 'G7', file: BROWSER, mode: 'before',
    anchor: 'return BrowserWindowTracker.getTopWindow(options);', site: 'WindowTracker.getTopNormalWindow',
    regexes: [/^\s*try \{\s*$/, /^\s*let top = this\.getTopWindow\(context\);\s*$/],
    why: 'the top-window probe must not throw NS_ERROR_FAILURE' },
  { id: 'G8', file: TABS, mode: 'after',
    anchor: 'let tabCreated = (eventName, event) => {', site: 'register.tabCreated',
    regexes: [/^\s*if \(windowTracker\.isTabHostWindow\(event\.nativeTab\.documentGlobal\)\) \{\s*$/, /^\s*return;\s*$/],
    why: 'tab-created reads the shell ZoomManager, which the shell lacks' },
];

// The weakening plant for each guard: one `+` line changed (or one dropped).
const WEAKEN = {
  G1: { find: 'if (tab && this.action', replace: 'if (tab || this.action' },
  G2: { find: 'if (windowTracker.isTabHostWindow(window)) {', replace: 'if (!windowTracker.isTabHostWindow(window)) {' },
  G3: { find: 'currentTab?.linkedBrowser?.frameLoader', replace: 'currentTab.linkedBrowser?.frameLoader' },
  G4: { find: 'if (window.gBrowser.tabs.length) {', replace: 'if (window.gBrowser.tabs) {' },
  G5: { find: 'return selectedTab ? tabManager.getWrapper(selectedTab) : null;', replace: 'return tabManager.getWrapper(selectedTab);' },
  G6: { find: 'if (sidebarKey && ', replace: 'if (sidebarKey || ' },
  G7: { drop: /^\s*try \{\s*$/ },
  G8: { find: 'if (windowTracker.isTabHostWindow(event.nativeTab', replace: 'if (!windowTracker.isTabHostWindow(event.nativeTab' },
};

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return']);

// ---- text model ------------------------------------------------------------

function parsePatch(text) {
  const lines = text.split('\n');
  const files = [];
  let file = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      file = { header: [line], path: null, hunks: [] };
      files.push(file);
      i++;
      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) {
        file.header.push(lines[i]);
        const m = /^\+\+\+ b\/(.+)$/.exec(lines[i]);
        if (m) file.path = m[1];
        i++;
      }
      continue;
    }
    const hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (hm && file) {
      let oc = hm[2] === undefined ? 1 : Number(hm[2]);
      let nc = hm[4] === undefined ? 1 : Number(hm[4]);
      let o = Number(hm[1]);
      let n = Number(hm[3]);
      const hunk = { oldStart: Number(hm[1]), ctx: hm[5], body: [] };
      i++;
      while ((oc > 0 || nc > 0) && i < lines.length) {
        const raw = lines[i];
        const c = raw[0];
        if (c === ' ') { oc--; nc--; hunk.body.push({ raw, o: o++, n: n++ }); }
        else if (c === '-') { oc--; hunk.body.push({ raw, o: o++, n: null }); }
        else if (c === '+') { nc--; hunk.body.push({ raw, o: null, n: n++ }); }
        else throw new Error(`hunk ended early at line ${i + 1}: ${JSON.stringify(raw)}`);
        i++;
      }
      while (i < lines.length && lines[i].startsWith('\\')) {
        hunk.body.push({ raw: lines[i], o: null, n: null });
        i++;
      }
      file.hunks.push(hunk);
      continue;
    }
    i++;
  }
  return files;
}

// git writes a count of 1 without ",1"; a deleted-only hunk reports the line before.
function serialize(files, endsWithNewline) {
  const out = [];
  for (const f of files) {
    out.push(...f.header);
    let delta = 0;
    for (const h of f.hunks) {
      const oc = h.body.filter(l => l.raw[0] === ' ' || l.raw[0] === '-').length;
      const nc = h.body.filter(l => l.raw[0] === ' ' || l.raw[0] === '+').length;
      const os = h.oldStart;
      const ns = os + delta + (oc === 0 ? 1 : 0) - (nc === 0 ? 1 : 0);
      out.push(`@@ -${os}${oc === 1 ? '' : ',' + oc} +${ns}${nc === 1 ? '' : ',' + nc} @@${h.ctx}`);
      for (const l of h.body) out.push(l.raw);
      delta += nc - oc;
    }
  }
  return out.join('\n') + (endsWithNewline ? '\n' : '');
}

const isChange = raw => raw[0] === '+' || raw[0] === '-';

// The guard's hunk, its change block and the `+` lines in that block.
// Returns null when no hunk carries the anchor in the stated role.
function findBlock(files, g) {
  const file = files.find(f => f.path === g.file);
  if (!file) return null;
  const anchor = g.anchor.trim();
  for (const hunk of file.hunks) {
    const body = hunk.body;
    for (let k = 0; k < body.length; k++) {
      const c = body[k].raw[0];
      if (body[k].raw.slice(1).trim() !== anchor) continue;
      if (g.mode === 'replace') {
        if (c !== '-') continue;
        let a = k;
        while (a > 0 && isChange(body[a - 1].raw)) a--;
        let b = k;
        while (b < body.length - 1 && isChange(body[b + 1].raw)) b++;
        const plus = [];
        for (let j = a; j <= b; j++) if (body[j].raw[0] === '+') plus.push(j);
        return { hunk, plus, range: [a, b] };
      }
      if (c !== ' ') continue;
      if (g.mode === 'after') {
        const plus = [];
        let j = k + 1;
        while (j < body.length && body[j].raw[0] === '+') { plus.push(j); j++; }
        return { hunk, plus, range: [k + 1, k + plus.length] };
      }
      const plus = [];
      let j = k - 1;
      while (j >= 0 && body[j].raw[0] === '+') { plus.unshift(j); j--; }
      return { hunk, plus, range: [k - plus.length, k - 1] };
    }
  }
  return null;
}

// ---- site derivation -------------------------------------------------------

function defName(t) {
  let m = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(t);
  if (m) return m[1];
  m = /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(t);
  if (m) return m[1];
  m = /^(?:(?:async|static|get|set)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{$/.exec(t);
  if (m) return KEYWORDS.has(m[1]) ? null : m[1];
  m = /^(?:(?:let|const|var)\s+)?([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s+)?(?:function\b|class\b|new\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(t);
  if (m) return m[1];
  return null;
}

function isCommentLine(t) {
  if (t.startsWith('//') || t.startsWith('/*')) return true;
  return t.startsWith('*') && !/^\*[A-Za-z_$][\w$]*\s*\(/.test(t);
}

// Walk upward from lines[idx]: take each non-comment line indented less than the
// last line taken, and take the first two that define a bare identifier.
function enclosing(lines, idx) {
  const ind = s => s.length - s.trimStart().length;
  let last = ind(lines[idx]);
  const found = [];
  for (let i = idx - 1; i >= 0 && found.length < 2; i--) {
    const t = lines[i].trim();
    if (t === '' || isCommentLine(t)) continue;
    if (ind(lines[i]) < last) {
      last = ind(lines[i]);
      const name = defName(t);
      if (name) found.push({ name, line: i });
    }
  }
  return { found, site: found.map(f => f.name).reverse().join('.') };
}

// ---- inputs ----------------------------------------------------------------

const gitShowCache = new Map();
function gitShow(path) {
  if (!gitShowCache.has(path)) {
    gitShowCache.set(path, execFileSync('git', ['-C', UPSTREAM, 'show', `HEAD:${path}`], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    }));
  }
  return gitShowCache.get(path);
}

// Applies the patch to the pristine bytes in a mktemp -d directory and returns
// the post-image of each target file. Throws when the patch does not apply.
function applyToScratch(patchPath, files, pristine) {
  const dir = mkdtempSync(join(tmpdir(), 'ext-tab-host-guards-'));
  try {
    const targets = [...new Set(files.map(f => f.path).filter(Boolean))];
    for (const p of targets) {
      const dest = join(dir, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, pristine(p));
    }
    execFileSync('git', ['apply', patchPath], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const post = new Map();
    for (const p of targets) post.set(p, readFileSync(join(dir, p), 'utf8'));
    return post;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function logicSet(dir) {
  const set = new Set();
  for (const name of readdirSync(dir).filter(n => n.endsWith('.patch')).sort()) {
    const text = readFileSync(join(dir, name), 'utf8');
    if (/^\+\+\+ b\/.*\.(js|mjs)$/m.test(text)) set.add(name);
  }
  return set;
}

function bulletSet(buildText) {
  const lines = buildText.split('\n');
  const h = lines.indexOf(LOGIC_HEADING);
  if (h < 0) return null;
  const names = new Set();
  for (let i = h + 1; i < lines.length && !lines[i].startsWith('#'); i++) {
    const m = /^\s*[-*]\s+`([^`]+)`/.exec(lines[i]);
    if (m) names.add(m[1]);
  }
  return names;
}

// ---- the check -------------------------------------------------------------

// Returns { failures: [{id, kind, text}], sites: [...], logic: [...] }.
// Overrides exist for the self-test only: patchPath, patchesDir, buildMdText,
// pristine (Map path -> text), post (Map path -> text).
function check(opts = {}) {
  const patchPath = opts.patchPath ?? PATCH;
  const patchesDir = opts.patchesDir ?? PATCHES_DIR;
  const pristineOverride = opts.pristine ?? new Map();
  const postOverride = opts.post ?? new Map();
  const failures = [];
  const sites = [];
  const logic = [];
  const pristine = p => (pristineOverride.has(p) ? pristineOverride.get(p) : gitShow(p));
  const broken = text => failures.push({ id: 'instrument', kind: 'BROKEN INSTRUMENT', text });
  const fail = (g, kind, detail) => failures.push({ id: g.id, kind, text: `${g.id} ${g.file}: ${kind} -- ${detail}` });

  let patchText;
  let files;
  try {
    patchText = readFileSync(patchPath, 'utf8');
  } catch (e) {
    broken(`cannot read ${patchPath}: ${e.message}`);
    return { failures, sites, logic };
  }
  try {
    files = parsePatch(patchText);
  } catch (e) {
    broken(`unparseable patch ${patchPath}: ${e.message}`);
    return { failures, sites, logic };
  }
  if (files.reduce((n, f) => n + f.hunks.length, 0) === 0) {
    broken(`zero hunks in ${patchPath}`);
    return { failures, sites, logic };
  }
  if (serialize(files, patchText.endsWith('\n')) !== patchText) {
    broken(`parse/serialize round trip of ${patchPath} differs; this instrument cannot be trusted`);
    return { failures, sites, logic };
  }

  // Phase A: anchors in the pristine bytes, then the guard shape in the patch.
  let drift = false;
  for (const g of GUARDS) {
    let pl;
    try {
      pl = pristine(g.file).split('\n');
    } catch (e) {
      broken(`cannot read pristine ${g.file}: ${e.message}`);
      return { failures, sites, logic };
    }
    const hits = [];
    pl.forEach((l, i) => { if (l.trim() === g.anchor.trim()) hits.push(i); });
    if (hits.length !== 1) {
      fail(g, 'ANCHOR DRIFT', `the anchor ${JSON.stringify(g.anchor)} occurs ${hits.length} times upstream; a rebase moved it, so regenerate 050`);
      drift = true;
      continue;
    }
    const at = g.mode === 'after' ? hits[0] + 1 : hits[0];
    const site = at < pl.length ? enclosing(pl, at).site : '';
    if (site !== g.site) {
      fail(g, 'ANCHOR DRIFT', `the anchor sits in ${site || 'no definition'}, the row says ${g.site}`);
      drift = true;
    }
  }
  if (drift) return { failures, sites, logic };

  const shaped = new Map();
  for (const g of GUARDS) {
    const b = findBlock(files, g);
    if (!b) {
      fail(g, 'MISSING', `no hunk carries the anchor ${JSON.stringify(g.anchor)} in its ${g.mode} position`);
      continue;
    }
    const plusLines = b.plus.map(j => b.hunk.body[j].raw.slice(1));
    if (plusLines.length === 0 || plusLines.every(s => s.trim() === g.anchor.trim())) {
      fail(g, 'MISSING', 'no guard line sits at the anchor (the anchor is unchanged or has no added line beside it)');
      continue;
    }
    let ok = true;
    for (const re of g.regexes) {
      if (!plusLines.some(s => re.test(s))) {
        fail(g, 'WEAKENED', `no added line at the anchor matches ${re}`);
        ok = false;
      }
    }
    if (ok) shaped.set(g.id, b);
  }

  // Phase B: the patch must apply to the pristine bytes; then the post-image.
  let post;
  try {
    post = applyToScratch(patchPath, files, pristine);
  } catch (e) {
    broken(`the patch does not apply to the pristine bytes: ${String(e.stderr || e.message).trim()}`);
    return { failures, sites, logic };
  }
  for (const [p, text] of postOverride) post.set(p, text);

  // Phase C: each guard's `+` line in the post-image sits in its derived site.
  for (const g of GUARDS) {
    const b = shaped.get(g.id);
    if (!b) continue;
    const primary = b.plus.find(j => g.regexes[0].test(b.hunk.body[j].raw.slice(1))) ?? b.plus[0];
    const line = b.hunk.body[primary];
    const lines = (post.get(g.file) ?? '').split('\n');
    const idx = line.n - 1;
    if (!lines[idx] || lines[idx].trim() !== line.raw.slice(1).trim()) {
      broken(`post-image line ${line.n} of ${g.file} is not the guard line ${JSON.stringify(line.raw.slice(1).trim())}`);
      continue;
    }
    const derived = enclosing(lines, idx).site;
    sites.push(`${g.id} ${derived}`);
    if (derived !== g.site) {
      fail(g, 'MISPLACED', `the guard sits in ${derived}, the row says ${g.site}`);
    }
  }

  // Phase D: the D-74 logic-patch set equals the BUILD.md bullets.
  let buildText;
  try {
    buildText = opts.buildMdText ?? readFileSync(BUILD_MD, 'utf8');
  } catch (e) {
    broken(`cannot read ${BUILD_MD}: ${e.message}`);
    return { failures, sites, logic };
  }
  const bullets = bulletSet(buildText);
  if (bullets === null) {
    broken(`heading ${JSON.stringify(LOGIC_HEADING)} is missing from docs/BUILD.md`);
    return { failures, sites, logic };
  }
  const logicNames = logicSet(patchesDir);
  for (const name of [...logicNames].sort()) {
    logic.push(name);
    if (!bullets.has(name)) {
      failures.push({ id: 'D-74', kind: 'LOGIC SET', text: `D-74: logic patch ${name} has no bullet under ${JSON.stringify(LOGIC_HEADING)} in docs/BUILD.md` });
    }
  }
  for (const name of [...bullets].sort()) {
    if (!logicNames.has(name)) {
      failures.push({ id: 'D-74', kind: 'LOGIC SET', text: `D-74: the docs/BUILD.md bullet ${name} names no logic patch in ${patchesDir}` });
    }
  }
  return { failures, sites, logic };
}

// ---- plants (self-test only; each writes into a mktemp -d directory) -------

function findPlusIndex(b, pred) {
  return b.plus.find(j => pred(b.hunk.body[j].raw.slice(1)));
}

// A guard removed: its change block is reverted, the `-` anchor restored as context.
function removeGuard(files, g) {
  const b = findBlock(files, g);
  if (!b) return false;
  const body = b.hunk.body;
  const drop = new Set();
  for (let j = b.range[0]; j <= b.range[1]; j++) {
    if (body[j].raw[0] === '-') body[j].raw = ' ' + body[j].raw.slice(1);
    else if (body[j].raw[0] === '+') drop.add(j);
  }
  b.hunk.body = body.filter((_, j) => !drop.has(j));
  return true;
}

function weakenGuard(files, g) {
  const b = findBlock(files, g);
  if (!b) return false;
  const op = WEAKEN[g.id];
  if (op.drop) {
    const j = findPlusIndex(b, s => op.drop.test(s));
    if (j === undefined) return false;
    b.hunk.body.splice(j, 1);
    return true;
  }
  const j = b.plus.find(k => b.hunk.body[k].raw.includes(op.find));
  if (j === undefined) return false;
  const line = b.hunk.body[j];
  line.raw = '+' + line.raw.slice(1).replace(op.find, op.replace);
  return true;
}

function pruneEmpty(files) {
  for (const f of files) {
    f.hunks = f.hunks.filter(h => h.body.some(l => isChange(l.raw)));
  }
  return files.filter(f => f.hunks.length > 0);
}

// The post-image with the guard's inner definition renamed, so the guard
// sits in a method other than its row's site.
function misplacedPost(g, cleanFiles, cleanPost) {
  const b = findBlock(cleanFiles, g);
  const primary = b.plus.find(j => g.regexes[0].test(b.hunk.body[j].raw.slice(1))) ?? b.plus[0];
  const lines = cleanPost.get(g.file).split('\n');
  const inner = enclosing(lines, b.hunk.body[primary].n - 1).found[0];
  const renamed = lines.slice();
  renamed[inner.line] = lines[inner.line].replace(new RegExp(`\\b${inner.name}\\b`), PLANT_SITE);
  return { text: renamed.join('\n'), landed: renamed[inner.line] !== lines[inner.line] };
}

function selfTest() {
  const clean = readFileSync(PATCH, 'utf8');
  const base = check({});
  if (base.failures.length) {
    for (const f of base.failures) console.error(`${NAME} --self-test: FAIL -- ${f.text}`);
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless`);
    return 1;
  }
  console.log(`${NAME} --self-test: unmodified tree green -- ${base.sites.join(', ')}; logic set {${base.logic.join(', ')}}; planting faults`);

  const dir = mkdtempSync(join(tmpdir(), 'ext-tab-host-guards-selftest-'));
  let bad = 0;
  let planted = 0;
  const landedOk = (label, landed) => {
    if (!landed) { bad++; console.error(`${NAME} --self-test: FAIL -- '${label}' plant did not land`); return false; }
    return true;
  };
  const expectRed = (label, res, pred, want) => {
    if (res.failures.some(pred)) {
      planted++;
      console.log(`  PASS -- ${label}: red as ${want.kind} naming ${want.id}`);
      return;
    }
    bad++;
    console.error(`${NAME} --self-test: FAIL -- '${label}' did not go red as ${want.kind} naming ${want.id}; got ${JSON.stringify(res.failures.map(f => f.text))}`);
  };
  const withPatch = (name, text) => {
    const file = join(dir, name);
    writeFileSync(file, text);
    return file;
  };

  try {
    const cleanFiles = parsePatch(clean);
    const cleanPost = applyToScratch(PATCH, cleanFiles, gitShow);

    for (const g of GUARDS) {
      const want = (kind) => ({ kind, id: g.id });
      const pred = kind => f => f.id === g.id && f.kind === kind;

      const removed = parsePatch(clean);
      const removedLanded = removeGuard(removed, g);
      const removedText = serialize(pruneEmpty(removed), clean.endsWith('\n'));
      if (landedOk(`${g.id} removed`, removedLanded && removedText !== clean)) {
        expectRed(`${g.id} removed`, check({ patchPath: withPatch(`${g.id}-removed.patch`, removedText) }), pred('MISSING'), want('MISSING'));
      }

      const weak = parsePatch(clean);
      const weakLanded = weakenGuard(weak, g);
      const weakText = serialize(weak, clean.endsWith('\n'));
      if (landedOk(`${g.id} weakened`, weakLanded && weakText !== clean)) {
        expectRed(`${g.id} weakened`, check({ patchPath: withPatch(`${g.id}-weakened.patch`, weakText) }), pred('WEAKENED'), want('WEAKENED'));
      }

      const mis = misplacedPost(g, cleanFiles, cleanPost);
      if (landedOk(`${g.id} misplaced`, mis.landed)) {
        expectRed(`${g.id} misplaced`, check({ post: new Map([[g.file, mis.text]]) }),
          f => f.id === g.id && f.kind === 'MISPLACED' && f.text.includes(PLANT_SITE), want('MISPLACED'));
      }
    }

    // Anchor drift: the anchor altered upstream (zero occurrences), and the anchor line duplicated into another method (two).
    const g2 = GUARDS.find(g => g.id === 'G2');
    const g2Text = gitShow(g2.file);
    const g2Altered = g2Text.replace('updateButton(window) {', 'updateButton(win) {');
    if (landedOk('G2 anchor altered', g2Altered !== g2Text)) {
      expectRed('G2 anchor altered', check({ pristine: new Map([[g2.file, g2Altered]]) }),
        f => f.id === 'G2' && f.kind === 'ANCHOR DRIFT', { kind: 'ANCHOR DRIFT', id: 'G2' });
    }
    const g6 = GUARDS.find(g => g.id === 'G6');
    const g6Text = gitShow(g6.file);
    const g6Dup = g6Text.replace('  unregister() {\n', '  unregister() {\n    if (sidebarKey) {\n');
    if (landedOk('G6 anchor duplicated', g6Dup !== g6Text)) {
      expectRed('G6 anchor duplicated', check({ pristine: new Map([[g6.file, g6Dup]]) }),
        f => f.id === 'G6' && f.kind === 'ANCHOR DRIFT', { kind: 'ANCHOR DRIFT', id: 'G6' });
    }

    // A second logic patch staged under another name.
    const pdir = join(dir, 'patches');
    mkdirSync(pdir);
    for (const n of readdirSync(PATCHES_DIR).filter(n => n.endsWith('.patch'))) copyFileSync(join(PATCHES_DIR, n), join(pdir, n));
    writeFileSync(join(pdir, '990-logic-plant.patch'),
      'diff --git a/scripts/planted.mjs b/scripts/planted.mjs\n--- a/scripts/planted.mjs\n+++ b/scripts/planted.mjs\n@@ -0,0 +1 @@\n+export const planted = 1;\n');
    expectRed('second logic patch', check({ patchesDir: pdir }),
      f => f.id === 'D-74' && f.text.includes('990-logic-plant.patch'), { kind: 'LOGIC SET', id: 'D-74' });

    // The BUILD.md bullet removed, and the heading removed.
    const build = readFileSync(BUILD_MD, 'utf8');
    const noBullet = build.split('\n').filter(l => !/^\s*[-*]\s+`050-extension-tab-host\.patch`/.test(l)).join('\n');
    if (landedOk('BUILD.md bullet', noBullet !== build)) {
      expectRed('BUILD.md bullet removed', check({ buildMdText: noBullet }),
        f => f.id === 'D-74' && f.text.includes('050-extension-tab-host.patch'), { kind: 'LOGIC SET', id: 'D-74' });
    }
    const noHeading = build.split('\n').filter(l => l !== LOGIC_HEADING).join('\n');
    if (landedOk('BUILD.md heading', noHeading !== build)) {
      expectRed('BUILD.md heading removed', check({ buildMdText: noHeading }),
        f => f.id === 'instrument', { kind: 'BROKEN INSTRUMENT', id: 'instrument' });
    }

    // Broken instruments: a missing patch and a hunk-free patch.
    expectRed('patch missing', check({ patchPath: join(dir, 'absent.patch') }),
      f => f.id === 'instrument', { kind: 'BROKEN INSTRUMENT', id: 'instrument' });
    const hunkFree = withPatch('hunk-free.patch',
      'diff --git a/browser/components/extensions/parent/ext-pageAction.js b/browser/components/extensions/parent/ext-pageAction.js\n--- a/browser/components/extensions/parent/ext-pageAction.js\n+++ b/browser/components/extensions/parent/ext-pageAction.js\n');
    expectRed('hunk-free patch', check({ patchPath: hunkFree }),
      f => f.id === 'instrument', { kind: 'BROKEN INSTRUMENT', id: 'instrument' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (bad) {
    console.error(`${NAME} --self-test: FAIL -- ${bad} plant(s) did not go red as planted`);
    return 1;
  }
  console.log(`${NAME} --self-test: PASS -- ${planted} planted faults each landed and went red naming their guard and kind`);
  return 0;
}

// ---- main ------------------------------------------------------------------

if (process.argv.includes('--self-test')) {
  process.exitCode = selfTest();
} else {
  const res = check({});
  if (res.failures.length) {
    for (const f of res.failures) console.error(`${NAME}: FAIL -- ${f.text}`);
    process.exitCode = 1;
  } else {
    console.log(`${NAME}: PASS -- guards ${res.sites.join(', ')} hold their shape at their derived sites; logic-patch set {${res.logic.join(', ')}} equals the bullets under the D-74 heading`);
  }
}
