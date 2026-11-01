# Phase 55: macOS (I) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** ~20 (CONTEXT, RESEARCH, S7 plan, generate.mjs, package-linux.sh, node-runtime.json, flake.nix, verify-update-channel/mar-update-hop/installer-build-proof/installer-schema/strip-spike-verdict/shell-error-copy/gui09-setups-copy, verify-platform.sh, regenerate-patches.sh, check-patch-surface.sh, BUILD.md, RELEASING.md, CLAUDE.md)
**Analogs found:** 11 / 13 file groups (no analog for `release.yml` build-macos job — no release workflow exists in tree yet; no analog for the five cocoa branding inputs as emitted files — only their two upstream consumers exist)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/packaging/mozconfig-macos-aarch64` + `mozconfig-macos-x86_64` (tracked comparands) | config | declared state (generator emission → byte-identity compare) | `.mozconfig` (16 lines, tracked root) + `scripts/generate.mjs` `emitMozconfig` + `TARGETS` row | exact |
| `scripts/generate.mjs` (2 new `TARGETS` rows + per-target mozconfig tail) | config/generator | transform (manifest → emitted text) | itself, lines 1464-1495 (`emitMozconfig`) + 3540-3546 (`.mozconfig` row) | exact |
| `flake.nix` (`.#firefox-macos` shell) | config | — | `flake.nix` `devShells.firefox` (mkShell.override stdenv) + S6 `.#firefox-win64` shape | exact |
| five cocoa branding inputs (`document.icns`, `Assets.car`, `dsstore`, `background.png`, `disk.icns`) | asset/config | declared state (emitted, consumed by cocoa repackage + DMG args) | `powerbrowser/branding/dev/*` + `generated/branding/*` (emitted surfaces); consumers `upstream/toolkit/moz.configure:3992-3999` + `upstream/browser/app/Makefile.in:85-87` | partial (consumers exist, emitted files do not) |
| `scripts/verify-mac-entitlements.mjs` (quick row + `--self-test`) | test/gate | transform (parse entitlement XML → set equality) | `scripts/verify-update-channel.mjs` (332 lines, Phase 40, freshest gate shape) | exact shape |
| `scripts/verify-macos-package-payload.mjs` (full row + `--self-test`) | test/gate | file-I/O + subprocess (`lipo`, `codesign`, `dmg` tool, `signmar`) + re-emit compare | `scripts/verify-installer-build-proof.mjs` (stage + compile + require artifact) + `scripts/verify-mar-update-hop.mjs` (evidence re-verify + `buildUpdateXml` re-emit) | role-match |
| `scripts/verify-macos-install-matrix.mjs` (full row + `--self-test`) | test/gate | transform (record text → verdict + BUILD_TARGET set equality) | `scripts/verify-strip-spike-verdict.mjs` (verdict-gate idiom) + S6 `verify-win-matrix-record.mjs` plan shape (not yet in tree) | exact shape (strip-spike is the tracked instance) |
| `scripts/verify-macos-download-copy.mjs` (quick row + `--self-test`) | test/gate | transform (doc text ↔ record text, set equality + no-internals shape) | `scripts/verify-shell-error-copy.mjs` + `scripts/verify-gui09-setups-copy.mjs` (derive-both-sides copy gates) | role-match |
| `powerbrowser/packaging/node-runtime.json` (add `darwin-arm64` + `darwin-x64` pins) | config | declared state (pin → curl + sha256 enforce) | itself (`linux-x64` entry) + `package-linux.sh:27-38` pin-read block | exact |
| `powerbrowser/packaging/package-macos.sh` | utility | file-I/O + subprocess (`mach package` → stage → `make_dmg`) | `powerbrowser/packaging/package-linux.sh` (97 lines) | exact shape |
| `patches/0NN-powerbrowser-macos-team-id.patch` (hook-only Team ID) | config/patch | declared state (regenerated, never text-edited) | `patches/010-powerbrowser-identity.patch` (hook-only include shape) via `scripts/regenerate-patches.sh` + `scripts/check-patch-surface.sh` | exact mechanism |
| `scripts/verify-platform.sh` (append rows) | config/registry | — | its own Phase 41 rows (quick `CHECKS=(` + full `CHECKS+=(`) | exact |
| `docs/BUILD.md` (packaging-hosts, DMG Linux branch, matrix, timings) | docs | — | itself (`### Packaging hosts`, `### Linux package`, `### Per-OS install matrix`, `### Packaging timings`) | exact |
| `docs/RELEASING.md` (macOS rows, deferred SEC-04 fill, asset names) | docs | — | itself (`### macOS`, `## Deferred signing items`, `## Release asset names`) | exact |
| `.github/workflows/release.yml` (`build-macos` job) | config/CI | — | none in tree (only `verify.yml`/`notify-drill.yml`/`rebase-upstream.yml` exist); S6 plan `build-windows` job shape is the prose analog | none, use S6-PLAN §task 7 + RESEARCH §Architecture Patterns |

