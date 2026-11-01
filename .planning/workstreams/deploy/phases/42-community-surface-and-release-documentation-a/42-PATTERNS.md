# Phase 42: Community surface and release documentation (A) - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 18
**Analogs found:** 8 / 18

All analog paths below were verified git-tracked with `git ls-files -- <path>` (all 7 print back, exit 0).
No analog is a gitignored mirror; no `scripts/verify-ng-NNN-*.mjs` path is named as a write target (hash-locked, read-only analogs only — none used here).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/settings/labels.json` (NEW) | config | declared state | `.github/settings/repo.json` + 42-RESEARCH.md §Code Examples labels.json shape | role-match (no labels body exists yet) |
| `scripts/verify-repo-controls.mjs` (MOD: `labels` control + `compareLabels` + `ownerSteps` + self-test plants) | test/gate | request-response (read-only `gh api`) + in-memory compare | `scripts/verify-repo-controls.mjs` itself (CONTROLS table, lines 551-646) | exact |
| `scripts/apply-repo-controls.mjs` (MOD only if `planWrites` shape changes — likely untouched) | utility | request-response (writes) | `scripts/apply-repo-controls.mjs` itself (lines 42-56) | exact |
| `scripts/verify-labels.mjs` (NEW quick row) | test/gate | transform (YAML parse + derive/compare as set equality) | `scripts/verify-update-channel.mjs` (gate skeleton) + `scripts/verify-workflows.mjs` (js-yaml reach-in, admission equality) | exact |
| `scripts/verify-renewals.mjs` (NEW quick row) | test/gate | transform (Markdown table parse, structure-only) | `scripts/verify-update-channel.mjs` (gate skeleton, vacuity guard) | exact |
| `scripts/verify-platform.sh` (MOD: 4 quick rows) | config/registry | — | `scripts/verify-platform.sh` itself, lines 4706-4730 + 5088-5092 | exact |
| `.github/ISSUE_TEMPLATE/bug.yml` (NEW) | config | — | none (dir absent; `git ls-files` empty) — use 42-RESEARCH.md §Pattern 2 + §Code Examples skeleton | none |
| `.github/ISSUE_TEMPLATE/feature.yml` (NEW) | config | — | none — same as bug.yml | none |
| `.github/ISSUE_TEMPLATE/config.yml` (NEW) | config | — | none — same as bug.yml | none |
| `SECURITY.md` (NEW, product repo) | docs | — | none — use GH-14 requirement text verbatim | none |
| `SUPPORT.md` (NEW, product repo) | docs | — | none — use GH-14 requirement text verbatim | none |
| `docs/KNOWN-ISSUES.md` (NEW) | docs | — | none — product-specific, no platform convention | none |
| org `.github` repo `SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` (NEW, owner-created repo) | docs | — | none (`gh api repos/DeBIOS-Foundation/.github` 404s; repo does not exist) | none |
| `docs/RENEWALS.md` (NEW) | docs | — | none — use 42-RESEARCH.md §Pattern 3 row sketch | none |
| `docs/RELEASING.md` (MOD: DOC-03/DOC-05 content-anchor edits) | docs | — | `docs/RELEASING.md` itself (anchors below) | exact |
| S2/S3/S8 reconciliation record (NEW) | docs/record | — | 42-RESEARCH.md §Pattern 5 (supersede-or-current per draft); `docs/RELEASING.md` Stage plan index as home candidate | partial |

## Pattern Assignments

### `.github/settings/labels.json` (NEW config, declared state)

**Analog:** `.github/settings/repo.json` (role-match — smallest tracked settings body) + 42-RESEARCH.md §Code Examples (exact shape to copy)

**Tracked body shape** (`repo.json`, 4 lines):
```json
{
  "has_discussions": true,
  "allow_auto_merge": true
}
```

**Settings-set invariant that auto-covers the new file** (`scripts/verify-repo-controls.mjs` lines 679-693): `referencedFiles()` is derived from CONTROLS, so once a `labels` control references `labels.json`, an orphan/missing/unparseable body each goes red naming the file:
```js
for (const f of listed.filter(f => !want.includes(f))) {
    failures.push(`${SETTINGS_REL}/${f} is an orphan: no CONTROLS entry in ${SELF_REL} references it. ...`);
}
for (const f of want) {
    if (!listed.includes(f)) {
        failures.push(`${SETTINGS_REL}/${f} is missing, but CONTROLS references it. ...`);
```

**Declared shape to write** (from 42-RESEARCH.md §Code Examples — planner details, executor follows):
```jsonc
// .github/settings/labels.json — the GH-13 set; names are the set, colors/descriptions presentation
{
  "labels": [
    { "name": "type/bug", "color": "d73a4a", "description": "Something isn't working" },
    { "name": "needs-triage", "color": "fbca02", "description": "Awaiting triage" },
    { "name": "train:blocked", "color": "b60205", "description": "Release train blocked" }
  ]
}
```
Full family per 42-CONTEXT.md §Specifics: `type/*`, `os/*`, `format/*`, `area/*`, plus `needs-triage`, `needs-info`, `confirmed`, `duplicate`, `wontfix`, `good-first-issue`, `security`, `upstream`, `release-train`, `claude-fix`, `train:blocked`. Planner decides: canonical name for space-vs-hyphen (`good first issue` vs `good-first-issue`), `gsd:*` declare-or-delete, colon names (`train:blocked`) — §Pitfalls 1, 2, 9.

---

### `scripts/verify-repo-controls.mjs` (MOD — add `labels` control)

**Analog:** itself. Extend the table; do not invent a second instrument.

**CONTROLS entry shape** (lines 551-646; one-file example lines 616-622):
```js
{
    id: 'repo',
    file: 'repo.json',
    write: { method: 'PATCH', path: 'repos/{owner}/{repo}' },
    read: 'repos/{owner}/{repo}',
    compare: projection,
},
```
Recommended new entry (per 42-RESEARCH.md §Pattern 1): `id: 'labels'`, `file: 'labels.json'`, `write: null` (owner applies via `gh label`, same as `org`/`apps` at lines 630-645), `read: 'repos/{owner}/{repo}/labels?per_page=100'`, `compare: compareLabels`. `write: null` + `ownerSteps` is the established owner-action idiom — `planWrites` (lines 738-759) skips `write: null` entries and collects `ownerSteps` instead:
```js
if (c.ownerSteps) ownerSteps.push(...c.ownerSteps(c, declared));
if (c.write === null) continue;
```

**Set helpers to reuse** (lines 140-148, 391):
```js
function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).sort().join(',')}]`;
    ...
}
const same = (decl, live) => canon(decl) === canon(project(decl, live));
const setDiff = (want, got) => ({ missing: want.filter(x => !got.includes(x)), extra: got.filter(x => ![...] ) });
```
Actual line 391: `const setDiff = (want, got) => ({ missing: want.filter(x => !got.includes(x)), extra: got.filter(x => !want.includes(x)) });`

**compare sketch** (from 42-RESEARCH.md §Code Examples — follows the file's `setDiff`/fail-closed idioms at lines 391, 422-446):
```js
function compareLabels(c, declared, live, ctx) {
  const want = new Set((declared.labels ?? []).map(l => l.name));
  const got = Array.isArray(live) ? live.map(l => l.name) : null;
  if (got === null) return [`${c.id}: GET labels did not return a list. Next step: check the endpoint in ${SELF_REL}.`];
  // ... one failure per missing name ("declared label X is missing live ... owner runs the gh label create --force loop")
  // ... one failure per extra name ("live label X is extra ... declare it in a reviewed commit, or delete it")
}
```
Names only — color/description are presentation (planner to ratify). Fail closed on non-2xx/unparseable via the existing `ghGet`/`safeGetter` path (lines 60-97).

**ownerSteps precedent** (lines 452-464):
```js
function appOwnerSteps(c, declared) {
    return c.files.map(f => declared[f]).flatMap(a => [
        `Create GitHub App ${a.slug} under the org with exactly these permissions: ...`,
        `Install ${a.slug} on: ${a.repositories.join(', ')}`,
    ]);
}
```
New: print the exact `gh label create --force` loop (name, `--color`, `--description`) derived from `labels.json`, plus explicit `gh label delete` lines for defaults being removed (Pitfall 2: live today is 9-10 GitHub defaults + 5 `gsd:*`; the apply must delete, not just create, or set-equality stays red).

**Self-test plants** (extend `fakeState` lines 790-814 + `getterOf` line 895-897 + plants table lines 954-1015):
```js
const getterOf = (state) => (path) => (Object.hasOwn(state, path)
    ? { ok: true, body: clone(state[path]) }
    : { ok: false, why: `GET ${path} could not be read (HTTP 404 in the self-test fixture). ${NEXT_AUTH}` });
```
Add one fake `repos/{owner}/{repo}/labels?per_page=100` endpoint; plants: live extra label, missing declared label, renamed color-only drift (green control — names are the contract), getter throw (red, never green). Assertion idiom (lines 1018-1026): each plant must go red naming its needles:
```js
if (failures.some(f => needles.every(n => f.includes(n)))) {
    console.log(`  ok  ${name} -> red, naming ...`);
```

---

### `scripts/apply-repo-controls.mjs` (VERIFY — likely untouched)

**Analog:** itself (82 lines). It defines no endpoint of its own (lines 2-8): it imports `planWrites` and executes exactly what it returns in table order.

**Dry-run / `--yes` gate** (lines 42-56):
```js
const { API_VERSION_HEADER, SETTINGS_REL, ghGet, planWrites } = await import('./verify-repo-controls.mjs');
const { writes, blocked, errors, ownerSteps } = planWrites(REPO_ROOT, ghGet);
```
`--yes` refuses when stdin is not a terminal (lines 37-40), so an agent or CI shell cannot apply. Writes are idempotent PUT/PATCH, POST only for a ruleset found absent by name (lines 14-18).

**Verdict for planner:** if the `labels` control is `write: null` + `ownerSteps` (recommended), `planWrites` shape is unchanged and this file needs **no edit** — verify by reading, do not touch. Only if the planner chooses a writable labels endpoint would this file change, and then only through `planWrites`, never a new writer.

---

### `scripts/verify-labels.mjs` (NEW quick row — form↔set agreement)

**Analog:** `scripts/verify-update-channel.mjs` (gate skeleton, 332 lines) + `scripts/verify-workflows.mjs` (js-yaml reach-in, derive-and-compare, vacuity guard).

**Header comment** (update-channel lines 1-40): numbered derivation → comparison → vacuity list ending with the honesty line. Copy the shape:
```
//  1. Derivation. ...
//  2. Consumer sweep over git ls-files minus the EXCLUDED table. ...
//  3. Zero mentions outside ... is a FAIL: an agreement over nothing is vacuous.
// This script and its --self-test only read the tree; every plant is applied in memory through runChecks' overrides.
```

**Imports + constants + strict arg parse** (update-channel lines 42-60):
```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'labels';
const SELF_REL = 'scripts/verify-labels.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}
```

**js-yaml reach-in** (workflows lines 88-94 — the ONLY sanctioned YAML parser; no vendoring, no regex scan):
```js
let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}
```
Pinned version: js-yaml 4.3.2 via `theia/`. A duplicate key throws — refuse it as a FAIL naming the file (workflows line 204: "a duplicate key such as a second on: is refused on purpose").

**Derive-and-compare, sorted output** (workflows lines 182-185, 343-350):
```js
if (names.length === 0) {
    fail(..., `no workflow files found ...; an agreement over nothing is vacuous. ...`);
}
failures.sort((a, b) => { ... }); // sorted by file, then job/rule — two runs print identical output
```
Copy for labels: derive declared set from `labels.json` + referenced set from `.github/ISSUE_TEMPLATE/*.yml` (`labels:` scalar-or-list at form level or per-`issues:` block — derive both) + `.github/workflows/*.yml` label-writers only (`issues.create`, `add-labels`, `gh issue edit --add-label` — NOT `runs-on`; Pitfall 4). Compare as set equality both directions. Vacuity: at least one form references at least one label, else FAIL. Also assert `config.yml` parses with `blank_issues_enabled: false` explicitly + ≥1 `contact_links:` entry each with `name:`/`url:`/`about:` (Pitfall 3).

**Injectable runChecks + honesty comment** (update-channel lines 150-153, 38-40):
```js
function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
```
"Honestly --quick: text reads only. No build, no browser, no display, no network. It writes nothing in the repository."

**`--self-test` shape** (update-channel lines 259-299; workflows lines 366-375): green-baseline-then-plants, all in memory:
```js
const baseline = runChecks(REPO_ROOT, { read: realRead, files });
if (baseline.failures.length > 0) { /* unmodified tree red → results mean nothing; exit 1 */ }
console.log(`  ok  baseline -> green`);
// plants: [name, overrides, file, value]; each must go red naming file + value
```
Plants: undeclared label in a form (red naming file+label), undeclared label in a workflow snippet (red), malformed `labels.json` (red), zero forms (red); green controls: all-declared forms, `good first issue` quoted-with-space label.

---

### `scripts/verify-renewals.mjs` (NEW quick row — structure-only)

**Analog:** `scripts/verify-update-channel.mjs` (same gate skeleton as above; simpler — no `gh`, no js-yaml, no derivation).

Same header/imports/arg-parse/`runChecks(root, overrides)`/honesty-comment/`--self-test` shape as `verify-labels.mjs`. The check body follows 42-RESEARCH.md §Code Examples (structure only — no `Date.now()`, no fetch, no calendar math; calendar logic is Phase 48 `renewals-due`):
```js
// every table row in docs/RENEWALS.md must carry a date cell and an owner-action cell
const rows = parseMarkdownTable(read('docs/RENEWALS.md'));
for (const [i, r] of rows.entries()) {
  if (!/\d{4}-\d{2}-\d{2}|(January|...|December) \d{4}/.test(r.date))
    fail(`docs/RENEWALS.md row ${i + 1} (${r.item}) carries no date`);
  if (!/(renew|rotate|re-verify|replace|re-apply|request|obtain|review)/i.test(r.action))
    fail(`docs/RENEWALS.md row ${i + 1} (${r.item}) carries no owner action`);
}
```
Required family (DOC-04): domain, Apple membership, Developer ID certificate, Azure validation, App keys, Cachix token, Safe Browsing key, each Cloudflare token, Codeberg token, Anthropic keys, winget credential, MAR certificate (2046, forward-looking — `brand/` holds no `.der` today), Node 24 EOL 2028-04-30, ESR 175 train dates. Self-test plants: row with no date (red naming row), row with no action (red), unparseable table (red); green control with the full declared family.

**mkdtemp precedent (only if fixtures need isolation):** `scripts/verify-release-identity.mjs` lines 200-229 — `mkdtempSync(join(tmpdir(), 'release-identity-'))`, fixture git repo with `user.name`/`user.email` overrides, `resolveConfig` derivation inside the fixture, `finally { rmSync(tmp, { recursive: true, force: true }); }`. The renewals row likely needs only in-memory plants (no mkdtemp); cite this only if the planner wants filesystem fixtures.

---

### `scripts/verify-platform.sh` (MOD — append 4 quick rows)

**Analog:** itself. Insertion point is the `--quick` CHECKS array beside `repo-controls-self-test` / `workflows` / `zizmor` (lines 4706-4730).

**Quick-row comment + entry shape** (lines 4706-4730):
```sh
    # NEW (Phase 41, GH-02): repo-controls-self-test serves the declared .github/settings/
    # bodies back in GitHub's live response shape and plants each widening -- ...
    # that throws -- each red naming the control. Honestly --quick: in-memory, with no network
    # and no gh; it writes nothing. The live read-back is the full-tier repo-controls row.
    "repo-controls-self-test|node $REPO_ROOT/scripts/verify-repo-controls.mjs --self-test"
    # NEW (Phase 41, GH-12 and GH-08): the trust-boundary rules over every workflow --
    # ...
    # (js-yaml from theia/) and file reads only; no build, browser, display or network.
    "workflows|node $REPO_ROOT/scripts/verify-workflows.mjs"
```
Append after `zizmor-self-test` (line 4730), before the closing `)` at line 4731:
```sh
    # NEW (Phase 42, GH-13): ... Honestly --quick: YAML parsing (js-yaml from theia/) and file reads only; ...
    "labels|node $REPO_ROOT/scripts/verify-labels.mjs"
    # labels-self-test plants ... each red naming file and label. It writes nothing.
    "labels-self-test|node $REPO_ROOT/scripts/verify-labels.mjs --self-test"
    # NEW (Phase 42, DOC-04): ... Honestly --quick: text reads only; ...
    "renewals|node $REPO_ROOT/scripts/verify-renewals.mjs"
    # renewals-self-test plants ... It writes nothing.
    "renewals-self-test|node $REPO_ROOT/scripts/verify-renewals.mjs --self-test"
