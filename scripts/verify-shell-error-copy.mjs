#!/usr/bin/env node
// scripts/verify-shell-error-copy.mjs
//
// shell-error-copy-no-internals (01-07).
//
// Asserts that no internal identifier can reach #powerbrowser-error-message --
// the full-screen text a user is looking at when the pointer-driven happy path
// has already failed. Before 01-07 that element was painted with strings like
// `powerbrowser.sidecar.backendMain (/x/y) does not exist` and `Backend did not
// announce POWERBROWSER_BACKEND_READY within 90000ms.`; a pure rename would
// have prefixed the leak with a new product name and shipped it.
//
// HOW IT ASSERTS, and why it is not a banned-literal list. It DERIVES, from
// TheiaService.sys.mjs at check time:
//
//   1. the USER_MESSAGE table's declared keys and their string values;
//   2. every `USER_MESSAGE.<key>` reference in the file;
//   3. every `message:` property value in the file;
//   4. every `this._showError(...)` call's first argument, checked against a
//      set of message-bearing bindings ALSO derived from the file -- see the
//      note on rule (4) below.
//
// and then compares those derived sets. A hand-kept list of forbidden strings
// can only ever agree with the tree it was written from; these comparisons go
// red on an ADDED leak, an ad-hoc literal that bypasses the table, a STALE
// declared-but-unreferenced entry, and a REMOVED entry that is still
// referenced. The leak test itself is a SHAPE test -- an all-caps underscored
// token of four or more characters, or a dotted key of three or more segments
// -- so a failure path added next year is covered without touching this file.
//
// RULE (4), and why 01-14 rewrote it. It used to accept any `<x>.message`
// argument, on the stated grounds that checks (1)-(3) "prove" such a value is
// table-derived. They do not: they constrain `message:` PROPERTY DECLARATION
// sites and say nothing about the identifier bound at a CALL site. A caught
// exception's `.message` -- the runtime's own text, carrying paths, ports and
// errno strings, and the exact shape this rule exists to catch -- matched that
// alternative and sailed through into full-screen user-facing copy. Rule (4)
// now binds to `messageBearingBindings()`, a set DERIVED from the file under
// test; every other `<x>.message` is rejected by name. A rename of a binding,
// an added call site or a removed one changes what the checker COMPUTES rather
// than requiring this file to be edited.
//
// RULE (4) therefore checks TWO things. That every ENUMERATED call site takes a
// table-derived message (01-14), and -- since 01-16, CR-03 -- that the
// ENUMERATION ITSELF IS COMPLETE: the number of `_showError(` call sites the
// enumeration regex parsed is compared against a second, independently derived
// total, and a disagreement is a loud failure. An accept rule applied to a
// silently incomplete set of sites can go green on the one site it never saw.
//
// Static on purpose: it reads the source, needs no build, no browser and no
// display, and therefore belongs in --quick where a leak costs seconds rather
// than a forty-minute rebuild. Its runtime counterpart is verify-platform.sh's
// shell-diagnostics-rows-populated, which drives two real failure paths and
// asserts the painted message is one of the values derived here.
//
// 14-02 (GUI-07) modes-copy extension. The same no-internal-identifier shape
// test (all-caps tokens, dotted keys) over the new modes sources, with two
// deliberate deltas from the shell rules: (a) a template may interpolate a
// SINGLE plain identifier -- ${name} is a mode name rendered as text, never
// an exception string, while a dotted or complex interpolation stays red;
// (b) the chrome-bar widget scope pins its copy by set equality only, since
// that copy predates this plan: additions, removals, and drifts go red
// without re-litigating its wording. Enumerated sites: label:, prompt:,
// placeHolder:, flash(...) call args, the widget's title=/aria-label=/
// placeholder= attrs plus its JSX text nodes plus .label/.caption
// assignments. (15-03 retired the organising placeholder: its widgetName:
// and textContent sites left with the file, and the panorama copy gate now
// owns the organising strings.) Command ids, element ids, class names,
// and roles are not user-facing sites and are excluded by construction, not
// by exemption list -- a user-facing string added at a NEW site is the known
// residual hole, stated here rather than silently assumed covered.
//
// Usage:
//   node scripts/verify-shell-error-copy.mjs [--file <path>]
//   node scripts/verify-shell-error-copy.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants every fault in the FAULTS array below
// into a temporary copy and requires each to go red naming the drift; a check
// that can only go green is not a check.

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { resolveConfig } from "./generate.mjs";

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(SELF), "..");
const DEFAULT_TARGET = join(REPO_ROOT, "powerbrowser/shell/TheiaService.sys.mjs");

// An ALL-CAPS underscored token (POWERBROWSER_BACKEND_READY, THEIA_CONFIG_DIR),
// four characters or more so a bare "A_B" in prose is not a false positive.
const ALL_CAPS_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// A dotted key of three or more segments (powerbrowser.sidecar.backendMain).
// Three, not two, so "Node.js" and a sentence-ending "...js." stay legal.
const DOTTED_KEY = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){2,}\b/g;

const failures = [];
const fail = (msg) => failures.push(msg);

/**
 * Removes block comments and whole-line `//` comments so the derivations below
 * see code only. Trailing `//` comments are deliberately NOT stripped: this
 * file contains `http://127.0.0.1` and `https://open-vsx.org` inside real
 * strings, and a naive strip-to-end-of-line would mangle them into silence.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function parseUserMessageTable(src) {
  const block = src.match(/const USER_MESSAGE = \{\n([\s\S]*?)\n\};/);
  if (!block) {
    return null;
  }
  const entries = new Map();
  const entryRe = /^\s*([A-Za-z_$][\w$]*):\s*("(?:[^"\\]|\\.)*")\s*,\s*$/gm;
  let m;
  while ((m = entryRe.exec(block[1])) !== null) {
    entries.set(m[1], JSON.parse(m[2]));
  }
  // WR-02 (01-16). A second, deliberately dumber count of what the table
  // DECLARES: every line at the table's own depth-1 indentation whose first
  // token is an identifier followed by a colon. `entryRe` above accepts only a
  // double-quoted, single-line, comma-terminated string, so an entry written as
  // a template literal, with single quotes, as a concatenation, or wrapped over
  // two lines is dropped with NO error. The consequences split badly: a
  // REFERENCED unparsed key still goes red at check (2), but a
  // DECLARED-AND-UNREFERENCED one is invisible to check (1), which never
  // leak-scans it, and to check (3), which iterates the parsed entries. That is
  // a user-facing string silently escaping the one gate that scans user-facing
  // strings -- the same silent-drop class as CR-03, in another function.
  //
  // 01-18 (WR-02). This count deliberately does NOT reuse `entryRe`'s key
  // pattern. It used to, and that made it not a cross-check at all: every key
  // form the parser could not read the counter could not see either, so both
  // were zero for the same entry and the guard below never fired. A quoted key
  // -- legal JavaScript, and the likeliest form a copy edit reaches for -- was
  // declared, never leak-scanned, and passed. Any line at the table's own
  // depth-1 indentation that bears a colon at all counts here, whatever its key
  // form, so a quoted, numeric or computed member is SEEN even though the parser
  // above cannot read it. (A depth-1 spread element carries no colon and is
  // still invisible to both; that is a smaller hole, and closing it needs a
  // parser rather than a second pattern.)
  const indent = block[1].match(/^[ \t]+/)?.[0] ?? "  ";
  const declared = [...block[1].matchAll(new RegExp(`^${indent}\\S.*:`, "gm"))].length;
  return { entries, declared, raw: block[0] };
}

/**
 * The given object-literal body with every span nested inside a `{` or a `[`
 * removed, so a property test applies at depth 0 only.
 *
 * WR-01 (01-16). `messageBearingBindings` shape (a) used to test for `message:`
 * anywhere in the body at any nesting depth, so a `message:` buried in a
 * sub-object or an array element marked the OUTER binding as message-bearing --
 * and `<binding>.message` is `undefined` at runtime in exactly that case. A
 * binding whose `.message` would paint nothing must not be waved through here;
 * the doc comment below already says so about `message: null`, and the nested
 * case is the same defect arriving by another route.
 */