All analog paths are git-tracked source. `ledger/` is never read by a gate (exclusion-table entry, same as `verify-update-channel.mjs:73`). `scripts/verify-ng-NNN-*.mjs` are hash-locked: read only, never edit, never create a file with that prefix.

## Pattern Assignments

### Per-target mozconfigs + `generate.mjs` TARGETS rows (config, byte-identity)

**Analog:** `scripts/generate.mjs` `emitMozconfig(config, variant)` lines 1464-1495 + `TARGETS` row lines 3540-3546 + tracked `.mozconfig` (16 lines).

**Emitter** — concatenate, never template-interpolate shell defaults (comment lines 1460-1463). Per-target tail appends only Darwin lines; shared lines stay verbatim:
```js
function emitMozconfig(config, variant) {
    const { channel, marChannelId: marChannel } = updateChannel(config);
    const objdir = assertEmittable(variantPath(variant, 'objdir'), variant.objdir);
    const lines = [
        ...GENERATED_BANNER,
        '',
        'mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/../${POWERBROWSER_OBJDIR:-' + objdir + '}',
        'ac_add_options --enable-application=browser',
        `ac_add_options --enable-update-channel=${channel}`,
        `ac_add_options MAR_CHANNEL_ID=${marChannel}`,
        `ac_add_options ACCEPTED_MAR_CHANNEL_IDS=${marChannel}`,
```
Per-target tail (RESEARCH §Code Examples pattern): `--target=aarch64-apple-darwin` / `--target=x86_64-apple-darwin` only (never `arm64-apple-darwin` per `init.configure:565-577`); `export MACOS_SDK_DIR`, `MKFSHFS`/`DMG_TOOL`/`HFS_TOOL`; forbid `--enable-mac-elevated-updates-with-generic-certs` by assertion (Pitfall 2).

**TARGETS rows** — one frozen row per target, same shape as the `.mozconfig` row:
```js
Object.freeze({
    generated: '.mozconfig',
    tracked: '.mozconfig',
    variant: 'dev',
    emit: emitMozconfig,
}),
```
New rows: `generated: 'packaging/mozconfig-macos-aarch64'`, `tracked: 'powerbrowser/packaging/mozconfig-macos-aarch64'`, `variant: '<macos-target>'`, `emit: emitMozconfigMacos`-or-parameterized `emitMozconfig`. Tracked comparands are authored once from the emitter and never edited to go green (same contract as `identity.configure.comparand`, generate.mjs 3547-3558 comment).

---

### `flake.nix` `.#firefox-macos` shell (config)

**Analog:** `flake.nix` lines 67-107 (`devShells.firefox`: `mkShell.override { stdenv = pkgs.llvmPackages.stdenv; }`, `inputsFrom`, MOZBUILD_STATE_PATH anchor, bintools `unset` line).

```nix
firefox =
  (pkgs.mkShell.override { stdenv = pkgs.llvmPackages.stdenv; }) {
    inputsFrom = [ pkgs.firefox-esr-153-unwrapped ];
    buildInputs = [ pkgs.sccache ];
    shellHook = ''
      export MOZBUILD_STATE_PATH="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.mozbuild"
      unset AS LD NM AR RANLIB OBJDUMP OBJCOPY READELF SIZE STRINGS STRIP
```
New shell copies that block verbatim (stdenv override, MOZBUILD anchor, unset line must not be lost — S7 task 2 read-first), then adds the macOS set RESEARCH §Standard Stack names: `llvm` (llvm-lipo), `lld`, `rcodesign`, `rsync`, `cmake`, `openssl`, `zlib`, `gnupatch`. Native inputs pattern follows the theia shell lines 32-49 (each non-obvious entry carries a why-comment; `zizmor` precedent line 48-49). `flake.lock` unchanged.

