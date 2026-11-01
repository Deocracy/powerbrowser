#!/usr/bin/env node
// scripts/verify-shell-furniture.mjs
//
// Phase 35 (plan 35-02, D-01, D-04): the shell furniture -- the stock elements a
// remote page reaches through the shell window itself -- is exactly what the
// boundary's Phase 35 section wires, each element is upstream's own, and the
// installer and policy rules hold. Every expectation is derived at check time
// (CLAUDE.md `## Verification` rule 2); text reads only, so `--quick` is honest.
//
//   1. Furniture ids. B = every id="..." between the `shell furniture: begin` and
//      `shell furniture: end` XML comments of powerbrowser.xhtml. A = every id
//      the `// Phase 35: shell furniture.` section of PowerBrowserAPI.sys.mjs
//      passes to getElementById("..."), plus the autocompletepopup value of
//      webTabOpen's attribute map, plus (35-06) every id an ADOPTED_ACTORS parent
//      under upstream/browser/actors or upstream/toolkit/actors passes to
//      getElementById("...") (FormValidationParent's template and panel). A == B:
//      an element nothing wires is DEAD FURNITURE; a wired id with no element is
//      MISSING FURNITURE.
//   2. Upstream parity. Each element in B has the start tag (local name with the
//      xul:/html: prefix dropped, attribute set and values) of the upstream
//      element with the same id in main-popupset.inc.xhtml or
//      fullscreen-and-pointerlock.inc.xhtml. Those files are preprocessor input:
//      #ifdef/#ifndef/#else/#endif are evaluated for a Linux release build
//      (XP_UNIX, XP_GNOME defined; XP_MACOSX, XP_WIN, NIGHTLY_BUILD not), every
//      other # line is dropped and #include is not followed. Children are
//      compared too, unless the upstream body holds an #include.
//   3. Installer. installShellFurniture( is one member of the PowerBrowserAPI
//      literal, installShellFurnitureReceivers( is defined once in the section,
//      and powerbrowser.js calls PowerBrowserAPI.installShellFurniture(window)
//      once on a non-comment line.
//   4. Policy. The xhtml carries windowtype="powerbrowser:main" once; the section
//      defines no window.PopupNotifications and references no tabContainer
//      (D-11); .pb-page-status is defined in chrome-bar.css and the
//      BLOCKING_LAYER_SELECTOR derived from web-tab.ts does not contain it (the
//      status line never hides the page).
//   5. Page menu rows (35-03, D-12). Each id in the PAGE_MENU_ROWS table of the
//      Phase 35 section is an element id of upstream browser-context.inc.xhtml as a
//      Linux release build preprocesses it (the non-mac navigation menugroup), in
//      upstream's order; its `l10n` equals that element's data-l10n-id and exists
//      in upstream browserContext.ftl or toolkit textActions.ftl (35-04: the edit
//      and spelling rows); a `bundle` key exists in upstream browser.properties.
//      A `dynamic` row (no upstream id) is accepted only for a kind in
//      DYNAMIC_KINDS, each with its reason.
//   6. Page menu actions. The `runs: "chrome"` ids (a dynamic row by its kind)
//      equal the `case "context-..."` / `case "spell-..."` / `case "extension-..."` arms of runPageMenuRow,
//      and the `runs: "frontend"` ids equal the keys of FRONTEND_ROWS in
//      page-context-menu.ts, both as set equality.
//   7. Page menu policy. #powerbrowser-content carries disablecontextmenu="true"
//      (ContextMenuParent.sys.mjs:29), so an IDE right-click never reaches the shim.
//   8. Extension subject (35-05, D-16). The keys of the section's `const subject = {`
//      literal (the on-build-contextmenu subject) equal the keys of upstream's
//      `let subject = {` literal in nsContextMenu.sys.mjs, as set equality, so
//      ext-menus reads every field it reads in Firefox and nothing invented.
//   9. Autocomplete popup (35-06, D-03, W6). webTabOpen's autocompletepopup value
//      equals the id of the furniture <panel> whose type is autocomplete-richlistbox,
//      so AutoCompleteParent's browser.autoCompletePopup is upstream's element.
//  10. Localization (35-06, D-15). Each <link rel="localization"> href in the shell
//      head names an upstream en-US file (browser/locales/en-US/ or
//      toolkit/locales/en-US/), and every data-l10n-id in the furniture block plus
//      each id ClipboardContextMenu.sys.mjs sets through setAttributes is a message
//      in a linked file (without one, document.l10n is absent and the page's
//      navigator.clipboard.readText() rejects).
//  11. Fullscreen state (35-07, D-05). The Phase 35 section both sets and removes the
//      root's inDOMFullscreen attribute (setAttribute("inDOMFullscreen" and
//      removeAttribute("inDOMFullscreen") on code lines): DOMFullscreenParent reads it
//      to clean up after a destroyed actor, so a set without a remove leaves the window
//      stuck in fullscreen state, and a remove without a set never arms the cleanup.
//      The #fullscreen-warning subtree is held to upstream's by rule 2 and its
//      fullscreen-warning-* ids by rule 10.
//  12. F11 (35-07, D-07). The `fullscreen` row of PAGE_KEYS in powerbrowser.js has the
//      keycode and modifiers of upstream's key_enterFullScreen in browser-sets.inc.xhtml
//      as a Linux release build preprocesses it (#define and #expand lines dropped), and
//      it is not reserved: a reserved row would fire with the IDE focused (KEY-04). The
//      row names no `firefox` id because that id carries an internals-boundary pattern.
//
// A section, block or selector that cannot be found, or empty A and B, is a BROKEN
// INSTRUMENT, never a clean pass. `--self-test` asserts the clean tree green,
// then plants one fault per rule into staged copies; each must land and go red
// naming its drift.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-shell-furniture';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  xhtml: 'powerbrowser/shell/powerbrowser.xhtml',
  api: 'powerbrowser/shell/PowerBrowserAPI.sys.mjs',
  shellJs: 'powerbrowser/shell/powerbrowser.js',
  css: 'theia/extensions/chrome-bar/src/browser/chrome-bar.css',
  webTab: 'theia/extensions/tab-uris/src/browser/web-tab.ts',
  popupset: 'upstream/browser/base/content/main-popupset.inc.xhtml',
  fullscreen: 'upstream/browser/base/content/fullscreen-and-pointerlock.inc.xhtml',
  contextMenu: 'upstream/browser/base/content/browser-context.inc.xhtml',
  contextFtl: 'upstream/browser/locales/en-US/browser/browserContext.ftl',
  textActionsFtl: 'upstream/toolkit/locales/en-US/toolkit/global/textActions.ftl',
  browserProperties: 'upstream/browser/locales/en-US/chrome/browser/browser.properties',
  pageMenu: 'theia/extensions/chrome-bar/src/browser/page-context-menu.ts',
  nsContextMenu: 'upstream/browser/base/content/nsContextMenu.sys.mjs',
  clipboardMenu: 'upstream/toolkit/modules/ClipboardContextMenu.sys.mjs',
  browserSets: 'upstream/browser/base/content/browser-sets.inc.xhtml',
};
const ACTOR_DIRS = ['upstream/browser/actors', 'upstream/toolkit/actors'];
const L10N_ROOTS = ['upstream/browser/locales/en-US', 'upstream/toolkit/locales/en-US'];
const BRANDING_L10N_ROOT = 'powerbrowser/branding/release/locales/en-US';
// Upstream actor parents whose chrome-window elements this shell hosts, each with its reason (35-06).
// Every id such a parent looks up joins the wired set A, so a missing element is MISSING FURNITURE.
const ADOPTED_ACTORS = new Map([
  ['ContextMenuParent.sys.mjs', 'PROMPT-04 (D-02): the stub page menu the actor opens'],
  ['FormValidationParent.sys.mjs', 'PROMPT-06 (D-14): the stock form-validation bubble, reached once 31.1 makes the overlay the selected browser'],
]);
const UPSTREAM_KEYS = ['popupset', 'fullscreen'];
const SECTION_HEADER = '// Phase 35: shell furniture.';
const BLOCK_BEGIN = '<!-- shell furniture: begin -->';
const BLOCK_END = '<!-- shell furniture: end -->';
const LINUX_DEFINES = new Set(['XP_UNIX', 'XP_GNOME']);
const INCLUDE_MARK = 'PB_FURNITURE_UPSTREAM_INCLUDE';
// Page menu rows with no upstream element id, each with the reason it has none (35-04).
const DYNAMIC_KINDS = new Map([
  ['spell-suggestion', 'spelling suggestions are dictionary words the spell checker returns; upstream inserts them as unnamed menuitems (InlineSpellChecker.sys.mjs _addSuggestionsToMenu), so no upstream id exists'],
  ['extension-entry', 'extension entries are built by ext-menus into the stub from each extension\'s menus.create calls (ext-menus.js buildSingleElement); their labels and element ids come from the extension, so no upstream id exists'],
]);