function depthZeroOnly(body) {
  let depth = 0;
  let out = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

/**
 * The text between the brace at `open` and its match, or null if unbalanced.
 * The source is comment-stripped before it gets here, and this file's only
 * brace-bearing strings are template interpolations, whose braces are balanced.
 */
function braceBody(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") {
      depth += 1;
    } else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return src.slice(open + 1, i);
      }
    }
  }
  return null;
}

/**
 * Every `catch (<name>)` binding name in the file under test. Used ONLY to pick
 * which rejection message rule (4) prints -- it never widens the accept set.
 *
 * ponytail: file-scoped, not block-scoped. A caught exception's identifier is a
 * raw exception object wherever it appears in this file, so block-scope
 * tracking would buy a parser this check does not need. Upgrade to block scope
 * only if a real false positive appears -- i.e. a binding that is a catch
 * parameter in one method and a legitimate message-bearing binding in another.
 */
function catchParamNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * The set of local binding names whose value is known to carry a
 * table-validated `message:` field. Two initializer shapes, both live in
 * TheiaService.sys.mjs:
 *
 *   (a) an object literal containing a `message:` property (`failed`);
 *   (b) a `this.<method>(` call, optionally awaited, where <method>'s body has
 *       at least one `return` object literal whose `message:` is set to a
 *       DECLARED `USER_MESSAGE.<key>` (`resolved`, `result`).
 *
 * Shape (a) does not re-validate the property value it finds, and that short
 * form is sound only because check (2) above already fails the whole run if ANY
 * `message:` site in this file is something other than `USER_MESSAGE.<declared
 * key>` or `null`. Weakening check (2) would hollow this out from underneath --
 * shape (a) would then accept a binding holding an ad-hoc string.
 *
 * A method whose every `return` sets `message: null` does NOT qualify: a
 * binding whose `.message` is always null would paint nothing, which is a
 * different defect and must not be waved through here.
 */