---

### Five cocoa branding inputs (asset/config)

**Analog:** partial. Emitted-surface shape follows `powerbrowser/branding/dev/moz.build` (`DIRS += ["content", "locales"]`) + `generated/branding/{dev,release}/`; gate shape follows `scripts/verify-installer-schema.mjs` (derive fragment set from `TARGETS` at check time, set equality both ways) — but the required set here derives from *both upstream consumers*, per S7 plan key_links `MOZ_PACKAGE_EXTRA_ARGS`:
- `upstream/toolkit/moz.configure:3992-3999` DMG branch (`--dsstore`, `--background`, `--icon` out of the branding dir);
- `upstream/browser/app/Makefile.in:85-87` (`cp -RL` trio `firefox.icns`, `document.icns`, `Assets.car`).

Anti-pattern (RESEARCH §Anti-Patterns): never hand-keep the five-name list. The gate parses both consumers at check time and unions them; red on addition AND removal. `firefox.icns` exists today; the four-plus-placeholder rest are new. Honest placeholder rule (Pitfall 5): ship `Assets.car`/`dsstore`/`background.png`/`disk.icns` placeholders explicitly labeled, Mac session observes the icon, `actool` upgrade path recorded as deferred.

---

### `scripts/verify-mac-entitlements.mjs` (gate, derive-and-compare, quick)

**Analog:** `scripts/verify-update-channel.mjs` (332 lines). Copy its file skeleton exactly:

Header comment (lines 1-39): numbered list of what the check derives and compares, ending with "This script and its --self-test only read the tree; every plant is applied in memory through runChecks' overrides."

Imports + constants + strict arg parse (lines 41-59):
```js
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'mac-entitlements';
const SELF_REL = 'scripts/verify-mac-entitlements.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
```

Exclusion table with mandatory reasons (lines 71-77) — must include `ledger/`:
```js
const EXCLUDED = Object.freeze([
    ['.planning/', 'planning history quotes past and hypothetical entitlement values'],
    ['ledger/', 'ledger history quotes past values'],
    ['generated/', 'derived output; its source is checked through the in-memory emit'],
    [SELF_REL, 'self-test fixtures plant wrong values on purpose'],
]);
```

Injectable reads (lines 122-139, 150-153): `readText(root, rel)` returning `null` on error; `runChecks(root, overrides = {})` with `const read = overrides.read ?? ((rel) => readText(root, rel));` returning `{ failures, ... }`.

Derivation (RESEARCH §Code Examples skeleton): resolve `mac-signing.hardened-sign-config` groups (`production`→`security/mac/hardenedruntime/production/`, `developer`→`.../developer/` per `mach_commands.py:386-398`), parse each entitlement plist, collect key set + string values; FAIL on `FORBIDDEN_SUBSTRINGS = ['43AQ936H96', 'org.mozilla']` or `RESTRICTED_KEYS = ['com.apple.developer.web-browser.public-key-constraint', 'com.apple.application-identifier']` (exact pair `strip_restricted_entitlements` strips, `mach_commands.py:732-738`); set-equality observed-vs-derived both ways.

main / PASS-FAIL (lines 246-257): `printConsumers`-style listing optional; `${NAME}: PASS -- ...` / `${NAME}: FAIL -- ...` + `process.exit(main())`; exit 2 on bad args.

Self-test (lines 259-330): green baseline first, plants table, each must name file+value, control stays green:
```js
const baseline = runChecks(REPO_ROOT, { read: realRead, files });
if (baseline.failures.length > 0) { ... return 1; }
const plants = [ ['43AQ936H96 string', ...], ['org.mozilla string', ...], ['restricted key', ...] ];
```
CONTEXT-mandated plants: one `43AQ936H96` string, one `org.mozilla` string, one restricted entitlement key — each required red naming the file+key.

---

### `scripts/verify-macos-package-payload.mjs` (gate, full-tier evidence)

**Analogs:** `scripts/verify-installer-build-proof.mjs` (stage inputs at check time, compile, require artifact; header lines 1-54 + `makeReporter` lines 79-94 + `resolveMakensis` fallback lines 116-120) + `scripts/verify-mar-update-hop.mjs` (evidence re-verify from files only; `buildUpdateXml` re-emit compare lines 283-296; import guard lines 504-522).

