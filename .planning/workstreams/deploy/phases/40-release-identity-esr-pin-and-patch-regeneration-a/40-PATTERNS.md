# Phase 40: Release identity, ESR pin and patch regeneration (A) - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 14
**Analogs found:** 13 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/verify-release-identity.mjs` (NEW) | test/gate | derive-and-compare | `scripts/verify-upstream-pins.mjs` | exact |
| `scripts/verify-update-channel.mjs` (NEW) | test/gate | derive-and-compare over `git ls-files` | `scripts/verify-upstream-pins.mjs` (step 4 sweep) | exact |
| `scripts/verify-update-prefs.mjs` (NEW) | test/gate | in-memory emitter compare | `scripts/verify-upstream-pins.mjs` + `TARGETS` import from `scripts/generate.mjs` | role-match |
| `scripts/regenerate-patches.sh` (NEW) | utility | file-I/O, write / --check / --self-test | `scripts/apply-patches.sh` | exact |
| `scripts/generate-licensing.mjs` (NEW) | generator | transform, write / --check / --self-test | `scripts/generate.mjs` (arg handling lines 94-194) | role-match |
| `scripts/generate.mjs` (MOD: releaseIdentity, version emitters, channel line, link prefs) | generator | transform | `emitMozconfig` lines 1424-1450; `TARGETS` line 3425 | exact |
| `scripts/lib/config-schema.json` (MOD: product.revision) | config | schema | itself | exact |
| `configuration.toml` (MOD: revision, urls, pin line 115) | config | - | itself | exact |
| `powerbrowser/packaging/version/{version,release}.txt` (NEW tracked comparands) | config | byte-identity comparand | `powerbrowser/identity.configure.comparand` via TARGETS row | exact |
| `scripts/verify-platform.sh` (MOD: 3 rows + 3 self-test rows + regenerate-patches rows) | config/registry | - | rows at lines 3650-3657 | exact |
| `.github/workflows/rebase-upstream.yml` (MOD: workflow_call, no default, generate inside nix) | config/CI | - | itself, lines 25-33, 109-115 | exact |
| `scripts/rebase-upstream.sh` (MOD: call regenerate-patches --check) | utility | - | itself | exact |
| `powerbrowser/endpoint-allowlist.json` + `scripts/verify-endpoints.sh` (MOD: `user-initiated` disposition, UPD-33) | config + gate | - | `check_allowlist_schema` / `check_allowlist_doc_consistency_self_test` in verify-platform.sh (~2700-2750) | role-match |
| `LICENSING.md`, `THIRD-PARTY-NOTICES.txt` (NEW outputs) | doc | generated | none | no analog |

Note: RESEARCH names `scripts/lib/endpoint-verdict.mjs`; it does not exist in the tree (`git ls-files` empty). It is a new file if the planner keeps it.

## Pattern Assignments

### `scripts/verify-*.mjs` (three NEW rows) -- copy `scripts/verify-upstream-pins.mjs`

**Header comment** (lines 1-60): numbered steps stating what is derived from where, and why each exclusion exists. Copy this shape.

**Imports + constants + argument guard** (lines 90-103):
```js
import { parse } from './lib/toml.cjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-upstream-pins';
const SELF_REL = 'scripts/verify-upstream-pins.mjs';
const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
```

**Core: injectable runChecks** (lines 243-250) -- `overrides.read` and `overrides.files` let the self-test plant faults in memory; tracked set derived once from `git ls-files` (`listTracked`, line 141), never a hand list:
```js
function runChecks(root, overrides = {}) {
    const failures = [];
    const skipped = [];
    const read = overrides.read ?? ((rel) => readBytes(root, rel)?.toString('utf8') ?? null);
    const tracked = overrides.files ?? listTracked(root);
```
Failure strings name the file and end with `Next step: ...`. Absent gitignored `generated/` output SKIPs (step 1 comment), unreadable output FAILs.

**main** (lines 468-479): `--self-test` dispatch, SKIP lines, `FAIL -- N problem(s)`, PASS summary, `process.exit(main())` (line 660).

**selfTest** (lines 487-540+):
1. Baseline must be green, else FAIL ("planted-fault results would mean nothing").
2. Derive the neighbour fault value from the real value (`neighborTag`, line 483) -- never a literal in the file (a literal tag here would trip the sweep).
3. Each plant substitutes in memory (`real.split(expected).join(neighbor)`), never edits the tracked file, and must go red NAMING the file; `checkNoRoot` asserts no checkout path leaks into output.

### `scripts/verify-update-prefs.mjs` -- also import `TARGETS`
`scripts/generate.mjs` line 3425 `export const TARGETS = Object.freeze([...])`; each row `{ generated, tracked?, variant, emit }`. Run the firefox-branding rows' `emit` in memory and compare.

### `scripts/generate.mjs` modifications
- Emitter shape: `emitMozconfig(config, variant)` (1424-1450). Every manifest value passes `assertEmittable('<dotted.path>', value)` (defined 1081); XML/NSIS sinks use `assertXmlEmittable` / `assertNsisEmittable`. Output begins with `...GENERATED_BANNER`. The channel line goes next to the `MAR_CHANNEL_ID` lines (currently `${app_basename}-default`).
- New version-file target: add a frozen TARGETS row with `tracked:` comparand, as at lines 3432-3443 (`identity.configure` -> `powerbrowser/identity.configure.comparand`); the comparand is authored once from the emitter, never hand-edited.

### `scripts/regenerate-patches.sh` -- copy `scripts/apply-patches.sh`
- Preamble (lines 21-25): `set -euo pipefail`, `REPO_ROOT` from `BASH_SOURCE`, `UPSTREAM_DIR`, `PATCHES_DIR`.
- One shared function used by both the real run and the self-test (comment lines 27-34: "shared by the real run below and --self-test so the fixture exercises the exact logic"). Here: generate a patch from `git -C upstream diff HEAD --abbrev=10 -- <+++ b/ paths>`.
- Self-test (lines 64-69, 102): `tmp="$(mktemp -d)"; trap 'find "$tmp" -delete' RETURN`, hermetic `git init` + `git commit -q -m "self-test: ..."`, then each case prints `regenerate-patches: --self-test PASS|FAIL -- ...` and asserts the message names the patch (lines 122-130).
- Dispatch (lines 170-173): `if [ "${1:-}" = "--self-test" ]; then run_self_test; exit $?; fi`, then real run. Add `--check` the same way.

### `scripts/generate-licensing.mjs`
Copy argument handling from `scripts/generate.mjs` lines 183-194 (`--check`/`--self-test` accepted, `--out` refused with `--check`), and self-test shape from verify-upstream-pins.

### `scripts/verify-platform.sh` registry rows (lines 3650-3657)
```sh
    # NEW (05-02): <what it derives and compares; static or not>.
    # The self-test rides alongside for the reason every other self-test row in this array gives.
    "verify-upstream-pins|node $REPO_ROOT/scripts/verify-upstream-pins.mjs"
    "verify-upstream-pins-self-test|node $REPO_ROOT/scripts/verify-upstream-pins.mjs --self-test"
```
Bash analog: `"fetch-upstream-self-test|bash $REPO_ROOT/scripts/fetch-upstream.sh --self-test"` (line 3649). Tag new rows `# NEW (Phase 40, REQ-ID): ...`.

### `.github/workflows/rebase-upstream.yml`
Lines 25-33: `tag` input with mirror comment and `default: FIREFOX_153_5_0esr_BUILD1` (bump to `FIREFOX_153_5_1esr_RELEASE` with `configuration.toml:115` first for DIST-06, then delete for AUTO-08 and update verify-upstream-pins step 2 accordingly). Lines 109-115 run `node scripts/generate.mjs`, `--check`, `verify-generated-identity.mjs` outside Nix (R1) -- wrap in `nix develop .#theia --command`.

## Shared Patterns

- **Message format:** `<name>: PASS|FAIL|SKIP -- <plain statement>`; each failure ends `Next step: ...`; exit 0/1, 2 for bad args.
- **Derive, never hand-keep:** expectations read from `configuration.toml` via `scripts/lib/toml.cjs` and from `git ls-files`; set equality catches both addition and removal.
- **Self-test:** green baseline first, in-memory or mkdtemp plants, red must name the drift, unplanted control stays green.
- **Stage new files** before trusting `scan-brand-residue.mjs` (git ls-files based); new self-test fixtures must not spell tag literals or brand tokens.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `LICENSING.md`, `THIRD-PARTY-NOTICES.txt` | generated doc | no licence aggregation exists; use RESEARCH.md |

## Metadata

**Analog search scope:** scripts/, .github/workflows/, powerbrowser/
**Files scanned:** 6
**Pattern extraction date:** 2026-10-20