function messageBearingBindings(src, table) {
  const bearing = new Set();

  // (a) object-literal initializer.
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g)) {
    const body = braceBody(src, m.index + m[0].length - 1);
    if (body !== null && /(?:^|[^\w.$])message:/.test(depthZeroOnly(body))) {
      bearing.add(m[1]);
    }
  }

  // (b) `this.<method>()` initializer, resolved through the method's own body.
  const declared = new Set(table.entries.keys());
  for (const m of src.matchAll(
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?this\.([A-Za-z_$][\w$]*)\(/g
  )) {
    const [, binding, method] = m;
    const decl = src.match(
      new RegExp(`^\\s*(?:async\\s+)?${method}\\s*\\([^)]*\\)\\s*\\{`, "m")
    );
    if (!decl) {
      continue;
    }
    const body = braceBody(src, decl.index + decl[0].length - 1);
    if (body === null) {
      continue;
    }
    for (const ret of body.matchAll(/return\s*\{/g)) {
      const literal = braceBody(body, ret.index + ret[0].length - 1);
      if (literal === null) {
        continue;
      }
      const prop = literal.match(/(?:^|[^\w.$])message:\s*USER_MESSAGE\.([A-Za-z_$][\w$]*)/);
      if (prop && declared.has(prop[1])) {
        bearing.add(binding);
        break;
      }
    }
  }

  return bearing;
}

function check(targetPath) {
  let raw;
  try {
    raw = readFileSync(targetPath, "utf8");
  } catch (err) {
    fail(`cannot read ${targetPath}: ${err.message}`);
    return;
  }
  const src = stripComments(raw);

  const table = parseUserMessageTable(src);
  if (!table) {
    fail(
      "no `const USER_MESSAGE = { ... };` table found -- the user-facing error " +
        "copy has no single derivable source, so nothing here can be checked"
    );
    return;
  }
  if (table.entries.size === 0) {
    fail("the USER_MESSAGE table is empty -- a table with no strings asserts nothing");
    return;
  }
  if (table.declared !== table.entries.size) {
    // WR-02 (01-16). Return, like the two guards above: with an incomplete
    // table, checks (1) through (4) are all reasoning about a partial set and
    // their output would be misleading noise on top of the real failure.
    fail(
      `the USER_MESSAGE table declares ${table.declared} entries but only ${table.entries.size} ` +
        `could be parsed -- a declared entry this parser cannot read is a user-facing string that ` +
        `is never leak-scanned. Write it as a double-quoted, single-line string ending in a comma`
    );
    return;
  }

  // --- (1) every declared message is clean -------------------------------
  for (const [key, value] of table.entries) {
    if (!value.includes("PowerBrowser")) {
      fail(`USER_MESSAGE.${key} does not name the product ("PowerBrowser"): ${JSON.stringify(value)}`);
    }
    for (const hit of value.match(ALL_CAPS_TOKEN) ?? []) {
      if (hit.length >= 4) {
        fail(
          `USER_MESSAGE.${key} leaks the internal identifier "${hit}" (all-caps underscored token) ` +
            `into user-facing error text -- it belongs in a diagnostics field row`
        );
      }
    }
    for (const hit of value.match(DOTTED_KEY) ?? []) {
      fail(
        `USER_MESSAGE.${key} leaks the internal identifier "${hit}" (dotted multi-segment key) ` +
          `into user-facing error text -- it belongs in a diagnostics field row`
      );
    }
    if (value.includes("${")) {
      fail(
        `USER_MESSAGE.${key} interpolates a runtime value -- a user-facing sentence must be a ` +
          `fixed literal; the varying part is a diagnostics field row`
      );
    }
  }

  // --- (2) every `message:` site resolves back to the table ---------------
  const referenced = new Set();
  const outsideTable = src.replace(table.raw, "");
  for (const m of outsideTable.matchAll(/USER_MESSAGE\.([A-Za-z_$][\w$]*)/g)) {
    referenced.add(m[1]);
  }

  for (const m of src.matchAll(/(?:^|[^\w.$])message:\s*([^,\n]+)/g)) {
    const expr = m[1].trim();
    if (expr === "null") {
      continue;
    }
    if (!/^USER_MESSAGE\.[A-Za-z_$][\w$]*$/.test(expr)) {
      fail(
        `a \`message:\` site is set to \`${expr}\`, which is not a USER_MESSAGE entry -- ` +
          `an ad-hoc string bypasses the copywriting contract and its checks entirely`
      );
      continue;
    }
    const key = expr.slice("USER_MESSAGE.".length);
    if (!table.entries.has(key)) {
      fail(`a \`message:\` site references USER_MESSAGE.${key}, which the table does not declare`);
    }
  }

  // --- (3) declared and referenced key sets must be equal -----------------
  for (const key of table.entries.keys()) {
    if (!referenced.has(key)) {
      fail(
        `USER_MESSAGE.${key} is declared but never referenced -- a stale entry drifts out of ` +
          `sync with the copy that actually paints`
      );
    }
  }
  for (const key of referenced) {
    if (!table.entries.has(key)) {
      fail(`USER_MESSAGE.${key} is referenced but not declared -- it resolves to undefined at runtime`);
    }
  }

  // --- (4) every _showError() call takes a table-derived message ----------
  // The accept set is DERIVED from this same file (see messageBearingBindings);
  // nothing below is a hand-kept list of identifier names.
  const bearing = messageBearingBindings(src, table);
  const caught = catchParamNames(src);

  // 01-16 (CR-03). 01-14 derived the ACCEPT set from the tree but left the step
  // BEFORE it -- the set of SITES that accept rule is applied to -- as an
  // unproven regex. The enumeration pattern below requires a literal `this.`
  // receiver AND a comma after the first argument; a call site matching neither
  // is not rejected, it is never seen. The only completeness guard was
  // `callSites === 0`, which fires only when EVERY site disappears, so five
  // sites parsed out of six present was indistinguishable from a clean run.
  //
  // 01-18 (CR-01). 01-16's first attempt at that completeness guard compared
  // two COUNTS: every textual `_showError(` minus a `definitions` term computed
  // as `/^\s*_showError\s*\(/gm`, against the number of sites the enumeration
  // parsed. That subtracted term is a hand-written assumption -- "a line-initial
  // `_showError(` is the method definition" -- and a receiverless CALL written
  // at the start of a line satisfies it just as well. Appending one raised the
  // raw total by 1 AND `definitions` by 1, so the difference did not move while
  // the parsed count also did not move: the two errors cancelled exactly, the
  // assertion agreed with itself, and a caught exception's `.message` reached
  // the error layer on a green run. A count can cancel; a POSITION cannot.
  //
  // So compare position SETS. Every textual `_showError(` start offset must be
  // either the one definition or a site the enumeration below actually parsed.
  // The definition is identified by the one thing that distinguishes it -- a
  // body follows its parameter list -- and the file is required to have exactly
  // one, which removes the line-initial assumption entirely.
  //
  // Both run over `src`, the comment-stripped source every other derivation in
  // this function uses: `raw` still holds eight doc-comment mentions of
  // _showError, and counting those would make this permanently red.
  //
  // The remedy for a mismatch is to write the call as
  // `this._showError(<message>, ...)`, or to teach this check the new shape --
  // NOT to widen the enumeration regex until today's sites match again. A wider
  // pattern is only a larger unproven expectation and would still be silent on
  // the next shape nobody thought of.
  //
  // 01-18 (WR-04). Every derivation in THIS block runs over `codeOnly` rather
  // than `src`. `stripComments` deliberately leaves trailing `//` comments in
  // place, because this file holds `http://127.0.0.1` and `https://open-vsx.org`
  // inside real strings and a naive strip would mangle them; the consequence was
  // that one trailing comment mentioning `_showError(` -- a doc edit, not a code
  // edit -- turned the COMMIT GATE red with a remedy line telling the operator
  // not to widen the pattern. A gate that goes red on a comment and forbids its
  // own fix is a gate people route around. Trailing comments are safe to drop
  // here specifically: the guard requires whitespace immediately before the
  // `//`, which `http://` and `https://` do not have.
  const codeOnly = src.replace(/(^|[^:\S])\/\/.*$/gm, "$1");
  const allSites = [...codeOnly.matchAll(/_showError\s*\(/g)].map((m) => m.index);
  const defs = [...codeOnly.matchAll(/_showError\s*\([^)]*\)\s*\{/g)].map((m) => m.index);
  if (defs.length !== 1) {
    fail(
      `${defs.length} \`_showError(...) {\` definition(s) found -- this check assumes exactly one; ` +
        `with none it is asserting nothing, with two it cannot say which sites belong to which`
    );
  }

  // 01-18 (WR-01). Everything above keys on the literal text `_showError(`.
  // `this._showError.bind(this)` writes `_showError.bind(` -- the parenthesis is
  // not adjacent -- so an aliased method is in NEITHER the site set nor the
  // parsed set, the position sets agree, and every call made through the alias
  // is invisible. Rather than trying to follow the alias (which is a dataflow
  // problem, not a regex one), reject the escape: any textual `_showError` that
  // is not immediately being called is a reference that removes the method from
  // this check's reach.
  const escapes = [...codeOnly.matchAll(/_showError(?!\s*\()/g)].map((m) => m.index);
  if (escapes.length !== 0) {
    fail(
      `\`_showError\` is referenced without being called (offset(s) ${escapes.join(", ")}) -- an ` +
        `alias, a \`.bind\`, or a property read hands the error layer to a call site this check ` +
        `cannot see. Call it directly as \`this._showError(<message>, ...)\``
    );
  }

  // The offsets the enumeration below actually reached, recorded BY the
  // enumeration rather than by a second pattern that guesses what it reaches.
  const parsed = new Set();
  let callSites = 0;
  for (const m of codeOnly.matchAll(/this\._showError\(\s*([^,]+?)\s*,/g)) {
    callSites += 1;
    parsed.add(m.index + "this.".length);
    const arg = m[1].trim();
    if (/^USER_MESSAGE\.[A-Za-z_$][\w$]*$/.test(arg)) {
      continue;
    }
    const dotted = arg.match(/^([A-Za-z_$][\w$]*)\.message$/);
    if (!dotted) {
      fail(
        `this._showError() is called with \`${arg}\` as its message -- only a USER_MESSAGE entry ` +
          `or a message-bearing binding's \`.message\` may paint the error layer`
      );
      continue;
    }
    const name = dotted[1];
    if (caught.has(name)) {
      fail(
        `this._showError() is called with \`${arg}\` as its message, and \`${name}\` is a ` +
          `\`catch\` parameter in this file -- a caught exception's \`.message\` is a raw exception ` +
          `string written by the runtime, carrying paths, ports and errno text. It belongs in a ` +
          `diagnostics field row, never in the user-facing error layer`
      );
      continue;
    }
    if (!bearing.has(name)) {
      fail(
        `this._showError() is called with \`${arg}\` as its message, but \`${name}\` is not a ` +
          `message-bearing binding -- no object literal and no \`this.<method>()\` return in this ` +
          `file gives \`${name}\` a table-validated \`message:\` field, so nothing here proves what ` +
          `it would paint`
      );
    }
  }
  if (callSites === 0) {
    fail(
      "no `this._showError(` call site found -- either the error layer is unreachable or this " +
        "check has stopped matching the code, and either way it is asserting nothing"
    );
  }
  const unparsed = allSites.filter((i) => !defs.includes(i) && !parsed.has(i));
  if (unparsed.length !== 0) {
    fail(
      `${unparsed.length} \`_showError(\` call site(s) at offset(s) ${unparsed.join(", ")} were not ` +
        `parsed -- a call site this check cannot read is a call site it is not checking, and rule ` +
        `(4) went green on sites it never saw. Write the call as ` +
        `\`this._showError(<message>, ...)\`, or teach this check the new shape; do not widen the ` +
        `enumeration pattern until the offsets happen to agree`
    );
  }
}

// ---------------------------------------------------------------------------
// 14-02 modes-copy extension (GUI-07). Pure functions of source strings so
// the self-test below can plant faults in memory.
// ---------------------------------------------------------------------------

const MODES_SERVICE_REL = "theia/extensions/modes/src/browser/mode-service.ts";
const MODES_COMMANDS_REL = "theia/extensions/modes/src/browser/modes-commands.ts";
const MODES_WIDGET_REL = "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx";
/** The pill's sources (30-01 D-04 move); their copy is pinned with the widget's. */
const ADDRESS_BAR_DIR_REL = "theia/extensions/chrome-bar/src/browser/address-bar/";
const ADDRESS_BAR_REL = `${ADDRESS_BAR_DIR_REL}address-bar.tsx`;
const NAV_COPY_REL = "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts";
const SHORTCUT_COPY_REL = "theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts";

/**
 * The declared modes copy contract, with ${...} interpolations normalized
 * to ${name} (the interpolation identifiers themselves are checked
 * separately against the plain-identifier rule). The ONE hand-kept list in
 * this section: editing it is how a deliberate copy change is made.
 */
const EXPECTED_MODES_COPY = new Set([
  "Save as Mode",
  "Mode name",
  "Give the mode a name — type a name and choose Save as Mode.",
  "A mode with this name already exists. Choose a different name.",
  "PowerBrowser could not save this mode. Your panels are unchanged — try again.",
  'Mode "${name}" saved.',
  "PowerBrowser couldn't load the \"${name}\" mode. Browsing is shown instead.",
]);

/**
 * The widget's grandfathered copy, pinned by set equality: any addition,
 * removal, or drift goes red naming it, with no wording judgment here.
 */
const EXPECTED_WIDGET_COPY = new Set([
  "Back",
  "Forward",
  "Reload",
  "Stop",
  "Home",
  "New Tab",
  "Suggestions",
  "Mode",
  "Chrome Bar",
]);

/**
 * Phase 27 chrome-bar copy (chrome-bar-copy.ts), interpolations normalized to
 * ${name}. Hand-kept on purpose, like EXPECTED_MODES_COPY: editing it is how a
 * deliberate copy change is made. The product is never a literal here -- the
 * subject is the configured application name, interpolated.
 */
const EXPECTED_NAV_COPY = new Set([
  "The browser",
  "Untitled page",
  "Downloads",
  "${name} downloads",
  "No downloads yet.",
  "Files you download appear here.",
  "Open",
  "Show in folder",
  "Cancel",
  "Retry",
  "${name}% — ${name}",
  "Failed — Retry",
  "Find in page",
  "${name} of ${name}",
  "Phrase not found",
  "Highlight all",
  "Match case",
  "Whole words",
  "Next match (F3)",
  "Previous match (Shift+F3)",
  "Close find bar (Esc)",
  "${name}%",
  "Zoom level — select to reset to 100%",
  "Zoom in (Ctrl++)",
  "Zoom out (Ctrl+−)",
  "Reset zoom (Ctrl+0)",
  "Mute tab",
  "Unmute tab",
  "Reader view",
  "Exit reader view",
  "Reader view isn't available for this page",
  "View page source (Ctrl+U)",
  "${name} couldn't open the print dialog. Press Ctrl+P to try again.",
  "Save page as",
  "${name} couldn't save that page. Choose a different place and try again.",
  "${name} can't open that link here. Choose Copy Link to copy it instead.",
  "${name} couldn't read this tab's history. Use Back and Forward to move one page at a time.",
  "Show the Home button next to Reload.",
  "${name} can't open your home page. Press Enter to change it in Settings.",
  "The page the Home button and Alt+Home open, such as https://example.com. Leave it empty to open an empty page.",
  "${name} can't search right now. Type a full address, such as https://example.com, and press Enter.",
  "Search or enter address",
  "Search with ${name} or enter address",
  "The search engine the address bar uses when what you type is not an address.",
  "Visit",
  "Search with ${name}",
  "Enter opens · Alt+Enter opens in a new tab · Esc closes suggestions",
  "${name} couldn't open that address. Press Enter to try again.",
  "${name} couldn't load suggestions. Press Enter to go to what you typed.",
  "Show suggestions from your search engine while you type in the address bar. What you type is sent to the search engine.",
  "This time, search with:",
  "Switch to Tab",
  "${name} couldn't remove that page from your history. Press Shift+Delete to try again.",
  "Cut",
  "Copy",
  "Paste",
  "Paste & Go",
  "Select All",
  "${name} couldn't read the clipboard. Press Ctrl+V to paste, then press Enter.",
  "Command centre",
  "Bookmarks",
  "Tabs",
  "History",
  "Actions",
  "Address",
  "Search Settings",
  "${name}, choose a mode",
  "Modes",
  "Return to ${name}",
  "Enter searches · Alt+Enter searches in a new tab · Esc closes suggestions",
  "Search tabs",
  "Search bookmarks",
  "Search history",
  "Search actions",
  "No other open tabs. Type an address, or words to search with ${name}.",
  "No bookmarks yet. Type an address, or words to search with ${name}.",
  "No history yet. Type an address, or words to search with ${name}.",
  "No matching tabs.",
  "No matching bookmarks.",
  "No matching history.",
  "No matching actions. Press Esc to go back.",
  "${name} couldn't load your bookmarks. Keep typing to try again.",
  "${name} couldn't load your history. Keep typing to try again.",
  "Enter switches to the tab · Esc closes suggestions",
  "Enter runs the action · Esc closes suggestions",
  "No recent files. Type a file name, or > to run a command.",
  "No matching results. Type ? to see what you can search.",
  "${name} couldn't load these results. Keep typing to try again.",
  "Enter opens · Type ? for more · ${name} enters an address · Esc closes",
  "Go to ${name}",
  "Connection secure",
  "Not Secure",
  "This page has a security problem",
  "This page is served from this device",
  "Show site information for ${name}",
  "Connection secure, show site information for ${name}",
  "Not Secure, show site information for ${name}",
  "Security problem, show site information for ${name}",
  "Local page, show site information for ${name}",
  "Connection not secure",
  "There is a security problem with ${name}",
  "Local page on ${name}",
  "${name} can't show site information for this page. Try reloading the page.",
  "Permissions",
  "No special permissions set for this site",
  "Allowed",
  "Blocked",
  "Block sounds",
  "Block all",
  "Use default",
  "Site permission",
  "${name} for ${name}: ${name}",
  "Site permissions set: ${name}",
  "+${name}",
  "Certificate",
  "Issued to: ${name}",
  "Issued by: ${name}",
  "Valid: ${name}",
  "${name} to ${name}",
  "Clear cookies and site data…",
  "Clear data for ${name}?",
  "This clears cookies and site data for ${name} and all of its subdomains.",
  "Closed tabs for ${name} are removed too.",
  "You stay signed in to ${name}.",
  "Clear",
  "Cancel",
  "${name} couldn't clear data for this site. Try again from the site information panel.",
  "No trackers detected on this page",
  "1 tracker blocked",
  "${name} trackers blocked",
  "Turn off protection for this site",
  "Turn protection back on",
  "Tracking protection is off for this site",
  "Application menu",
  "New Tab",
  "Settings",
  "Passwords",
  "Add-ons",
  "Help",
  "Quit ${name} (Ctrl+Q)",
  "${name} (Coming soon)",
]);

/**
 * NAV-05 tooltip parts (chrome-bar-shortcuts.ts): the `label` of every
 * PAGE_SHORTCUTS row and the `verb` of every BUTTON_SHORTCUTS entry. Hand-kept
 * like EXPECTED_NAV_COPY: editing it is how a deliberate copy change is made.
 */
const EXPECTED_SHORTCUT_COPY = new Set([
  "Esc", "Ctrl+T", "Ctrl+W", "Ctrl+R", "F5", "Ctrl+Shift+R", "Ctrl+F5",
  "Alt+Left Arrow", "Alt+Right Arrow", "Alt+Home", "Alt+D", "Ctrl+L",
  "Ctrl+Tab", "Ctrl+Shift+Tab", "Ctrl+Page Down", "Ctrl+Page Up",
  "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
  "F6", "Shift+F6",
  "Ctrl+F", "F3", "Shift+F3", "Ctrl+=", "Ctrl++", "Ctrl+-", "Ctrl+0", "Ctrl+M", "Ctrl+P", "Ctrl+S", "Ctrl+U", "F12",
  "Back", "Forward", "Reload", "Stop", "Home", "New Tab",
]);

/**
 * The brand the configured-name ruling bans from chrome-bar copy (BAR-14):
 * configuration.toml's identity.display_name, derived at check time, so a
 * rebrand bans its own name. Empty when the manifest does not resolve; the
 * brand check then fails as a broken instrument.
 */
function deriveBrand() {
  try {
    return String(resolveConfig().config?.identity?.display_name ?? "").trim();
  } catch {
    return "";
  }
}
const NAV_BRAND_LITERAL = deriveBrand();

/** Every chrome-bar source the brand ban covers. */
const CHROME_BAR_SRC_DIR = "theia/extensions/chrome-bar/src";

function chromeBarSourceRels(dir = CHROME_BAR_SRC_DIR) {
  const out = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...chromeBarSourceRels(rel));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Comments blanked with their line breaks kept, so a hit reports its real line. */
function blankComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * BAR-14: no chrome-bar source names the configured application as a literal
 * (comments excepted); a message that names the product reads appSubject().
 */
function checkChromeBarBrand(sources) {
  if (!NAV_BRAND_LITERAL) {
    return ["brand: configuration.toml identity.display_name did not resolve to a name -- the brand ban has nothing to ban (broken instrument)"];
  }
  const rels = Object.keys(sources).filter((rel) => rel.startsWith(`${CHROME_BAR_SRC_DIR}/`));
  if (rels.length === 0) {
    return [`brand: derived ZERO chrome-bar sources under ${CHROME_BAR_SRC_DIR} -- the ban covers nothing (broken instrument)`];
  }
  const out = [];
  for (const rel of rels) {
    blankComments(sources[rel]).split("\n").forEach((line, i) => {
      if (line.includes(NAV_BRAND_LITERAL)) {
        out.push(
          `brand: ${rel}:${i + 1} spells the configured application name ${JSON.stringify(NAV_BRAND_LITERAL)} as a literal -- ` +
            `chrome-bar copy names the configured application name through appSubject()`
        );
      }
    });
  }
  return out;
}

function normalizeInterp(value) {
  return value.replace(/\$\{[^}]+\}/g, "${name}");
}

/** Raw user-facing strings from the modes sources (interpolations intact). */
function deriveModesCopyRaw(sources) {
  const out = [];
  const commandsSrc = sources[MODES_COMMANDS_REL] ?? "";
  const serviceSrc = sources[MODES_SERVICE_REL] ?? "";
  // A template literal below spans the backtick alternative; it is written
  // with literal backticks, matching the same characters tsc parses.
  const flashRe = /flash\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')/g;
  for (const m of commandsSrc.matchAll(/label:\s*'([^']+)'/g)) {
    out.push(m[1]);
  }
  for (const m of serviceSrc.matchAll(/prompt:\s*'([^']+)'/g)) {
    out.push(m[1]);
  }
  for (const m of serviceSrc.matchAll(/placeHolder:\s*'([^']+)'/g)) {
    out.push(m[1]);
  }
  for (const m of serviceSrc.matchAll(flashRe)) {
    out.push(m[1].slice(1, -1));
  }
  return out;
}