```js
// Import guard: importing this module (to reuse buildUpdateXml as the
// descriptor's single source) must not run the gate's main.
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch { return false; }
})();
```

What it asserts (S7 task 4 action, carried into Phase 55 per RESEARCH Pattern 1/4): every Mach-O carries exactly the two expected slices (`lipo -archs` vs `aarch64+x86_64`); both per-target `application.ini` + unified bundle share one fourteen-digit BuildID equal to the recorded `MOZ_BUILD_DATE` (`variables.py:22-27` shape); ad-hoc signature present with no cert chain / no Team ID / no notarization ticket (artifact assertion, not a word grep); DMG opens with the Linux dmg tool and extracts the same bundle; MAR bytes re-emitted through the shared descriptor emitter reproduce hash+size (`build-update-xml.mjs` import, never restated); two descriptors differ only in target directory (`Darwin_aarch64-gcc3` vs `Darwin_x86_64-gcc3`); no `config.status` or emitted mozconfig carries the generic-certs switch. Absent evidence = FAIL naming `docs/BUILD.md` procedure (mar-update-hop lines 37-41 precedent), never SKIP. `--self-test` plants: single-slice binary, divergent BuildIDs, stripped signature, cert-chain signature, hash-mismatched descriptor, same-target descriptor pair, generic-certs `config.status` — each red naming drift, green control first. `makeReporter` fail/eq accumulator shape from installer-build-proof lines 80-94; missing-tool fails name the `.#firefox-macos` shell (`resolveMakensis` precedent).

---

### `scripts/verify-macos-install-matrix.mjs` (gate, record + BUILD_TARGET set equality)

**Analog:** `scripts/verify-strip-spike-verdict.mjs` lines 76-113 (verdict-gate idiom S6/S7 both imitate):

```js
function parseVerdict(record) {
    const lines = record.split('\n').filter(line => /\*\*Verdict:\s*(GREEN|RED)\*\*/.test(line));
    return lines;
}
function causeOf(line) {
    const match = /\*\*Verdict:\s*(?:GREEN|RED)\*\*\s*[—–-]\s*(.+)/.exec(line.trim());
    return match ? match[1].trim() : '';
}
```

Applied to the Mac matrix record (S7 `S7-MACOS-MATRIX.md` shape, five cells install/launch/uninstall/no-residue/hop): exactly one well-formed verdict line per derived cell name, cause required on RED, observed `Darwin_*` BUILD_TARGET strings derived from the record and compared as set equality against the emitted descriptor set (`UpdateUtils.sys.mjs:89-90` `OS + "_" + ABI` shape; S7 key_link `Darwin_` pattern). Non-vacuity: zero cells = broken instrument FAIL. `--self-test` plants (S6 §364 precedent): missing cell, bare RED with no cause, empty BUILD_TARGET, Mozilla-root-touching residue claim, absent Gatekeeper block — each red naming drift, clean control green first.

---

### `scripts/verify-macos-download-copy.mjs` (gate, quick)

**Analogs:** `scripts/verify-gui09-setups-copy.mjs` lines 19-46 (derive both sides, set equality, UNREVIEWED vs DROPPED both red) + `scripts/verify-shell-error-copy.mjs` lines 13-29 (no-internals SHAPE test, not a banned-literal list).

Derives the download-page copy's claims from the record/document at check time and the contracted copy from the live `/download` source, compares as set equality (addition AND removal red); runs the no-internal-identifier shape test over the same strings (all-caps tokens, dotted keys — `shell-error-copy-no-internals` pattern, never a banned-string list); asserts the signing/notarization status is stated honestly (ad-hoc vs Developer ID + ticket) and names `PowerBrowser` per the user-facing copy rule. Honestly `--quick`: text off disk only. `--self-test` plants a dropped consequence, an added internal identifier, and a notarization overclaim, each red naming the drift.

---

### `powerbrowser/packaging/node-runtime.json` darwin pins (config)

**Analog:** itself lines 1-7 + `package-linux.sh:27-38` pin-read-and-enforce block:

```json
"linux-x64": {
    "version": "v24.19.0",
    "url": "https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz",
    "sha256": "14b342e..."
}
```
```sh
read -r NODE_VERSION NODE_URL NODE_SHA < <(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["linux-x64"]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json")
...
echo "$NODE_SHA  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json"; }
```

