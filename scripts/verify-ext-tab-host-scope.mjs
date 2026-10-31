#!/usr/bin/env node
// scripts/verify-ext-tab-host-scope.mjs
//
// EXT-05 gate (plan 31.1-03). Four derived families over the phase's scope rulings:
//
//   consumers        every per-window extension consumer of browserWindows() and addOpenListener() is either
//                    skipped by patch 050 or carries a reason whose claims hold (D-10)
//   theia-exclusion  tabHostAddTab has one call, inside webTabOpen, on the browser webTabOpen creates in the
//                    browsers group; the Theia frame stays out of the gBrowser tabs and out of extension code (D-06)
//   scheme-wall      webTabOpen and webTabNavigate refuse every scheme but about:blank and http(s), and the
//                    ext-tabs.js URL wall in patch 050 carries the identical allow-list literal (D-05, D-17)
//   window-type      openShellWindow's features carry toolbar, so the shell is a normal window (D-08)
//
// What is derived, and from what:
//   - Consumer sites come from the PRISTINE bytes (git -C upstream show HEAD:<path>), so the set is the same with
//     or without 050 applied. A call 050 adds (this.browserWindows() in _mostRecentBrowserWindow) is not counted.
//     A site key is <basename>:<innermost enclosing definition>, with #2, #3 for repeats in source order.
//   - Skips and claims are read from the POST-IMAGE: 050 applied to those bytes in a mktemp -d directory. A patch
//     that does not apply is a broken instrument, never a clean tree.
//   - The enclosing-name walk is 31.1-01's indentation-ancestor walk. It is copied here because the guard gate
//     exports nothing. A name comes only from a bare identifier, so a member-expression line never names a site (I2).
//   - guard: claims take their shape regex from scripts/verify-ext-tab-host-patch-guards.mjs at check time.
//   - host: claims run the stand-in gate's literal parser (deriveImplemented) on powerbrowser.js.
//   - The shell rules read PowerBrowserAPI.sys.mjs and powerbrowser.js from the working tree, comment lines removed.
//
// The hand-kept content, and why each is there:
//   - REASONED: one row per site that 050 does not skip. Each row is a key, a reason and claims the gate verifies.
//     Only the reasons are hand-kept. The sites themselves are derived.
//   - SCHEME_ALLOW: the scheme allow-list literal. It is the policy itself (D-05, D-17), not a copy of a tree value,
//     so it is written once here. Every other scheme comparison is tree against tree.
//
// Honestly --quick: it reads text, runs read-only git show and ls-tree, and applies the patch only inside a
// mktemp -d directory. It never writes upstream/ or patches/. --self-test plants only into in-memory text and
// into mktemp -d directories.
//
// --self-test first requires the unmodified tree to be green. It then plants faults and requires each one to go
// red naming its drift. The I2 control must stay green with the same derived keys.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveImplemented, deriveZoomShimImplemented } from './verify-shell-gbrowser-standin.mjs';

const NAME = 'verify-ext-tab-host-scope';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PATCH = join(ROOT, 'patches', '050-extension-tab-host.patch');
const GUARD_GATE = join(ROOT, 'scripts', 'verify-ext-tab-host-patch-guards.mjs');
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const JS_REL = 'powerbrowser/shell/powerbrowser.js';
const UPSTREAM = join(ROOT, 'upstream');
const EXT_DIRS = ['browser/components/extensions', 'toolkit/components/extensions'];
const EXT_TABS = 'browser/components/extensions/parent/ext-tabs.js';
const EXT_BROWSER_ACTION = 'browser/components/extensions/parent/ext-browserAction.js';
const EXT_SESSIONS = 'browser/components/extensions/parent/ext-sessions.js';

