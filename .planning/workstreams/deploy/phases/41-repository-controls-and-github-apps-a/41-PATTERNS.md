# Phase 41: Repository controls and GitHub Apps (A) - Pattern Map

**Mapped:** 2026-10-21
**Files analyzed:** 27 (≈19 settings bodies, 4 scripts, verify-platform.sh, flake.nix, docs/RELEASING.md)
**Analogs found:** 7 / 9 file groups (no analog for `.github/settings/*.json` and for any `gh api` caller)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/settings/*.json` (rulesets, environments, actions-*, workflow-permissions, fork-pr-approval, repo, immutable-releases, private-vulnerability-reporting, org, app-*) | config | declared state | none (`.github/settings/` does not exist) | none, use RESEARCH §Settings bodies |
| `scripts/verify-repo-controls.mjs` (exports CONTROLS; full row; `--self-test` quick) | test/gate | request-response (read-only `gh api`) + in-memory compare | `scripts/verify-update-channel.mjs` | role-match (no `gh api` caller exists) |
| `scripts/apply-repo-controls.mjs` (dry-run default, `--yes` writes) | utility | request-response (writes) | `scripts/download-plugins.mjs` (spawnSync pattern) + arg handling from verify-update-channel.mjs | partial |
| `scripts/verify-workflows.mjs` (quick; `--self-test`) | test/gate | transform (YAML parse + derive/compare) | `scripts/verify-update-channel.mjs` + js-yaml loading from `scripts/verify-ng-086-theia-react-node.mjs` (read-only analog) | exact shape |
| `scripts/verify-zizmor.mjs` (quick; `--self-test` with mkdtemp) | test/gate | file-I/O + subprocess | `scripts/verify-release-identity.mjs` (mkdtemp self-test) | role-match |
| `scripts/verify-platform.sh` (append rows) | config/registry | — | its own Phase 40 rows, lines 4650-4698 (quick) and 5048-5054 (full) | exact |
| `flake.nix` (add `pkgs.zizmor`) | config | — | `flake.nix` lines 32-48 `devShells.theia.nativeBuildInputs` | exact |
| `docs/RELEASING.md` (settings text 305-322, 437-467; signed-tag claim ~932-935; GH-11 probe, GH-18 drill, SEC-06 attestations) | docs | — | itself | exact |
| `.github/workflows/verify.yml` | input only (read by workflows/zizmor rows; possibly SHA-pin `uses:`) | — | — | — |

All analog paths are git-tracked source. `scripts/verify-ng-NNN-*.mjs` are hash-locked: read only, never edit, never create a file with that prefix.

## Pattern Assignments

### `scripts/verify-workflows.mjs`, `scripts/verify-repo-controls.mjs`, `scripts/verify-zizmor.mjs` (gate, derive-and-compare)

**Analog:** `scripts/verify-update-channel.mjs` (332 lines, Phase 40, freshest shape)

**Header comment** (lines 1-39): numbered list of what the check derives and compares, ending with "This script and its --self-test only read the tree; every plant is applied in memory through runChecks' overrides."

**Imports + constants + strict arg parse** (lines 41-59):
```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'update-channel';
const SELF_REL = 'scripts/verify-update-channel.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
```

**Exclusion table with mandatory reasons** (lines ~70-83): each entry `[path, reason]`; an entry with no reason exits 2 at startup. Reuse for any allow-list (e.g. hosted-label exceptions).

**Injectable reads** (lines 122-139, 150-153): `readText(root, rel)` returns `null` on error; `listTracked(root)` = `git ls-files`; `runChecks(root, overrides = {})` with `const read = overrides.read ?? ((rel) => readText(root, rel));` and returns `{ failures, ... }`. For `verify-repo-controls.mjs`, make the `gh api` GET the injectable (`overrides.get`) so `--self-test` runs in memory at the quick tier.

**main / PASS-FAIL output** (lines 246-257):
```js
function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, consumers, expected } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with ...`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ...`);
    return 0;
}
...
process.exit(main());
```

**Self-test: green baseline first, plants table, each must name file+value, control stays green** (lines 259-330):
```js
const baseline = runChecks(REPO_ROOT, { read: realRead, files });
if (baseline.failures.length > 0) {
    console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
    ...return 1;
}
const plants = [ [name, overrides, file, value], ... ];
for (const [name, overrides, file, value] of plants) {
    const { failures } = runChecks(REPO_ROOT, { files, ...overrides });
    const hit = failures.some(f => f.includes(file) && f.includes(needle));
    if (hit) console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
    else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red ...; got: ${failures.join(' | ') || '(no failures at all)'}`); failed += 1; }
}
```
Plants per RESEARCH: workflows row (Pattern 3 list: legion in `release.yml publish`, legion in `verify.yml`, `schedule:`, unpinned `uses:`, `pull_request` on release.yml, `actions/cache`, ...); repo-controls (missing ruleset, `null` env branch policy, App holding `workflows`, orphan/missing settings file).

**js-yaml loading** (read-only analog `scripts/verify-ng-086-theia-react-node.mjs` lines 39, 103-108; also `verify-ng-070-no-spaced-name.mjs` line 21):
```js
import { createRequire } from 'node:module';
let semver = null;
try {
    semver = createRequire(join(theia, 'package.json'))('semver');
} catch {
    fail(`broken instrument: semver is not installed in ${rel(theia) || 'theia'}/ (run yarn install in theia/ first)`);
}
```
Apply as `createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml')`, failing closed with a "broken instrument" message naming `yarn install in theia/`.

**mkdtemp fixture self-test** (for verify-zizmor.mjs): copy the structure of `scripts/verify-release-identity.mjs --self-test` (mkdtemp git repo, plants, controls, writes nothing in the repository; see registry comment at verify-platform.sh 4655-4657). zizmor missing from PATH = FAIL naming `nix develop .#theia`, not SKIP.

---

### `scripts/apply-repo-controls.mjs` (utility, writes)

**Analog:** no `gh api` caller exists anywhere in `scripts/` (grep confirmed). Use subprocess shape from `scripts/download-plugins.mjs` line 19 and 149:
```js
import { spawnSync } from 'node:child_process';
const r = spawnSync('npm', ['pack', folder, ...], { encoding: 'utf8' });
```
→ `spawnSync('gh', ['api', '-X', method, path, '--input', file], { encoding: 'utf8' })`; check `r.status !== 0` and print stderr. Arg parse copies verify-update-channel.mjs 54-59 with `--yes` instead of `--self-test`. Imports `CONTROLS` from `./verify-repo-controls.mjs` (same pattern as `import { TARGETS, ... } from './generate.mjs'`, line 46) — so `verify-repo-controls.mjs` must not run `main()` on import; guard with `if (import.meta.url === pathToFileURL(process.argv[1]).href)`, or put CONTROLS in `scripts/lib/repo-controls.mjs` (precedent: `scripts/lib/endpoint-verdict.mjs`).

For reads in verify-repo-controls: `execFileSync('gh', ['api', path], ...)` inside try/catch; an error is a failure naming the endpoint (fail closed), never a SKIP.

---

### `scripts/verify-platform.sh` (registry rows)

**Quick rows** — append inside the quick `CHECKS=(` array right after line 4698 (`licensing-self-test`), before the `)` at 4699. Shape (lines 4659-4669):
```sh
    # NEW (Phase 40, UPD-11): <what it proves>. Honestly --quick: <why no build, browser, display or network>.
    "update-channel|node $REPO_ROOT/scripts/verify-update-channel.mjs"
    # update-channel-self-test plants <list of faults> ...; it writes nothing.
    "update-channel-self-test|node $REPO_ROOT/scripts/verify-update-channel.mjs --self-test"
```
Add: `workflows`, `workflows-self-test`, `zizmor`, `zizmor-self-test`, `repo-controls-self-test`.

**Full row** — inside `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` (opens line 4701), append after the last entry at line 5054 (`theia-fresh-clone-build-self-test`), before `)` at 5055. Shape (lines 5048-5054):
```sh
      # NEW (Phase 20, PLAT-01, ...): <what>. Full tier: <why: network/gh auth>.
      "theia-fresh-clone-build|bash $REPO_ROOT/scripts/verify-theia-fresh-clone-build.sh"
```
Add: `"repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"` with a "Full tier: read-only gh api against the live org and repo (network, gh auth)" comment.

---

### `flake.nix` (add zizmor)

**Analog:** lines 32-48, `devShells.theia.nativeBuildInputs`; each non-obvious entry carries a why-comment (see `pkgs.inkscape`, 38-47). Append `pkgs.zizmor` after `pkgs.inkscape` with a one-line comment (zizmor quick row, version 1.29.0 from the locked nixpkgs). `flake.lock` unchanged.

---

### `.github/settings/*.json` (config)

No analog in tree. Bodies are prescribed in 41-RESEARCH.md §Settings bodies (lines 288-364) and file list §Recommended Project Structure (lines 180-201). One file per REST call. The CONTROLS table must assert set-equality between files present in `.github/settings/` and the files it knows. Stage the new files before trusting `scan-brand-residue.mjs`.

## Shared Patterns

- **Message format:** `${NAME}: FAIL -- ...` / `${NAME}: PASS -- ...` / `  ok  <plant> -> red, naming ...`; exit 0/1, 2 for bad args (verify-update-channel.mjs 54-59, 246-257).
- **Every failure ends with a next step** ("Next step: run ..."), line 57 and 157-158.
- **Derive, do not hand-keep lists:** expectations come from `.github/settings/*.json` and `.github/workflows/*`, compared as sets so addition and removal both go red (CLAUDE.md Verification rule 2).
- **Fail closed:** unreadable file/endpoint or missing instrument (js-yaml, zizmor, gh auth) = FAIL with named cause; zero files parsed = distinct FAIL (vacuity, cf. update-channel check 3).
- **Self-test writes nothing in the repo**; plants in memory or in mkdtemp.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.github/settings/*.json` | config | declared state | directory does not exist; use RESEARCH bodies |
| `gh api` invocation in apply/verify-repo-controls | utility | request-response | no script calls `gh api`; only curl (smoke-theia.sh, verify-platform.sh 3043) |

## Metadata

**Analog search scope:** `scripts/`, `.github/`, `flake.nix`, `docs/`
**Files scanned:** ~10
**Pattern extraction date:** 2026-10-21