New keys `darwin-arm64` + `darwin-x64`: same three fields, URL under `nodejs.org/dist/`, sha256 from `SHASUMS256.txt` after the owner `gpg --verify` step (RELEASING.md Node provenance — script enforces the pin, never the key trust). `package-macos.sh` reads `["darwin-arm64"]`/`["darwin-x64"]` per arch; never ships a `linux-x64` binary under a darwin name (Pitfall 6; `package-linux.sh:60` hard-codes `linux-x64` — the macOS script parameterizes it).

---

### `powerbrowser/packaging/package-macos.sh` (utility)

**Analog:** `powerbrowser/packaging/package-linux.sh` (97 lines) — copy the file skeleton, change only the OS leg:

```sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/${POWERBROWSER_OBJDIR:-objdir}"
fail() { echo "package-macos: FAIL -- $*" >&2; exit 1; }
```
- Pin block: per-arch `node-runtime.json` read + `sha256sum -c` + delete-and-fail (lines 27-38 precedent).
- Stage: `./mach package` from `upstream/`, locate staged dir via `precomplete` (lines 42-44), stage Theia `lib/` minus maps + `package.json` + `plugins/` (lines 45-50), per-arch `better-sqlite3` prebuilds merged with `lipo` (F7 comment lines 51-60 adapted: two darwin prebuilds in, one fat binary staged).
- RUNPATH + checkout-path assertion (lines 64-86): `patchelf --remove-rpath` analog for Mach-O (whatever task 1 proves — `llvm-install-name-tool -delete_rpath` or documented no-op), then the `grep -rlF "$ROOT/"` fail-naming-hit loop.
- Refresh `precomplete`, rewrite the DMG through `make_dmg`/Linux-branch tools (`MKFSHFS`/`DMG_TOOL`/`HFS_TOOL` from the mozconfig), `trap ... ERR` partial-artifact cleanup (lines 30-32, 96).
- `package-target-natives` extension point: every staged `.node`/`rg`/`node` must read Mach-O (universal where merged).

---

### Hook-only Team-ID patch (patch stack)

**Analog/mechanism:** `scripts/regenerate-patches.sh` (`regenerate_one`, `check_kept`, write-mode rename) + `scripts/check-patch-surface.sh` (compiled-suffix scan lines 43-73; brand-values scan lines 102-167; `--self-test-brand` hook-only fixture lines 211-238 proving `include(` + `DIRS +=` + comments stay green).

Team ID arrives ONLY as a hook-only patch regenerated via `scripts/regenerate-patches.sh`, never text-edited (CLAUDE.md hard rule; CONTEXT §decisions). Surface guard: patch touches no compiled suffix (`is_compiled_path` list `.c .cc .rs .mm ...`), carries no brand value on `+` lines (manifest-derived set). Self-test precedent: planted display-name `+line` red naming patch+value; hook-only fixture green.

---

### `scripts/verify-platform.sh` (registry rows)

**Analog:** its own Phase 40/41 rows. Quick rows append inside `local -a CHECKS=(` (opens line 3573) after the last quick entry (`zizmor-self-test`, line 4730) and before `)` line 4731; full rows append inside `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` (opens line 4733-4734). Shape per 41-PATTERNS (lines 121-135):

```sh
    # NEW (Phase 55, PKG-24): <what it proves>. Honestly --quick: <why no build, browser, display or network>.
    "mac-entitlements|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs"
    # mac-entitlements-self-test plants <list of faults> ...; it writes nothing.
    "mac-entitlements-self-test|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs --self-test"
```
```sh
      # NEW (Phase 55, PKG-14/15/16, SEC-04): <what>. Full tier: <why: needs built tree / evidence dir>.
      "macos-package-payload|node $REPO_ROOT/scripts/verify-macos-package-payload.mjs"
```
Add: `mac-entitlements` + self-test (quick); `macos-package-payload` + self-test (full + quick self-test twin); `macos-download-copy` + self-test (quick); `macos-install-matrix` + self-test (full + quick self-test twin). No sibling driver (CLAUDE.md Verification rule).

---

### `docs/BUILD.md`, `docs/RELEASING.md` (docs)

