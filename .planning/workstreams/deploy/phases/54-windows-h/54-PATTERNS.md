# Phase 54: Windows (H) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** ~14 (generator, mozconfig, NSIS patch, packaging scripts, trademark + update + platform-verify rows, TheiaService/PowerBrowserAPI, docs/RELEASING.md + docs/BUILD.md matrix records)
**Analogs found:** 8 / 10 file groups (no analog for `package-windows.sh` — mirror of `package-linux.sh`; no analog for a per-target mozconfig emission — extend `emitMozconfig`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/generate.mjs` (per-target Windows mozconfig emission, `TARGETS` row) | generator | transform (manifest → emitted file) | itself `emitMozconfig` (lines 1464-1500, Phase 40) + `TARGETS` table (line 3540) | exact |
| `powerbrowser/packaging/package-windows.sh` (NEW) | utility | file-I/O + subprocess | `powerbrowser/packaging/package-linux.sh` (staging pattern, checkout-path purge, precomplete refresh) | exact mirror |
| `powerbrowser/packaging/node-runtime.json` (Windows entry) | config | declared state | itself (linux-x64 entry, SHASUMS-pinned) + Phase 43 detector contract | exact |
| `patches/040-powerbrowser-nsis.patch` (extended by regeneration) | patch | diff regeneration | itself (43 lines: AppName, CERT_NAME, telemetry blank, install-ping neuter) + `scripts/regenerate-patches.sh --check` | exact |
| `scripts/verify-windows-mozconfig.mjs` (NEW quick) | test/gate | transform (derive + compare) | `scripts/verify-update-channel.mjs` (332 lines; header list, strict arg guard, injectable `readText`/`runChecks`, green-baseline-then-plants self-test) | role-match |
| `scripts/verify-package-natives.mjs` (NEW full + self-test) | test/gate | file-I/O (magic bytes) + transform | `scripts/verify-release-identity.mjs` (mkdtemp fixture self-test) | role-match |
| `scripts/verify-trademark-surface.mjs` (EXTENDED, LEG-01) | test/gate | transform (derive surfaces + compare) | itself (brand.ftl/properties, Theia fragments, desktop Name lines, 5-plant self-test) | exact shape |
| `scripts/verify-win-matrix-record.mjs` (NEW full) | test/gate | transform (record verdicts + evidence) | `docs/RELEASING.md` `win-matrix-record` row spec (5 cells, verbatim evidence, BUILD_TARGET, registry diff) | spec-first (no code analog) |
| `scripts/verify-win-download-copy.mjs` (NEW full) | test/gate | transform (3-way text equality) | `docs/RELEASING.md` `win-download-copy` row spec (record ↔ tracked doc ↔ live page) | spec-first |
| `scripts/verify-win-sign-chain.mjs` (NEW full) | test/gate | transform (order evidence) | `upstream/taskcluster/kinds/repackage/kind.yml` chain + `docs/RELEASING.md` `mar-sign-self-test` row | spec-first |
| `powerbrowser/shell/*.sys.mjs` (UPD-30 AsyncShutdown reap blocker) | platform | event-driven (quit/restart path) | `TheiaService.stop()` (`powerbrowser/shell/TheiaService.sys.mjs:345`), `PowerBrowserAPI.onQuitGranted` (INTERNAL-APIS.md:54), `Sqlite.shutdown.addBlocker` pattern (INTERNAL-APIS.md:84) | partial |
| `powerbrowser/INTERNAL-APIS.md` + `scripts/check-internals-boundary.sh` | docs/gate | catalogue | themselves (every Firefox internal through one anti-corruption layer) | exact |
| `scripts/verify-platform.sh` (registry rows) | config/registry | — | its own Phase 40/41 rows (quick array ~4650-4730, full `CHECKS+=(` at 4734) | exact |
| `docs/RELEASING.md` + `docs/WINDOWS-DISTRIBUTION.md` (NEW) | docs | — | `docs/RELEASING.md` windows-unsigned stage (vocabulary to reuse, stale lines to correct) | exact |

All analog paths are git-tracked source. `scripts/verify-ng-NNN-*.mjs` are hash-locked: read only, never edit, never create a file with that prefix.

## Pattern Assignments

### `scripts/verify-windows-mozconfig.mjs`, `scripts/verify-node-runtime-targets.mjs`, `scripts/verify-package-natives.mjs`, `scripts/verify-win-*.mjs` (gates, derive-and-compare)

**Analog:** `scripts/verify-update-channel.mjs` (332 lines, freshest Phase 40 shape)

**Header comment** (lines 1-39): numbered list of what the check derives and compares, ending with an honesty line (quick = no build/browser/display/network; full = what input it needs and why).

**Imports + constants + strict arg parse** (lines 41-59):
```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'windows-mozconfig';
```
One accepted flag (`--self-test`); anything else exits 2 naming the script.

**Injectable reads** (lines 122-139, 150-153): `readText(root, rel)` returning null on error; `runChecks(root, overrides = {})` with overridable read/list so `--self-test` runs in memory (quick) or in mkdtemp fixtures (full rows' self-tests).

**main / PASS-FAIL output** (lines 246-257):
```js
function main() {
    if (args.includes('--self-test')) return selfTest();
    ...
}
process.exit(main());
```
`${NAME}: FAIL -- ...` / `${NAME}: PASS -- ...`; every failure ends with a concrete "Next step:".

**Self-test: green baseline first, plants table, each must name file+value, control stays green** (lines 259-330). Window rows plant: inverted `--enable-maintenance-service`, missing `--target`, Linux `.node` in a Windows stage, missing `node-runtime.json` Windows key, missing matrix cell / bare RED / empty BUILD_TARGET / `Software\Mozilla` touched / absent SmartScreen block, reworded SEC-03 label, out-of-order sign evidence.

**mkdtemp fixture self-test** (for full-tier rows): copy `scripts/verify-release-identity.mjs --self-test` structure (mkdtemp git repo, plants, controls, writes nothing in the repository).

---

### `scripts/generate.mjs` per-target emission (generator extension)

**Analog:** `emitMozconfig` lines 1464-1500 + `TARGETS` row at 3540-3546.

**Rules:** values from `configuration.toml` only (channel/MAR ids via `updateChannel(config)`, app basename/remoting via `assertEmittable`); no literals. New emission function (e.g. `emitMozconfigWindows`) beside `emitMozconfig`, not a branch inside it, so the Linux row's byte-identity is untouched. One `TARGETS` row per new emitted file with a tracked comparand authored once from the emitter. `generate --check` covers the row through the frozen table.

**insertion points:** emission function near 1464-1500; `TARGETS` entry in the frozen array at 3540; no second writer (generator is the only writer, CFG-01).

---

### `powerbrowser/packaging/package-windows.sh` (staging mirror)

**Analog:** `powerbrowser/packaging/package-linux.sh` (whole file: `./mach package` → stage sidecar + pinned Node + policies.json → refresh precomplete → rewrite tarball; M-6 checkout-path purge with patchelf; ng063-style staged-file assertion; tarball rewrite).

**Mirror rules:** same stage order; sidecar comes from the `windows-latest` artifact, never `$ROOT/theia/` on legion; win32-x64 Node from `node-runtime.json` with the same sha256-pin-or-delete gate; `policies.json` copied unchanged (PKG-19's `DisableAppUpdate` merge is Phase 56's, not this phase's); precomplete refreshed in the stage; NSIS inputs rewritten from generated branding; MAR via the same chain as Linux plus the sign order in Pattern 5.

---

### `patches/040-powerbrowser-nsis.patch` (extension by regeneration)

**Analog:** the patch itself (43 lines) + `scripts/regenerate-patches.sh --check` + `patches-regenerated` row.

**Rules (CLAUDE.md hard rule):** regenerate from a patched tree (`git -C upstream diff HEAD --abbrev=10 -- <+++ b/ paths>`), never text-edit a hunk body. `--check` re-derives and byte-compares; on a file upstream moved, compares only `+`/`-` lines (owner ruling CR-01). New surface: uninstaller-ping removal, registry namespace move, fork artwork. `CERTIFICATE_ISSUER` stays upstream's until SEC-12.

---

### PowerBrowserAPI boundary (UPD-30 blocker)

**Analog:** `INTERNAL-APIS.md` rows (quit-observer, Sqlite blocker, reap identity) + `scripts/check-internals-boundary.sh`.

**Rules:** every new Firefox internal touchpoint (AsyncShutdown phase used, quit/restart registration) is catalogued in `powerbrowser/INTERNAL-APIS.md` with the exact file:line, and `check-internals-boundary.sh` passes. `TheiaService.sys.mjs` is a *consumer* of the boundary, never a second one. The blocker awaits the reap (bounded, loud on timeout); it never asserts on the absence of a log line — it observes the process table and the version flip.

---

### `scripts/verify-platform.sh` (registry rows)

**Quick rows** — append inside the quick `CHECKS=(` array after `zizmor-self-test` (line ~4730), before the closing `)`. Shape (lines 4658-4674):
```sh
    # NEW (Phase 54, PKG-11): <what it proves>. Honestly --quick: <why no build, browser, display or network>.
    "windows-mozconfig|node $REPO_ROOT/scripts/verify-windows-mozconfig.mjs"
    # windows-mozconfig-self-test plants <list of faults> ...; it writes nothing.
    "windows-mozconfig-self-test|node $REPO_ROOT/scripts/verify-windows-mozconfig.mjs --self-test"
```
Add: `windows-mozconfig(-self-test)`, `node-runtime-targets(-self-test)`, trademark-NSIS extension is inside the existing `verify-trademark-surface(-self-test)` rows (no new row name), `build-windows-shape(-self-test)`.

**Full rows** — inside `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` (opens line 4734), append after the last entry, before the closing `)`. Shape: `# NEW (Phase 54, REQ): <what>. Full tier: <why: needs built package / guest / network>.`
Add: `package-target-natives(-self-test)`, `win-matrix-record(-self-test)`, `win-download-copy`, `win-sign-chain(-self-test)`, `sidecar-reap-blocker(-self-test)` (static half quick if it only reads the tree).

---

### `docs/RELEASING.md` + `docs/WINDOWS-DISTRIBUTION.md` (docs)

**Analog:** `docs/RELEASING.md` `windows-unsigned` stage + verification-map rows (`win-matrix-record`, `win-download-copy`).

**Rules:** reuse the documented vocabulary (five routing verdicts, `.#firefox-win64` naming reconciled against the real `flake.nix` shells, `WINSYSROOT`, five-cell matrix, WINNT descriptor row, `build-windows` job); correct stale lines in the same commit (050→040 numbering, `.#firefox-win64` vs real shells, BUILD_TARGET derivation wording). SEC-03 warning copied verbatim — a paraphrase is the gate's catch. No internal identifiers in user-facing copy; identifiers live in the diagnostics/matrix record.

## Shared Patterns

- **Message format:** `${NAME}: FAIL -- ...` / `${NAME}: PASS -- ...` / `  ok  <plant> -> red, naming ...`; exit 0/1, 2 for bad args.
- **Every failure ends with a next step** ("Next step: run ...").
- **Derive, do not hand-keep lists:** BUILD_TARGET strings, target sets, NSIS surfaces, descriptor sets all derived at check time from the tree/build, compared as set equality.
- **Fail closed:** unreadable file/endpoint or missing instrument = FAIL with named cause; zero files parsed = distinct FAIL (vacuity).
- **Self-test writes nothing in the repo**; plants in memory or in mkdtemp.
- **Stage new files before trusting the brand scan** (`scan-brand-residue.mjs` reads `git ls-files`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `powerbrowser/packaging/package-windows.sh` | utility | stage + assemble | does not exist; mirror `package-linux.sh` per RESEARCH |
| per-target mozconfig emission in `generate.mjs` | generator | manifest → emitted file | `emitMozconfig` emits one Linux file; extend with a Windows emitter + TARGETS row |
| `windows-latest` sidecar build job | CI | build artifact | `release.yml` itself does not exist (Phase 50 pending); plans add the job to its assumed shape |
| `pkg-win11` libvirt harness | test harness | guest orchestration | no `matrix-*` job exists; build harness locally against fixtures, owner runs live |

## Metadata

**Analog search scope:** `scripts/`, `powerbrowser/`, `patches/`, `flake.nix`, `docs/`, `.github/`
**Files scanned:** ~14
**Pattern extraction date:** 2026-10-23