function readInputs() {
  const inputs = {};
  for (const [key, rel] of Object.entries(FILES)) {
    try {
      inputs[key] = readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
      inputs[key] = null;
    }
  }
  // { "<rel path>": text } for every *Parent.sys.mjs under ACTOR_DIRS (recursive).
  inputs.actorParents = {};
  for (const dir of ACTOR_DIRS) {
    let entries = [];
    try {
      entries = readdirSync(join(REPO_ROOT, dir), { recursive: true });
    } catch {}
    for (const entry of entries.filter(e => e.endsWith('Parent.sys.mjs'))) inputs.actorParents[`${dir}/${entry}`] = readRepo(`${dir}/${entry}`);
  }
  return inputs;
}

function readRepo(rel) {
  try {
    return readFileSync(join(REPO_ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

// The top-level keys of the object literal opened on the first line matching `declRe` and closed by `};` at its indent.
function literalKeys(text, declRe) {
  const lines = text.split('\n');
  const at = lines.findIndex(line => declRe.test(line));
  if (at === -1) return null;
  const indent = /^\s*/.exec(lines[at])[0];
  const keyRe = new RegExp(`^${indent}  ([A-Za-z_$][\\w$]*)(?::|,\\s*$)`);
  const keys = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i] === `${indent}};`) return keys;
    const m = keyRe.exec(lines[i]);
    if (m) keys.push(m[1]);
  }
  return null;
}

const codeLines = text => text.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line));