**Analogs:** themselves. BUILD.md sections to extend (verified lines 997-1097): `### Packaging hosts` table (replace `pkg-macos staged-unexecuted` row line 1013 with hosted-runner + real-Mac record; keep numbered-version floor convention lines 1005-1007); `### MSIX / DMG mechanics` (rewrite the `hdiutil`/`SetFile` line 1026-1027 with the S7 Linux-branch path); `### Per-OS install matrix` (fill macOS row line 1078); `### Packaging timings` (append attributed `MOZ_BUILD_DATE` + unify + notarize wall times — RESEARCH Open Q5 first-notarization measurement). RELEASING.md sections: `### macOS` lines 122-141 (replace ad-hoc posture with Developer ID + notarize + staple), `## Deferred signing items` (fill SEC-04 halves, keep single-register rule lines 145-149), `## Release asset names` table lines 709-713 (replace `pending stage macos-adhoc-signed` with observed universal DMG + MAR names — S6 precedent: fill row, never invent a name).

---

### `.github/workflows/release.yml` `build-macos` (CI)

No analog in tree (workflows dir holds only `verify.yml`, `notify-drill.yml`, `rebase-upstream.yml`). Prose analog: S6 plan task 7 `build-windows` shape (S6-PLAN:348,368): `runs-on: [self-hosted, legion]`, `permissions: contents: read`, no `environment:`, no `secrets.` reference, `nix develop .#firefox-macos` build+package with per-target `POWERBROWSER_OBJDIR`, `nix develop .#theia` sidecar staging, last step extends `release-manifest.json`; `sign-upload`/`sign-publish` needs it; macOS assets + Darwin descriptors gated on the matrix row via a step running `scripts/verify-platform.sh --only macos-install-matrix` that fails the job on red; every `uses:` SHA-pinned and admissible under the `workflows` row (no `schedule:`, legion label only in `build-*`/`matrix-*`). Follows Phase 50 `build-*`/`matrix-*` + `contents: read` conventions per CONTEXT A2.

## Shared Patterns

- **Message format:** `${NAME}: FAIL -- ...` / `${NAME}: PASS -- ...` / `  ok  <plant> -> red, naming ...`; exit 0/1, 2 for bad args (verify-update-channel.mjs 54-59, 246-257).
- **Every failure ends with a next step** ("Next step: run ...").
- **Derive, do not hand-keep lists:** entitlement keys from `hardened-sign-config` + `developer/browser.xml`; branding five from both cocoa consumers; BUILD_TARGET set from the matrix record vs emitted descriptors; DMG/MAR bytes re-emitted and compared. Set equality both ways so addition AND removal go red (CLAUDE.md Verification rule 2).
- **Fail closed:** unreadable file/endpoint or missing instrument (lipo, makensis, SDK, evidence dir) = FAIL naming the cause; zero derived cells/files = distinct FAIL (vacuity, cf. update-channel check 3).
- **Self-test writes nothing in the repo;** plants in memory or in mkdtemp; green baseline first, each plant red naming file+value, control stays green.
- **Honesty comments on every registry row** (--quick: text only; full: needs built tree/evidence/runner).
- **Team ID only via regenerated hook-only patch;** `check-patch-surface.sh` guards the surface.
- **User-facing copy** names `PowerBrowser`, states signing/notarization status honestly, ends with a real on-screen next step; no internal identifier (pref key, sentinel, port, Team ID, `43AQ936H96`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| five cocoa branding inputs (as emitted files) | asset | declared state | inputs do not exist in tree; only the two upstream consumers do — use RESEARCH §Patterns + S7 task 3 derivation |
| `.github/workflows/release.yml` `build-macos` | config/CI | — | no release workflow in tree (Phase 50 owns it); use S6-plan `build-windows` prose shape + `verify.yml` `contents: read` posture |
| `lipo`-merge + `macos-sign --use_rcodesign` invocation strings | utility | subprocess | no caller in tree; canonical forms are `unify.py:84-85` (`[lipo, "-create"]`), `mach_commands.py:103-115` (`--use_rcodesign`), S7 task 4 action |

## Metadata

**Analog search scope:** `scripts/`, `powerbrowser/packaging/`, `powerbrowser/branding/`, `flake.nix`, `docs/`, `.github/workflows/`, `.planning/drafts/distribution/S6*` + `S7*`, `.mozconfig`, `generated/`
**Files scanned:** ~20
**Pattern extraction date:** 2026-10-23
