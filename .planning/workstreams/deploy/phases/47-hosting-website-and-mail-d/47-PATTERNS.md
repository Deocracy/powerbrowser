# Phase 47: Hosting, website and mail (D) - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 8 (1 new script, 1 modified driver, 4 site pages, updates staging tree, 2 doc edits)
**Analogs found:** 6 / 8 (2 with no tracked analog: `_redirects`, `update.xml` placeholder)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/verify-updates-repo-static.mjs` (NEW) | utility (verification gate) | request-response (read-only `gh api` read-back) + batch (in-memory self-test) | `scripts/verify-repo-controls.mjs` | exact |
| `scripts/verify-updates-repo-static.mjs` (NEW, secondary) | utility (verification gate) | batch (derive-and-compare sweep) | `scripts/verify-update-channel.mjs` | role-match |
| `scripts/verify-platform.sh` (MOD: append 2 rows) | config (registry) | batch (check dispatch) | itself (`scripts/verify-platform.sh:4664-4674`, `:4706-4711`, `:5088-5092`) | exact |
| website staging `index.html` | component (static page) | file-I/O (static bytes served) | `.claude/skills/sketch-findings-Power-Browser/sources/002-mode-toggle-tabs/index.html` | partial |
| website staging `download.html` | component (static page) | file-I/O (static bytes served) | same sketch source + `docs/RELEASING.md:696-723` (asset names) | partial |
| website staging `privacy.html` | component (static page) | file-I/O (static bytes served) | same sketch source (shell only); content values from `configuration.toml` + CONTEXT TEL-08 lines | partial |
| website staging `legal.html` | component (static page) | file-I/O (static bytes served) | same sketch source (shell only); values from `configuration.toml:47-50` | partial |
| updates staging `_redirects` | config (edge routing) | file-I/O (single static file) | none tracked | no analog |
| updates staging `default/Linux_x86_64-gcc3/update.xml` + per-target tree | config (data fixture) | file-I/O (static descriptor) | `scripts/verify-update-channel.mjs:98` (descriptor-path shape, partial) | no analog |
| `docs/RELEASING.md` (MOD: Cloudflare/Pages/security.txt/live-probe + single-page-note correction) | docs | batch (prose edit) | itself (`docs/RELEASING.md:394-428`, `:531-546`) | exact |
| `docs/RENEWALS.md` Cloudflare token rows (NEW block; file owned by Phase 42 DOC-04) | docs | batch (prose append) | `docs/RELEASING.md:531-546` (Secrets inventory table shape, partial) | no analog |

## Pattern Assignments

### `scripts/verify-updates-repo-static.mjs` (utility, request-response)

**Analog:** `scripts/verify-repo-controls.mjs` (exact — same `gh api` read-back + fail-closed + in-memory `--self-test` contract; RESEARCH names it as the model)

**Imports pattern** (`scripts/verify-repo-controls.mjs:30-35`):
```javascript
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';
```

**`gh` read-back pattern** (`scripts/verify-repo-controls.mjs:42,60-74` — pinned header, fail-closed, never SKIP):
```javascript
export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28';
export function ghGet(path) {
    let out;
    try {
        out = execFileSync('gh', ['api', '-H', API_VERSION_HEADER, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
    try {
        return { ok: true, body: JSON.parse(out) };
    } catch {
        return { ok: false, why: `GET ${path} could not be read (the response is not JSON). ${NEXT_AUTH}` };
    }
}
```
Copy: recommended live endpoint per RESEARCH Pattern 2 is `repos/{owner}/{repo}/git/trees/main?recursive=1` (single call); owner/repo derived from `configuration.toml [urls] release_notes` via `resolveConfig` + `repoSlug` (`scripts/verify-repo-controls.mjs:101-120`), so no org/repo literal is written in the new script.

**Fail-closed getter wrapper** (`scripts/verify-repo-controls.mjs:76-97`):
```javascript
// Every getter, real or planted, goes through this: a throw, a malformed
// result and a truncated list are each unreadable, never green.
function safeGetter(get) {
    const cache = new Map();
    return (path) => {
        if (cache.has(path)) return cache.get(path);
        let r;
        try {
            r = get(path);
        } catch (e) {
            r = { ok: false, why: `GET ${path} could not be read (${String(e?.message ?? e).split('\n')[0]}). ${NEXT_AUTH}` };
        }
        ...
        cache.set(path, r);
        return r;
    };
}
```
Copy the fail-closed contract (`scripts/verify-repo-controls.mjs:20-22`): non-2xx, missing/unauthenticated `gh`, unparseable JSON → FAIL naming endpoint + next step (`gh auth status`; row needs `repo` + `read:org`), never SKIP/PASS.

**Main entry shape** (`scripts/verify-repo-controls.mjs:763-782`):
```javascript
function main() {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the comparison discriminates.`);
            return 2;
        }
    }
    if (args.includes('--self-test')) return selfTest();
    const { failures, compared, slug } = runChecks(REPO_ROOT);
    ...
}
```
Copy verbatim structure: unknown-arg rejection, `--self-test` branch, `runChecks(REPO_ROOT)` live path. Plain `node` invocation, no yarn.

**Self-test pattern** (`scripts/verify-repo-controls.mjs:895-923`): fixture state keyed by request path, `getterOf` serving it, green-baseline-first gate, then one plant per fault:
```javascript
const getterOf = (state) => (path) => (Object.hasOwn(state, path)
    ? { ok: true, body: clone(state[path]) }
    : { ok: false, why: `GET ${path} could not be read (HTTP 404 in the self-test fixture). ${NEXT_AUTH}` });
// baseline must be green before plants mean anything; each plant red naming the control
```
New row's plants (RESEARCH): clean tree → green; `functions/x.js` plant → red naming the path; `_worker.js` plant → red naming the path. In-memory only: no network, no `gh`, writes nothing — this is what makes the row honestly `--quick` (`scripts/verify-platform.sh:4706-4711` precedent).

**Secondary analog — derive-and-compare shape:** `scripts/verify-update-channel.mjs` (freshest derive-and-compare row per prompt). Copy its assertion vocabulary:
- Derive at check time, compare as set equality so additions AND removals go red (`scripts/verify-update-channel.mjs:150-195` derivation block; failures name `rel:line`, expected vs derived value, and the one source — `scripts/verify-update-channel.mjs:211`).
- Quorum-against-nothing rule: zero mentions is FAIL (`scripts/verify-update-channel.mjs:218-220`).
- Self-test plants each mismatch kind plus a must-stay-green control (`scripts/verify-update-channel.mjs:287-325`: 10 plants + the MAR key-store/runner-unit control).
- Exclusion table with mandatory reason per entry (`scripts/verify-update-channel.mjs:71-85`): if the new sweep scans `git ls-files`, exclude `SELF_REL` (plants wrong values) with a reason line or fail at startup.
- For _this_ row, prefer the absence-property assertion over a hand-kept list: FAIL on any path under `functions/` or equal to `_worker.js` (RESEARCH Anti-Patterns: never hand-keep the expected file list).

---

### `scripts/verify-platform.sh` (MOD — append 2 rows)

**Analog:** itself. Append exactly one live row + one self-test row; never a sibling driver (CLAUDE.md Verification).

**Quick-tier row + self-test comment precedent** (`scripts/verify-platform.sh:4664-4674`, update-channel pair):
```sh
    # NEW (Phase 40, UPD-11): the update channel and the MAR channel id derive from
    # UPDATE_CHANNEL through the .mozconfig emission, and every structured channel mention in
    # the tracked tree equals the value of its own kind. Honestly --quick: git ls-files and text
    # reads plus an in-memory emit, no build, browser, display or network.
    "update-channel|node $REPO_ROOT/scripts/verify-update-channel.mjs"
    # update-channel-self-test plants each mismatch kind in memory ...
    # names green; it writes nothing.
    "update-channel-self-test|node $REPO_ROOT/scripts/verify-update-channel.mjs --self-test"
```
Copy: `label|command` shape, `NEW (Phase 47, DIST-03):` provenance prefix in the comment, and the `Honestly --quick:` justification sentence on the self-test row (in-memory, no network, no `gh`, writes nothing).

**Live-row-is-full-tier precedent** (`scripts/verify-platform.sh:5088-5092`, repo-controls live row inside the `if [ "$QUICK" -eq 0 ]` block):
```sh
      # NEW (Phase 41, GH-02): the live org and repo equal the declared .github/settings/
      # bodies, by projection and set equality, failing closed on any unreadable endpoint.
      # Full tier: read-only gh api against the live org and repo (network, gh auth with repo
      # and read:org); green only after the owner applies the settings at plan 41-04.
      "repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"
```
Copy exactly: `"updates-repo-static|node $REPO_ROOT/scripts/verify-updates-repo-static.mjs"` goes INSIDE the full-tier `CHECKS+=(...)` block with a `Full tier:` comment (read-only `gh api`, network, owner `gh auth`); `"updates-repo-static-self-test|... --self-test"` goes in the `--quick` array beside `repo-controls-self-test` (`scripts/verify-platform.sh:4706-4711`). The label is the contract (`--only <label>` runs exactly that row).

---

### Website staging `index.html`, `download.html`, `privacy.html`, `legal.html` (component, file-I/O)

**Analog (page shell only):** `.claude/skills/sketch-findings-Power-Browser/sources/002-mode-toggle-tabs/index.html:1-8` (tracked):
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sketch 002: Mode toggle + tabs</title>
<link rel="stylesheet" href="../themes/default.css">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding-top: 52px; ... font-family: var(--font-sans); }
```
**Divergence the planner must enforce** (not copy): the sketch links an external stylesheet; the four Phase 47 pages must carry ZERO external requests (WEB-01/WEB-05, RESEARCH skeleton `<!doctype html>...<style>/* inline */</style>...` with no `<script src>`, no external `<link>`). Copy the doctype/head/meta/viewport skeleton and the inline-`<style>` habit, NOT the `<link rel="stylesheet">`.

**Design tokens (skill):** `.claude/skills/sketch-findings-Power-Browser/SKILL.md` — neutrals + one restrained blue accent; system sans + mono for URIs; quiet dark surfaces. RESEARCH Code Examples confirm: `neutrals + one blue accent; system sans + mono URIs`.

**Locked copy values (sources of truth, not analogs):**
- Home footer sentence (CONTEXT, verbatim): `DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products.`
- Legal values (`configuration.toml:47-50`, verified): `license = "PolyForm Noncommercial 1.0.0"`, `trademark_notice = "PowerBrowser is a trademark of DeBIOS Foundation."`; links `LICENSING.md` + `THIRD-PARTY-NOTICES`.
- Download page: stable-URL shape, `SHA256SUMS`, `gh attestation verify` + login note + offline `--bundle` alternative, upload-coverage statement (`docs/RELEASING.md:696-723` asset names feed the link targets).
- Privacy page: TEL-08 payload lines from CONTEXT (type, basename, line, column, version, buildID, OS; no message, no stack; 30-day retention; Cloudflare only processor; hosts contacted unattended; privacy@ + owner-filled postal-address line).
- User-facing copy rule (CLAUDE.md): no internal identifiers on any page — no pref key, port, timeout, sentinel, or exception text; every string names "PowerBrowser" in plain language.

---

### Updates staging `_redirects` + `update.xml` tree (config, file-I/O)

**No tracked analog** (`git ls-files` shows no `_redirects`, no `update.xml` in tree). Planner uses RESEARCH Code Examples verbatim (committed rule shape `docs/RELEASING.md:404-409` + official redirects doc):

```
# the ONE 200 rule: ten placeholders, same-site relative destination
/update/6/:product/:version/:buildid/:target/:locale/:channel/:osversion/:syscaps/:dist/:distversion/update.xml  /:channel/:target/update.xml  200
```
- One rule, exactly; budget is 1/100 dynamic rules. No `_redirects` on the website project (multi-page: every route is a real file).
- Placeholder body at `default/Linux_x86_64-gcc3/update.xml`: two-line no-update document (an empty `updates` element — what an update origin returns with nothing to offer). Placeholder exists also because git cannot commit an empty directory (`docs/RELEASING.md:398-403`).
- Partial shape reference only: `scripts/verify-update-channel.mjs:98` shows the descriptor-path mention regex `` `<channel>/<target>/update.xml` `` — confirms the `<channel>/<BUILD_TARGET>/update.xml` tree shape convention.

---

### `docs/RELEASING.md` (MOD)

**Analog:** itself. Edit the `### Cloudflare Pages` section (`docs/RELEASING.md:394-428`):
- KEEP: two-project shape, eleven-segment rule text (`:404-409`), placeholder `default/Linux_x86_64-gcc3/update.xml` text, 25 MiB MAR note (`:420-421`).
- CORRECT (RESEARCH State-of-the-Art resolution, multi-page wins): replace the single-page note (`:423-428` — `serves the single-page website repository`, `/download /#download 302`, `/privacy … copied`) with four real 200 routes (`/`, `/download`, `/privacy`, `/legal`), no fragment redirect, no `_redirects` on the website project.
- RECORD: zone-level security.txt procedure, Email Routing proof (three test messages, non-destination sender), and the live-probe results (four GETs, 11-segment escaped shapes, unknown-target-404) once the owner runs the checkpoint.

**Secrets-table shape for the RENEWALS rows** (`docs/RELEASING.md:531-546`):
```markdown
| Scope | Name | Arrives in | Holder |
|---|---|---|---|
| Repository Actions secrets | none, and the count must stay zero | n/a | `repo-controls` asserts it |
| `release` environment | `MAR_SIGNING_P12_B64` | `mar-signing-and-update-integrity` | GitHub, gated on the required reviewer |
```
New RENEWALS block mirrors this: one row per Cloudflare credential with named holder + renewal date + owner action (INF-06).

---

## Shared Patterns

### Fail-closed read-back + in-memory self-test (applies to: new `verify-updates-repo-static.mjs`)
**Source:** `scripts/verify-repo-controls.mjs:20-22,60-97,895-923`
Non-2xx / missing-authless-`gh` / unparseable JSON → FAIL naming endpoint + `gh auth status` next step, never SKIP/PASS. `--self-test` serves fixture listings from a path-keyed map (`getterOf`), gates on a green baseline, then plants each named fault (here: `functions/` plant, `_worker.js` plant). No network, no `gh`, writes nothing → honestly `--quick`; the live row is full-tier.

### Derive-and-compare, never hand-kept lists (applies to: new row)
**Source:** `scripts/verify-update-channel.mjs:150-220` (derive at check time; set equality so additions and removals both go red); negative: RESEARCH Anti-Patterns.
Assert the *absence property* (no `functions/`, no `_worker.js`) plus set-equality only where a set is genuinely derived. Name `rel:line`, expected vs derived, and the one source in every failure.

### Registry append contract (applies to: `verify-platform.sh` edit)
**Source:** `scripts/verify-platform.sh:4668,4674,5092` + comment blocks `:4664-4674,:4706-4730,:5088-5092`.
`label|command` entries; provenance prefix `NEW (Phase 47, DIST-03):`; self-test row in `--quick` array with `Honestly --quick:` sentence; live `gh`-reading row inside the `if [ "$QUICK" -eq 0 ]` full-tier block with `Full tier:` sentence. `--only <label>` compatibility is the contract.

### User-facing copy: no internal identifiers (applies to: all four site pages)
**Source:** CLAUDE.md User-facing copy; skill design direction.
No pref key, port, timeout, sentinel, or exception text. Product named "PowerBrowser" in plain language; footer sentence verbatim. Enforced by review + `grep` presence checks (RESEARCH Validation Architecture rows WEB-01/02/03, TEL-08), not by log-line absence.

### Stage-before-scan (applies to: every new staging file)
**Source:** CLAUDE.md residual-brand gate; `scripts/verify-platform.sh:3578` (`scan-brand-residue` row).
The scan iterates `git ls-files` — stage new files before trusting a green scan. Token classification lives only in `inventory/brand-tokens.json`; never spell the originating product token elsewhere.

### Plain-`node` rows; nix shells only for builds (applies to: new row)
**Source:** `scripts/verify-platform.sh` row commands (all `node $REPO_ROOT/...`); `flake.nix` (no wrangler entry — external npm per RESEARCH).
New row runs on plain `node` like `repo-controls`; never through yarn. Quick tier = no build, no browser, no display, no network.

### Static-only discipline (applies to: updates staging + website staging)
**Source:** RESEARCH Pattern 2 + `docs/RELEASING.md:398-421`.
No `functions/`, no `_worker.js` on the updates host (the row forbids them; silent-landing the Worker fallback corrupts the guarded invariant — needs its own recorded decision). Website project carries no `_redirects`. MAR bytes stay on Releases (25 MiB Pages cap).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| updates staging `_redirects` | config | file-I/O | No `_redirects` file tracked in repo (`git ls-files` match: none). Planner uses RESEARCH Code Examples rule text + `docs/RELEASING.md:404-409`. |
| updates staging `default/Linux_x86_64-gcc3/update.xml` placeholder | config | file-I/O | No `update.xml` tracked in repo. Planner uses the two-line no-update document shape from `docs/RELEASING.md:400-403`. |
| `docs/RENEWALS.md` Cloudflare rows | docs | batch | File does not exist in tree (Phase 42 DOC-04 owns it). Planner stages an appended block shaped on `docs/RELEASING.md:531-546` secrets-inventory columns; DOC-04 adopts it. |
| website staging `privacy.html` content lines | component | file-I/O | No `docs/PRIVACY.md` or prior privacy source tracked (`git ls-files` match: none). Planner uses CONTEXT TEL-08 locked lines + owner-filled postal-address line. |

## Metadata

**Analog search scope:** `scripts/verify-*.mjs`, `scripts/verify-platform.sh` CHECKS registry, `scripts/generate.mjs` (UPDATE_CHANNEL/TARGETS), `docs/RELEASING.md`, `configuration.toml`, `.claude/skills/sketch-findings-Power-Browser/`, tracked `*.html`/`*.xml`/`_redirects`/privacy/RENEWALS inventory.
**Files scanned:** 8 candidate outputs; 7 tracked analogs read (2 fully, 5 targeted excerpts); `git ls-files` verification run for every named analog path — all non-empty (tracked). `docs/RENEWALS.md` confirmed absent (not an analog, recorded in No Analog Found).
**Tracked-source gate (#3645):** every analog path named above was verified with `git ls-files -- <path>` (non-empty = tracked). No mirror/untracked paths emitted.
**Pattern extraction date:** 2026-10-22