// The Phase 35 section: its header line up to the next `// Phase` header, or EOF.
function phase35Section(api) {
  const lines = api.split('\n');
  const start = lines.findIndex(line => line.trim() === SECTION_HEADER);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\/\/ Phase /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// Evaluates the Linux release build's #ifdef/#ifndef/#else/#endif, drops every
// other # line and keeps an #include as a marker, so a body that held one is known.
// `dropped` names further directives whose lines are dropped (browser-sets' #define and #expand).
function preprocess(text, rel, broken, dropped = []) {
  const stack = [];
  const kept = [];
  for (const line of text.split('\n')) {
    const d = /^#(\w*)\s*(.*)$/.exec(line);
    const active = stack.every(Boolean);
    if (!d) {
      if (active) kept.push(line);
      continue;
    }
    const [, directive, rest] = d;
    const arg = rest.trim().split(/\s+/)[0];
    if (directive === 'ifdef' || directive === 'ifndef') stack.push(LINUX_DEFINES.has(arg) === (directive === 'ifdef'));
    else if (directive === 'else') stack.push(!stack.pop());
    else if (directive === 'endif') stack.pop();
    else if (directive === 'include') {
      if (active) kept.push(INCLUDE_MARK);
    } else if (directive !== '' && directive !== 'filter' && directive !== 'unfilter' && !dropped.includes(directive)) {
      broken.push(`${rel}: unsupported preprocessor directive #${directive}`);
    }
  }
  return kept.join('\n');
}

// Tokens of comment-free markup: { type: 'start'|'end'|'text', name, attrs, selfClose, text }.
function tokenize(markup) {
  const text = markup.replace(/<!--[\s\S]*?-->/g, '');
  const tokens = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of text.matchAll(re)) {
    if (m[5] !== undefined) {
      const t = m[5].replace(/\s+/g, ' ').trim();
      if (t) tokens.push({ type: 'text', text: t });
      continue;
    }
    const name = m[2].replace(/^(xul|html):/, '');
    if (m[1]) {
      tokens.push({ type: 'end', name });
      continue;
    }
    const attrs = new Map();
    for (const a of m[3].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) attrs.set(a[1], a[2] ?? a[3] ?? '');
    tokens.push({ type: 'start', name, attrs, selfClose: m[4] === '/' });
  }
  return tokens;
}

// The element with `id` in `tokens`: { start, children } (children as strings), or null.
function elementById(tokens, id) {
  const at = tokens.findIndex(t => t.type === 'start' && t.attrs.get('id') === id);
  if (at === -1) return null;
  const start = tokens[at];
  if (start.selfClose) return { start, children: [] };
  const children = [];
  let depth = 1;
  for (let i = at + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'start' && !t.selfClose) depth++;
    if (t.type === 'end') depth--;
    if (depth === 0) return { start, children };
    children.push(serialize(t));
    if (t.type === 'start' && t.selfClose) children.push(`</${t.name}>`);
  }
  return null;
}

function serialize(t) {
  if (t.type === 'text') return t.text;
  if (t.type === 'end') return `</${t.name}>`;
  const attrs = [...t.attrs].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<${t.name}${attrs}>`;
}

function compareStart(id, shell, upstream) {
  const diffs = [];
  if (shell.name !== upstream.name) diffs.push(`element is <${shell.name}>, upstream's is <${upstream.name}>`);
  for (const [k, v] of shell.attrs) {
    if (!upstream.attrs.has(k)) diffs.push(`attribute ${k}="${v}" is not on upstream's element`);
    else if (upstream.attrs.get(k) !== v) diffs.push(`attribute ${k} is "${v}", upstream's is "${upstream.attrs.get(k)}"`);
  }
  for (const [k, v] of upstream.attrs) {
    if (!shell.attrs.has(k)) diffs.push(`upstream attribute ${k}="${v}" is missing`);
  }
  return diffs.map(d => `PARITY: #${id}: ${d}`);
}