/** User-facing strings from the widget's enumerated attribute and text sites. */
function deriveWidgetCopy(widgetSrc) {
  const out = new Set();
  const attrRe = /(?:title|aria-label|placeholder)=\{?((?:"(?:[^"\\\n]|\\.)*")|(?:'(?:[^'\\\n]|\\.)*')|(?:`(?:[^`\\]|\\.)*`))\}?/g;
  for (const m of widgetSrc.matchAll(attrRe)) {
    out.add(m[1].slice(1, -1));
  }
  // A braced expression (a ternary such as Reload/Stop) contributes every
  // quoted literal inside its braces, so no branch of it hides copy from the pin.
  const literalRe = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of widgetSrc.matchAll(/(?:title|aria-label|placeholder)=\{([^{}]*)\}/g)) {
    for (const lit of m[1].matchAll(literalRe)) {
      out.add(lit[0].slice(1, -1));
    }
  }
  for (const m of widgetSrc.matchAll(/[^=]>([^<>{}\n]+?)</g)) {
    const text = m[1].trim();
    if (text) {
      out.add(text);
    }
  }
  for (const m of widgetSrc.matchAll(/\.(?:label|caption)\s*=\s*'([^']+)'/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Raw literals inside the `CHROME_BAR_COPY = Object.freeze({ ... })` object
 * only: imports and helper code are not copy. Null when the object is gone.
 */
function deriveNavCopyRaw(src) {
  const code = stripComments(src);
  const at = code.indexOf("CHROME_BAR_COPY = Object.freeze({");
  if (at < 0) {
    return null;
  }
  const body = braceBody(code, code.indexOf("{", at)) ?? "";
  // A quoted property key (30-02: the modeLabels keys are mode ids) is not copy; its value still is.
  return [...body.matchAll(/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g)]
    .filter((m) => !(/[{,]\s*$/.test(body.slice(0, m.index)) && /^\s*:/.test(body.slice(m.index + m[0].length))))
    .map((m) => m[0].slice(1, -1));
}

/** The internal-identifier rules every copy surface shares. */
function leakFailures(surface, value) {
  const out = [];
  for (const hit of value.match(ALL_CAPS_TOKEN) ?? []) {
    out.push(
      `${surface} ${JSON.stringify(value)} leaks the internal identifier "${hit}" (all-caps underscored token) ` +
        `into user-facing text -- it belongs in a diagnostics field row`
    );
  }
  for (const hit of value.match(DOTTED_KEY) ?? []) {
    out.push(
      `${surface} ${JSON.stringify(value)} leaks the internal identifier "${hit}" (dotted multi-segment key) ` +
        `into user-facing text -- it belongs in a diagnostics field row`
    );
  }
  for (const m of value.matchAll(/\$\{([^}]+)\}/g)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(m[1])) {
      out.push(
        `${surface} ${JSON.stringify(value)} interpolates \`${m[0]}\` -- only a single plain identifier ` +
          `rendered as text may interpolate; a dotted or complex expression carries runtime internals`
      );
    }
  }
  return out;
}