```
Each comment states the NEW phase + requirement, what the row derives, and the honesty line. The `labels` control extension lives inside the existing full-tier row (lines 5088-5092: `"repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"`) — no new full-tier row.

---

### `docs/RELEASING.md` (MOD — DOC-03/DOC-05 content-anchor edits)

**Analog:** itself. Locate by content, never by line number (CONTEXT line numbers have drifted; file is 1032 lines).

| Edit | Content anchor (verified this session) | Fix |
|---|---|---|
| DOC-03 cadence | `:728` "One release per ESR point release, roughly every four weeks, plus out-of-cycle" | "roughly every two weeks" (owner decision 5) |
| DOC-03 cadence | `README.md:46-47` "ESR rebases roughly every four weeks" | same two-week fix |
| DOC-03 cadence | `.github/workflows/rebase-upstream.yml:1-9` D-77 no-schedule note | leave; confirm D-77 still holds, do not add cadence text |
| DOC-03 ESR 175 / queued-job | Schedule-posture section `:753-758`; queued-runner note `:957-968` ("The runner is offline. `release.yml`'s build job queues forever rather than failing.") | current ESR 175 dates (REQUIREMENTS.md External Gates: 153.6 2026-10-27, every two weeks; 175 nightly 2027-05-27, beta 2027-06-10, release 2027-06-29) + 24-hour queued-job cancellation |
| DOC-05 runner shape | `:257-304` ephemeral runner + `tokenFile = "/var/lib/secrets/github-runner-pat"` + `ephemeral = true` (also `:289` module-behaviour paragraph) | rewrite to non-ephemeral + `release`/`descriptor`/`bot` env shape already at `:327-337` |
| DOC-05 secrets inventory | table `:531-545` (descriptor PAT row `:538`, legion PAT-file row `:540`) | App keys per environment (bot/release/descriptor/fixer/triage env bodies exist as tracked `.github/settings/environment-*.json` ×5 + branch-policy file); no PAT/App key on legion; descriptor PAT → scoped App token |
| DOC-05 release-env policy | `:327-334` already `main`-only branch policy | verify-and-keep, do not re-change (ARCHITECTURE §1 item 5 resolved this) |
| DOC-05 rebuild runbook | Runner-upkeep `:773-785` (`objdir/` ~14 GB + ~5.6 GB `upstream/`) | extend into legion-rebuild runbook (four objdirs ≈14 GB each per CONTEXT) |

Negated-grep discipline for the doc rows (same idiom as 41-VALIDATION task pattern): assert presence + value (e.g. "every two weeks" present, ESR 175 dates present), never mere absence of prose (CLAUDE.md: never assert on the absence of a log line).

---

## Shared Patterns

### One driver, one registry
**Source:** `scripts/verify-platform.sh` (`run_own_checks()` CHECKS, lines 3570-3573 + 4650-4731 quick set, 4733+ full set).
**Apply to:** `verify-labels.mjs`, `verify-renewals.mjs` (each gets exactly one quick row + one `--self-test` sibling row; no sibling driver, no new `verify-phase-*` script).

### Derive from the tree and compare as set equality
**Source:** `scripts/verify-repo-controls.mjs` (`canon`/`same` lines 140-148, `setDiff` line 391, `projection` lines 150-156) + `scripts/verify-workflows.mjs` (admission-set equality lines 187-195, 339-341).
**Apply to:** `labels` control (live names vs declared names), `labels` quick row (form/workflow label refs vs declared set), `renewals` row (rows present vs required family — structure only, not calendar).
```js
const setDiff = (want, got) => ({ missing: want.filter(x => !got.includes(x)), extra: got.filter(x => !want.includes(x)) });
```
A hand-kept expectation list is forbidden — it can only agree with the tree it was copied from.

### Every new check gets `--self-test` planting each fault red naming the drift
**Source:** `scripts/verify-update-channel.mjs` lines 259-330 (green-baseline-then-plants, needle = quoted value, green control for the MAR key store / runner unit names lines 317-325) + `scripts/verify-repo-controls.mjs` lines 899-1127 (fixture `fakeState`/`getterOf`, plants table with needle arrays, `planWrites` order/guard assertions lines 1048-1122).
**Apply to:** `verify-labels.mjs`, `verify-renewals.mjs`, `labels` control extension. Each plant goes red naming the file/control + drifted value; each control stays green. Vacuity guard in every row (zero forms / zero workflows / empty settings dir is FAIL, not PASS).

### Honesty comments + quick-tier discipline
**Source:** `scripts/verify-update-channel.mjs` lines 38-40; `scripts/verify-release-identity.mjs` lines 35-37; `scripts/verify-platform.sh` rows (e.g. lines 4709-4710).
**Apply to:** both new scripts + all 4 registry rows. Formula: "Honestly --quick: [reads only]. No build, no browser, no display, no network. It writes nothing [in the repository / in the tree]." No `gh`, no network in any quick row (the `labels` *control* is full-tier inside `repo-controls`).

### Stage new files before trusting the brand scan
**Source:** `CLAUDE.md` residual-brand-scan gate (`node scripts/scan-brand-residue.mjs` iterates `git ls-files`; an unstaged new file is invisible).
**Apply to:** every new `.md`/`.yml`/`.json` in this phase (`labels.json`, 3 issue forms, 6+ health files, `RENEWALS.md`, 2 new scripts, reconciliation record) — `git add` before trusting a green scan. Token classification lives only in `inventory/brand-tokens.json`; never spell the originating product token elsewhere.

### No internal identifiers in user-facing copy
**Source:** `CLAUDE.md` user-facing-copy rule; enforced by pattern (`shell-error-copy-no-internals`), not by banned-word list.
**Apply to:** issue-form boilerplate, `SECURITY.md`/`SUPPORT.md`/`KNOWN-ISSUES.md`, org health files. Name the product "PowerBrowser", state the problem plainly, end with a next step that is a real on-screen affordance; carry `security@powerbrowser.org` (GH-14) and the Copy-button diagnostics guidance — never a pref key, port, or raw exception text. (Full UPD-32 shape test lands in Phase 46; write compliant copy now.)

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.github/ISSUE_TEMPLATE/bug.yml` | config | — | No issue-form precedent in tree (dir absent). Planner uses 42-RESEARCH.md §Pattern 2 + §Code Examples skeleton; field `id:`s `version`/`os`/`install_format` frozen for TEL-05 prefill (`?template=bug.yml&version=…&os=…&install_format=…`); labels `["type/bug", "needs-triage"]` |
| `.github/ISSUE_TEMPLATE/feature.yml` | config | — | Same; parallel to bug.yml |
| `.github/ISSUE_TEMPLATE/config.yml` | config | — | Same; must carry `blank_issues_enabled: false` + `contact_links:` to Discussions (`https://github.com/DeBIOS-Foundation/powerbrowser/discussions`) and the security policy |
| `SECURITY.md` (product) | docs | — | No health-file precedent. Content per GH-14: private reporting first, security@ second, latest release only, acknowledgement window |
| `SUPPORT.md` (product) | docs | — | Same; support channels per GH-14 |
| `docs/KNOWN-ISSUES.md` | docs | — | Product-specific, no platform convention (GH-15 train copy is Phase 49 — create the file with current known items only) |
| org `.github` `SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` | docs | — | Org repo does not exist (404 verified); owner creates literal `.github` repo, content arrives by review, never by script |
| `docs/RENEWALS.md` | docs | — | No register precedent. Structure per 42-RESEARCH.md §Pattern 3 sketch (date cell + owner-action cell per row; forward-looking MAR-cert 2046 row states the ceremony is owned by Phases B/C) |
| S2/S3/S8 reconciliation record | docs/record | — | No record precedent in tree (pattern cited from Phase 40 STATE.md sign-off, not re-read). Per draft SUPERSEDED (with superseding landed fact: NG-065/NG-067 `done`, Phase 40 channel/revision/host) or CURRENT (with surviving action, e.g. S8's `bug.yml` field ids). Do not edit the draft files |

## Metadata

**Analog search scope:** `scripts/` (all `verify-*.mjs`, `apply-repo-controls.mjs`, `verify-platform.sh`), `.github/settings/`, `.github/workflows/`, `docs/RELEASING.md`, `.planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/41-PATTERNS.md` (prior-phase idioms), 42-CONTEXT.md + 42-RESEARCH.md (required reading).
**Files scanned:** 7 analogs read in full or in the relevant ranges (332 + 328 + 545 + 1129 + 82 + registry excerpts + RELEASING.md anchors); `git ls-files` probes for all analogs + all expected-new paths.
**Pattern extraction date:** 2026-10-22
**Project constraints applied:** one driver/one registry; derive-and-compare as set equality; every new check gets `--self-test` planting each fault red naming the drift; stage new files before trusting the brand scan; no internal identifiers in user-facing copy; never edit `upstream/` or `ledger/`; never create/edit `scripts/verify-ng-NNN-*.mjs`; builds need Nix shells but this phase needs none (Node + file reads only; js-yaml 4.3.2 via `createRequire` from `theia/`).
**Fallback note:** where in-tree analogs run out (issue forms, health files, RENEWALS.md), 42-RESEARCH.md §Code Examples + 41-PATTERNS.md gate/skeleton idioms are the sanctioned fallback — do not stall, do not invent new instruments.
