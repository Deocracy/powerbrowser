#!/usr/bin/env node
// scripts/scan-brand-residue.mjs
//
// D-16/D-17: the residual-brand scan as an executable guard, not prose. Reads
// its entire token set from `inventory/brand-tokens.json` (D-15) -- no token
// literal is hardcoded here, so "what is scanned" and "what is renamed" cannot
// drift apart. Grep-class: no build, no browser, no network.
//
// Structured as the Node port of scripts/check-internals-boundary.sh (the named
// in-tree idiom): a scan function, one `path:line:token` row per offense, a
// non-vacuity assertion that FAILS on an empty scan set with its own distinct
// message, a `--self-test` planting fixtures in `mktemp -d` (never a real repo
// file) that asserts the guard both rejects them AND names them, and argument
// dispatch at the bottom.
//
// -- Why a bare non-zero exit is not the contract (D-17) --
// An under-scanning scanner also exits non-zero on a dirty tree. So the red
// evidence is RECONCILED COUNTS, asserted by name in `--reconcile`:
//   1. every inventoried token with expected_count > 0 was found
//   2. each token's observed count EQUALS its expected count
//   3. every observed file appears in that token's expected_files
//   4. no occurrence was found that the inventory does not account for
// Condition 4 is the one that catches this file being wrong. It does NOT reuse
// the boundary matcher below -- it re-scans with `scope.residue_probes`, a
// case-insensitive raw-substring probe with no boundary rule at all, and
// asserts every probe hit lands inside a span some inventory row claimed. A
// boundary bug (missing `sourcererPrivilegedJs`, say) leaves an unclaimed probe
// hit and fails condition 4 even though conditions 1-3 all agree with
// themselves.
//
// `scope.tracked_residue_probes` (P60-R2) is a second probe list that applies to
// the tracked tree ONLY. `orca` lives there rather than in `residue_probes`
// because the `--extra-root` pass walks Gecko, which holds 1598 files containing
// the substring (the GNOME Orca screen reader, and in-word joins such as
// ErrorCallback), and coincidental rows are excluded from that pass's claim set,
// so probing it there would turn the permanent rebase gate red with nothing to
// classify. Orca is a classification of THIS tree: every tracked mention is
// claimed by a coincidental row with an exact count, so a stray one goes red.
//
// -- `--reconcile` has two states, and says which one it is in --
// Pre-rename (any renameable occurrence still present): asserts 1-4 and exits
// non-zero. That run is the committed red evidence.
// Post-rename (zero renameable occurrences in scope): the four conditions above
// are about a tree that no longer exists, so instead it asserts that every
// `frozen` and `coincidental` row still reconciles by count -- the rename must
// not have eaten the XPCOM cid, the `a-` category prefix, or Gecko's own
// `%content/branding/` slot names. Exits 0. That assertion is what keeps the
// green run from being vacuous.
//
// -- `--scope-chain <name>` is a proof, not the gate --
// It narrows the scan to the files of one coupled chain (`chains.<name>.files`)
// so the rename machinery can be proven end-to-end on six coupled sites before
// it is pointed at the whole tree. It narrows the FILE SET ONLY -- every
// inventory row stays active, so a chain run is the full ruleset restricted to
// those files, never a second, weaker ruleset. Condition 2 (exact counts) is
// the one thing it cannot assert, because expected_count is a whole-tree
// figure; the full-tree run is the gate.
//
// Text is read as UTF-8 and matched on JavaScript string code units with NO
// Unicode normalization -- normalizing would silently fold distinct byte
// sequences together. Binary paths are excluded by the inventory's explicit
// extension list rather than by content sniffing. Positions are reported as
// `path:line`, never as byte offsets.
//
// -- `--except-hand-write` is a hand-off, not a mute button --
//
// D-18 makes this scan a permanent gate the moment the rename turns it green,
// so it has to be runnable green while one surface set is still legitimately
// outstanding: plan 01-02 renames every identifier mechanically, and plan
// 01-03 hand-writes the surfaces afterwards. `--except-hand-write` holds back
// EXACTLY the sites `rename-brand.mjs` is forbidden to touch, by calling the
// very predicates that forbid it (`excludedWholeFile` / `excludedLine`, below,
// which rename-brand.mjs re-exports rather than re-implements). The gate's
// exception and the rename's prohibition are therefore the same code reading
// the same `hand_write` block, and cannot drift apart.
//
// It is scoped by SITE and not by class, which is not a stylistic choice --
// excepting a class cannot express this hand-off:
//
//   * Pitfall 1 puts `brand-display` residue in the branding locale files,
//     `configure.sh` and the LICENSE notice, because no token-boundary rule
//     separates `Power Browser` (the display value, with a space) from
//     `PowerBrowser` (the identifier).
//   * Pitfall 4 puts `brand-identifier` residue in the two `.desktop` files,
//     because `Exec=/home/chris/coding/sourcerer/objdir/dist/bin/sourcerer`
//     carries three tokens on one line with three different correct targets.
//
// So the outstanding set spans two classes. `--except-class brand-display`
// leaves the six `.desktop` identifier sites failing and the gate can never go
// green; `--except-class brand-identifier` would except the 899 sites this
// very plan exists to rename, i.e. it would gut the gate. Excepting the
// hand-write SITES holds back all 31 and keeps every other class-and-site
// combination fully enforced -- a stray `brand-identifier` anywhere outside a
// hand-write surface still fails.
//
// An excepted site is REPORTED with its count on every run, never hidden, and
// the flag is dropped from the gate once 01-03 lands.
//
// -- `--extra-root <dir>` is how the gate reaches a tree git cannot see --
//
// The file set above comes from `git ls-files`. A rebase replays the patch
// stack onto `upstream/`, which `.gitignore` excludes, so `git ls-files` cannot
// name a single byte of it. Without this mode the post-replay invocation in
// `scripts/rebase-upstream.sh` re-scanned exactly the same tracked files the
// pre-replay one already scanned -- a gate placed at precisely the right call
// site that could not see the tree at that call site, green by construction and
// unable to go red for its stated cause (plan 01-15, closing 01-VERIFICATION.md
// gap CR-B).
//
// `--extra-root <dir>` adds a SECOND file set, walked from the filesystem under
// the same `scope.exclude` and `scope.binary_extensions` filters the tracked
// path applies -- one filter definition, two file-set sources, never a second
// weaker ruleset. It is additive: the tracked-tree scan always runs and is never
// replaced. It never follows a symlink and never descends `.git`. An absent,
// unreadable or empty root is a hard FAIL, never a skip: a skip-when-absent mode
// would reproduce CR-B in a new shape. So is an unreadable FILE inside that root,
// and the reported file count names files actually read rather than files walked.
// A relative `--extra-root` argument resolves against the repo root, the same
// base `--report` uses.
//
// Usage:
//   node scripts/scan-brand-residue.mjs [--reconcile] [--scope-chain <name>]
//                                       [--except-hand-write]
//                                       [--extra-root <dir>]
//                                       [--report <path>] [--self-test]

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const INVENTORY_PATH = join(REPO_ROOT, 'inventory/brand-tokens.json');

export const CLASSES = Object.freeze([
  'brand-identifier',
  'brand-display',
  'identity',
  'frozen',
  'coincidental',
]);

/** Classes whose occurrences the rename must remove. Everything else stays put. */
export const RENAMEABLE_CLASSES = Object.freeze(['brand-identifier', 'brand-display', 'identity']);

export const CASE_FORMS = Object.freeze(['lower', 'title', 'upper', 'literal']);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function loadInventory(path = INVENTORY_PATH) {
  const inv = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(inv.tokens)) {
    throw new Error(`brand-tokens: FAIL -- ${path} has no tokens[] array`);
  }
  assertNoProbeSwallowingRow(inv, path);
  return inv;
}

/**
 * WR-05 (plan 01-18). The `--extra-root` row filter (see main()) excludes the
 * `coincidental` class and ONLY that class, and its justification used to be a
 * comment hand-enumerating the rows that happen to exist today: "`frozen` rows
 * legitimately occur in a Gecko checkout and carry no residue probe". That is an
 * expectation kept by hand about a file explicitly designed to grow -- exactly
 * what CLAUDE.md's "derive from the tree and compare" rule forbids -- and adding
 * one `frozen` row whose token contains a probe form silently reopens the defect
 * that filter was cut for, with nothing firing.
 *
 * The property the filter actually depends on is derivable from the inventory:
 * no row that is neither renameable nor already excluded may contain a residue
 * probe. `claimOccurrences` orders rows longest-token-first and writes claimed
 * spans into `taken[]`, so such a row would swallow the shorter brand token
 * nested inside it AND suppress that span's independent probe hit.
 */
/** Both probe lists: the tracked-tree scan's default. `--extra-root` uses `residue_probes` only. */
export function allProbes(inv) {
  return [...(inv.scope?.residue_probes ?? []), ...(inv.scope?.tracked_residue_probes ?? [])];
}

