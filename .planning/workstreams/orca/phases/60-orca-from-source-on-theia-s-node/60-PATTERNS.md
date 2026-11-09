# Phase 60: Orca from source on Theia's Node - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 17 new/modified
**Analogs found:** 16 / 17 (all analog paths verified git-tracked; none are mirrors)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `scripts/fetch-orca.sh` | script (fetch) | file-I/O + batch | `scripts/fetch-upstream.sh` | exact |
| `scripts/build-orca.sh` | script (build) | batch | `scripts/fetch-upstream.sh` (shell shape only) | partial |
| `configuration.toml` `[upstreams]` | config | transform | `firefox_esr_tag` / `theia_release` keys (lines 155-157) | exact |
| `scripts/lib/config-schema.json` | config | transform | `upstreams.firefox_esr_tag` / `upstreams.theia_release` rows (lines 170-183) | exact |
| `scripts/generate.mjs` (`emitUpstreamPins`, banner) | utility (emitter) | transform | itself, lines 3112-3129 | exact |
| `docs/REBRANDING.md` (+2 rows) | doc | n/a | `[upstreams]` table, lines 305-310 | exact |
| `flake.nix` `devShells.orca` | config | n/a | `devShells.theia` (lines 32-77) | role |
| `.gitignore` `/orca/` | config | n/a | `/yarn.lock`, `upstream/`, `/generated/` anchoring | exact |
| `scripts/verify-orca-pin.mjs` | test (quick) | request-response | `scripts/verify-upstream-pins.mjs` | exact |
| `scripts/verify-orca-build-shape.mjs` | test (full+quick self-test) | file-I/O | `scripts/verify-generated-identity.mjs` | role |
| `scripts/verify-orca-slotless-start.mjs` | test (full) | event-driven (spawn, ready line, BiDi) | `scripts/verify-crash-autosubmit-env.mjs` (header/derive style) + `scripts/lib/pb-live-probe.mjs` | partial |
| `scripts/lib/orca-run.mjs` | utility | streaming (stdout line) | `scripts/lib/pb-live-probe.mjs` | partial |
| `scripts/verify-platform.sh` rows | registry | n/a | rows at ~3820, ~4633 | exact |
| `inventory/licence-allowlist.json` + `orca-licence` check | config + test | transform | `inventory/brand-tokens.json` (shape), `verify-extension-pins.mjs` (sha compare) | role |
| `inventory/brand-tokens.json` (`orca` probe + `coincidental` rows) | config | transform | the `Deocracy` `coincidental` rows | exact |
| `scripts/scan-brand-residue.mjs` self-test plant | test | transform | its existing `--self-test` | exact |
| Claude Code ext. (EXT-01) | n/a | n/a | see below: NOT a pin | n/a |

## Pattern Assignments

### `scripts/fetch-orca.sh` (script, file-I/O)

**Analog:** `scripts/fetch-upstream.sh`

**Header and pin read** (lines 5-32), copy verbatim, swap names:
```bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PINS_FRAGMENT="$REPO_ROOT/generated/upstream-pins.env"
if [ -z "${TAG:-}" ]; then
  if [ -f "$PINS_FRAGMENT" ]; then
    . "$PINS_FRAGMENT"
    TAG="${FIREFOX_ESR_TAG:-}"      # -> UPSTREAM_ORCA_TAG / UPSTREAM_ORCA_COMMIT
  fi
fi
if [ -z "${TAG:-}" ]; then
  echo "fetch-upstream: FAIL -- no TAG export and $PINS_FRAGMENT is absent." >&2
  echo "  Run 'node scripts/generate.mjs' from the repo root, then re-run this script." >&2
  exit 1
fi
```
Differences: a `TAG=` override must come with its own `COMMIT=` (do not compare it to the manifest commit). No literal fallback.

**Verify-instead-of-reclone** (lines 275-298): compare `rev-parse HEAD` to `rev-parse "refs/tags/$TAG^{commit}"`; on mismatch print `rm -rf ... && script` remediation. For Orca compare HEAD to `$COMMIT` (the tag is annotated: the bare ref gives the tag object, pitfall 1).

**Clone** (line 315): `git clone --depth 1 --branch "$TAG" "$REMOTE" "$UPSTREAM_DIR"`. Orca change: clone into `orca.partial`, check HEAD == COMMIT, then `mv` (RESEARCH Pattern 1).