/** `label` literals of PAGE_SHORTCUTS and `verb` literals of BUTTON_SHORTCUTS; null when either table is gone. */
function deriveShortcutCopyRaw(src) {
  const code = stripComments(src);
  const tables = [
    [/PAGE_SHORTCUTS\b[^=]*=\s*\[([\s\S]*?)\n\];/, /\blabel:\s*'((?:[^'\\\n]|\\.)*)'/g],
    [/BUTTON_SHORTCUTS\b[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/, /\bverb:\s*'((?:[^'\\\n]|\\.)*)'/g],
  ];
  const out = [];
  for (const [table, field] of tables) {
    const body = table.exec(code)?.[1];
    if (!body) {
      return null;
    }
    out.push(...[...body.matchAll(field)].map((m) => m[1]));
  }
  return out;
}

/** @returns {string[]} failure messages for the chrome-bar-shortcuts.ts surface. */
function checkShortcutCopy(src) {
  const raw = deriveShortcutCopyRaw(src);
  if (!raw || raw.length === 0) {
    return [`shortcut copy: derived ZERO strings from PAGE_SHORTCUTS and BUTTON_SHORTCUTS in ${SHORTCUT_COPY_REL} -- a table is gone or empty, so this comparison proves nothing`];
  }
  const out = [];
  const derived = new Set(raw);
  for (const value of derived) {
    if (!EXPECTED_SHORTCUT_COPY.has(value)) {
      out.push(`shortcut copy: string NOT in EXPECTED_SHORTCUT_COPY (unreviewed tooltip copy): ${JSON.stringify(value)}`);
    }
    if (value.includes(NAV_BRAND_LITERAL)) {
      out.push(`shortcut copy ${JSON.stringify(value)} spells the product name as a literal -- chrome-bar copy names the configured application name, interpolated`);
    }
    out.push(...leakFailures("shortcut copy", value));
  }
  for (const value of EXPECTED_SHORTCUT_COPY) {
    if (!derived.has(value)) {
      out.push(`shortcut copy: EXPECTED_SHORTCUT_COPY string is GONE (drifted or reworded tooltip copy): ${JSON.stringify(value)}`);
    }
  }
  return out;
}