export function assertNoProbeSwallowingRow(inv, path = INVENTORY_PATH) {
  const probeForms = allProbes(inv).map((p) => p.toLowerCase());
  for (const row of inv.tokens) {
    // Renameable rows are what the gate exists to catch; `coincidental` rows are
    // already excluded from the --extra-root row set, which is what makes the
    // one real probe-bearing row (this checkout's own source path) safe.
    if (RENAMEABLE_CLASSES.includes(row.class) || row.class === 'coincidental') continue;
    const hit = probeForms.find((p) => String(row.token).toLowerCase().includes(p));
    if (hit) {
      throw new Error(
        `brand-tokens: FAIL -- ${path} row ${JSON.stringify(row.token)} is class "${row.class}" ` +
          `(not renameable, not excluded from --extra-root) but contains the residue probe ` +
          `"${hit}" -- longest-first claim order lets it swallow a brand token and suppress that ` +
          `token's probe. Either classify it renameable, or exclude its class from the ` +
          `--extra-root row set as "coincidental" already is`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Token-boundary matching
// ---------------------------------------------------------------------------
//
// "Boundary" means the adjacent characters are not token characters, EXCEPT for
// the joins the inventory's case forms declare:
//
//   lower / title -- a camelCase join on the right is legal, so `sourcerer` in
//     `sourcererPrivilegedJs` and `Sourcerer` in `SourcererAPI` both match,
//     while `resourcerer` (letter on the left) and `Sourcerers` (lowercase on
//     the right) do not.
//   upper -- an UPPER_SNAKE join is legal, so `SOURCERER` in `SOURCERER_TOKEN`
//     matches while `SOURCERERX` does not.
//   literal -- a structural anchor (a UUID, a jar.mn slot name). No boundary
//     rule applies; it is matched as a raw substring.
//
// Matching is case-sensitive: the three case forms are three different tokens,
// not one token searched case-insensitively (Pitfall 1).

const LEFT_TOKEN_CHAR = /[A-Za-z0-9]/;
const RIGHT_LOWERISH = /[a-z0-9]/;
const RIGHT_UPPERISH = /[A-Za-z0-9]/;

export function isBoundaryMatch(text, index, token, caseForm) {
  if (caseForm === 'literal') return true;
  const before = index > 0 ? text[index - 1] : '';
  const after = index + token.length < text.length ? text[index + token.length] : '';
  if (before && LEFT_TOKEN_CHAR.test(before)) return false;
  const rightRe = caseForm === 'upper' ? RIGHT_UPPERISH : RIGHT_LOWERISH;
  if (after && rightRe.test(after)) return false;
  return true;
}

/** Every boundary-legal start index of `token` in `text`, ascending. */
export function findMatches(text, token, caseForm) {
  const out = [];
  let i = text.indexOf(token);
  while (i !== -1) {
    if (isBoundaryMatch(text, i, token, caseForm)) out.push(i);
    i = text.indexOf(token, i + 1);
  }
  return out;
}

/** Precomputed newline offsets, so index -> 1-based line is a binary search. */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

export function lineOf(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// ---------------------------------------------------------------------------
// Deterministic row order: longest token first, then UPPER_SNAKE, TitleCase,
// lowercase, then literal; ties broken by token then class so two runs of this
// file over the same inventory produce byte-identical output.
// ---------------------------------------------------------------------------

const CASE_RANK = { upper: 0, title: 1, lower: 2, literal: 3 };

export function orderRows(rows) {
  return [...rows].sort((a, b) =>
    b.token.length - a.token.length ||
    // A row scoped to specific files (`only_in`) outranks the broad row for the
    // same literal. This is how the TitleCase ambiguity is resolved PER SITE
    // (Pitfall 1): `Sourcerer` in brand.ftl is a `brand-display` row scoped to
    // that file and means `Power Browser`, while the same nine characters
    // everywhere else fall through to the broad `brand-identifier` row and mean
    // `PowerBrowser`.
    (a.only_in ? 0 : 1) - (b.only_in ? 0 : 1) ||
    (CASE_RANK[a.case_form] ?? 9) - (CASE_RANK[b.case_form] ?? 9) ||
    a.token.localeCompare(b.token) ||
    a.class.localeCompare(b.class));
}

/** A row applies to `file` unless it declares an `only_in` list that omits it. */
export function rowAppliesTo(row, file) {
  return !row.only_in || row.only_in.includes(file);
}

/** Stable identity for a row, so two rows sharing a literal stay distinct. */
export function rowKey(row) {
  return `${row.token}@${row.case_form}@${row.class}@${(row.only_in ?? []).join(',')}`;
}

/**
 * Claims spans in `text` for the given rows, longest-token-first. A span already
 * claimed by an earlier (longer) row is never re-claimed, which is how
 * `@sourcerer.dev/...` is one identity occurrence rather than also a lowercase
 * brand occurrence, and how `/home/chris/coding/sourcerer/sourcerer/...` splits
 * into the coincidental repo root plus one brand token.
 */
export function claimOccurrences(text, rows, file) {
  const starts = lineIndex(text);
  const claimed = [];
  const taken = new Uint8Array(text.length);
  for (const row of orderRows(rows)) {
    if (!rowAppliesTo(row, file)) continue;
    for (const index of findMatches(text, row.token, row.case_form)) {
      let free = true;
      for (let k = index; k < index + row.token.length; k++) {
        if (taken[k]) { free = false; break; }
      }
      if (!free) continue;
      for (let k = index; k < index + row.token.length; k++) taken[k] = 1;
      claimed.push({ file, index, line: lineOf(starts, index), row });
    }
  }
  claimed.sort((a, b) => a.index - b.index);
  return { claimed, taken };
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/**
 * The one scope filter, shared by both file-set sources: the `git ls-files`
 * path below and the `--extra-root` walk beneath it. It is extracted rather
 * than restated so the extra root cannot become a second, weaker ruleset --
 * one filter definition, two callers.
 */
export function inScanScope(inv, relPath) {
  const exclude = inv.scope?.exclude ?? [];
  const binary = inv.scope?.binary_extensions ?? [];
  return !exclude.some((x) => relPath === x || relPath.startsWith(x)) &&
    !binary.some((ext) => relPath.toLowerCase().endsWith(ext));
}

export function scopeFiles(inv, { chainFiles = null } = {}) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  let files = tracked.filter((p) => inScanScope(inv, p));
  if (chainFiles) {
    const want = new Set(chainFiles);
    files = files.filter((p) => want.has(p));
  }
  return files.sort();
}

/**
 * The second file-set source: a filesystem walk under a caller-supplied root
 * OUTSIDE the git index, returning paths relative to `root` so the result drops
 * straight into the existing `scan(inv, { root, files })` call. That function
 * already takes both parameters, so this is a second file set for the one
 * scanner, not a second scanner.
 *
 * Two structural exclusions, both with mechanical reasons specific to this tree:
 *
 *   - Never follow a symbolic link. `upstream/powerbrowser` is a real symlink
 *     back into this repo's own `powerbrowser/` directory (`rebase-upstream.sh`
 *     asserts exactly that resolution), so a link-following walk would rescan
 *     this repo's tree through a second path and could recurse.
 *   - Never descend a directory named `.git`. A rebased upstream checkout
 *     carries a multi-gigabyte object store whose packfiles are not source.
 *
 * Content-based exclusion is NOT hand-kept here. `inv.scope.exclude`'s entries
 * are repo-relative and none of them exists under a Gecko checkout, so applying
 * them verbatim to extra-root-relative paths is inert there rather than harmful
 * -- that is intended. Any content-based exclusion a real rebase turns out to
 * need belongs in `inventory/brand-tokens.json`, which is the derived source
 * both file-set paths already read, never as a literal in this walker.
 *
 * Throws naming the path when the root is absent or is not a directory. It does
 * NOT return an empty array in that case: a silent skip is CR-B in a new shape.
 */
export function extraRootFiles(inv, root) {
  let st;
  try {
    // IN-02 (plan 01-17): the asymmetry is deliberate and is documented rather
    // than removed. The ROOT is checked with `statSync`, which follows a
    // symlink, while every entry INSIDE the walk is checked with lstat
    // semantics (`dirent.isSymbolicLink()`) and skipped when it is a link.
    // Switching the root to `lstatSync` would make a symlinked `--extra-root` a
    // hard failure, which no caller needs and which would be a behaviour change
    // smuggled in under a comment-level finding.
    st = statSync(root);
  } catch {
    throw new Error(`--extra-root ${root} does not exist or cannot be read -- an unreadable extra root is not a clean tree, and skipping it would make this pass green by construction`);
  }
  if (!st.isDirectory()) {
    throw new Error(`--extra-root ${root} exists but is not a directory -- the mode walks a directory tree, and it will not silently pass on a path it cannot walk`);
  }

  const out = [];
  const walk = (absDir, relDir) => {
    for (const dirent of readdirSync(absDir, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) continue;
      const rel = relDir ? `${relDir}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        if (dirent.name === '.git') continue;
        walk(join(absDir, dirent.name), rel);
      } else if (dirent.isFile() && inScanScope(inv, rel)) {
        out.push(rel);
      }
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * A named coupled chain. `--scope-chain` narrows the FILE SET only -- every
 * inventory row stays active -- so a chain run is the full ruleset restricted
 * to the files whose sites must move together, never a second, weaker ruleset.
 */
export function chainOf(inv, name) {
  const files = inv.chains?.[name]?.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`scan-brand-residue: FAIL -- inventory declares no chain "${name}" with a non-empty files[]`);
  }
  return { files: [...files].sort() };
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export function scan(inv, { chain = null, root = REPO_ROOT, files = null, rows = null, probes = null } = {}) {
  const activeRows = rows ?? inv.tokens;
  const activeFiles = files ?? scopeFiles(inv, { chainFiles: chain ? chainOf(inv, chain).files : null });

  if (activeFiles.length === 0) {
    // `unreadable` is present on this shape too. It is a different literal from
    // the main return below, and a caller reading `.unreadable` off it must not
    // get `undefined` and quietly conclude nothing failed to read.
    return { empty: true, occurrences: [], unclaimedProbes: [], unreadable: [], files: activeFiles, rows: activeRows };
  }

  const occurrences = [];
  const unclaimedProbes = [];
  const unreadable = [];
  const activeProbes = probes ?? allProbes(inv);
  // A second, deliberately dumb recount: plain case-sensitive substring, no
  // rows, no boundary rule, no claim order. It is the only number in this file
  // computed the same way 01-RESEARCH.md computed its ground truth, which is
  // what makes the ground-truth arithmetic below a real cross-check rather
  // than this scanner agreeing with itself.
  const rawForms = inv.ground_truth?.raw_forms ?? [];
  const rawCounts = Object.fromEntries(rawForms.map((f) => [f, 0]));

  for (const file of activeFiles) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (err) {
      // CR-02 (plan 01-17). This used to be a bodyless `catch { continue; }`
      // justified as "a path git tracks but this checkout does not
      // materialise". That justification covers ONE of this function's two
      // file-set provenances. A `git ls-files` path that throws may indeed be
      // a tracked path this checkout does not materialise; an extra-root path
      // came from a `readdirSync` that had just reported it as an existing
      // regular file, so a throw there is EACCES, EISDIR or a read past the V8
      // string limit -- never the absent case. One justification cannot serve
      // both, so `scan()` records the fact and leaves the POLICY to the caller,
      // which is where the provenance is known.
      unreadable.push({ file, reason: err.code ?? err.message });
      continue;
    }
    const { claimed, taken } = claimOccurrences(text, activeRows, file);
    occurrences.push(...claimed);

    for (const form of rawForms) {
      let i = text.indexOf(form);
      while (i !== -1) { rawCounts[form]++; i = text.indexOf(form, i + 1); }
    }

    // Condition 4's independent detector: raw case-insensitive substring, no
    // boundary rule, deliberately NOT the matcher above.
    const lower = text.toLowerCase();
    const starts = lineIndex(text);
    for (const probe of activeProbes) {
      const needle = probe.toLowerCase();
      let i = lower.indexOf(needle);
      while (i !== -1) {
        if (!taken[i]) {
          unclaimedProbes.push({ file, line: lineOf(starts, i), probe, text: text.slice(i, i + needle.length) });
        }
        i = lower.indexOf(needle, i + 1);
      }
    }
  }

  occurrences.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.index - b.index);
  unclaimedProbes.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { empty: false, occurrences, unclaimedProbes, unreadable, rawCounts, files: activeFiles, rows: activeRows };
}

/**
 * D-17's "reconciled counts, not an exit code", checked against a source
 * outside this repo's own tooling: 01-RESEARCH.md's independently measured
 * occurrence census of the sourcerer tree. The arithmetic must CLOSE --
 * observed now, plus everything already renamed, plus everything deliberately
 * not imported, must equal the researched total exactly. A deviation is
 * reconciled here by name, never absorbed into a fudge factor.
 */
export function groundTruth(inv, result) {
  const gt = inv.ground_truth;
  if (!gt || !result.rawCounts) return null;
  const observed = Object.values(result.rawCounts).reduce((a, b) => a + b, 0);
  const alreadyRenamed = (gt.already_renamed ?? []).reduce((n, e) => n + e.occurrences, 0);
  const notImported = (gt.not_imported ?? []).reduce((n, e) => n + e.occurrences, 0);
  const expected = (gt.migrating_occurrences ?? 0) + (gt.phase_verifier_occurrences ?? 0);
  const accounted = observed + alreadyRenamed + notImported;
  return { observed, alreadyRenamed, notImported, expected, accounted, closes: accounted === expected };
}

export function offensesOf(result) {
  return result.occurrences.filter((o) => RENAMEABLE_CLASSES.includes(o.row.class));
}

// ---------------------------------------------------------------------------
// Hand-write exclusions
// ---------------------------------------------------------------------------
//
// These two predicates live here, in the lower-level module, and
// rename-brand.mjs re-exports them. That direction matters: rename-brand.mjs
// already imports this file, so defining them there and importing them here
// would make the pair circular. One definition, two consumers -- the rename
// refuses to touch exactly what the gate agrees to hold back.

/** True when the whole file is hand-written by a later plan. */
export function excludedWholeFile(inv, file) {
  return (inv.hand_write?.files ?? []).includes(file);
}

/**
 * True when this one line is hand-written by a later plan. Line-scoped rather
 * than file-scoped where a file carries ordinary identifier sites too --
 * `theia/applications/browser/package.json`'s `"applicationName"` is a display
 * literal, but the rest of that file must still rename.
 */
export function excludedLine(inv, file, lineText) {
  return (inv.hand_write?.line_contains ?? [])
    .some((r) => r.file === file && lineText.includes(r.contains));
}

/**
 * Splits offenses into the ones a later plan hand-writes and the ones this gate
 * enforces. Matched by SITE, using the same predicates rename-brand.mjs obeys,
 * so the gate cannot except a site the rename would have been allowed to touch
 * (nor keep failing on one it was forbidden to fix).
 *
 * Files are read here rather than carried on every occurrence because only the
 * offending files are ever needed, and `excludedLine` needs the line's text.
 */
export function partitionHandWrite(inv, offenses, { root = REPO_ROOT } = {}) {
  const lines = new Map();
  const linesOf = (file) => {
    if (!lines.has(file)) {
      let text = '';
      try { text = readFileSync(join(root, file), 'utf8'); } catch { /* unreadable: treat as enforced */ }
      lines.set(file, text.split('\n'));
    }
    return lines.get(file);
  };
  const handWritten = [];
  const enforced = [];
  for (const o of offenses) {
    const excepted = excludedWholeFile(inv, o.file) ||
      excludedLine(inv, o.file, linesOf(o.file)[o.line - 1] ?? '');
    (excepted ? handWritten : enforced).push(o);
  }
  return { handWritten, enforced };
}

/**
 * The `--extra-root` pass's scan: coincidental rows excluded (CR-01, see main())
 * and `residue_probes` only. `tracked_residue_probes` (P60-R2, `orca`) stays off
 * here because Gecko holds 1598 files containing that substring -- the GNOME
 * Orca screen reader and in-word joins such as ErrorCallback -- and with the
 * coincidental rows excluded nothing could claim them, so the permanent rebase
 * gate would be red with nothing to classify. Orca is a PowerBrowser-tree
 * classification. One function so the self-test exercises the call main() makes.
 */
export function scanExtraRoot(inv, root, files) {
  return scan(inv, {
    root,
    files,
    rows: inv.tokens.filter((r) => r.class !== 'coincidental'),
    probes: inv.scope?.residue_probes ?? [],
  });
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export function reconcile(inv, result, { chain = null, chainFiles = null } = {}) {
  const failures = [];
  const byRow = new Map();
  for (const o of result.occurrences) {
    const key = rowKey(o.row);
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(o);
  }

  const conditions = [];
  const postRename = offensesOf(result).length === 0;

  // Condition 4 is asserted on BOTH branches, and it sits above the split for
  // that reason. It used to live below, inside the red-state block only, which
  // made it unreachable in the one state this tree permanently sits in: the
  // scanner's only defence against a brand string reappearing in a form no
  // inventory row matches was live exclusively while the rename was still
  // outstanding. A defence that cannot run in the state it exists to guard is
  // not a defence (plan 01-08, closing the D-17/D-18 gap 01-VERIFICATION.md
  // reproduced). Its detector is deliberately not the boundary matcher above --
  // see the header note.
  conditions.push('condition 4: no occurrence was found that the inventory does not account for (independent case-insensitive probe, no boundary rule)');
  for (const u of result.unclaimedProbes) {
    failures.push(`condition 4: ${u.file}:${u.line}: "${u.text}" matched probe "${u.probe}" but no inventory row claimed it`);
  }

  if (postRename) {
    // Green state. The four pre-rename conditions describe a tree that no
    // longer exists; assert instead that nothing the rename was forbidden to
    // touch moved, which is a real assertion over a real expected count.
    // In chain mode only rows whose whole expected_files set lies inside the
    // chain can be reconciled exactly -- expected_count is a whole-tree figure,
    // so a row that also lives outside the chain would report a short count for
    // a tree that is simply not all being looked at.
    const inChain = chainFiles ? new Set(chainFiles) : null;
    let checked = 0;
    for (const row of result.rows) {
      if (row.class !== 'frozen' && row.class !== 'coincidental') continue;
      if (inChain && !(row.expected_files ?? []).every((f) => inChain.has(f))) continue;
      const observed = (byRow.get(rowKey(row)) ?? []).length;
      checked++;
      if (observed !== row.expected_count) {
        failures.push(`held-back row "${row.token}" (${row.case_form}/${row.class}): expected ${row.expected_count} occurrence(s), observed ${observed}`);
      }
    }
    conditions.push(`held-back rows intact: every frozen/coincidental row wholly inside the scanned scope still reconciles by count (${checked} row(s) checked)`);
    if (checked === 0) {
      failures.push('held-back rows intact: no frozen or coincidental row was wholly inside the scanned scope, so a clean result would prove nothing');
    }
    return { postRename, conditions, failures };
  }

  // Red state: the four D-17 conditions, asserted by name.
  conditions.push('condition 1: every inventoried token with expected_count > 0 was found');
  for (const row of result.rows) {
    if (!(row.expected_count > 0)) continue;
    if (!byRow.has(rowKey(row))) {
      failures.push(`condition 1: token "${row.token}" (${row.case_form}/${row.class}) expected ${row.expected_count} occurrence(s), found none`);
    }
  }

  if (chain) {
    conditions.push('condition 2: SKIPPED in --scope-chain mode -- expected_count is a whole-tree figure; the full-tree run is the gate');
  } else {
    conditions.push('condition 2: each token\'s observed count EQUALS its expected count');
    for (const row of result.rows) {
      const observed = (byRow.get(rowKey(row)) ?? []).length;
      if (observed !== row.expected_count) {
        failures.push(`condition 2: token "${row.token}" (${row.case_form}/${row.class}): expected ${row.expected_count}, observed ${observed}`);
      }
    }
  }

  conditions.push('condition 3: every observed file appears in that token\'s expected_files');
  for (const list of byRow.values()) {
    const row = list[0].row;
    const allowed = new Set(row.expected_files ?? []);
    for (const file of new Set(list.map((o) => o.file))) {
      if (!allowed.has(file)) {
        failures.push(`condition 3: token "${row.token}" (${row.case_form}/${row.class}) found in ${file}, which is not in its expected_files`);
      }
    }
  }

  const gt = groundTruth(inv, result);
  if (gt && !chain) {
    conditions.push(`ground truth: observed + already-renamed + not-imported EQUALS 01-RESEARCH.md's independently measured census (${gt.observed} + ${gt.alreadyRenamed} + ${gt.notImported} = ${gt.accounted}, expected ${gt.expected})`);
    if (!gt.closes) {
      failures.push(`ground truth: the arithmetic does not close -- ${gt.accounted} accounted for against a researched total of ${gt.expected}, a deviation of ${gt.accounted - gt.expected}. Reconcile it in inventory/brand-tokens.json's ground_truth block by name; do not absorb it.`);
    }
  } else if (gt && chain) {
    conditions.push('ground truth: SKIPPED in --scope-chain mode -- the census is a whole-tree figure');
  }

  return { postRename, conditions, failures };
}

/**
 * THE gate decision, and the only one. Returns a human-readable reason per
 * failing category; an empty array means the gate is green.
 *
 * It is a pure function of (offenses, reconciliation) so the self-test can
 * plant a fault and require THIS decision to go red without spawning a
 * subprocess. Before plan 01-08 the two non-zero exits in `main()` were
 * independent and the reconciliation one was guarded by `--reconcile`, which no
 * registered call site passes -- so `verify-platform.sh`, `rebase-upstream.sh`
 * and the CI workflow all invoked a gate whose reconciliation half could not
 * fail. One function, one exit source, reachable from the self-test.
 */
export function gateFailures(offenses, rec, { chain = null } = {}) {
  const reasons = [];
  if (offenses.length !== 0) {
    reasons.push(`${offenses.length} residual brand occurrence(s) across ${new Set(offenses.map((o) => o.file)).size} file(s)${chain ? ` in chain "${chain}"` : ''}`);
  }
  if (rec && rec.failures.length !== 0) {
    reasons.push(`${rec.failures.length} reconciliation failure(s)`);
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function renderReport(inv, result, rec, { chain = null } = {}) {
  const offenses = offensesOf(result);
  const heldBack = result.occurrences.filter((o) => !RENAMEABLE_CLASSES.includes(o.row.class));
  const lines = [];
  lines.push('# Residual-brand scan report');
  lines.push('');
  lines.push(`- Inventory: \`inventory/brand-tokens.json\``);
  lines.push(`- Scope: ${chain ? `chain \`${chain}\`` : 'whole tree (`git ls-files` minus `scope.exclude` minus binary extensions)'}`);
  lines.push(`- Files scanned: ${result.files.length}`);
  lines.push(`- Inventory rows in scope: ${result.rows.length}`);
  lines.push(`- Verdict: **${rec.postRename ? 'GREEN — no renameable occurrence remains' : 'RED — renameable occurrences remain'}**`);
  lines.push('');
  lines.push('## Reconciliation conditions asserted');
  lines.push('');
  for (const c of rec.conditions) lines.push(`- ${c}`);
  lines.push('');
  lines.push(rec.failures.length === 0
    ? 'All asserted conditions hold.'
    : `**${rec.failures.length} reconciliation failure(s):**`);
  if (rec.failures.length) {
    lines.push('');
    for (const f of rec.failures) lines.push(`- ${f}`);
  }
  const gt = groundTruth(inv, result);
  if (gt && !chain) {
    lines.push('');
    lines.push('## Ground-truth reconciliation');
    lines.push('');
    lines.push(`Source: \`${inv.ground_truth.source}\`. Counted the same way that census was counted — plain case-sensitive substring over the scanned scope, no boundary rule and no inventory rows — so this is a cross-check against a number produced by a different tool on a different tree, not this scanner agreeing with itself.`);
    lines.push('');
    lines.push('| accounting line | occurrences |');
    lines.push('|---|---:|');
    for (const form of inv.ground_truth.raw_forms ?? []) {
      lines.push(`| observed now: \`${form}\` | ${result.rawCounts[form]} |`);
    }
    lines.push(`| **observed now, total** | **${gt.observed}** |`);
    for (const e of inv.ground_truth.already_renamed ?? []) {
      lines.push(`| already renamed: ${e.what} | ${e.occurrences} |`);
    }
    for (const e of inv.ground_truth.not_imported ?? []) {
      lines.push(`| not imported: \`${e.path}\` | ${e.occurrences} |`);
    }
    lines.push(`| **accounted for** | **${gt.accounted}** |`);
    lines.push(`| researched migrating scope | ${inv.ground_truth.migrating_occurrences} |`);
    lines.push(`| researched phase-verifier drivers (D-21, migrated now, consolidated later) | ${inv.ground_truth.phase_verifier_occurrences} |`);
    lines.push(`| **researched total** | **${gt.expected}** |`);
    lines.push('');
    lines.push(gt.closes
      ? `**The arithmetic closes exactly: ${gt.accounted} = ${gt.expected}.** Nothing is absorbed.`
      : `**The arithmetic does NOT close: ${gt.accounted} against ${gt.expected}, a deviation of ${gt.accounted - gt.expected}.**`);
  }

  lines.push('');
  lines.push(`## Offenses — occurrences that must be renamed (${offenses.length})`);
  lines.push('');
  lines.push('One row per occurrence, as `path:line:token`, sorted by path then line.');
  lines.push('');
  lines.push('```');
  for (const o of offenses) lines.push(`${o.file}:${o.line}:${o.row.token}`);
  if (offenses.length === 0) lines.push('(none)');
  lines.push('```');
  lines.push('');
  lines.push(`## Held back — frozen / coincidental occurrences the rename must not touch (${heldBack.length})`);
  lines.push('');
  lines.push('```');
  for (const o of heldBack) lines.push(`${o.file}:${o.line}:${o.row.token}  [${o.row.class}]`);
  if (heldBack.length === 0) lines.push('(none)');
  lines.push('```');
  lines.push('');
  lines.push('## Per-token totals');
  lines.push('');
  lines.push('| token | case | class | scoped to | expected | observed |');
  lines.push('|---|---|---|---|---|---|');
  const counts = new Map();
  for (const o of result.occurrences) {
    counts.set(rowKey(o.row), (counts.get(rowKey(o.row)) ?? 0) + 1);
  }
  for (const row of orderRows(result.rows)) {
    const scope = row.only_in ? row.only_in.join('<br>') : '(all files in scope)';
    lines.push(`| \`${row.token}\` | ${row.case_form} | ${row.class} | ${scope} | ${row.expected_count} | ${counts.get(rowKey(row)) ?? 0} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

const SELF_TEST_INVENTORY = {
  $comment: 'scan-brand-residue.mjs --self-test fixture inventory. Never the real one.',
  scope: { exclude: [], binary_extensions: ['.png'], residue_probes: ['sourcerer'] },
  tokens: [
    {
      token: 'sourcerer',
      case_form: 'lower',
      class: 'brand-identifier',
      target: 'powerbrowser',
      expected_count: 1,
      expected_files: ['planted-violation.txt'],
    },
  ],
};

function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), 'scan-brand-residue-'));
  let overall = 0;
  try {
    // Fixture 1: a planted residual occurrence must be rejected AND named.
    const plantedRel = 'planted-violation.txt';
    writeFileSync(join(tmp, plantedRel), 'chrome://sourcerer/content/x\n');
    const r1 = scan(SELF_TEST_INVENTORY, { root: tmp, files: [plantedRel] });
    const o1 = offensesOf(r1);
    if (o1.length === 0) {
      console.error('scan-brand-residue: --self-test FAIL -- planted violation was NOT rejected');
      overall = 1;
    } else if (o1.some((o) => o.file === plantedRel)) {
      console.log(`scan-brand-residue: --self-test PASS -- planted violation was correctly rejected and named: ${o1[0].file}:${o1[0].line}:${o1[0].row.token}`);
    } else {
      console.error('scan-brand-residue: --self-test FAIL -- rejected, but message does not name the planted path');
      overall = 1;
    }

    // Fixture 2: the boundary rule. `resourcerer` is not a token match;
    // `sourcererPrivilegedJs` is (camelCase join).
    const boundaryRel = 'planted-boundary.txt';
    writeFileSync(join(tmp, boundaryRel), 'resourcerer\nsourcererPrivilegedJs\n');
    const invB = structuredClone(SELF_TEST_INVENTORY);
    invB.tokens[0].expected_files = [boundaryRel];
    const r2 = scan(invB, { root: tmp, files: [boundaryRel] });
    const hits = r2.occurrences.map((o) => o.line);
    if (hits.length === 1 && hits[0] === 2) {
      console.log('scan-brand-residue: --self-test PASS -- boundary rule left `resourcerer` untouched and matched `sourcererPrivilegedJs`');
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- boundary rule matched lines [${hits}], expected exactly [2] (planted-boundary.txt)`);
      overall = 1;
    }

    // Fixture 3: condition 4's independent probe catches an occurrence the
    // boundary matcher misses. `resourcerer` contains the probe but no row
    // claims it, so a --reconcile run must fail naming that file:line.
    const rec2 = reconcile(invB, r2, {});
    if (rec2.failures.some((f) => f.includes('condition 4') && f.includes(boundaryRel))) {
      console.log('scan-brand-residue: --self-test PASS -- condition 4 named the unclaimed probe hit in planted-boundary.txt');
    } else {
      console.error('scan-brand-residue: --self-test FAIL -- condition 4 did not name the unclaimed probe hit');
      overall = 1;
    }

    // Fixture 5: --except-hand-write must have TEETH. It holds back the
    // hand-write surfaces (whole-file and line-scoped alike) and NOTHING else:
    // an ordinary identifier site in a non-hand-write file, and an ordinary
    // line in a line-scoped file, both stay enforced. An exception that
    // excepted more than its declared sites would be indistinguishable from a
    // green tree, which is the whole failure mode this flag risks.
    const hwFileRel = 'planted-handwrite.desktop';
    const hwLineRel = 'planted-linescoped.json';
    const ordinaryRel = 'planted-ordinary.txt';
    writeFileSync(join(tmp, hwFileRel), 'Exec=/x/sourcerer/bin/sourcerer\n');
    writeFileSync(join(tmp, hwLineRel), '"applicationName": "sourcerer"\n"id": "sourcerer"\n');
    writeFileSync(join(tmp, ordinaryRel), 'chrome://sourcerer/content/y\n');
    const invHW = structuredClone(SELF_TEST_INVENTORY);
    invHW.hand_write = {
      files: [hwFileRel],
      line_contains: [{ file: hwLineRel, contains: '"applicationName"' }],
    };
    const r4 = scan(invHW, { root: tmp, files: [hwFileRel, hwLineRel, ordinaryRel] });
    const { handWritten, enforced } = partitionHandWrite(invHW, offensesOf(r4), { root: tmp });
    const hwSites = handWritten.map((o) => `${o.file}:${o.line}`).sort();
    const enSites = enforced.map((o) => `${o.file}:${o.line}`).sort();
    const wantHW = [`${hwFileRel}:1`, `${hwFileRel}:1`, `${hwLineRel}:1`].sort();
    const wantEn = [`${hwLineRel}:2`, `${ordinaryRel}:1`].sort();
    if (String(hwSites) === String(wantHW) && String(enSites) === String(wantEn)) {
      console.log(`scan-brand-residue: --self-test PASS -- --except-hand-write held back ${handWritten.length} declared hand-write site(s) and still enforced ${enforced.length} ordinary site(s), including line 2 of the line-scoped file`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- --except-hand-write partitioned wrongly: held back [${hwSites}] (expected [${wantHW}]), enforced [${enSites}] (expected [${wantEn}])`);
      overall = 1;
    }

    // Fixture 5b (WR-05, plan 01-18): the inventory invariant the --extra-root
    // row filter rests on. Two loads of the SAME fixture differing ONLY by the
    // planted row, so the throw is attributable to the plant. Written to disk
    // and read back through loadInventory() rather than passed in-process,
    // because "fails at LOAD" is the claim being proven.
    const invPath = join(tmp, 'planted-inventory.json');
    const invBase = {
      $comment: 'scan-brand-residue.mjs --self-test inventory-invariant fixture. Never the real one.',
      scope: { exclude: [], binary_extensions: ['.png'], residue_probes: ['sourcerer'] },
      // The excluded class MAY carry a probe -- that is this checkout's own
      // source path, and excluding it is what CR-01 (01-17) did.
      tokens: [{ token: '/x/y/sourcerer', case_form: 'literal', class: 'coincidental', expected_count: 0, expected_files: [] }],
    };
    writeFileSync(invPath, JSON.stringify(invBase));
    let ctlThrew = null;
    try {
      loadInventory(invPath);
    } catch (err) {
      ctlThrew = err.message;
    }
    if (ctlThrew !== null) {
      console.error(`scan-brand-residue: --self-test FAIL -- the unplanted inventory control did not load: ${ctlThrew}`);
      overall = 1;
    } else {
      const invPlant = structuredClone(invBase);
      invPlant.tokens.push({ token: 'SOURCERER_APP_ID', case_form: 'upper', class: 'frozen', expected_count: 0, expected_files: [] });
      writeFileSync(invPath, JSON.stringify(invPlant));
      let plantThrew = null;
      try {
        loadInventory(invPath);
      } catch (err) {
        plantThrew = err.message;
      }
      if (plantThrew && plantThrew.includes('SOURCERER_APP_ID') && plantThrew.includes('residue probe')) {
        console.log('scan-brand-residue: --self-test PASS -- a non-renameable, non-excluded inventory row carrying a residue probe was rejected at load, naming the row');
      } else {
        console.error(`scan-brand-residue: --self-test FAIL -- a frozen row containing the residue probe did NOT fail at load (got: ${plantThrew ?? '<no throw>'})`);
        overall = 1;
      }
    }

    // Fixture 4: non-vacuity. An empty scan set is a FAIL, not a clean pass.
    const r3 = scan(SELF_TEST_INVENTORY, { root: tmp, files: [] });
    if (r3.empty) {
      console.log('scan-brand-residue: --self-test PASS -- an empty scan set is reported as empty, not as clean');
    } else {
      console.error('scan-brand-residue: --self-test FAIL -- empty scan set was not flagged');
      overall = 1;
    }

    // Fixture 6 (01-08): the gate must be able to go RED on the POST-RENAME
    // branch, through the UN-FLAGGED path. That is the branch this repo
    // permanently sits on and the path all three registered call sites take, and
    // it was exactly the combination nothing exercised: condition 4 sat below
    // reconcile()'s post-rename early return, and its verdict was gated behind
    // `--reconcile`, so the registered gate could not fail on an unclaimed
    // occurrence. Two runs over one fixture inventory differing ONLY by the
    // plant, so the red is attributable to the plant rather than to the fixture.
    const postRenameInv = {
      $comment: 'scan-brand-residue.mjs --self-test post-rename fixture inventory. Never the real one.',
      scope: { exclude: [], binary_extensions: ['.png'], residue_probes: ['sourcerer'] },
      tokens: [{
        token: 'Sourcerer',
        case_form: 'title',
        class: 'frozen',
        expected_count: 1,
        expected_files: ['planted-postrename.txt'],
      }],
    };
    const postRel = 'planted-postrename.txt';
    const controlText = 'Sourcerer\n';

    // The control runs FIRST. An unplanted fixture that is not green makes the
    // red below prove nothing.
    writeFileSync(join(tmp, postRel), controlText);
    const rCtl = scan(postRenameInv, { root: tmp, files: [postRel] });
    const recCtl = reconcile(postRenameInv, rCtl, {});
    const gateCtl = gateFailures(offensesOf(rCtl), recCtl);
    if (recCtl.postRename && gateCtl.length === 0) {
      console.log(`scan-brand-residue: --self-test PASS -- the same post-rename fixture WITHOUT the plant produced no gate failure (${postRel}), so the red below is caused by the plant and not by the fixture`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- the unplanted post-rename control was not clean: postRename=${recCtl.postRename}, gate=[${gateCtl}]`);
      overall = 1;
    }

    // The plant: the trailing-plural form. Its trailing lowercase character
    // puts it outside the TitleCase row's right-boundary rule, so no row claims
    // it, while condition 4's case-insensitive probe substring stays fully
    // intact. That it is genuinely unclaimed is ASSERTED below, not assumed.
    writeFileSync(join(tmp, postRel), `${controlText}Sourcerers\n`);
    const rPlant = scan(postRenameInv, { root: tmp, files: [postRel] });
    const recPlant = reconcile(postRenameInv, rPlant, {});
    const gatePlant = gateFailures(offensesOf(rPlant), recPlant);
    const plantClaimed = rPlant.occurrences.some((o) => o.line === 2);
    const namesPlant = gatePlant.length !== 0 &&
      recPlant.failures.some((f) => f.includes('condition 4') && f.includes(`${postRel}:2`));
    if (!recPlant.postRename) {
      console.error('scan-brand-residue: --self-test FAIL -- the planted fixture is not on the post-rename branch, so it does not exercise the branch this tree sits on');
      overall = 1;
    } else if (plantClaimed) {
      console.error('scan-brand-residue: --self-test FAIL -- an inventory row claimed the planted trailing-plural form, so it is not a genuinely unclaimed plant; choose another form');
      overall = 1;
    } else if (namesPlant) {
      console.log(`scan-brand-residue: --self-test PASS -- an unclaimed trailing-plural form planted on a POST-RENAME fixture was rejected by the un-flagged gate path, naming ${postRel}:2`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- the planted unclaimed form did NOT fail the un-flagged gate: gate=[${gatePlant}], failures=[${recPlant.failures}]`);
      overall = 1;
    }

    // Fixtures 6b-6d (P60-R2): `scope.tracked_residue_probes`. Fixture
    // inventories only; the plant files are fixtures in tmp.
    const orcaInv = (count) => ({
      $comment: 'scan-brand-residue.mjs --self-test tracked-probe fixture inventory. Never the real one.',
      scope: { exclude: [], binary_extensions: ['.png'], residue_probes: ['sourcerer'], tracked_residue_probes: ['orca'] },
      tokens: [{
        token: 'Orca', case_form: 'title', class: 'coincidental', target: 'Orca',
        expected_count: count, expected_files: ['a.txt'], only_in: ['a.txt'],
      }],
    });
    const orcaDir = join(tmp, 'tracked-probe');
    mkdirSync(orcaDir);
    writeFileSync(join(orcaDir, 'a.txt'), 'Orca\n');
    const orcaGate = (inv, files) => {
      const r = scan(inv, { root: orcaDir, files });
      const rec = reconcile(inv, r, {});
      return { gate: gateFailures(offensesOf(r), rec), failures: rec.failures };
    };
    // 6b: green control, then an unclaimed Orca in another file.
    const oCtl = orcaGate(orcaInv(1), ['a.txt']);
    writeFileSync(join(orcaDir, 'b.txt'), 'Orca planted\n');
    const oPlant = orcaGate(orcaInv(1), ['a.txt', 'b.txt']);
    if (oCtl.gate.length !== 0) {
      console.error(`scan-brand-residue: --self-test FAIL -- the tracked-probe control (one claimed Orca in a.txt) is not green: [${oCtl.failures}]`);
      overall = 1;
    } else if (oPlant.failures.some((f) => f.includes('condition 4') && f.includes('b.txt:1') && f.includes('probe "orca"'))) {
      console.log('scan-brand-residue: --self-test PASS -- tracked_residue_probes: a claimed Orca is green, and an unclaimed Orca in b.txt fails condition 4 naming b.txt:1 and probe "orca"');
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- an unclaimed Orca under tracked_residue_probes did not fail condition 4 naming b.txt:1: [${oPlant.failures}]`);
      overall = 1;
    }
    // 6c: the same coincidental row with a wrong exact count.
    const oCount = orcaGate(orcaInv(2), ['a.txt']);
    if (oCount.gate.length !== 0 && oCount.failures.some((f) => f.includes('held-back row "Orca"') && f.includes('expected 2'))) {
      console.log('scan-brand-residue: --self-test PASS -- an Orca coincidental row with expected_count 2 over one occurrence is red, naming the row');
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- a wrong Orca expected_count stayed green or did not name the row: [${oCount.failures}]`);
      overall = 1;
    }
    // 6d: the --extra-root scan (the call main() makes) ignores the tracked
    // probe, while residue_probes still run there.
    const extraOrcaDir = join(tmp, 'tracked-probe-extra');
    mkdirSync(extraOrcaDir);
    writeFileSync(join(extraOrcaDir, 'gecko.txt'), 'Orca screen reader\nErrorCallback\n');
    const eCtl = scanExtraRoot(orcaInv(1), extraOrcaDir, ['gecko.txt']);
    const tCtl = scan(orcaInv(1), { root: extraOrcaDir, files: ['gecko.txt'] });
    writeFileSync(join(extraOrcaDir, 'gecko.txt'), 'Orca screen reader\nErrorCallback\nSourcerers\n');
    const ePlant = scanExtraRoot(orcaInv(1), extraOrcaDir, ['gecko.txt']);
    const orcaLeak = eCtl.unclaimedProbes.filter((u) => u.probe === 'orca').length;
    const trackedSees = tCtl.unclaimedProbes.filter((u) => u.probe === 'orca').length;
    if (orcaLeak === 0 && trackedSees === 2 && ePlant.unclaimedProbes.some((u) => u.probe === 'sourcerer' && u.line === 3)) {
      console.log('scan-brand-residue: --self-test PASS -- the --extra-root scan raised no orca probe over "Orca screen reader" and ErrorCallback (the tracked scan raises 2 there), while a planted sourcerer form in the same fixture is still red');
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- --extra-root orca probe hits ${orcaLeak} (want 0), tracked-scan orca hits ${trackedSees} (want 2), planted sourcerer hit ${ePlant.unclaimedProbes.some((u) => u.probe === 'sourcerer')} (want true)`);
      overall = 1;
    }

    // Fixtures 7-9 (01-15): the `--extra-root` mode, which is how this gate
    // reaches a tree `git ls-files` cannot name.
    //
    // Unlike every fixture above, these three spawn the REAL CLI as a
    // subprocess rather than calling scan() directly, because CR-B's missing[]
    // names a token "passed as --extra-root" -- the argument parsing, the walk,
    // the filters, the reporting and the exit code are all part of what has to
    // be proven, and none of them is exercised by an in-process scan() call.
    //
    // Each of these three also runs the ordinary tracked-tree scan as a side
    // effect, which is precisely why the first row is a control: without it, a
    // red in the second row could have been caused by the tracked-tree half
    // rather than by the plant.
    //
    // IN-04 (plan 01-17), stated so it is not rediscovered: because every
    // CLI-spawning row below runs the full tracked-tree scan as a side effect, a
    // DIRTY WORKING TREE can turn any of them red for a reason that has nothing
    // to do with its plant. The clean-control row runs first precisely so such a
    // red is attributable -- read the control's verdict before believing any row
    // beneath it.
    const SELF = fileURLToPath(import.meta.url);
    const runCli = (...args) => {
      try {
        return { status: 0, out: execFileSync(process.execPath, [SELF, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
      } catch (err) {
        return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
      }
    };

    const cleanRootLabel = '--extra-root over a clean scratch root is a PASS control';
    const cleanRoot = join(tmp, 'extra-root-clean');
    mkdirSync(cleanRoot);
    writeFileSync(join(cleanRoot, 'clean.txt'), 'nothing to see here\n');
    const rClean = runCli('--extra-root', cleanRoot);
    if (rClean.status === 0) {
      console.log(`scan-brand-residue: --self-test PASS -- ${cleanRootLabel}`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- ${cleanRootLabel}: exited ${rClean.status} over a token-free root, so the two rows below prove nothing -- their red could not be attributed to their plant. Output: ${rClean.out.trim()}`);
      overall = 1;
    }

    const plantOutsideLabel = '--extra-root names a brand token planted outside the git index';
    const plantRoot = join(tmp, 'extra-root-planted');
    const plantedOutsideRel = 'planted-outside-index.txt';
    mkdirSync(plantRoot);
    writeFileSync(join(plantRoot, plantedOutsideRel), 'chrome://sourcerer/content/x\n');
    const rPlantOutside = runCli('--extra-root', plantRoot);
    if (rPlantOutside.status !== 0 &&
        rPlantOutside.out.includes(plantRoot) &&
        rPlantOutside.out.includes(plantedOutsideRel)) {
      console.log(`scan-brand-residue: --self-test PASS -- ${plantOutsideLabel}`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- ${plantOutsideLabel}: exited ${rPlantOutside.status} and did not name both ${plantRoot} and ${plantedOutsideRel}. A non-zero exit alone is not enough -- a red that does not name the path leaves an operator unable to find the residue. Output: ${rPlantOutside.out.trim()}`);
      overall = 1;
    }

    // What this row defends: a skip-when-absent mode would be green by
    // construction, which is the exact failure class CR-B is.
    const missingRootLabel = '--extra-root on a nonexistent directory fails loudly rather than skipping';
    const missingRoot = join(tmp, 'extra-root-never-created');
    const rMissing = runCli('--extra-root', missingRoot);
    if (rMissing.status !== 0 && rMissing.out.includes(missingRoot)) {
      console.log(`scan-brand-residue: --self-test PASS -- ${missingRootLabel}`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- ${missingRootLabel}: exited ${rMissing.status} and did not name ${missingRoot}. A root that is silently skipped when absent cannot go red for its stated cause. Output: ${rMissing.out.trim()}`);
      overall = 1;
    }

    // The typo guard. Before it, an unknown flag was dropped and the run
    // reported a green tracked-tree PASS -- so a mistyped `--extra-root` at a
    // call site would have re-created CR-B silently.
    const typoLabel = 'a mistyped flag is rejected rather than silently ignored into a green run';
    const rTypo = runCli('--extra-roots', cleanRoot);
    if (rTypo.status === 2 && rTypo.out.includes('--extra-roots')) {
      console.log(`scan-brand-residue: --self-test PASS -- ${typoLabel}`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- ${typoLabel}: exited ${rTypo.status} (expected 2) and did not name the argument. Output: ${rTypo.out.trim()}`);
      overall = 1;
    }

    // CR-01 (plan 01-17). The plant is 01-REVIEW.md's literal reproduction: a
    // mozconfig-shaped assignment whose objdir path embeds this checkout's own
    // absolute source path, which is the `coincidental` row that used to claim
    // the whole span and exempt the `brand-identifier` token inside it.
    // Measured on the pre-fix script: this exact input exited 0 printing
    // `PASS -- ... plus 1 file(s) under --extra-root`.
    //
    // This row has no control of its own on purpose: the clean-root row above
    // already establishes that a token-free scratch root exits 0, so a red here
    // is attributable to the plant. That control must keep running BEFORE this
    // row -- do not reorder them.
    //
    // Spelling a real inventory token in this file is safe and is this file's
    // established practice: `inventory/brand-tokens.json`'s `scope.exclude`
    // lists `scripts/scan-brand-residue.mjs` for exactly that reason.
    const coincidentalLabel = '--extra-root does not exempt a brand token claimed by a coincidental-class row';
    const coincRoot = join(tmp, 'extra-root-coincidental');
    const coincRel = 'mozconfig';
    mkdirSync(coincRoot);
    writeFileSync(join(coincRoot, coincRel), 'MOZ_OBJDIR=/home/chris/coding/sourcerer/objdir\n');
    const rCoinc = runCli('--extra-root', coincRoot);
    if (rCoinc.status !== 0 && rCoinc.out.includes(coincRoot) && rCoinc.out.includes(coincRel)) {
      console.log(`scan-brand-residue: --self-test PASS -- ${coincidentalLabel}`);
    } else {
      console.error(`scan-brand-residue: --self-test FAIL -- ${coincidentalLabel}: exited ${rCoinc.status} and did not name both ${coincRoot} and ${coincRel}. A coincidental row is an assertion about THIS checkout, and nothing reconciles its count under --extra-root, so a token it swallows there passes the gate whose purpose is catching it. Output: ${rCoinc.out.trim()}`);
      overall = 1;
    }

    // CR-02 (plan 01-17). Measured on the pre-fix script: this exact input
    // exited 0 printing `PASS -- ... plus 1 file(s) under --extra-root` -- a
    // file it never opened, counted as scanned.
    //
    // The row verifies its own precondition before asserting anything, because
    // a plant that is not actually unreadable proves nothing while looking like
    // proof. Stated consequence, so it is met as a decision rather than a
    // surprise: `--self-test` run AS ROOT will go red here by design, since root
    // can read a mode-000 file. That is the correct trade -- a silent skip is
    // the exact failure class this plan closes three times over. This repo's CI
    // and local development both run as a non-root user. If a root-running
    // caller ever appears, the fix is a plant mechanism that is unreadable
    // regardless of uid, never a skip.
    const unreadableLabel = 'an unreadable file under --extra-root is a gate failure, not a silent skip';
    const unreadRoot = join(tmp, 'extra-root-unreadable');
    const unreadRel = 'leak.txt';
    const unreadAbs = join(unreadRoot, unreadRel);
    mkdirSync(unreadRoot);
    writeFileSync(unreadAbs, 'chrome://sourcerer/content/x\n');
    chmodSync(unreadAbs, 0o000);
    let plantIsUnreadable = false;
    try {
      readFileSync(unreadAbs, 'utf8');
    } catch {
      plantIsUnreadable = true;
    }
    if (!plantIsUnreadable) {
      console.error(`scan-brand-residue: --self-test FAIL -- ${unreadableLabel}: the plant at ${unreadAbs} is still readable after chmod 000, so this row could not establish its precondition and it proves nothing. This is what happens when --self-test runs as root; run it as a non-root user.`);
      overall = 1;
    } else {
      const rUnread = runCli('--extra-root', unreadRoot);
      if (rUnread.status !== 0 && rUnread.out.includes(unreadRel)) {
        console.log(`scan-brand-residue: --self-test PASS -- ${unreadableLabel}`);
      } else {
        console.error(`scan-brand-residue: --self-test FAIL -- ${unreadableLabel}: exited ${rUnread.status} and did not name ${unreadRel}. A file the scanner could not open is not a file it found clean, and counting it as scanned tells the operator the gate covered it. Output: ${rUnread.out.trim()}`);
        overall = 1;
      }
    }
    // Restore the mode so the recursive cleanup below cannot fail on it.
    chmodSync(unreadAbs, 0o644);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return overall;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Flags that consume the following argv entry as their value. */
const FLAGS_TAKING_A_VALUE = new Set(['--scope-chain', '--report', '--extra-root']);
const KNOWN_FLAGS = new Set([...FLAGS_TAKING_A_VALUE, '--self-test', '--reconcile', '--except-hand-write']);

function main(argv) {
  // Reject an argument this script does not know, rather than ignoring it.
  // Until plan 01-15 an unknown flag was silently dropped, so a typo at a call
  // site -- `--extra-roots "$UPSTREAM_DIR"`, say -- produced a green
  // tracked-tree PASS while the caller believed a second tree had been
  // scanned. That is the same green-by-construction failure CR-B is, one
  // keystroke away, so the guard ships with the mode rather than after the
  // first time it bites. Measured on the pre-fix script: `--extra-root <dir>`
  // with a planted token exited 0 printing `PASS -- ... 109 scanned file(s)`.
  for (let i = 0; i < argv.length; i++) {
    if (!KNOWN_FLAGS.has(argv[i])) {
      console.error(`scan-brand-residue: FAIL -- unrecognized argument: ${argv[i]}`);
      return 2;
    }
    if (FLAGS_TAKING_A_VALUE.has(argv[i])) i++;
  }

  if (argv.includes('--self-test')) return selfTest();

  const chainIdx = argv.indexOf('--scope-chain');
  const chain = chainIdx === -1 ? null : argv[chainIdx + 1];
  if (chainIdx !== -1 && !chain) {
    console.error('scan-brand-residue: FAIL -- --scope-chain requires a chain name');
    return 2;
  }
  const reportIdx = argv.indexOf('--report');
  const reportPath = reportIdx === -1 ? null : argv[reportIdx + 1];
  if (reportIdx !== -1 && !reportPath) {
    console.error('scan-brand-residue: FAIL -- --report requires a path');
    return 2;
  }
  const extraRootIdx = argv.indexOf('--extra-root');
  const extraRootArg = extraRootIdx === -1 ? null : argv[extraRootIdx + 1];
  if (extraRootIdx !== -1 && !extraRootArg) {
    console.error('scan-brand-residue: FAIL -- --extra-root requires a directory');
    return 2;
  }
  const exceptHandWrite = argv.includes('--except-hand-write');
  const wantReconcile = argv.includes('--reconcile');

  if (!existsSync(INVENTORY_PATH)) {
    console.error(`scan-brand-residue: FAIL -- ${INVENTORY_PATH} does not exist; the inventory is this scan's only token source`);
    return 1;
  }
  const inv = loadInventory();
  if (inv.tokens.length === 0) {
    console.error('scan-brand-residue: FAIL -- inventory carries zero token rows; an empty token set is not a clean scan');
    return 1;
  }

  const result = scan(inv, { chain });
  if (result.empty) {
    console.error(`scan-brand-residue: FAIL -- the scanned file set is empty${chain ? ` for chain "${chain}"` : ''} -- an empty file set is not a clean tree, it is a scan that ran over nothing`);
    return 1;
  }

  const allOffenses = offensesOf(result);
  const split = exceptHandWrite
    ? partitionHandWrite(inv, allOffenses)
    : { handWritten: [], enforced: allOffenses };
  const offenses = split.enforced;
  for (const o of offenses) {
    console.error(`  ${o.file}:${o.line}: ${o.row.token}`);
  }
  // Report what was held back, by file and by class, with counts. A gate that
  // goes quiet about what it stopped checking is how an exception outlives its
  // hand-off. Naming the classes too makes it visible that this exception
  // spans `brand-display` (Pitfall 1) AND `brand-identifier` (Pitfall 4).
  if (split.handWritten.length !== 0) {
    const files = [...new Set(split.handWritten.map((o) => o.file))].sort();
    const classes = [...new Set(split.handWritten.map((o) => o.row.class))].sort();
    console.log(`scan-brand-residue: HELD BACK -- ${split.handWritten.length} occurrence(s) across ${files.length} hand-write surface(s) [${classes.join(', ')}] excepted by --except-hand-write (owned by a later plan, not clean):`);
    for (const f of files) {
      console.log(`  ${f}: ${split.handWritten.filter((o) => o.file === f).length}`);
    }
  } else if (exceptHandWrite) {
    console.log('scan-brand-residue: HELD BACK -- nothing; every hand-write surface is already clean, so --except-hand-write can be dropped from the gate');
  }

  const rec = reconcile(inv, result, { chain, chainFiles: chain ? chainOf(inv, chain).files : null });

  if (reportPath) {
    writeFileSync(resolve(REPO_ROOT, reportPath), renderReport(inv, result, rec, { chain }));
    console.log(`scan-brand-residue: report written to ${reportPath}`);
  }

  // The `asserting ...` narration is progress reporting and stays behind the
  // flag. The FAILURES are not narration: a gate that exits non-zero while
  // saying nothing about what failed is unusable, so they print on every run.
  if (wantReconcile) {
    for (const c of rec.conditions) console.log(`scan-brand-residue: asserting ${c}`);
  }
  for (const f of rec.failures) console.error(`scan-brand-residue: ${f}`);

  // One exit source. What this widens, stated plainly: on the pre-rename branch
  // the un-flagged run now also enforces conditions 1-3 and the ground-truth
  // arithmetic. That is not a regression -- the pre-rename branch is only
  // reached when renameable offenses exist, in which case the gate had already
  // failed on the first reason.
  const gate = gateFailures(offenses, rec, { chain });

  // CR-02 (plan 01-17), tracked-tree policy. The split is deliberate and it is
  // the whole reason `scan()` records rather than decides: `ENOENT` here is the
  // documented and legitimate case -- a path git tracks which this checkout
  // does not materialise -- and it keeps its allowance, so a sparse or partial
  // checkout stays green. EVERY other code means a tracked file could not be
  // read, which the old justifying comment never covered and which was silently
  // skipped and counted as scanned. A file that could not be read is not a file
  // that was found clean.
  for (const u of result.unreadable ?? []) {
    if (u.reason === 'ENOENT') continue;
    gate.push(`${u.file} could not be read (${u.reason}) -- a file that could not be read is not a file that was found clean`);
  }

  // WR-03 (plan 01-18). The tracked-tree PASS line used to print
  // `result.files.length` -- files WALKED -- while the ENOENT allowance above
  // means some of those were never opened. 01-17 corrected the extra-root
  // summary on the stated grounds that "reporting an unopened file as scanned
  // tells the operator the gate covered a file it never opened"; the
  // tracked-tree branch is where that defect is actually REACHABLE, because
  // ENOENT keeps its allowance and the run still passes. Any non-ENOENT entry
  // has already pushed a gate reason above, so at the PASS line the subtrahend
  // is exactly the allowed skips.
  const scannedCount = result.files.length - (result.unreadable ?? []).length;
  // An allowed skip is still a hole in coverage. Naming the skipped paths at
  // --reconcile verbosity keeps a GROWING skip set visible instead of folding it
  // into a silently shrinking number.
  const skipped = (result.unreadable ?? []).filter((u) => u.reason === 'ENOENT');
  if (wantReconcile && skipped.length !== 0) {
    console.log(`scan-brand-residue: SKIPPED -- ${skipped.length} tracked path(s) this checkout does not materialise (ENOENT), walked but never opened:`);
    for (const u of skipped) console.log(`  ${u.file}`);
  }

  // The --extra-root pass. It joins the SAME gate reasons and the same single
  // exit below -- the tracked-tree scan above always ran and is never replaced.
  //
  // It runs offenses and unclaimed residue probes, and deliberately does NOT
  // call reconcile() or groundTruth(). Those implement D-17's census of THIS
  // repo's own migrating tree; applied to a foreign Gecko checkout the
  // arithmetic cannot close, so reusing them would make this pass permanently
  // red for a reason that has nothing to do with residual brand strings -- and
  // a permanently-red gate is a gate that gets switched off. The probes still
  // run for the reason reconciliation condition 4 exists: they are the
  // independent detector that catches a case variant the boundary matcher
  // missed, which over an unowned tree is the likelier failure.
  let extraSummary = '';
  if (extraRootArg) {
    // IN-01 (plan 01-17): resolved against REPO_ROOT, the same base `--report`
    // uses, so the CLI's two path flags do not resolve a relative argument
    // against two different directories. Both current callers pass an absolute
    // path, which `resolve` returns unchanged, so this is a foot-gun removal
    // rather than a behaviour change.
    const extraRoot = resolve(REPO_ROOT, extraRootArg);
    let extraFiles = null;
    try {
      extraFiles = extraRootFiles(inv, extraRoot);
    } catch (err) {
      gate.push(err.message);
    }
    if (extraFiles && extraFiles.length === 0) {
      gate.push(`the --extra-root file set is empty for ${extraRoot} -- an empty file set is not a clean tree, it is a scan that ran over nothing`);
    } else if (extraFiles) {
      // CR-01 (plan 01-17): the row set this pass scans with EXCLUDES the
      // `coincidental` class, and only that class.
      //
      // Why it must be excluded here: a `coincidental` row is an assertion
      // about THIS checkout -- a local absolute source path and two hex colour
      // literals -- and is meaningless as a claim about a foreign tree.
      // Applied there it is worse than inert. `claimOccurrences` orders rows
      // longest-token-first, so the 28-character local-path row wins over the
      // shorter `brand-identifier` row nested inside it, writes the whole span
      // into `taken[]`, and classifies the occurrence `coincidental` -- which
      // `offensesOf` does not count as an offence AND which suppresses the
      // independent residue probe at that same index, because a claimed span
      // is a written `taken[]` entry. Over the tracked tree that is safe only
      // because `reconcile()` condition 2 asserts the row's observed count is
      // zero; this pass deliberately does not run `reconcile()` (see above), so
      // nothing constrains it here at all. The single likeliest residue in a
      // replayed tree -- an absolute source or objdir path baked into a
      // mozconfig, a patch header or a generated build file -- is exactly the
      // shape that exempts.
      //
      // Why nothing ELSE is excluded: `frozen` rows (`MOZ_APP_ID`,
      // `%content/branding/`, `-brand-product-name = Firefox`) legitimately
      // occur in a Gecko checkout, so dropping them would produce claim churn
      // without closing anything. The three renameable classes are what this
      // gate exists to catch.
      //
      // WR-05 (plan 01-18): the part of that reasoning which is a PROPERTY --
      // that no non-excluded, non-renameable row carries a residue probe -- is
      // no longer argued here about the rows that happen to exist today. It is
      // derived from the inventory by `assertNoProbeSwallowingRow`, which
      // `loadInventory` runs, so adding such a row fails at load rather than
      // silently reopening this defect.
      //
      // P60-R2: and it probes with `residue_probes` only, never
      // `tracked_residue_probes` -- see scanExtraRoot().
      const extra = scanExtraRoot(inv, extraRoot, extraFiles);
      const extraOffenses = offensesOf(extra);
      for (const o of extraOffenses) {
        console.error(`  ${join(extraRoot, o.file)}:${o.line}: ${o.row.token}`);
      }
      for (const u of extra.unclaimedProbes) {
        console.error(`  ${join(extraRoot, u.file)}:${u.line}: "${u.text}" matched probe "${u.probe}" but no inventory row claimed it`);
      }
      if (extraOffenses.length !== 0) {
        gate.push(`${extraOffenses.length} residual brand occurrence(s) across ${new Set(extraOffenses.map((o) => o.file)).size} file(s) under --extra-root ${extraRoot}`);
      }
      if (extra.unclaimedProbes.length !== 0) {
        gate.push(`${extra.unclaimedProbes.length} unclaimed residue-probe hit(s) under --extra-root ${extraRoot} -- a form no inventory row claimed`);
      }
      // CR-02 (plan 01-17), extra-root policy. ANY unreadable file fails here,
      // with no reason-code allowance: this file set came from a `readdirSync`
      // that had just reported each entry as an existing regular file, so the
      // absent case the tracked-tree allowance exists for cannot arise. A
      // warning, a skipped row or a silently corrected count would be CR-B in a
      // new shape -- an invocation that cannot go red for its stated cause.
      for (const u of extra.unreadable) {
        console.error(`  ${join(extraRoot, u.file)}: unreadable (${u.reason})`);
      }
      if (extra.unreadable.length !== 0) {
        gate.push(`${extra.unreadable.length} unreadable file(s) under --extra-root ${extraRoot} -- a file that could not be read is not a file that was found clean`);
      }
      // The count names files actually READ, not files walked. Reporting an
      // unopened file as scanned tells the operator the gate covered a file it
      // never opened, which is the half of CR-02 that is a reporting defect
      // rather than a detection defect.
      extraSummary = `, plus ${extraFiles.length - extra.unreadable.length} file(s) under --extra-root ${extraRoot}`;
    }
  }

  if (gate.length !== 0) {
    for (const reason of gate) console.error(`scan-brand-residue: FAIL -- ${reason}`);
    return 1;
  }
  console.log(`scan-brand-residue: PASS -- no residual brand occurrence in ${scannedCount} scanned file(s)${extraSummary}${chain ? ` for chain "${chain}"` : ''}${exceptHandWrite ? ' (excepting the hand-write surfaces named above)' : ''}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