**Self-test** (lines 178-273, `run_self_test`, `mktemp -d`, `trap 'find "$tmp" -delete' RETURN`, throwaway `git init` repo, `self-test: <case> PASS (...)` lines, `[ "$failures" -eq 0 ]`; dispatch at 270-273). Plants: wrong commit rejected before `mv`; tag-object SHA; existing `orca/` at another tag. Do NOT copy the patch-stack classifier or `ensure_branding_overlay`.

---

### `configuration.toml` + `scripts/lib/config-schema.json` + `scripts/generate.mjs`

**Analog:** the existing `[upstreams]` keys.

`configuration.toml` lines 155-157: `firefox_esr_tag = "..."`, `theia_release = "1.76.0"`. Add `orca_tag = "v1.4.248"`, `orca_commit = "965978bc78bf03a6a43187c1ed28fcffe0e01bb5"` (peeled commit, not tag object `c2f3bb65...`).

Schema row shape (config-schema.json 170-183):
```json
"upstreams.theia_release": {
  "type": "string", "required": true,
  "regex": "^[0-9]+\\.[0-9]+\\.[0-9]+$",
  "regex_help": "an exact Theia release triple, ...",
  "regex_example": "9.9.9"
}
```
New rows: `upstreams.orca_tag` regex `^v[0-9]+\.[0-9]+\.[0-9]+$`, `upstreams.orca_commit` regex `^[0-9a-f]{40}$`, both `"required": false` (research recommendation: keeps downstream manifests and fixtures valid). Every row needs `regex_help` and `regex_example`.