/** @returns {string[]} failure messages for the chrome-bar-copy.ts surface. */
function checkNavCopy(src) {
  const raw = deriveNavCopyRaw(src);
  if (!raw || raw.length === 0) {
    return [`nav copy: derived ZERO strings from the CHROME_BAR_COPY object in ${NAV_COPY_REL} -- the object is gone or empty, so this comparison proves nothing`];
  }
  const out = [];
  const normalized = new Set(raw.map(normalizeInterp));
  for (const value of normalized) {
    if (!EXPECTED_NAV_COPY.has(value)) {
      out.push(`nav copy: string NOT in EXPECTED_NAV_COPY (unreviewed chrome-bar copy): ${JSON.stringify(value)}`);
    }
  }
  for (const value of EXPECTED_NAV_COPY) {
    if (!normalized.has(value)) {
      out.push(`nav copy: EXPECTED_NAV_COPY string is GONE (drifted or reworded copy): ${JSON.stringify(value)}`);
    }
  }
  for (const value of new Set(raw)) {
    if (value.includes(NAV_BRAND_LITERAL)) {
      out.push(`nav copy ${JSON.stringify(value)} spells the product name as a literal -- chrome-bar copy names the configured application name, interpolated`);
    }
    out.push(...leakFailures("nav copy", value));
  }
  return out;
}

function readModesSources() {
  const out = {};
  for (const rel of [MODES_SERVICE_REL, MODES_COMMANDS_REL, MODES_WIDGET_REL, NAV_COPY_REL, SHORTCUT_COPY_REL, ...chromeBarSourceRels()]) {
    try {
      out[rel] = readFileSync(join(REPO_ROOT, rel), "utf8");
    } catch {
      out[rel] = "";
    }
  }
  return out;
}

/** @returns {string[]} failure messages -- empty means the copy holds. */
function checkModesCopy(sources) {
  const copyFailures = [];
  const raw = deriveModesCopyRaw(sources);
  if (raw.length === 0) {
    copyFailures.push("modes copy: derived ZERO user-facing strings from the modes sources -- the enumeration matches nothing, so this comparison proves nothing");
    return copyFailures;
  }
  const normalized = new Set(raw.map(normalizeInterp));
  for (const value of normalized) {
    if (!EXPECTED_MODES_COPY.has(value)) {
      copyFailures.push(`modes copy: user-facing string NOT in the declared contract (unreviewed copy): ${JSON.stringify(value)}`);
    }
  }
  for (const value of EXPECTED_MODES_COPY) {
    if (!normalized.has(value)) {
      copyFailures.push(`modes copy: declared contract string is GONE (drifted or reworded copy): ${JSON.stringify(value)}`);
    }
  }
  for (const value of new Set(raw)) {
    copyFailures.push(...leakFailures("modes copy", value));
  }
  copyFailures.push(...checkNavCopy(sources[NAV_COPY_REL] ?? ""));
  copyFailures.push(...checkChromeBarBrand(sources));
  copyFailures.push(...checkShortcutCopy(sources[SHORTCUT_COPY_REL] ?? ""));
  const widgetCopyRels = widgetCopySourceRels(sources);
  const widget = deriveWidgetCopy(widgetCopyRels.map((rel) => sources[rel] ?? "").join("\n"));
  if (widget.size === 0) {
    copyFailures.push("widget copy: derived ZERO user-facing strings from the chrome-bar widget -- the enumeration matches nothing, so this comparison proves nothing");
    return copyFailures;
  }
  for (const value of widget) {
    if (!EXPECTED_WIDGET_COPY.has(value)) {
      copyFailures.push(`widget copy: string NOT in the pinned contract (added or reworded widget copy): ${JSON.stringify(value)}`);
    }
  }
  for (const value of EXPECTED_WIDGET_COPY) {
    if (!widget.has(value)) {
      copyFailures.push(`widget copy: pinned string is GONE (removed or reworded widget copy): ${JSON.stringify(value)}`);
    }
  }
  return copyFailures;
}

/** The widget plus every .tsx under address-bar/, from the sources read (so an absent directory adds nothing). */
function widgetCopySourceRels(sources) {
  return [
    MODES_WIDGET_REL,
    ...Object.keys(sources).filter((rel) => rel.startsWith(ADDRESS_BAR_DIR_REL) && rel.endsWith(".tsx")).sort(),
  ];
}