// The allow-list both walls and the ext-tabs.js hunk must spell. D-05, D-17.
const SCHEME_ALLOW = '/^https?:\\/\\//i';
// The skip shape 050 writes at the top of a per-window loop.
const SKIP_RE = /^\s*if \(windowTracker\.isTabHostWindow\(window\)\) \{\s*$/;
const LOOP_RE = /^\s*for \(.*\) \{\s*$/;
const TAB_HOST_TEST = /^\s*if \(.*\bisTabHostWindow\(/;
// A regex literal tested against a value: `!/.../flags.test(`.
const WALL_LIT = /!\s*(\/(?:\\.|[^\/\\\n])+\/[a-z]*)\.test\(/;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return']);

// One row per site 050 does not skip. A key is <basename>:<enclosing name>, with #n for the nth repeat.
const REASONED = [
  { key: 'ext-browserAction.js:updateOnChange', why: 'toolbar loop; updateWindow returns for a tab host window', claims: ['callee:updateWindow'] },
  { key: 'ext-sidebarAction.js:updateOnChange', why: 'sidebar loop; updateWindow returns for a tab host window', claims: ['callee:updateWindow'] },
  { key: 'ext-sidebarAction.js:onManifestEntry', why: 'open listener; createMenuItem returns for a tab host window', claims: ['callee:createMenuItem'] },
  { key: 'ext-menus.js:register', why: 'menu loop calls onWindowOpen, which returns for a tab host window', claims: ['callee:onWindowOpen'] },
  { key: 'ext-menus.js:register#2', why: 'open listener installs onWindowOpen, which returns for a tab host window', claims: ['callee:onWindowOpen'] },
  { key: 'ext-menus.js:unregister', why: 'menu loop calls cleanupWindow, which returns for a tab host window', claims: ['callee:cleanupWindow'] },
  { key: 'ext-pageAction.js:onManifestEntry', why: 'zero-tab show_matches loop (G1) and the updateButton skip', claims: ['guard:G1@onManifestEntry', 'callee:updateButton'] },
  { key: 'ExtensionShortcuts.sys.mjs:registerKeys', why: 'sidebar shortcut skipped for a tab host window (G6)', claims: ['guard:G6@registerKeysToDocument'] },
  { key: 'ExtensionShortcuts.sys.mjs:register', why: 'open listener reaches registerKeysToDocument (G6)', claims: ['guard:G6@registerKeysToDocument'] },
  { key: 'ExtensionShortcuts.sys.mjs:unregister', why: 'design: removes this extension keysets; the shell keyset is removed like any window, and keysets otherwise stay in the shell as Phase 38 plan 38-05 expects', claims: ['admits'] },
  { key: 'ext-browser.js:init', why: 'open listener reaches _handleWindowOpen, which guards a zero-tab window (G4)', claims: ['guard:G4@_handleWindowOpen'] },
  { key: 'ext-tabGroups.js:queryGroups', why: 'tabGroups is a member of the shell literal', claims: ['host:tabGroups'] },
  { key: 'ext-tabs.js:register', why: 'the onZoomChange registration loop reads getZoomLevel, which the shell answers through its ZoomManager shim (Phase 32 plan 09)', claims: ['host:ZoomManager'] },
  { key: 'ext-tabs-base.js:addListener#3', why: 'progress listener registration is a shell member', claims: ['host:addTabsProgressListener'] },
  { key: 'ext-tabs-base.js:removeListener', why: 'progress listener removal is a shell member', claims: ['host:removeTabsProgressListener'] },
  { key: 'ext-tabs-base.js:addOpenListener', why: 'design: the tracker own deferred admission of incomplete windows', claims: ['admits'] },
  { key: 'ext-tabs-base.js:addListener', why: 'design: the tracker registering its own open listener', claims: ['admits'] },
  { key: 'ext-tabs-base.js:addListener#2', why: 'design: the tracker registering its own open listener', claims: ['admits'] },
  { key: 'ext-browser.js:getAll', why: 'design: windows.getAll lists the shell window', claims: ['admits'] },
];

// ---- git inputs (cached) ---------------------------------------------------

const showCache = new Map();
function gitShow(path) {
  if (!showCache.has(path)) {
    showCache.set(path, execFileSync('git', ['-C', UPSTREAM, 'show', `HEAD:${path}`], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    }));
  }
  return showCache.get(path);
}

function scopeFiles() {
  const out = execFileSync('git', ['-C', UPSTREAM, 'ls-tree', '-r', '--name-only', 'HEAD', '--', ...EXT_DIRS], { encoding: 'utf8' });
  return out.split('\n').filter(p => /\.(js|mjs)$/.test(p) && !/(^|\/)tests?\//.test(p));
}

// ---- patch model -----------------------------------------------------------

function sections(text) {
  return text.split(/(?=^diff --git )/m).filter(s => s.startsWith('diff --git '));
}
function sectionPath(sec) {
  const m = /^\+\+\+ b\/(.+)$/m.exec(sec);
  return m ? m[1] : null;
}
function hunksOf(sec) {
  return sec.split(/(?=^@@ )/m).slice(1);
}
function touchedPaths(text) {
  return [...new Set(sections(text).map(sectionPath).filter(Boolean))];
}
// The `+` line contents 050 adds to one file, trimmed. Header numbers are not used, so a plant that moves lines
// upstream does not shift the match.
function addedLines(text, path) {
  const set = new Set();
  for (const sec of sections(text)) {
    if (sectionPath(sec) !== path) continue;
    for (const h of hunksOf(sec)) {
      for (const l of h.split('\n')) {
        if (l.startsWith('+') && !l.startsWith('+++ ')) set.add(l.slice(1).trim());
      }
    }
  }
  return set;
}
// Drops the hunks of one file that match hunkRe. A file left with no hunks is dropped entirely.
function dropHunks(text, fileRe, hunkRe) {
  return sections(text).map(sec => {
    if (!fileRe.test(sectionPath(sec) ?? '')) return sec;
    const parts = sec.split(/(?=^@@ )/m);
    const kept = [parts[0], ...parts.slice(1).filter(p => !hunkRe.test(p))];
    return kept.length > 1 ? kept.join('') : '';
  }).join('');
}

// Applies the patch to the pristine bytes in a mktemp -d directory. Throws when the patch does not apply.
function applyToScratch(patchText, paths, pristine) {
  const dir = mkdtempSync(join(tmpdir(), 'ext-tab-host-scope-'));
  const pdir = mkdtempSync(join(tmpdir(), 'ext-tab-host-scope-patch-'));
  try {
    for (const p of paths) {
      const dest = join(dir, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, pristine(p));
    }
    const pf = join(pdir, 'patch.patch');
    writeFileSync(pf, patchText);
    execFileSync('git', ['apply', pf], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const post = new Map();
    for (const p of paths) post.set(p, readFileSync(join(dir, p), 'utf8'));
    return post;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(pdir, { recursive: true, force: true });
  }
}

// The post-image: the touched files after 050, plus any caller-supplied overrides.
function postImage(patchText, pristine, extra) {
  const post = applyToScratch(patchText, touchedPaths(patchText), pristine);
  for (const [p, t] of extra) post.set(p, t);
  return post;
}

// ---- text model ------------------------------------------------------------

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

// Walks upward over the indentation ancestors of lines[idx]. found lists up to two bare-identifier definitions,
// innermost first. The site is the dotted pair, outermost first.
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

function stripComments(text) {
  return text.split('\n').map(l => (isCommentLine(l.trim()) ? '' : l)).join('\n');
}

// The span of one definition, from its line to the closing line at the same indentation. Exactly one match.
function methodSpan(lines, name) {
  const re = new RegExp(`^\\s*(?:async\\s+|function\\s+)?${name}\\(.*\\{\\s*$`);
  const hits = [];
  lines.forEach((l, i) => { if (re.test(l)) hits.push(i); });
  if (hits.length !== 1) return { error: `${hits.length} definitions of ${name} (need exactly one)` };
  const start = hits[0];
  const ind = s => s.length - s.trimStart().length;
  const d = ind(lines[start]);
  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (ind(lines[i]) === d && /^\s*\}/.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

// The line that closes the brace opened on lines[start]. Quoted text is blanked first.
function closeLine(lines, start) {
  let depth = 0;
  let opened = false;
  for (let i = start; i < lines.length; i++) {
    const s = lines[i].replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');
    for (const c of s) {
      if (c === '{') { depth++; opened = true; } else if (c === '}') depth--;
    }
    if (opened && depth === 0) return i;
  }
  return -1;
}

function replaceInSpan(text, fn, from, to) {
  const lines = text.split('\n');
  const span = methodSpan(lines, fn);
  if (span.error) throw new Error(span.error);
  const body = lines.slice(span.start, span.end + 1).join('\n');
  if (!body.includes(from)) throw new Error(`${JSON.stringify(from)} is not in ${fn}`);
  lines.splice(span.start, span.end - span.start + 1, ...body.replace(from, to).split('\n'));
  return lines.join('\n');
}

// ---- consumer sites --------------------------------------------------------

// Sites in one file, in source order. A `.browserWindows(` call is any `.browserWindows(` on a line that is not a
// comment; the generator definition `*browserWindows(` has no dot and is not a call. An `addOpenListener(` call is
// any such call except the definition line `addOpenListener(listener) {`.
function siteLines(lines, file) {
  const base = basename(file);
  const count = new Map();
  const out = [];
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (t === '' || isCommentLine(t)) return;
    let kind = null;
    if (/\.browserWindows\(/.test(raw)) kind = 'browserWindows';
    else if (/\baddOpenListener\(/.test(raw) && !/^\s*addOpenListener\([^)]*\)\s*\{\s*$/.test(raw)) kind = 'addOpenListener';
    if (!kind) return;
    const name = enclosing(lines, idx).found[0]?.name ?? '(top level)';
    const k = `${base}:${name}`;
    const n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    out.push({ idx, line: idx + 1, kind, name, key: n === 1 ? k : `${k}#${n}` });
  });
  return out;
}

// A loop line followed by the 050 skip shape (the next non-blank line).
function isSkipped(lines, idx) {
  if (!LOOP_RE.test(lines[idx] ?? '')) return false;
  for (let j = idx + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') continue;
    return SKIP_RE.test(lines[j]);
  }
  return false;
}

// ---- claims ----------------------------------------------------------------

// The method has exactly one definition in the file, and its first statement is an isTabHostWindow test.
function calleeHolds(lines, method) {
  const defs = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t && !isCommentLine(t) && defName(t) === method) defs.push(i);
  });
  if (defs.length !== 1) return `${defs.length} definitions of ${method} in the file (need exactly one)`;
  let j = defs[0] + 1;
  while (j < lines.length && (lines[j].trim() === '' || isCommentLine(lines[j].trim()))) j++;
  return TAB_HOST_TEST.test(lines[j] ?? '') ? null : `the first statement of ${method} is not an isTabHostWindow test`;
}

// The guard's shape regexes, read from the guard gate's own row at check time.
function guardRegexes(id) {
  const src = readFileSync(GUARD_GATE, 'utf8');
  const start = src.indexOf(`{ id: '${id}',`);
  if (start < 0) return null;
  const why = src.indexOf('why:', start);
  const seg = src.slice(start, why < 0 ? undefined : why);
  const m = /regexes:\s*\[(.*)\]/.exec(seg);
  if (!m) return null;
  const lits = m[1].match(/\/\^.*?\$\/[a-z]*/g) ?? [];
  if (!lits.length) return null;
  return lits.map(l => new RegExp(l.slice(1, l.lastIndexOf('/'))));
}

// Every shape regex of the guard matches an added line of 050 inside the named method.
function guardHolds(lines, added, id, method) {
  const regs = guardRegexes(id);
  if (!regs) return `no shape regex for ${id} in scripts/verify-ext-tab-host-patch-guards.mjs`;
  for (const re of regs) {
    const ok = lines.some((l, idx) => added.has(l.trim()) && re.test(l)
      && enclosing(lines, idx).site.split('.').includes(method));
    if (!ok) return `no added line in ${method} matches ${re}`;
  }
  return null;
}

// The innermost definition enclosing the site, in the post-image, carries no isTabHostWindow test. A reason that says
// the design admits the shell at a site is checkable only in this negative form: a skip added there contradicts it.
function admitsHolds(lines, idx) {
  if (idx < 0) return 'the site is not in the post-image';
  const enc = enclosing(lines, idx).found[0];
  if (!enc) return 'the site sits in no definition';
  const end = closeLine(lines, enc.line);
  if (end < 0) return `the definition of ${enc.name} does not close`;
  for (let i = enc.line; i <= end; i++) {
    if (!isCommentLine(lines[i].trim()) && /\bisTabHostWindow\(/.test(lines[i])) {
      return `${enc.name} tests isTabHostWindow at line ${i + 1}; the design admits the shell at this site, so the skip contradicts it`;
    }
  }
  return null;
}

// Phase 32 plan 09: a name that is not a window.gBrowser member resolves to its win.<Name> = { shim literal in the boundary file.
// The claim holds when that shim implements every member the site's file reads on the name (ZoomManager for ext-tabs.js).
function shimHolds(ctx, lines, name) {
  const shim = ctx.shimLiteral(name);
  if (!shim.members) return `${name} is not implemented on the shell literal, and no win.${name} = { shim literal parsed (${shim.reason})`;
  const read = new Set();
  const re = new RegExp(`(?<![\\w$])${name}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
  for (const line of lines) {
    if (isCommentLine(line.trim())) continue;
    for (const m of line.matchAll(re)) read.add(m[1]);
  }
  if (read.size === 0) return `${name} is not implemented on the shell literal, and the site's file reads no member of it`;
  const missing = [...read].filter(x => !shim.members.has(x));
  return missing.length ? `win.${name} = { does not implement ${missing.join(', ')}, which the site's file reads` : null;
}

function claimError(ctx, file, claim, lines, idx) {
  if (claim === 'admits') return admitsHolds(lines, idx);
  let m;
  if ((m = /^callee:([\w$]+)$/.exec(claim))) return calleeHolds(lines, m[1]);
  if ((m = /^guard:(G\d+)@([\w$.]+)$/.exec(claim))) return guardHolds(lines, addedLines(ctx.patchText, file), m[1], m[2]);
  if ((m = /^host:([\w$]+)$/.exec(claim))) {
    const r = ctx.implemented();
    if (!r.members) return `the shell literal did not parse (${r.reason})`;
    return r.members.has(m[1]) ? null : shimHolds(ctx, lines, m[1]);
  }
  return `unknown claim form ${claim}`;
}

// ---- context and families --------------------------------------------------

function makeCtx(opts) {
  const texts = opts.texts ?? new Map();
  const patchText = opts.patchText ?? readFileSync(PATCH, 'utf8');
  const pristineOver = opts.pristine ?? new Map();
  const pristine = p => (pristineOver.has(p) ? pristineOver.get(p) : gitShow(p));
  let postMap = null;
  const post = () => {
    if (!postMap) postMap = postImage(patchText, pristine, opts.post ?? new Map());
    return postMap;
  };
  const postOf = p => (post().has(p) ? post().get(p) : pristine(p));
  const text = rel => (texts.has(rel) ? texts.get(rel) : readFileSync(join(ROOT, rel), 'utf8'));
  let impl = null;
  const implemented = () => {
    if (!impl) {
      const dir = mkdtempSync(join(tmpdir(), 'ext-tab-host-scope-shell-'));
      const f = join(dir, 'powerbrowser.js');
      try {
        writeFileSync(f, text(JS_REL));
        impl = deriveImplemented(f);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    return impl;
  };
  // Phase 32 plan 09: a win.<Name> = { shim literal in the boundary file, parsed by the stand-in gate's literal parser.
  const shimLiteral = name => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-tab-host-scope-shim-'));
    const f = join(dir, 'PowerBrowserAPI.sys.mjs');
    try {
      writeFileSync(f, text(API_REL));
      return deriveZoomShimImplemented(f, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  return {
    patchText,
    pristine,
    postOf,
    text,
    implemented,
    shimLiteral,
    scope: () => opts.scopeFiles ?? scopeFiles(),
    reasons: () => opts.reasons ?? REASONED,
  };
}

function brokenOut(out, family, id, detail) {
  out.failures.push({ family, id, kind: 'BROKEN INSTRUMENT', text: `${family}: BROKEN INSTRUMENT ${id} -- ${detail}` });
}
function failOut(out, family, id, kind, detail) {
  out.failures.push({ family, id, kind, text: `${family}: ${kind} ${id} -- ${detail}` });
}

function consumersFamily(ctx, out) {
  const F = 'consumers';
  const scope = ctx.scope();
  if (!scope.length) return brokenOut(out, F, 'scope', 'the extension scope is empty (git ls-tree found no .js or .mjs path)');
  const sites = [];
  for (const file of scope) {
    for (const s of siteLines(ctx.pristine(file).split('\n'), file)) sites.push({ file, ...s });
  }
  const bw = sites.filter(s => s.kind === 'browserWindows').length;
  const ao = sites.length - bw;
  if (bw === 0 || ao === 0) {
    return brokenOut(out, F, 'sites', `derived ${bw} browserWindows and ${ao} addOpenListener sites; both kinds must be present`);
  }
  out.keys = sites.map(s => s.key);

  const postCache = new Map();
  const postSites = file => {
    if (!postCache.has(file)) {
      const lines = ctx.postOf(file).split('\n');
      postCache.set(file, { lines, byKey: new Map(siteLines(lines, file).map(s => [s.key, s])) });
    }
    return postCache.get(file);
  };
  const reasons = ctx.reasons();
  const reasonBy = new Map(reasons.map(r => [r.key, r]));
  const keys = new Set(sites.map(s => s.key));
  const before = out.failures.length;
  let skipped = 0;
  let reasoned = 0;
  for (const s of sites) {
    const post = postSites(s.file);
    const hit = post.byKey.get(s.key);
    const isSkip = hit !== undefined && s.kind === 'browserWindows' && isSkipped(post.lines, hit.idx);
    const reason = reasonBy.get(s.key);
    const where = `${s.file}:${s.line}`;
    if (isSkip) skipped++;
    if (isSkip && reason) {
      failOut(out, F, s.key, 'CONTRADICTION', `${where} is skipped by 050 and also reasoned; a site is one or the other`);
    } else if (!isSkip && !reason) {
      failOut(out, F, where, 'UNDISPOSITIONED', `${s.key} (${s.kind}) is neither skipped by 050 nor reasoned`);
    } else if (reason) {
      reasoned++;
      for (const claim of reason.claims) {
        const err = claimError(ctx, s.file, claim, post.lines, hit ? hit.idx : -1);
        if (err) failOut(out, F, s.key, 'CLAIM FAILED', `${claim} -- ${err}`);
      }
    }
  }
  for (const r of reasons) {
    if (!keys.has(r.key)) failOut(out, F, r.key, 'STALE REASON', 'no derived site carries this key');
  }
  if (out.failures.length === before) {
    out.passes.push(`consumers PASS -- ${bw} browserWindows and ${ao} addOpenListener sites derived from the pristine bytes; ${skipped} skipped by 050 (derived), ${reasoned} reasoned, every claim held`);
  }
}

function theiaFamily(ctx, out) {
  const F = 'theia-exclusion';
  const before = out.failures.length;
  const fail = (id, kind, detail) => failOut(out, F, id, kind, detail);
  const api = stripComments(ctx.text(API_REL)).split('\n');
  const js = stripComments(ctx.text(JS_REL)).split('\n');

  // (a) one call of tabHostAddTab, inside webTabOpen, passing the browser webTabOpen created.
  const wto = methodSpan(api, 'webTabOpen');
  if (wto.error) return brokenOut(out, F, 'webTabOpen', wto.error);
  const ws = api.slice(wto.start, wto.end + 1).join('\n');
  const calls = [];
  api.forEach((l, i) => { if (/tabHostAddTab\(/.test(l) && !/function\s+tabHostAddTab\(/.test(l)) calls.push(i); });
  if (calls.length !== 1) {
    fail('tabHostAddTab', 'CALL COUNT', `tabHostAddTab( is called ${calls.length} time(s) in PowerBrowserAPI.sys.mjs; the rule is exactly one, inside webTabOpen`);
  } else {
    const L = calls[0];
    if (L < wto.start || L > wto.end) fail('tabHostAddTab', 'CALL SITE', `the call at line ${L + 1} is outside webTabOpen`);
    const bind = /(?:const|let|var)\s+([\w$]+)\s*=\s*[\w$.]+\.createXULElement\("browser"\)/.exec(ws);
    const third = /tabHostAddTab\(\s*[^,()]+,\s*[^,()]+,\s*([^,()]+?)\s*\)/.exec(api[L]);
    if (!bind) brokenOut(out, F, 'webTabOpen', 'webTabOpen binds no browser from createXULElement("browser")');
    else if (!third || third[1] !== bind[1]) {
      fail('tabHostAddTab', 'THIRD ARGUMENT', `the call passes ${third ? third[1] : '(none)'} where webTabOpen binds ${bind[1]}`);
    }
  }
  if (!/messagemanagergroup:\s*"browsers"/.test(ws)) {
    fail('webTabOpen', 'ATTRIBUTE', 'webTabOpen does not set messagemanagergroup "browsers" on the browser it creates');
  }

  // (b) tabHostAddTab refuses any browser outside the browsers group before it creates a node.
  const tha = methodSpan(api, 'tabHostAddTab');
  if (tha.error) return brokenOut(out, F, 'tabHostAddTab', tha.error);
  const body = api.slice(tha.start, tha.end + 1);
  const gi = body.findIndex(l => /getAttribute\("messagemanagergroup"\)/.test(l));
  if (gi < 0 || !/^\s*if \(.*getAttribute\("messagemanagergroup"\)\s*!==\s*"browsers"/.test(body[gi])
    || !body.slice(gi, gi + 3).some(l => /^\s*(return|throw)\b/.test(l))) {
    fail('tabHostAddTab', 'GROUP GUARD', 'tabHostAddTab does not refuse a browser outside the browsers group');
  } else {
    const mk = body.findIndex(l => /makeTabNode\(|createXULElement\(/.test(l));
    if (mk >= 0 && mk < gi) fail('tabHostAddTab', 'GROUP GUARD', 'a node is created before the browsers-group guard');
  }

  // (c) the Theia frame's identifier, and the aliases bound to it, appear in the gBrowser literal only inside webDriverTabs.
  const jsText = js.join('\n');
  const fm = [...jsText.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*document\.getElementById\("powerbrowser-content"\)/g)];
  if (fm.length !== 1) return brokenOut(out, F, 'powerbrowser-content', `${fm.length} bindings of getElementById("powerbrowser-content") (need exactly one)`);
  const frame = fm[0][1];
  const ids = new Set([frame]);
  for (const m of jsText.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*\{\s*linkedBrowser:\s*([\w$]+)\s*\}/g)) {
    if (m[2] === frame) ids.add(m[1]);
  }
  const lit = js.findIndex(l => /window\.gBrowser\s*=\s*\{/.test(l));
  const litEnd = lit < 0 ? -1 : closeLine(js, lit);
  if (lit < 0 || litEnd < 0) return brokenOut(out, F, 'window.gBrowser', 'no balanced window.gBrowser literal in powerbrowser.js');
  const wd = js.findIndex((l, i) => i > lit && i <= litEnd && /^\s*get webDriverTabs\(\)\s*\{/.test(l));
  if (wd < 0) return brokenOut(out, F, 'webDriverTabs', 'no get webDriverTabs() member in the gBrowser literal');
  const wdEnd = closeLine(js, wd);
  for (let i = lit; i <= litEnd; i++) {
    if (i >= wd && i <= wdEnd) continue;
    for (const id of ids) {
      if (new RegExp(`\\b${id}\\b`).test(js[i])) {
        fail(id, 'THEIA FRAME', `${id} (the Theia frame or an alias of it) appears in the window.gBrowser literal outside webDriverTabs (powerbrowser.js:${i + 1})`);
      }
    }
  }

  // (d) no extension-scope file reads webDriverTabs.
  const scope = ctx.scope();
  for (const file of scope) {
    if (ctx.postOf(file).includes('webDriverTabs')) {
      fail(file, 'EXTENSION READS WEBDRIVERTABS', `${file} names webDriverTabs; extensions must not read the WebDriver list`);
    }
  }

  if (out.failures.length === before) {
    out.passes.push(`theia-exclusion PASS -- tabHostAddTab has one call, inside webTabOpen, passing the browser webTabOpen creates in the browsers group; the group guard precedes node creation; ${[...ids].join(', ')} appears in the gBrowser literal only inside webDriverTabs; no one of ${scope.length} extension-scope files names webDriverTabs`);
  }
}

function wallFamily(ctx, out) {
  const F = 'scheme-wall';
  const before = out.failures.length;
  const api = stripComments(ctx.text(API_REL)).split('\n');
  const lits = {};
  for (const fn of ['webTabOpen', 'webTabNavigate']) {
    const span = methodSpan(api, fn);
    if (span.error) return brokenOut(out, F, fn, span.error);
    const i = api.findIndex((l, k) => k > span.start && k <= span.end && /^\s*if \(/.test(l));
    if (i < 0 || !/"refused-scheme"/.test(api[i + 1] ?? '')) {
      failOut(out, F, fn, 'NO WALL', 'the first if-block does not refuse with "refused-scheme"');
      continue;
    }
    const m = WALL_LIT.exec(api[i]);
    if (!m) {
      failOut(out, F, fn, 'NO WALL', 'the first if-block has no allow-list regex test');
      continue;
    }
    lits[fn] = m[1];
    if (!/!==\s*"about:blank"/.test(api[i])) failOut(out, F, fn, 'ABOUT BLANK', `${fn} does not exempt about:blank`);
  }

  const wallLabel = 'ext-tabs.js URL wall (patch 050)';
  const sec = sections(ctx.patchText).find(s => sectionPath(s) === EXT_TABS);
  const hunk = sec ? hunksOf(sec).find(h => /^ .*let url = context\.uri\.resolve\(updateProperties\.url\);/m.test(h)) : undefined;
  if (!hunk) {
    failOut(out, F, EXT_TABS, 'NO HUNK', 'patch 050 has no ext-tabs.js hunk whose context holds `let url = context.uri.resolve(updateProperties.url);`');
  } else {
    const plus = hunk.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++ ')).join('\n');
    for (const [tok, what] of [
      ['isTabHostWindow(nativeTab.documentGlobal)', 'the isTabHostWindow(nativeTab.documentGlobal) test'],
      ['url !== "about:blank"', 'an about:blank comparison'],
      ['Promise.reject', 'a Promise.reject'],
    ]) {
      if (!plus.includes(tok)) failOut(out, F, EXT_TABS, 'NO WALL', `the ext-tabs.js hunk has no ${what}`);
    }
    const m = /!\s*(\/(?:\\.|[^\/\\\n])+\/[a-z]*)\.test\(url\)/.exec(plus);
    if (!m) failOut(out, F, EXT_TABS, 'NO WALL', 'the ext-tabs.js hunk has no allow-list regex literal');
    else lits[wallLabel] = m[1];
  }

  for (const [where, lit] of Object.entries(lits)) {
    if (lit !== SCHEME_ALLOW) failOut(out, F, where, 'ALLOW-LIST', `${where} allows ${lit}; the allow-list is ${SCHEME_ALLOW} (D-05, D-17)`);
  }
  const shell = lits.webTabOpen;
  for (const [where, lit] of Object.entries(lits)) {
    if (where !== 'webTabOpen' && shell !== undefined && lit !== shell) {
      failOut(out, F, where, 'LITERALS DIFFER', `${where} literal ${lit} differs from the webTabOpen literal ${shell}`);
    }
  }
  if (out.failures.length === before) {
    out.passes.push(`scheme-wall PASS -- webTabOpen and webTabNavigate refuse every scheme but about:blank and http(s) (${SCHEME_ALLOW}); the ${wallLabel} carries the identical literal`);
  }
}

function windowTypeFamily(ctx, out) {
  const F = 'window-type';
  const before = out.failures.length;
  const api = stripComments(ctx.text(API_REL)).split('\n');
  const span = methodSpan(api, 'openShellWindow');
  if (span.error) return brokenOut(out, F, 'openShellWindow', span.error);
  const body = api.slice(span.start, span.end + 1).join('\n');
  const m = /"(chrome,[^"]*)"/.exec(body);
  if (!m) failOut(out, F, 'openShellWindow', 'NO FEATURES', 'openShellWindow has no chrome feature string');
  else if (!m[1].split(',').includes('toolbar')) {
    failOut(out, F, 'openShellWindow', 'FEATURES', `openShellWindow features "${m[1]}" lack toolbar; without it the shell has no CHROME_TOOLBAR and WindowBase.type reads popup (D-08)`);
  }
  if (out.failures.length === before) {
    out.passes.push(`window-type PASS -- openShellWindow's features "${m[1]}" carry toolbar, so the shell reads as a normal window`);
  }
}

// (e) messagemanagergroup (WR-02, UF-31.1-03). The Theia frame carries no group, and that absence keeps content
// scripts out of it (D-06, ExtensionPolicyService.cpp:371-382). Every write of the attribute under powerbrowser/shell
// is derived from the tree. The one allowed write is webTabOpen's overlay literal. A getAttribute read is not a write.
function groupFamily(ctx, out) {
  const F = 'messagemanagergroup';
  const before = out.failures.length;
  const rels = readdirSync(join(ROOT, 'powerbrowser/shell')).filter(f => /\.(xhtml|js|mjs)$/.test(f)).sort()
    .map(f => `powerbrowser/shell/${f}`);
  const frames = [];
  for (const rel of rels.filter(r => r.endsWith('.xhtml'))) {
    ctx.text(rel).split('\n').forEach((l, i) => {
      if (/<xul:browser\b[^>]*\bid="powerbrowser-content"/.test(l)) frames.push({ rel, line: i, text: l });
    });
  }
  if (frames.length !== 1) return brokenOut(out, F, 'powerbrowser-content', `${frames.length} xul:browser elements with id powerbrowser-content (need exactly one)`);
  if (/messagemanagergroup/.test(frames[0].text)) {
    failOut(out, F, 'powerbrowser-content', 'THEIA FRAME GROUP', `${frames[0].rel}:${frames[0].line + 1} sets messagemanagergroup on the Theia frame; the frame must carry none (D-06)`);
  }
  const writes = [];
  for (const rel of rels) {
    stripComments(ctx.text(rel)).split('\n').forEach((l, i) => {
      if (!/messagemanagergroup/.test(l) || /getAttribute\(\s*["']messagemanagergroup["']\s*\)/.test(l)) return;
      writes.push({ rel, line: i, text: l.trim() });
    });
  }
  const api = stripComments(ctx.text(API_REL)).split('\n');
  const wto = methodSpan(api, 'webTabOpen');
  if (wto.error) return brokenOut(out, F, 'webTabOpen', wto.error);
  for (const w of writes) {
    const overlay = w.rel === API_REL && w.text.includes('messagemanagergroup: "browsers"') && w.line >= wto.start && w.line <= wto.end;
    if (!overlay) {
      failOut(out, F, `${w.rel}:${w.line + 1}`, 'WRITE SITE', `${w.rel}:${w.line + 1} writes messagemanagergroup (${w.text}); the only write allowed is webTabOpen's overlay literal`);
    }
  }
  if (!writes.some(w => w.rel === API_REL && w.text.includes('messagemanagergroup: "browsers"') && w.line >= wto.start && w.line <= wto.end)) {
    failOut(out, F, 'webTabOpen', 'OVERLAY LITERAL', 'webTabOpen does not write messagemanagergroup "browsers" on the overlay it creates');
  }
  if (out.failures.length === before) {
    out.passes.push(`messagemanagergroup PASS -- the Theia frame ${frames[0].rel}:${frames[0].line + 1} carries no group; the only write under ${rels.length} powerbrowser/shell files is webTabOpen's overlay literal`);
  }
}

// (f) selection hooks (WR-03, D-13). tabHostSelectById has exactly two callers: one in pushPageFocus (page focus) and
// one in the webTabActivated arm (Theia's selected web tab). Each is pinned on its own, so removing either goes red.
function selectionFamily(ctx, out) {
  const F = 'selection';
  const before = out.failures.length;
  const api = stripComments(ctx.text(API_REL)).split('\n');
  const calls = [];
  api.forEach((l, i) => { if (/tabHostSelectById\(/.test(l) && !/function\s+tabHostSelectById\(/.test(l)) calls.push(i); });
  if (calls.length !== 2) failOut(out, F, 'tabHostSelectById', 'CALL COUNT', `tabHostSelectById( is called ${calls.length} time(s); the rule is two, pushPageFocus and the webTabActivated arm`);
  const within = (lo, hi) => calls.filter(i => i >= lo && i <= hi).length;
  const pp = methodSpan(api, 'pushPageFocus');
  if (pp.error) return brokenOut(out, F, 'pushPageFocus', pp.error);
  if (within(pp.start, pp.end) !== 1) {
    failOut(out, F, 'pushPageFocus', 'PAGE FOCUS HOOK', `pushPageFocus has ${within(pp.start, pp.end)} tabHostSelectById call(s); page focus must select its tab (D-13), so it needs one`);
  }
  const arm = api.findIndex(l => /^\s*case "webTabActivated": \{\s*$/.test(l));
  if (arm < 0) return brokenOut(out, F, 'webTabActivated', 'no case "webTabActivated": arm in PowerBrowserAPI.sys.mjs');
  const armEnd = closeLine(api, arm);
  if (armEnd < 0) return brokenOut(out, F, 'webTabActivated', 'the webTabActivated arm does not close');
  if (within(arm, armEnd) !== 1) {
    failOut(out, F, 'webTabActivated', 'ACTIVATION HOOK', `the webTabActivated arm has ${within(arm, armEnd)} tabHostSelectById call(s); Theia's selected web tab must select (D-13), so it needs one`);
  }
  if (out.failures.length === before) {
    out.passes.push('selection PASS -- tabHostSelectById has one call in pushPageFocus (page focus, D-13), one in the webTabActivated arm, and no other call');
  }
}

// Runs every family. A family that cannot derive its inputs reports a broken instrument and the next one still runs.
function checkAll(opts = {}) {
  const ctx = makeCtx(opts);
  const out = { failures: [], passes: [], keys: [] };
  const fams = [['consumers', consumersFamily], ['theia-exclusion', theiaFamily], ['scheme-wall', wallFamily], ['window-type', windowTypeFamily], ['messagemanagergroup', groupFamily], ['selection', selectionFamily]];
  for (const [name, fn] of fams) {
    try {
      fn(ctx, out);
    } catch (e) {
      brokenOut(out, name, 'instrument', String(e.stderr || e.message).trim().split('\n')[0]);
    }
  }
  return out;
}

// ---- self-test -------------------------------------------------------------

function selfTest() {
  const clean = checkAll({});
  if (clean.failures.length) {
    for (const f of clean.failures) console.error(`${NAME} --self-test: FAIL -- ${f.text}`);
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted results below would be meaningless`);
    return 1;
  }
  console.log(`${NAME} --self-test: unmodified tree green -- ${clean.passes.join('; ')}; planting faults`);

  const cleanPatch = readFileSync(PATCH, 'utf8');
  const apiRaw = readFileSync(join(ROOT, API_REL), 'utf8');
  const jsRaw = readFileSync(join(ROOT, JS_REL), 'utf8');
  let bad = 0;
  let planted = 0;
  const landed = (label, changed) => {
    if (!changed) { bad++; console.error(`${NAME} --self-test: FAIL -- '${label}' plant did not land`); }
    return changed;
  };
  const expect = (label, hits, min, detail) => {
    if (hits.length >= min) {
      planted++;
      console.log(`  PASS -- ${label}: red as ${detail}`);
      return;
    }
    bad++;
    console.error(`${NAME} --self-test: FAIL -- '${label}' did not go red as ${detail}`);
  };
  const has = (res, pred) => res.failures.filter(pred);
  const sameKeys = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // consumers
  {
    const orig = gitShow(EXT_TABS);
    const text = `${orig}\nfor (let window of windowTracker.browserWindows()) {\n}\n`;
    const line = text.split('\n').findIndex(l => l === 'for (let window of windowTracker.browserWindows()) {') + 1;
    if (landed('new browserWindows consumer', text !== orig)) {
      const res = checkAll({ pristine: new Map([[EXT_TABS, text]]) });
      expect('new browserWindows consumer', has(res, f => f.family === 'consumers' && f.kind === 'UNDISPOSITIONED' && f.text.includes(`${EXT_TABS}:${line}`)), 1, `UNDISPOSITIONED naming ${EXT_TABS}:${line}`);
    }
  }
  {
    const text = dropHunks(cleanPatch, /ext-sessions\.js$/, /isTabHostWindow/);
    if (landed('050 without the ext-sessions skips', text !== cleanPatch)) {
      const res = checkAll({ patchText: text });
      const hits = has(res, f => f.family === 'consumers' && f.kind === 'UNDISPOSITIONED' && f.text.includes(EXT_SESSIONS + ':'));
      expect('050 without the ext-sessions skips', hits, 2, `UNDISPOSITIONED for both ext-sessions.js sites (${hits.length} found)`);
    }
  }
  {
    const extra = [...REASONED, { key: 'ext-browser.js:zzzPlantedReason', why: 'plant', claims: ['admits'] }];
    const res = checkAll({ reasons: extra });
    expect('REASONED with an extra key', has(res, f => f.kind === 'STALE REASON' && f.id === 'ext-browser.js:zzzPlantedReason'), 1, 'STALE REASON naming ext-browser.js:zzzPlantedReason');
  }
  {
    const extra = [...REASONED, { key: 'ext-sessions.js:getRecentlyClosed', why: 'plant', claims: ['admits'] }];
    const res = checkAll({ reasons: extra });
    expect('reasoned key that is also skipped', has(res, f => f.kind === 'CONTRADICTION' && f.id === 'ext-sessions.js:getRecentlyClosed'), 1, 'CONTRADICTION naming ext-sessions.js:getRecentlyClosed');
  }
  {
    const post = postImage(cleanPatch, gitShow, new Map());
    const lines = post.get(EXT_BROWSER_ACTION).split('\n');
    const d = lines.findIndex(l => defName(l.trim()) === 'updateWindow');
    const j = lines.findIndex((l, i) => i > d && /isTabHostWindow\(/.test(l));
    if (landed('updateWindow lost its skip', d >= 0 && j > d)) {
      lines[j] = '    // skip removed by the plant';
      const res = checkAll({ post: new Map([[EXT_BROWSER_ACTION, lines.join('\n')]]) });
      expect('updateWindow lost its skip', has(res, f => f.kind === 'CLAIM FAILED' && f.text.includes('callee:updateWindow')), 1, 'CLAIM FAILED naming callee:updateWindow');
    }
  }
  {
    const lines = gitShow(EXT_BROWSER_ACTION).split('\n');
    const d = lines.findIndex(l => defName(l.trim()) === 'updateOnChange');
    if (landed('updateOnChange renamed', d >= 0)) {
      lines[d] = lines[d].replace('updateOnChange', 'zzzPlantedSite');
      const res = checkAll({ pristine: new Map([[EXT_BROWSER_ACTION, lines.join('\n')]]) });
      expect('updateOnChange renamed: new site', has(res, f => f.kind === 'UNDISPOSITIONED' && f.text.includes(`${EXT_BROWSER_ACTION.split('/').pop()}:zzzPlantedSite`)), 1, `UNDISPOSITIONED naming ${EXT_BROWSER_ACTION.split('/').pop()}:zzzPlantedSite`);
      expect('updateOnChange renamed: old reason', has(res, f => f.kind === 'STALE REASON' && f.id === `${EXT_BROWSER_ACTION.split('/').pop()}:updateOnChange`), 1, `STALE REASON naming ${EXT_BROWSER_ACTION.split('/').pop()}:updateOnChange`);
    }
  }
  {
    // I2 control: a member-expression line between a site and its definition names nothing, so every key holds.
    const lines = gitShow(EXT_BROWSER_ACTION).split('\n');
    const site = siteLines(lines, EXT_BROWSER_ACTION).find(s => s.key === 'ext-browserAction.js:updateOnChange');
    if (landed('I2 control site', site !== undefined)) {
      const enc = enclosing(lines, site.idx);
      const ind = s => s.length - s.trimStart().length;
      const defLine = enc.found[0].line;
      const want = Math.floor((ind(lines[defLine]) + ind(lines[site.idx])) / 2);
      if (!(ind(lines[defLine]) < want && want < ind(lines[site.idx]))) {
        bad++;
        console.error(`${NAME} --self-test: FAIL -- I2 control: no indentation strictly between the definition and the site`);
      } else {
        const planted2 = [...lines];
        planted2.splice(site.idx, 0, `${' '.repeat(want)}ExtensionParent.zzzPlanted(() => {`);
        const res = checkAll({ pristine: new Map([[EXT_BROWSER_ACTION, planted2.join('\n')]]) });
        if (res.failures.length === 0 && sameKeys(res.keys, clean.keys)) {
          planted++;
          console.log('  PASS -- I2 control: a member-expression line between a site and its definition leaves every key unchanged; green');
        } else {
          bad++;
          console.error(`${NAME} --self-test: FAIL -- I2 control went red or changed a key: ${JSON.stringify(res.failures.map(f => f.text))}`);
        }
      }
    }
  }
  {
    const res = checkAll({ scopeFiles: [] });
    expect('empty scope list', has(res, f => f.family === 'consumers' && f.kind === 'BROKEN INSTRUMENT'), 1, 'BROKEN INSTRUMENT (consumers)');
  }

  // theia-exclusion
  {
    const api = apiRaw.split('\n');
    const at = api.findIndex(l => /^\s*tabHostAddTab\(win, tabId, browser\);/.test(l));
    if (landed('second tabHostAddTab call', at >= 0)) {
      api.splice(at + 1, 0, '    tabHostAddTab(win, tabId, theiaBrowser);');
      const res = checkAll({ texts: new Map([[API_REL, api.join('\n')]]) });
      expect('second tabHostAddTab call', has(res, f => f.family === 'theia-exclusion' && f.id === 'tabHostAddTab' && f.kind === 'CALL COUNT'), 1, 'CALL COUNT naming tabHostAddTab');
    }
  }
  {
    const from = ' || browser.getAttribute("messagemanagergroup") !== "browsers"';
    const text = apiRaw.includes(from) ? apiRaw.replace(from, '') : apiRaw;
    if (landed('group guard removed', text !== apiRaw)) {
      const res = checkAll({ texts: new Map([[API_REL, text]]) });
      expect('group guard removed', has(res, f => f.family === 'theia-exclusion' && f.id === 'tabHostAddTab' && f.kind === 'GROUP GUARD'), 1, 'GROUP GUARD naming tabHostAddTab');
    }
  }
  {
    const from = 'return host.tabs();';
    const text = jsRaw.includes(from) ? jsRaw.replace(from, 'return [browserElement, ...host.tabs()];') : jsRaw;
    if (landed('frame in the tabs getter', text !== jsRaw)) {
      const res = checkAll({ texts: new Map([[JS_REL, text]]) });
      expect('frame in the tabs getter', has(res, f => f.family === 'theia-exclusion' && f.kind === 'THEIA FRAME' && f.text.includes('browserElement')), 1, 'THEIA FRAME naming browserElement');
    }
  }
  {
    const orig = gitShow(EXT_TABS);
    const text = `${orig}\nconst zzzReadsDriverTabs = gBrowser.webDriverTabs;\n`;
    if (landed('extension-scope read of webDriverTabs', text !== orig)) {
      const res = checkAll({ pristine: new Map([[EXT_TABS, text]]) });
      expect('extension-scope read of webDriverTabs', has(res, f => f.family === 'theia-exclusion' && f.kind === 'EXTENSION READS WEBDRIVERTABS' && f.text.includes(EXT_TABS)), 1, `EXTENSION READS WEBDRIVERTABS naming ${EXT_TABS}`);
    }
  }

  // scheme-wall
  {
    const text = replaceInSpan(apiRaw, 'webTabNavigate', '!/^https?:\\/\\//i.test(spec)', '!/^https?:\\/\\/|moz-extension/i.test(spec)');
    const res = checkAll({ texts: new Map([[API_REL, text]]) });
    expect('|moz-extension in the webTabNavigate wall', has(res, f => f.family === 'scheme-wall' && f.id === 'webTabNavigate' && f.kind === 'ALLOW-LIST'), 1, 'ALLOW-LIST naming webTabNavigate');
  }
  {
    const text = replaceInSpan(apiRaw, 'webTabOpen', 'spec !== "about:blank" && ', '');
    const res = checkAll({ texts: new Map([[API_REL, text]]) });
    expect('about:blank dropped from the webTabOpen wall', has(res, f => f.family === 'scheme-wall' && f.id === 'webTabOpen' && f.kind === 'ABOUT BLANK'), 1, 'ABOUT BLANK naming webTabOpen');
  }
  {
    const text = dropHunks(cleanPatch, /ext-tabs\.js$/, /Promise\.reject/);
    if (landed('050 without the ext-tabs.js wall hunk', text !== cleanPatch)) {
      const res = checkAll({ patchText: text });
      expect('050 without the ext-tabs.js wall hunk', has(res, f => f.family === 'scheme-wall' && f.kind === 'NO HUNK'), 1, 'NO HUNK naming ext-tabs.js');
    }
  }
  {
    const text = cleanPatch.replace('!/^https?:\\/\\//i.test(url)', '!/^https?:/i.test(url)');
    if (landed('050 wall literal /^https?:/i', text !== cleanPatch)) {
      const res = checkAll({ patchText: text });
      expect('050 wall literal /^https?:/i', has(res, f => f.family === 'scheme-wall' && f.kind === 'LITERALS DIFFER' && f.text.includes('/^https?:/i') && f.text.includes('/^https?:\\/\\//i')), 1, 'LITERALS DIFFER naming both literals');
    }
  }

  // admits (WR-05): a tab-host test planted into ExtensionShortcuts unregister, where the design admits the shell.
  {
    const sc = 'toolkit/components/extensions/ExtensionShortcuts.sys.mjs';
    const orig = gitShow(sc);
    const text = orig.replace('  unregister() {\n', '  unregister() {\n    lazy.global.windowTracker.isTabHostWindow(null);\n');
    if (landed('tab-host test in unregister', text !== orig)) {
      const res = checkAll({ pristine: new Map([[sc, text]]) });
      expect('tab-host test in unregister', has(res, f => f.family === 'consumers' && f.kind === 'CLAIM FAILED' && f.text.includes('admits')), 1, 'CLAIM FAILED naming admits');
    }
  }
  // window-type
  {
    const text = apiRaw.replace('"chrome,dialog=no,all,toolbar"', '"chrome,dialog=no,all"');
    if (landed('openShellWindow without toolbar', text !== apiRaw)) {
      const res = checkAll({ texts: new Map([[API_REL, text]]) });
      expect('openShellWindow without toolbar', has(res, f => f.family === 'window-type' && f.id === 'openShellWindow'), 1, 'FEATURES naming openShellWindow');
    }
  }

  // messagemanagergroup (WR-02): the frame gets the group in the XHTML, or a setAttribute appears in the JS.
  {
    const xh = 'powerbrowser/shell/powerbrowser.xhtml';
    const xraw = readFileSync(join(ROOT, xh), 'utf8');
    const text = xraw.replace('id="powerbrowser-content" ', 'id="powerbrowser-content" messagemanagergroup="browsers" ');
    if (landed('messagemanagergroup on the Theia frame (XHTML)', text !== xraw)) {
      const res = checkAll({ texts: new Map([[xh, text]]) });
      expect('messagemanagergroup on the Theia frame (XHTML)', has(res, f => f.family === 'messagemanagergroup' && f.kind === 'THEIA FRAME GROUP' && f.text.includes('powerbrowser.xhtml')), 1, 'THEIA FRAME GROUP naming powerbrowser.xhtml');
    }
  }
  {
    const js = 'powerbrowser/shell/powerbrowser.js';
    const text = `${jsRaw}\ndocument.getElementById("powerbrowser-content").setAttribute("messagemanagergroup", "browsers");\n`;
    if (landed('messagemanagergroup set from powerbrowser.js', text !== jsRaw)) {
      const res = checkAll({ texts: new Map([[js, text]]) });
      expect('messagemanagergroup set from powerbrowser.js', has(res, f => f.family === 'messagemanagergroup' && f.kind === 'WRITE SITE' && f.text.includes('powerbrowser.js')), 1, 'WRITE SITE naming powerbrowser.js');
    }
  }
  // Phase 32 plan 09: a win.ZoomManager literal without getZoomForBrowser fails the host:ZoomManager claim.
  {
    const text = apiRaw.replace('getZoomForBrowser(browser) {', 'zzzNoGetZoomForBrowser(browser) {');
    if (landed('ZoomManager literal without getZoomForBrowser', text !== apiRaw)) {
      const res = checkAll({ texts: new Map([[API_REL, text]]) });
      expect('ZoomManager literal without getZoomForBrowser', has(res, f => f.family === 'consumers' && f.kind === 'CLAIM FAILED' && f.text.includes('host:ZoomManager')), 1, 'CLAIM FAILED naming host:ZoomManager');
    }
  }
  // selection hooks (WR-03): each caller removed on its own goes red.
  {
    const text = replaceInSpan(apiRaw, 'pushPageFocus', 'tabHostSelectById(theiaBrowser, tabId);', '');
    if (landed('pushPageFocus without its selection', text !== apiRaw)) {
      const res = checkAll({ texts: new Map([[API_REL, text]]) });
      expect('pushPageFocus without its selection', has(res, f => f.family === 'selection' && f.id === 'pushPageFocus' && f.kind === 'PAGE FOCUS HOOK'), 1, 'PAGE FOCUS HOOK naming pushPageFocus');
    }
  }
  {
    const text = apiRaw.replace('tabHostSelectById(actorRef.browsingContext.top.embedderElement, data.tabId);', '');
    if (landed('webTabActivated arm without its selection', text !== apiRaw)) {
      const res = checkAll({ texts: new Map([[API_REL, text]]) });
      expect('webTabActivated arm without its selection', has(res, f => f.family === 'selection' && f.id === 'webTabActivated' && f.kind === 'ACTIVATION HOOK'), 1, 'ACTIVATION HOOK naming webTabActivated');
    }
  }

  if (bad) {
    console.error(`${NAME} --self-test: FAIL -- ${bad} plant(s) or control(s) did not behave as required`);
    return 1;
  }
  console.log(`${NAME} --self-test: PASS -- ${planted} planted faults each landed and went red naming their drift, and the I2 control stayed green`);
  return 0;
}

// ---- main ------------------------------------------------------------------

const IS_ENTRY = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_ENTRY) {
  if (process.argv.includes('--self-test')) {
    process.exitCode = selfTest();
  } else {
    const res = checkAll({});
    if (res.failures.length) {
      for (const f of res.failures) console.error(`${NAME}: FAIL -- ${f.text}`);
      process.exitCode = 1;
    } else {
      for (const p of res.passes) console.log(`${NAME}: ${p}`);
    }
  }
}