Emitter (`generate.mjs` 3112-3129): extend, do not add a second emitter.
```js
const UPSTREAM_PINS_BANNER = Object.freeze([
    '# Generated from configuration.toml by scripts/generate.mjs -- do not edit here.',
    '# To change it: edit configuration.toml ([upstreams] firefox_esr_tag), run: node scripts/generate.mjs.',
    '# Sourced by scripts/fetch-upstream.sh as its TAG default.',
]);
const TAG_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
export function emitUpstreamPins(config, variant) {
    ...
    assertEmittable('upstreams.firefox_esr_tag', tag);
    return [...UPSTREAM_PINS_BANNER, `FIREFOX_ESR_TAG=${tag}`, ''].join('\n');
}
```
Add: when both Orca keys present emit `UPSTREAM_ORCA_TAG=` and `UPSTREAM_ORCA_COMMIT=` (validate each with a pattern, `assertEmittable`, `report([...])` naming the key and `${RERUN}`); one without the other is refused naming the key; update the two banner lines to name both fetch scripts. Do not use `ORCA_*` names (Orca's env namespace). Fragment is sourced whole by `fetch-upstream.sh`, so extra variables are safe.

**docs/REBRANDING.md** line 305-310 table: add rows `| \`upstreams.orca_tag\` | Optional | ... | \`generated/upstream-pins.env\`, \`scripts/fetch-orca.sh\` |` and the same for `orca_commit`. Each dotted path must be an exact backtick span (`verify-rebranding-docs` derives from the schema). Also change the heading "(both required, never inherited)".

After edit: `node scripts/generate.mjs && node scripts/generate.mjs --check`.

---

### `flake.nix` `devShells.orca`

**Analog:** `devShells.theia` (lines 32-77); Node defined at line 21 (`nodejs = pkgs.nodejs_24;`).
```nix
devShells.${system} = {
  theia = pkgs.mkShell {
    NIX_NO_SELF_RPATH = "1";
    nativeBuildInputs = [ nodejs yarn pkgs.python3 pkgs.pkg-config pkgs.gnumake ... ];
    buildInputs = [ ... ];
    shellHook = ''...'';
  };
```
New `orca = pkgs.mkShell { nativeBuildInputs = [ nodejs pkgs.corepack_24 pkgs.python3 pkgs.pkg-config pkgs.gnumake pkgs.binutils ]; shellHook = ...; }` reusing `nodejs`. Copy `NIX_NO_SELF_RPATH = "1"` (same rpath-baking reason, node-gyp links). Do not touch `theia`; `default` (line 153) stays `theia`. Shell hook exports from RESEARCH: `COREPACK_HOME`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Comment-the-why style as in the file.

---

### `.gitignore`

Anchoring convention present: `/yarn.lock`, `upstream/`, `objdir/`, `.mozbuild/`. Add `/orca/` anchored (an unanchored `orca/` would hide `.planning/workstreams/orca/`). Place near the "Firefox fork build spill" block with a one-line comment.

---

### `scripts/verify-orca-pin.mjs` (test, quick)

**Analog:** `scripts/verify-upstream-pins.mjs` (long header; imports `parse` from `scripts/lib/toml.cjs`; derives expected from manifest; fragment absent = SKIP of that step, present-but-unreadable = FAIL; `git ls-files` literal sweep; in-memory fault plants).

Copy: output format `orca-pin: PASS -- ...` / `FAIL -- ... Next step: ...`; unknown arg exits 2 with `FAIL -- unknown argument`; `--self-test` first proves the unmutated tree green (see `verify-generated-identity.mjs` lines 432-442: "the unmutated tree is already red, so the planted-fault results below would be meaningless"), then prints `ok <case> -> red, naming '<x>'`, and treats a vacuous case as FAIL (lines 517-549).
Plants (RESEARCH table): mismatched tag in fragment; mismatched commit; tag-object SHA vs fixture `orca/`; fixture `orca/` at another tag; literal tag/commit in `fetch-orca.sh`; one key without the other; tracked path under `orca/` (`git ls-files -- orca` must be empty).

---

### `scripts/verify-orca-build-shape.mjs` (test, full + quick self-test)

**Analog:** `scripts/verify-generated-identity.mjs` (derive both sides at check time, set equality both ways, `mkdtempSync` fixtures removed in `finally`, self-test cases carry `{name, anchor, expect}`). Walk `orca/out/` for files named `node`/`node.exe` (hash them) and for an `electron` binary; assert none of `.runtime-node`, `.server-target`, `.version` in `out/orcad`. Named SKIP line, exit 0, when no built `orca/`. Self-test plants: each marker file, a second `node`, `out/runtimes/node-<sha>/bin/node`, an `electron` file, clean control first.

---

### `scripts/verify-orca-slotless-start.mjs` + `scripts/lib/orca-run.mjs` (test, full)

**Analogs:** header style from `scripts/verify-crash-autosubmit-env.mjs` (numbered derive-at-check-time steps, "Limit" paragraph, honest tier statement); live part from `scripts/lib/pb-live-probe.mjs` (`withProbeShell` ~line 51, `openWebTab` ~line 177, `pollFor`, `app.evaluateIn`). Spike 003 original: `.claude/skills/spike-findings-Power-Browser/sources/003-orca-headless-client-in-pb/probe.mjs`. Spawn the official 24.19.0 Node from `powerbrowser/packaging/node-runtime.json` (cached in `.mozbuild/node-dist`), never host `node` (24.22.1). Argv/env and ready-line parser are in RESEARCH "Pattern 3" and "Code Examples"; reuse those. Assert `health.nodeVersion === '24.19.0'`, `boundEndpoint` starts `ws://127.0.0.1:`; redact `pairing`; kill `health.terminalDaemon.pid` in `finally`; SKIP (named line) if any of the four installed-Orca paths exists or no built `orca/`. Self-test: fixtures for 0.0.0.0, 24.22.1, and a sentinel pairing code that must never appear in captured output. DOM assertion reads the rendered page (CLAUDE.md rule 1: no absence assertion on your own log).

---

### `scripts/verify-platform.sh` rows

**Analog:** lines 3820-3821 and 4633-4634:
```bash
    "verify-upstream-pins|node $REPO_ROOT/scripts/verify-upstream-pins.mjs"
    "verify-upstream-pins-self-test|node $REPO_ROOT/scripts/verify-upstream-pins.mjs --self-test"
    ...
    "extension-pins|node $REPO_ROOT/scripts/verify-extension-pins.mjs"
    "extension-pins-self-test|node $REPO_ROOT/scripts/verify-extension-pins.mjs --self-test"
```
Add quick rows next to them: `orca-pin`, `orca-pin-self-test`, `fetch-orca-self-test` (`bash $REPO_ROOT/scripts/fetch-orca.sh --self-test`), `orca-build-shape-self-test`, `orca-slotless-start-self-test`, `orca-licence`, `orca-licence-self-test`. Full tier (inside `if [ "$QUICK" -eq 0 ]`): `orca-build-shape`, `orca-slotless-start`. Only exit code maps to PASS/FAIL; a SKIP is a printed line plus exit 0. Append rows; no sibling driver.

---

### `inventory/licence-allowlist.json` and `orca-licence` check (P60-R1)

**No allow-list analog exists** (confirmed). Shape analog: `inventory/brand-tokens.json` (top-level `$comment` stating consumers and fail-closed rule, then a rows array with a mandatory `reason`). Row: `{ "spdx": "MIT", "holder": "Lovecast Inc.", "source": "stablyai/orca", "tag": <derived, not stored>, "licence_file_sha256": "<sha256 of orca/LICENSE at the pin>", "reason": ... }`. Check pattern from `verify-extension-pins.mjs` step 3 (sha256 compare of a derived file against the pinned digest, failing naming the entry id). Derive the vendored-tree list from the allow-list rows and compare against the tree's LICENSE; SKIP line when `orca/` absent. The check must fail on any SPDX id not listed and on "SEE LICENSE IN". Self-test plants: altered LICENSE text; unlisted SPDX; "SEE LICENSE IN". Note `inventory/` is excluded from the brand scan, so the file may name Orca.

---

### `inventory/brand-tokens.json` and `scripts/scan-brand-residue.mjs` (P60-R2)

**Analog:** the `Deocracy` `coincidental` row (title form), whose keys are `token`, `case_form`, `class: "coincidental"`, `target` (== token), `expected_count`, `expected_files[]`, `only_in[]`, `reason`.
Probe list at `scope.residue_probes` (lines 22-25): `["sourcerer", "deocracy"]`; add `"orca"`. Probe is case-insensitive raw substring, so also claim the substring hits with `coincidental` rows: `ErrorCapture`/`ErrorCalls` in `theia/extensions/telemetry/src/browser/telemetry-error-capture.ts`, `.../telemetry-frontend-module.ts`, `scripts/verify-page-tools-reader-crash.mjs`, `docs/non-gui/plans/wave-e-PLAN.md` (case form `literal` or per-case as the report shows), plus real `Orca`/`orca`/`orcad`/`ORCA` mentions in tracked files outside `.planning/` (e.g. `.claude/hooks/ledger-session-check.py`, `systemd/legion-pb.nix`, spike-findings skill files). Take exact counts from `node scripts/scan-brand-residue.mjs --report <path>` on a staged tree; expected_count is exact per row. `reason` must cite file:line. Self-test plant in the scan: an unclaimed `Orca` in a fixture goes red naming file:line, and a wrong `expected_count` goes red. Stage new files before trusting green.

---

### Claude Code extension (EXT-01)

Not a `theiaPlugins` pin: RESEARCH says do not add it as a pinned `[[extensions]]` entry (proprietary licence, PB does not redistribute; installed at runtime from Open VSX). So `theia/applications/browser/package.json` `theiaPlugins` and `scripts/verify-extension-pins.mjs` stay unchanged (the pin gate derives `theiaPlugins` from `[[extensions]]`; adding one would require a sha pin and a licence ruling). Human checkpoint only; step list in RESEARCH lines 539-546.

## Shared Patterns

### Derive, don't keep
**Source:** `scripts/verify-generated-identity.mjs`, `scripts/verify-crash-autosubmit-env.mjs` header. **Apply to:** every new verify script. Expectations come from `configuration.toml` (via `scripts/lib/toml.cjs` / `generate.mjs`'s resolver), `node-runtime.json`, or the tree.

### Row output and `--self-test`
`<name>: PASS -- ...`, `<name>: FAIL -- ... Next step: ...`, `<name>: SKIP -- ...`; self-test prints `ok <case> -> red, naming '<x>'`, proves the clean control green first, flags vacuous cases. **Apply to:** all new `.mjs`/`.sh` checks.

### Stage before scan
Brand scan iterates `git ls-files`; `git add` explicit paths (never `-a`) before trusting green; another session may commit.

### No generator for pins is the wrong rule here
Pins go `configuration.toml` -> `generate.mjs` -> `generated/upstream-pins.env`; scripts have no literal fallback.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `inventory/licence-allowlist.json` | config | No allow-list exists; only `brand-tokens.json` for file shape |
| `scripts/build-orca.sh` | build script | No in-tree pnpm build wrapper; use RESEARCH install/de-slot commands |
| `scripts/lib/orca-run.mjs` ready-line/redaction parts | utility | New; use RESEARCH "Code Examples" |

## Metadata

**Analog search scope:** `scripts/`, `scripts/lib/`, `inventory/`, `flake.nix`, `configuration.toml`, `docs/REBRANDING.md`, `.gitignore`
**Files read:** fetch-upstream.sh (full), config/schema/generate excerpts, verify-* headers, brand-tokens.json head
**Pattern extraction date:** 2026-11-09