const MODES_COPY_FAULTS = [
  {
    name: "a literal aria string in a nested address-bar source bypasses the pinned copy",
    apply: (sources) => ({
      ...sources,
      [`${ADDRESS_BAR_DIR_REL}planted.tsx`]: "export const planted = <div aria-label='Planted pill copy' />;\n",
    }),
    expect: "Planted pill copy",
  },
  {
    name: "all-caps sentinel leaked into the fallback notice",
    apply: (sources) => ({
      ...sources,
      [MODES_SERVICE_REL]: sources[MODES_SERVICE_REL].replace(
        "couldn't load the",
        "could not see POWERBROWSER_MODES_JSON in"
      ),
    }),
    expect: "POWERBROWSER_MODES_JSON",
  },
  {
    name: "dotted store key leaked into the saved confirmation",
    apply: (sources) => ({
      ...sources,
      [MODES_SERVICE_REL]: sources[MODES_SERVICE_REL].replace(
        'Mode "${name}" saved.',
        'Mode "${name}" saved to powerbrowser.modes.store.'
      ),
    }),
    expect: "powerbrowser.modes.store",
  },
  {
    name: "save label drifted from the contracted copy",
    apply: (sources) => ({
      ...sources,
      [MODES_COMMANDS_REL]: sources[MODES_COMMANDS_REL].replace(
        "label: 'Save as Mode',",
        "label: 'Save Mode',"
      ),
    }),
    // The drifted value goes red as surplus; 'Save as Mode' itself still
    // derives from the save prompt, and the switch-invariant gate pins the
    // command label verbatim on top of this.
    expect: "Save Mode",
  },
  {
    name: "new widget aria string bypasses the pinned copy",
    apply: (sources) => ({
      ...sources,
      [MODES_WIDGET_REL]: sources[MODES_WIDGET_REL].replace(
        "title={row.name}",
        "title={row.name}\n                                aria-label='Custom mode bliss'"
      ),
    }),
    expect: "Custom mode bliss",
  },
  {
    name: "braced ternary label drifted inside the braces",
    apply: (sources) => ({
      ...sources,
      [MODES_WIDGET_REL]: sources[MODES_WIDGET_REL].replace(
        "aria-label={stopping ? 'Stop' : 'Reload'}",
        "aria-label={stopping ? 'Halt loading' : 'Reload'}"
      ),
    }),
    expect: "Halt loading",
  },
  {
    name: "a mode label under a quoted key drifted from the pinned copy",
    apply: (sources) => ({
      ...sources,
      [NAV_COPY_REL]: sources[NAV_COPY_REL].replace("'command-centre': 'Command centre'", "'command-centre': 'Command center'"),
    }),
    expect: "Command center",
  },
  {
    name: "chrome-bar copy spells the product name as a literal",
    apply: (sources) => ({
      ...sources,
      [NAV_COPY_REL]: sources[NAV_COPY_REL].replace("noAppName: 'The browser'", `noAppName: '${NAV_BRAND_LITERAL}'`),
    }),
    expect: "spells the product name as a literal",
  },
  {
    name: "the configured name in a JSX text node of the address bar",
    apply: (sources) => ({
      ...sources,
      [ADDRESS_BAR_REL]: sources[ADDRESS_BAR_REL].replace(
        "<div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>",
        `<div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter} ${NAV_BRAND_LITERAL} help</div>`
      ),
    }),
    expect: `brand: ${ADDRESS_BAR_REL}:`,
  },
  {
    name: "the configured name inside a string in chrome-bar-copy.ts",
    apply: (sources) => ({
      ...sources,
      [NAV_COPY_REL]: sources[NAV_COPY_REL].replace("untitledPage: 'Untitled page'", `untitledPage: 'Untitled ${NAV_BRAND_LITERAL} page'`),
    }),
    expect: `brand: ${NAV_COPY_REL}:`,
  },
  {
    name: "chrome-bar copy interpolates a member expression",
    apply: (sources) => ({
      ...sources,
      [NAV_COPY_REL]: sources[NAV_COPY_REL].replace("`${subject} couldn't", "`${error.message} couldn't"),
    }),
    expect: "${error.message}",
  },
  {
    name: "chrome-bar history sentence drifted",
    apply: (sources) => ({
      ...sources,
      [NAV_COPY_REL]: sources[NAV_COPY_REL].replace("move one page at a time.", "go back."),
    }),
    expect: "Use Back and Forward to go back.",
  },
  {
    name: "shortcut label drifted",
    apply: (sources) => ({
      ...sources,
      [SHORTCUT_COPY_REL]: sources[SHORTCUT_COPY_REL].replace("label: 'Alt+Home'", "label: 'Alt+Hom'"),
    }),
    expect: "Alt+Hom",
  },
];

function runModesCopySelfTest() {
  const clean = readModesSources();
  const baseline = checkModesCopy(clean);
  if (baseline.length !== 0) {
    console.error("verify-shell-error-copy --self-test: FAIL -- the modes-copy baseline is already red, so the planted-fault results below would be meaningless:");
    baseline.forEach((f) => console.error(`  ${f}`));
    return false;
  }
  let allOk = true;
  for (const fault of MODES_COPY_FAULTS) {
    const mutated = fault.apply(clean);
    if (JSON.stringify(mutated) === JSON.stringify(clean)) {
      console.error(`  FAIL  ${fault.name} -- the fault did not apply; this self-test row proves nothing`);
      allOk = false;
      continue;
    }
    const found = checkModesCopy(mutated);
    if (!found.some((f) => f.includes(fault.expect))) {
      console.error(
        `  FAIL  ${fault.name} -- planted fault did NOT go red naming ${JSON.stringify(fault.expect)}; ` +
          `got: ${found.join(" | ") || "(no failures at all)"}`
      );
      allOk = false;
    } else {
      console.log(`  ok    ${fault.name} -- red, naming the drift`);
    }
  }
  return allOk;
}

// ---------------------------------------------------------------------------
// --self-test: plant faults, require each to go red naming the drift.
// ---------------------------------------------------------------------------