// Returns { broken: [...], failures: [...], summary }.
function check(inputs) {
  const broken = [];
  const failures = [];
  for (const [key, rel] of Object.entries(FILES)) {
    if (inputs[key] === null) broken.push(`cannot read ${rel}`);
  }
  if (broken.length) return { broken, failures };

  // Rule 1: the two id sets.
  const section = phase35Section(inputs.api);
  if (section === null) broken.push(`no '${SECTION_HEADER}' section header in ${FILES.api}`);
  const begin = inputs.xhtml.indexOf(BLOCK_BEGIN);
  const end = inputs.xhtml.indexOf(BLOCK_END);
  if (begin === -1 || end === -1 || end < begin) broken.push(`no '${BLOCK_BEGIN}' ... '${BLOCK_END}' block in ${FILES.xhtml}`);
  if (broken.length) return { broken, failures };

  const blockTokens = tokenize(inputs.xhtml.slice(begin + BLOCK_BEGIN.length, end));
  const setB = new Set(blockTokens.filter(t => t.type === 'start' && t.attrs.has('id')).map(t => t.attrs.get('id')));
  const sectionCode = codeLines(section).join('\n');
  const setA = new Set([...sectionCode.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]));
  const openAt = inputs.api.search(/^ {2}webTabOpen\(/m);
  let popup = null;
  if (openAt !== -1) {
    const body = inputs.api.slice(openAt, inputs.api.indexOf('\n  },', openAt));
    popup = /autocompletepopup:\s*["']([^"']+)["']/.exec(body)?.[1] ?? null;
    if (popup) setA.add(popup);
  }
  const actorFiles = Object.keys(inputs.actorParents);
  if (!actorFiles.length) return { broken: [`no *Parent.sys.mjs under ${ACTOR_DIRS.join(' or ')}: rule 1's actor wiring would prove nothing`], failures };
  for (const name of ADOPTED_ACTORS.keys()) {
    const rel = actorFiles.find(f => f.endsWith(`/${name}`));
    const ids = rel ? [...codeLines(inputs.actorParents[rel] ?? '').join('\n').matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]) : [];
    if (!ids.length) return { broken: [`adopted actor ${name} is not under ${ACTOR_DIRS.join(' or ')} or looks up no element id: rule 1 would prove nothing for it`], failures };
    for (const id of ids) setA.add(id);
  }
  // Both empty is a parse that found nothing; B empty against a wired A is missing furniture, reported below.
  if (setB.size === 0 && setA.size === 0) return { broken: [`the furniture block of ${FILES.xhtml} and the Phase 35 section yield no id: the comparison would prove nothing`], failures };
  for (const id of [...setB].filter(id => !setA.has(id)).sort()) failures.push(`DEAD FURNITURE: #${id} is in the furniture block but nothing in the Phase 35 section wires it`);
  for (const id of [...setA].filter(id => !setB.has(id)).sort()) failures.push(`MISSING FURNITURE: #${id} is wired (Phase 35 section, overlay attribute or an adopted actor parent) but the furniture block has no such element`);

  // Rule 2: upstream parity.
  const upstreamTokens = UPSTREAM_KEYS.map(key => ({ rel: FILES[key], tokens: tokenize(preprocess(inputs[key], FILES[key], broken)) }));
  if (broken.length) return { broken, failures };
  for (const id of [...setB].sort()) {
    const shell = elementById(blockTokens, id);
    const found = upstreamTokens.map(u => ({ rel: u.rel, el: elementById(u.tokens, id) })).find(u => u.el);
    if (!shell) {
      failures.push(`PARITY: #${id}: the furniture element is not balanced markup`);
      continue;
    }
    if (!found) {
      failures.push(`PARITY: #${id}: upstream defines no element with this id in ${UPSTREAM_KEYS.map(k => FILES[k]).join(' or ')}`);
      continue;
    }
    failures.push(...compareStart(id, shell.start, found.el.start));
    if (!found.el.children.some(c => c.includes(INCLUDE_MARK)) && shell.children.join('') !== found.el.children.join('')) {
      failures.push(`PARITY: #${id}: children differ from upstream's (${found.rel}): shell [${shell.children.join('')}], upstream [${found.el.children.join('')}]`);
    }
  }

  // Rule 3: the installer.
  const apiLines = inputs.api.split('\n');
  const literalStart = apiLines.findIndex(line => line.startsWith('export const PowerBrowserAPI = Object.freeze({'));
  const literalEnd = literalStart === -1 ? -1 : apiLines.findIndex((line, i) => i > literalStart && line === '});');
  if (literalStart === -1 || literalEnd === -1) return { broken: [`no PowerBrowserAPI literal in ${FILES.api}`], failures };
  const members = apiLines.slice(literalStart, literalEnd).filter(line => /^ {2}installShellFurniture\(/.test(line)).length;
  const anywhere = codeLines(inputs.api).filter(line => /^\s*installShellFurniture\(/.test(line)).length;
  if (members !== 1 || anywhere !== 1) failures.push(`INSTALLER: installShellFurniture( must be one member of the PowerBrowserAPI literal; found ${members} in the literal, ${anywhere} in the file`);
  const receivers = (sectionCode.match(/^function installShellFurnitureReceivers\(/gm) || []).length;
  const receiversAnywhere = (codeLines(inputs.api).join('\n').match(/function installShellFurnitureReceivers\(/g) || []).length;
  if (receivers !== 1 || receiversAnywhere !== 1) failures.push(`INSTALLER: installShellFurnitureReceivers( must be defined once, in the Phase 35 section; found ${receivers} there, ${receiversAnywhere} in the file`);
  const calls = codeLines(inputs.shellJs).filter(line => line.includes('PowerBrowserAPI.installShellFurniture(window)')).length;
  if (calls !== 1) failures.push(`INSTALLER: ${FILES.shellJs} must call PowerBrowserAPI.installShellFurniture(window) exactly once; found ${calls}`);

  // Rule 4: policy.
  const windowtype = (inputs.xhtml.match(/windowtype="powerbrowser:main"/g) || []).length;
  if (windowtype !== 1) failures.push(`POLICY: ${FILES.xhtml} must carry windowtype="powerbrowser:main" once; found ${windowtype}`);
  if (/\b(?:window|win)\.PopupNotifications\s*=(?!=)/.test(sectionCode)) failures.push('POLICY: the Phase 35 section defines window.PopupNotifications (D-11: doorhangers are not shell furniture)');
  if (/\btabContainer\b/.test(sectionCode)) failures.push('POLICY: the Phase 35 section references tabContainer (D-11: the shell has no tab strip of its own)');
  if (!/^\.pb-page-status\s*\{/m.test(inputs.css)) failures.push(`POLICY: ${FILES.css} defines no .pb-page-status rule`);
  const selector = /const BLOCKING_LAYER_SELECTOR\s*=\s*'([^']*)'/.exec(inputs.webTab);
  if (!selector) return { broken: [`no BLOCKING_LAYER_SELECTOR string in ${FILES.webTab}`], failures };
  if (selector[1].includes('pb-page-status')) failures.push('POLICY: BLOCKING_LAYER_SELECTOR contains .pb-page-status: a hover state would hide the page');

  // Rule 5: the page menu rows against upstream's markup and strings.
  const rowsAt = sectionCode.indexOf('const PAGE_MENU_ROWS = Object.freeze([');
  const rowsText = rowsAt === -1 ? '' : sectionCode.slice(rowsAt, sectionCode.indexOf('\n]);', rowsAt));
  const field = (line, name) => new RegExp(`\\b${name}: "([^"]*)"`).exec(line)?.[1];
  const rowLines = rowsText.split('\n').filter(line => /^\s*\{ (id|dynamic): "/.test(line));
  const dynamicRows = rowLines.filter(line => /^\s*\{ dynamic: "/.test(line)).map(line => ({ dynamic: field(line, 'dynamic'), runs: field(line, 'runs') }));
  const rows = rowLines.filter(line => /^\s*\{ id: "/.test(line)).map(line => ({ id: field(line, 'id'), l10n: field(line, 'l10n'), bundle: field(line, 'bundle'), runs: field(line, 'runs') }));
  for (const row of dynamicRows) {
    if (!DYNAMIC_KINDS.has(row.dynamic)) failures.push(`ROWS: dynamic row kind "${row.dynamic}" is not in DYNAMIC_KINDS: a row with no upstream id needs a recorded reason`);
  }
  if (!rows.length) return { broken: [`no PAGE_MENU_ROWS rows in the Phase 35 section of ${FILES.api}: rules 5 and 6 would prove nothing`], failures };
  const menuTokens = tokenize(preprocess(inputs.contextMenu, FILES.contextMenu, broken));
  if (broken.length) return { broken, failures };
  let lastAt = -1;
  for (const row of rows) {
    const at = menuTokens.findIndex(t => t.type === 'start' && t.attrs.get('id') === row.id);
    if (at === -1) {
      failures.push(`ROWS: ${row.id} is not an element id in upstream ${FILES.contextMenu} (Linux build)`);
      continue;
    }
    if (at < lastAt) failures.push(`ROWS: ${row.id} is out of upstream's order in ${FILES.contextMenu}`);
    lastAt = at;
    const upstreamL10n = menuTokens[at].attrs.get('data-l10n-id');
    if (row.l10n !== undefined && row.l10n !== upstreamL10n) failures.push(`ROWS: ${row.id}: l10n "${row.l10n}" differs from upstream's data-l10n-id "${upstreamL10n ?? '(none)'}"`);
    if (row.l10n !== undefined && !new RegExp(`^${row.l10n} =`, 'm').test(inputs.contextFtl) && !new RegExp(`^${row.l10n} =`, 'm').test(inputs.textActionsFtl)) failures.push(`ROWS: ${row.id}: l10n "${row.l10n}" is not a message in upstream ${FILES.contextFtl} or ${FILES.textActionsFtl}`);
    if (row.bundle !== undefined && !new RegExp(`^${row.bundle}=`, 'm').test(inputs.browserProperties)) failures.push(`ROWS: ${row.id}: bundle key "${row.bundle}" is not in upstream ${FILES.browserProperties}`);
    if (row.l10n === undefined && row.bundle === undefined) failures.push(`ROWS: ${row.id} has neither an l10n id nor a bundle key: its label would not be Firefox's string`);
  }

  // Rule 6: chrome rows == runPageMenuRow arms; frontend rows == FRONTEND_ROWS keys.
  const dispatcherAt = sectionCode.search(/^async function runPageMenuRow\(/m);
  const dispatcher = dispatcherAt === -1 ? '' : sectionCode.slice(dispatcherAt, sectionCode.indexOf('\n}', dispatcherAt));
  const arms = new Set([...dispatcher.matchAll(/case "((?:context|spell|extension)-[^"]+)"/g)].map(m => m[1]));
  const frontendAt = inputs.pageMenu.indexOf('const FRONTEND_ROWS');
  const frontendKeys = new Set(frontendAt === -1 ? [] : [...inputs.pageMenu.slice(frontendAt, inputs.pageMenu.indexOf('});', frontendAt)).matchAll(/^\s*'(context-[^']+)':/gm)].map(m => m[1]));
  if (!arms.size) return { broken: [`no case "context-..." arms in runPageMenuRow in ${FILES.api}: rule 6 would prove nothing`], failures };
  if (!frontendKeys.size) return { broken: [`no FRONTEND_ROWS keys in ${FILES.pageMenu}: rule 6 would prove nothing`], failures };
  const chromeRows = new Set([...rows, ...dynamicRows].filter(r => r.runs === 'chrome').map(r => r.id ?? r.dynamic));
  const frontendRows = new Set(rows.filter(r => r.runs === 'frontend').map(r => r.id));
  const missingArms = [...chromeRows].filter(id => !arms.has(id)).sort();
  const surplusArms = [...arms].filter(id => !chromeRows.has(id)).sort();
  const missingKeys = [...frontendRows].filter(id => !frontendKeys.has(id)).sort();
  const surplusKeys = [...frontendKeys].filter(id => !frontendRows.has(id)).sort();
  if (missingArms.length) failures.push(`ACTIONS: chrome rows with no runPageMenuRow arm: ${missingArms.join(', ')}`);
  if (surplusArms.length) failures.push(`ACTIONS: runPageMenuRow arms with no chrome row: ${surplusArms.join(', ')}`);
  if (missingKeys.length) failures.push(`ACTIONS: frontend rows with no FRONTEND_ROWS handler in ${FILES.pageMenu}: ${missingKeys.join(', ')}`);
  if (surplusKeys.length) failures.push(`ACTIONS: FRONTEND_ROWS handlers with no frontend row: ${surplusKeys.join(', ')}`);

  // Rule 7: the Theia frame never feeds the page menu.
  const content = /<xul:browser\b[^>]*\bid="powerbrowser-content"[^>]*>/.exec(inputs.xhtml);
  if (!content) return { broken: [`no #powerbrowser-content browser in ${FILES.xhtml}`], failures };
  if (!/\sdisablecontextmenu="true"/.test(content[0])) failures.push('POLICY: #powerbrowser-content does not carry disablecontextmenu="true" (ContextMenuParent.sys.mjs:29): an IDE right-click would reach the page menu');

  // Rule 8: the on-build-contextmenu subject has exactly upstream's keys.
  const upstreamSubject = literalKeys(inputs.nsContextMenu, /^\s*let subject = \{$/);
  const shellSubject = literalKeys(sectionCode, /^\s*const subject = \{$/);
  if (!upstreamSubject?.length) return { broken: [`no 'let subject = {' literal in ${FILES.nsContextMenu}: rule 8 would prove nothing`], failures };
  if (!shellSubject) return { broken: [`no 'const subject = {' literal in the Phase 35 section of ${FILES.api}: rule 8 would prove nothing`], failures };
  for (const key of upstreamSubject.filter(k => !shellSubject.includes(k))) failures.push(`SUBJECT: key ${key} of upstream's on-build-contextmenu subject (${FILES.nsContextMenu}) is missing from the section's subject`);
  for (const key of shellSubject.filter(k => !upstreamSubject.includes(k))) failures.push(`SUBJECT: key ${key} of the section's subject is not in upstream's on-build-contextmenu subject`);

  // Rule 9: the overlays' autocompletepopup is the furniture's autocomplete panel.
  const acPanels = blockTokens.filter(t => t.type === 'start' && t.name === 'panel' && t.attrs.get('type') === 'autocomplete-richlistbox').map(t => t.attrs.get('id'));
  if (acPanels.length !== 1) failures.push(`AUTOCOMPLETE: the furniture block must hold exactly one <panel type="autocomplete-richlistbox">; found ${acPanels.length}`);
  else if (popup !== acPanels[0]) failures.push(`AUTOCOMPLETE: webTabOpen's autocompletepopup is ${popup ? `"${popup}"` : 'unset'}, the furniture's autocomplete panel is #${acPanels[0]}`);

  // Rule 10: localization links name upstream en-US files that carry every id the shell needs.
  const head = /<head>([\s\S]*?)<\/head>/.exec(inputs.xhtml.replace(/<!--[\s\S]*?-->/g, ''));
  if (!head) return { broken: [`no <head> in ${FILES.xhtml}`], failures };
  const hrefs = [...head[1].matchAll(/<link\b[^>]*\brel="localization"[^>]*>/g)].map(m => /\bhref="([^"]*)"/.exec(m[0])?.[1] ?? '');
  const linked = [];
  for (const href of hrefs) {
    // branding/ resolves to the product's own branding locale (Phase 37's doorhangers link brand.ftl), not upstream's.
    const text = href.startsWith('branding/') ? readRepo(`${BRANDING_L10N_ROOT}/${href.slice('branding/'.length)}`) ?? undefined : L10N_ROOTS.map(root => readRepo(`${root}/${href}`)).find(t => t !== null);
    if (text === undefined) failures.push(`LOCALIZATION: <link rel="localization" href="${href}"> names no file under ${href.startsWith('branding/') ? BRANDING_L10N_ROOT : L10N_ROOTS.join(' or ')}`);
    else linked.push(text);
  }
  const clipboardIds = [...inputs.clipboardMenu.matchAll(/\.setAttributes\([^,]+,\s*["']([^"']+)["']/g)].map(m => [m[1], 'ClipboardContextMenu.sys.mjs']);
  if (!clipboardIds.length) return { broken: [`no setAttributes(..., "<id>") call in ${FILES.clipboardMenu}: rule 10 would prove nothing for the paste popup`], failures };
  const blockIds = blockTokens.filter(t => t.type === 'start' && t.attrs.has('data-l10n-id')).map(t => [t.attrs.get('data-l10n-id'), 'the furniture block']);
  const l10nIds = [...blockIds, ...clipboardIds];
  for (const [id, from] of l10nIds) {
    if (!linked.some(text => new RegExp(`^${id} =`, 'm').test(text))) failures.push(`LOCALIZATION: ${id} (set by ${from}) is a message in no linked localization file of ${FILES.xhtml}`);
  }

  // Rule 11: the inDOMFullscreen root attribute is set and removed in the section.
  for (const call of ['setAttribute', 'removeAttribute']) {
    if (!new RegExp(`\\.${call}\\(\\s*["']inDOMFullscreen["']`).test(sectionCode)) failures.push(`FULLSCREEN: the Phase 35 section never calls ${call}("inDOMFullscreen") on the root (DOMFullscreenParent.sys.mjs:21, :107 read it)`);
  }

  // Rule 12: the F11 page row is upstream's Linux key_enterFullScreen, unreserved.
  const setsTokens = tokenize(preprocess(inputs.browserSets, FILES.browserSets, broken, ['define', 'expand']));
  if (broken.length) return { broken, failures };
  const enterKey = elementById(setsTokens, 'key_enterFullScreen')?.start;
  if (!enterKey) return { broken: [`no key_enterFullScreen in the Linux build of ${FILES.browserSets}: rule 12 would prove nothing`], failures };
  const f11Row = codeLines(inputs.shellJs).find(line => /^\s*\{ id: "fullscreen",/.test(line));
  if (!f11Row) failures.push(`F11: ${FILES.shellJs} has no PAGE_KEYS row with id "fullscreen"`);
  else {
    const rowField = name => new RegExp(`\\b${name}: "([^"]*)"`).exec(f11Row)?.[1] ?? '';
    const want = { keycode: enterKey.attrs.get('keycode') ?? '', modifiers: enterKey.attrs.get('modifiers') ?? '' };
    for (const name of ['keycode', 'modifiers']) {
      if (rowField(name) !== want[name]) failures.push(`F11: the fullscreen row's ${name} is "${rowField(name)}", upstream key_enterFullScreen's (Linux) is "${want[name]}"`);
    }
    if (!/\breserved: false\b/.test(f11Row)) failures.push('F11: the fullscreen row is not reserved: false (a reserved row fires with the IDE focused, KEY-04)');
  }

  return { broken, failures, summary: `furniture {${[...setB].sort().join(', ')}} == wired {${[...setA].sort().join(', ')}} (section, overlay attribute and ${ADOPTED_ACTORS.size} adopted actor parents of ${actorFiles.length}), each equal to upstream's element; installer member, receivers and one call; windowtype, D-11 and the status-line layer rule hold; ${rows.length} page menu rows are upstream's ids and strings in upstream's order, ${chromeRows.size} chrome rows == dispatcher arms, ${frontendRows.size} frontend rows == FRONTEND_ROWS; the Theia frame carries disablecontextmenu; the on-build-contextmenu subject has upstream's ${upstreamSubject.length} keys; overlays name the autocomplete panel #${acPanels[0]}; ${hrefs.length} localization link(s) carry the ${l10nIds.length} id(s) the shell needs; the section sets and removes inDOMFullscreen; the F11 row is upstream's Linux key_enterFullScreen, unreserved` };
}

function report(result) {
  for (const b of result.broken) console.error(`  BROKEN INSTRUMENT: ${b}`);
  for (const f of result.failures) console.error(`  ${f}`);
}

function selfTest() {
  const clean = readInputs();
  const control = check(clean);
  if (control.broken.length || control.failures.length) {
    console.error(`${NAME} --self-test: FAIL -- the clean tree is already red`);
    report(control);
    process.exit(1);
  }
  console.log(`${NAME} --self-test: clean tree green -- ${control.summary}; planting faults`);
  const tooltip = '<xul:tooltip id="remoteBrowserTooltip"/>';
  const plants = [
    { name: '(a) tooltip element removed from the block', key: 'xhtml', mutate: t => t.replace(tooltip, ''), expect: 'MISSING FURNITURE: #remoteBrowserTooltip' },
    { name: '(b) an extra element in the block', key: 'xhtml', mutate: t => t.replace(tooltip, `${tooltip}<xul:menupopup id="backForwardMenu"/>`), expect: 'DEAD FURNITURE: #backForwardMenu' },
    { name: '(c) page="true" on the tooltip', key: 'xhtml', mutate: t => t.replace(tooltip, '<xul:tooltip id="remoteBrowserTooltip" page="true"/>'), expect: 'PARITY: #remoteBrowserTooltip: attribute page="true" is not on upstream\'s element' },
    { name: '(d) a furniture element upstream lacks', key: 'xhtml', mutate: t => t.replace(tooltip, `${tooltip}<xul:tooltip id="zzzPlantedFurniture"/>`), expect: 'PARITY: #zzzPlantedFurniture: upstream defines no element with this id' },
    { name: '(e) a second installer call', key: 'shellJs', mutate: t => t.replace('PowerBrowserAPI.installShellFurniture(window);', 'PowerBrowserAPI.installShellFurniture(window);\n    PowerBrowserAPI.installShellFurniture(window);'), expect: 'must call PowerBrowserAPI.installShellFurniture(window) exactly once; found 2' },
    { name: '(f) a tabContainer reference in the section', key: 'api', mutate: t => `${t}\nwindow.gBrowser.tabContainer;\n`, expect: 'POLICY: the Phase 35 section references tabContainer' },
    { name: '(g) .pb-page-status in the blocking selector', key: 'webTab', mutate: t => t.replace(/(const BLOCKING_LAYER_SELECTOR\s*=\s*'[^']*)'/, "$1, .pb-page-status'"), expect: 'POLICY: BLOCKING_LAYER_SELECTOR contains .pb-page-status' },
    { name: '(h) the section header removed', key: 'api', mutate: t => t.replace(SECTION_HEADER, '// Phase 35 header removed.'), expect: `BROKEN INSTRUMENT: no '${SECTION_HEADER}' section header` },
    { name: '(i) an invented page menu row id', key: 'api', mutate: t => t.replace(/^(\s*)\{ id: "context-copylink",/m, '$1{ id: "context-zzzplanted", l10n: "main-context-menu-copy-link-simple", when: "copyLink", runs: "frontend", group: "copy" },\n$&'), expect: 'ROWS: context-zzzplanted is not an element id in upstream' },
    { name: '(j) a row l10n id that differs from upstream', key: 'api', mutate: t => t.replace('l10n: "main-context-menu-copy-link-simple"', 'l10n: "main-context-menu-copy-link"'), expect: 'ROWS: context-copylink: l10n "main-context-menu-copy-link" differs from upstream\'s data-l10n-id "main-context-menu-copy-link-simple"' },
    { name: '(k) a chrome row with no dispatcher arm', key: 'api', mutate: t => t.replace(/^\s*case "context-reloadframe":.*\n/m, ''), expect: 'ACTIONS: chrome rows with no runPageMenuRow arm: context-reloadframe' },
    { name: '(l) a frontend row with no frontend handler', key: 'pageMenu', mutate: t => t.replace(/^\s*'context-stop':.*\n/m, ''), expect: `ACTIONS: frontend rows with no FRONTEND_ROWS handler in ${FILES.pageMenu}: context-stop` },
    { name: '(m) disablecontextmenu removed from the Theia frame', key: 'xhtml', mutate: t => t.replace(' disablecontextmenu="true"', ''), expect: 'POLICY: #powerbrowser-content does not carry disablecontextmenu="true"' },
    { name: '(n) a dynamic row of an unknown kind', key: 'api', mutate: t => t.replace('{ dynamic: "spell-suggestion",', '{ dynamic: "zzz-planted",'), expect: 'ROWS: dynamic row kind "zzz-planted" is not in DYNAMIC_KINDS' },
    { name: '(o) a key dropped from the on-build-contextmenu subject', key: 'api', mutate: t => t.replace(/^ {4}frameId: context\.frameID,\n/m, ''), expect: 'SUBJECT: key frameId of upstream\'s on-build-contextmenu subject' },
    { name: '(p) an invented key in the on-build-contextmenu subject', key: 'api', mutate: t => t.replace(/^( {4}frameId: context\.frameID,\n)/m, '$1    zzzPlanted: true,\n'), expect: 'SUBJECT: key zzzPlanted of the section\'s subject is not in upstream\'s' },
    { name: '(q) the autocomplete panel as a <popup> (W6)', key: 'xhtml', mutate: t => t.replace('<xul:panel is="autocomplete-richlistbox-popup"', '<xul:popup is="autocomplete-richlistbox-popup"'), expect: 'PARITY: #PopupAutoComplete: element is <popup>, upstream\'s is <panel>' },
    { name: '(r) the overlay attribute naming another id', key: 'api', mutate: t => t.replace('autocompletepopup: "PopupAutoComplete",', 'autocompletepopup: "contentAreaContextMenu",'), expect: 'AUTOCOMPLETE: webTabOpen\'s autocompletepopup is "contentAreaContextMenu", the furniture\'s autocomplete panel is #PopupAutoComplete' },
    { name: '(s) the textActions.ftl localization link removed', key: 'xhtml', mutate: t => t.replace(/^\s*<link rel="localization" href="toolkit\/global\/textActions\.ftl"\/>\n/m, ''), expect: 'LOCALIZATION: text-action-paste (set by ClipboardContextMenu.sys.mjs)' },
    { name: '(t) the validation template removed', key: 'xhtml', mutate: t => t.replace(/^\s*<template id="invalidFormTemplate">[\s\S]*?<\/template>\n/m, ''), expect: 'MISSING FURNITURE: #invalidFormTemplate' },
    { name: '(u) the exit button removed from the fullscreen warning', key: 'xhtml', mutate: t => t.replace(/^\s*<button id="fullscreen-exit-button">\s*<\/button>\n/m, ''), expect: 'PARITY: #fullscreen-warning: children differ from upstream\'s' },
    { name: '(v) the inDOMFullscreen remove call deleted', key: 'api', mutate: t => t.replace('document.documentElement.removeAttribute("inDOMFullscreen");', ''), expect: 'FULLSCREEN: the Phase 35 section never calls removeAttribute("inDOMFullscreen")' },
    { name: '(w) a modifier on the F11 row', key: 'shellJs', mutate: t => t.replace('{ id: "fullscreen", keycode: "VK_F11", modifiers: ""', '{ id: "fullscreen", keycode: "VK_F11", modifiers: "accel"'), expect: 'F11: the fullscreen row\'s modifiers is "accel", upstream key_enterFullScreen\'s (Linux) is ""' },
  ];
  let failed = false;
  for (const plant of plants) {
    const staged = { ...clean, [plant.key]: plant.mutate(clean[plant.key]) };
    if (staged[plant.key] === clean[plant.key]) {
      console.error(`  FAIL  ${plant.name} -- the plant did not apply`);
      failed = true;
      continue;
    }
    const r = check(staged);
    const lines = [...r.broken.map(b => `BROKEN INSTRUMENT: ${b}`), ...r.failures];
    if (!lines.some(line => line.includes(plant.expect))) {
      console.error(`  FAIL  ${plant.name} -- did not go red naming "${plant.expect}"; got: ${lines.join(' | ') || 'green'}`);
      failed = true;
      continue;
    }
    console.log(`  ok    ${plant.name} -> red: ${lines.find(line => line.includes(plant.expect))}`);
  }
  if (failed) {
    console.error(`${NAME} --self-test: FAIL`);
    process.exit(1);
  }
  console.log(`${NAME} --self-test: PASS -- the clean tree is green and plants (a) through (w) each landed and went red naming their drift`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const result = check(readInputs());
  if (result.broken.length || result.failures.length) {
    console.error(`${NAME}: FAIL -- the shell furniture does not match its wiring, upstream, or the installer and policy rules`);
    report(result);
    process.exit(1);
  }
  console.log(`${NAME}: PASS -- ${result.summary}`);
}