const FAULTS = [
  {
    name: "all-caps sentinel leaked into a message",
    apply: (s) =>
      s.replace(
        "PowerBrowser's interface didn't finish starting.",
        "PowerBrowser did not see POWERBROWSER_BACKEND_READY."
      ),
    expect: "POWERBROWSER_BACKEND_READY",
  },
  {
    name: "pref key leaked into a message",
    apply: (s) =>
      s.replace(
        "PowerBrowser needs Node.js and couldn't find it.",
        "PowerBrowser could not read powerbrowser.sidecar.nodePath."
      ),
    expect: "powerbrowser.sidecar.nodePath",
  },
  {
    name: "ad-hoc string literal bypasses the table",
    apply: (s) => s.replace("message: USER_MESSAGE.couldNotStart,", 'message: "Backend spawn failed.",'),
    expect: "Backend spawn failed",
  },
  {
    name: "stale declared-but-unreferenced entry",
    apply: (s) =>
      s.replace(
        "const USER_MESSAGE = {\n",
        'const USER_MESSAGE = {\n  neverUsed: "PowerBrowser has an unused message.",\n'
      ),
    expect: "USER_MESSAGE.neverUsed is declared but never referenced",
  },
  {
    name: "referenced entry removed from the table",
    apply: (s) => s.replace(/^ {2}nodeMissing: .*\n/m, ""),
    expect: "USER_MESSAGE.nodeMissing is referenced but not declared",
  },
  {
    name: "_showError() called with raw interpolated text",
    apply: (s) =>
      s.replace(
        "this._showError(resolved.message, /* recoverable */ false, resolved.details);",
        "this._showError(`raw ${resolved.detail}`, false, resolved.details);"
      ),
    expect: "this._showError() is called with",
  },
  // 01-14 (CR-A). The two rows below plant the shape rule (4) exists to catch
  // and, before 01-14, could not: an `<identifier>.message` argument whose
  // identifier proves nothing. Both mutate the ONE direct `USER_MESSAGE.*`
  // call site, which is the substitution 01-VERIFICATION.md's missing[] names.
  {
    name: "_showError() called with a caught exception's .message",
    apply: (s) =>
      s.replace(
        "this._showError(USER_MESSAGE.couldNotStart, /* recoverable */ true, [",
        "this._showError(err.message, /* recoverable */ true, ["
      ),
    expect: "raw exception string",
  },
  {
    name: "_showError() called with an unknown identifier's .message",
    apply: (s) =>
      s.replace(
        "this._showError(USER_MESSAGE.couldNotStart, /* recoverable */ true, [",
        "this._showError(stray.message, /* recoverable */ true, ["
      ),
    expect: "stray.message",
  },
  // 01-16 (CR-03). Both rows plant a call site the enumeration regex CANNOT
  // read, which before this plan was not a rejection but an absence: the site
  // was never examined and the run exited 0. Both APPEND rather than substitute,
  // because the defect is about call shapes the file does not currently contain.
  //
  // The comma-less row's text must be the LAST content in the mutated source and
  // must contain no comma after its `this._showError(`: the enumeration's
  // `[^,]+?` capture excludes commas but DOES match newlines, so a later comma
  // anywhere in the file would let the regex match across the plant and mask the
  // fault. Neither snippet may introduce a `message:` property or a
  // `USER_MESSAGE.<key>` reference, or it would trip check (2) or (3) instead
  // and the row would be red for the wrong reason.
  {
    name: "_showError() call site with no trailing comma is never enumerated",
    apply: (s) => `${s}\nthis._showError(err.message)\n`,
    expect: "a call site this check cannot read",
  },
  {
    name: "_showError() call site with an optional-chaining receiver is never enumerated",
    apply: (s) => `${s}\nthis?._showError(err.message, false, []);\n`,
    expect: "a call site this check cannot read",
  },
  // 01-18 (CR-01). A RECEIVERLESS call written at the start of a line. Under
  // 01-16's count-based guard this row was GREEN -- verified against a scratch
  // copy of that checker -- because the plant raised the raw `_showError(` total
  // and the `definitions` term it was subtracted from by exactly one each, so
  // the difference never moved. It is the row that distinguishes the position-set
  // comparison from the counts it replaced; a count that cancels is why it
  // exists, so it must never be rewritten to carry a `this.` receiver.
  {
    name: "receiverless line-initial _showError() call site is absorbed by the definition term",
    apply: (s) => `${s}\n_showError(err.message, false, []);\n`,
    expect: "were not parsed",
  },
  // 01-18 (WR-01). CR-03's third documented bypass, still open after 01-16: an
  // aliased method is counted by neither derivation because `_showError.bind(`
  // has no adjacent parenthesis, so the two position sets agree while the call
  // through the alias is never examined.
  {
    name: "_showError aliased through .bind is invisible to every derivation",
    apply: (s) => `${s}\nconst show = this._showError.bind(this);\nshow(err.message, false, []);\n`,
    expect: "referenced without being called",
  },
  // 01-16 (WR-01, WR-02). Two sibling silent drops in this same file.
  //
  // The WR-01 row's appended call site HAS a trailing comma, so it is enumerated
  // and both of CR-03's counts rise together: this row must go red on the
  // depth-0 rule, not on the call-site equality assertion. Its nested `message:`
  // sits on its own comma-terminated line so that check (2) reads it as a clean
  // `USER_MESSAGE.<declared key>` and does not fire first.
  //
  // The WR-02 row's key is deliberately UNREFERENCED: an unreferenced key cannot
  // trip check (2) or check (3), so the row can only go red on the new totality
  // assertion. That is what makes it evidence for this change rather than for a
  // check that already existed.
  {
    name: "nested message: makes a binding falsely message-bearing",
    apply: (s) =>
      `${s}\nconst nestedOnly = {\n  details: [\n    {\n      message: USER_MESSAGE.couldNotStart,\n    },\n  ],\n};\nthis._showError(nestedOnly.message, false, []);\n`,
    expect: "is not a message-bearing binding",
  },
  // 01-18 (WR-02). The quoted-key form, which 01-16's counter shared a blind
  // spot with: its key grammar was `entryRe`'s key grammar, so the two could
  // never disagree. Unreferenced for the same reason the row below is -- it must
  // be able to go red ONLY on the totality assertion.
  {
    name: "quoted-key USER_MESSAGE entry is invisible to both the parser and its counter",
    apply: (s) =>
      s.replace(
        "const USER_MESSAGE = {\n",
        'const USER_MESSAGE = {\n  "quotedKey": "PowerBrowser has an entry with a quoted key.",\n'
      ),
    expect: "never leak-scanned",
  },
  {
    name: "USER_MESSAGE entry the parser cannot read is dropped silently",
    apply: (s) =>
      s.replace(
        "const USER_MESSAGE = {\n",
        "const USER_MESSAGE = {\n  unreadableEntry: `PowerBrowser has an entry this parser cannot read.`,\n"
      ),
    expect: "never leak-scanned",
  },
];

function runSelfTest(targetPath) {
  const original = readFileSync(targetPath, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "verify-shell-error-copy-"));
  let allOk = true;
  try {
    for (const fault of FAULTS) {
      const mutated = fault.apply(original);
      if (mutated === original) {
        console.error(`  FAIL  ${fault.name} -- the fault did not apply; this self-test row proves nothing`);
        allOk = false;
        continue;
      }
      const path = join(dir, "TheiaService.sys.mjs");
      writeFileSync(path, mutated);

      let out = "";
      let exitCode = 0;
      try {
        out = execFileSync(process.execPath, [SELF, "--file", path], { encoding: "utf8", stdio: "pipe" });
      } catch (err) {
        exitCode = err.status ?? 1;
        out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      }

      if (exitCode === 0) {
        console.error(`  FAIL  ${fault.name} -- planted fault did NOT go red`);
        allOk = false;
      } else if (!out.includes(fault.expect)) {
        console.error(
          `  FAIL  ${fault.name} -- went red but did not name the drift ` +
            `(expected output to mention ${JSON.stringify(fault.expect)})`
        );
        allOk = false;
      } else {
        console.log(`  ok    ${fault.name} -- red, naming the drift`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return allOk;
}

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let target = DEFAULT_TARGET;
let selfTest = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--self-test") {
    selfTest = true;
  } else if (argv[i] === "--file") {
    target = argv[i + 1];
    i += 1;
    if (!target) {
      console.error("verify-shell-error-copy: FAIL -- --file requires a path argument");
      process.exit(1);
    }
  } else {
    console.error(`verify-shell-error-copy: FAIL -- unknown argument '${argv[i]}'`);
    process.exit(1);
  }
}

if (selfTest) {
  console.log(`verify-shell-error-copy --self-test: planting ${FAULTS.length} fault(s)`);
  const shellOk = runSelfTest(target);
  if (shellOk) {
    console.log(`verify-shell-error-copy: PASS -- all ${FAULTS.length} planted faults went red naming the drift`);
  }
  console.log(`verify-shell-error-copy --self-test: planting ${MODES_COPY_FAULTS.length} modes-copy fault(s)`);
  const modesOk = runModesCopySelfTest();
  if (modesOk) {
    console.log(`verify-shell-error-copy: PASS -- all ${MODES_COPY_FAULTS.length} planted modes-copy faults went red naming the drift`);
  }
  if (shellOk && modesOk) {
    process.exit(0);
  }
  console.error("verify-shell-error-copy: FAIL -- see the self-test rows above");
  process.exit(1);
}

check(target);
if (!argv.includes("--file")) {
  const modesSources = readModesSources();
  for (const f of checkModesCopy(modesSources)) {
    fail(f);
  }
  console.log(`verify-shell-error-copy: widget copy derived from ${widgetCopySourceRels(modesSources).length} chrome-bar source(s)`);
}
if (failures.length === 0) {
  console.log(`verify-shell-error-copy: PASS -- no internal identifier can reach the error layer (${target})`);
  process.exit(0);
}
for (const f of failures) {
  console.error(`verify-shell-error-copy: FAIL -- ${f}`);
}
process.exit(1);
