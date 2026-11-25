# Phase 68: Three-OS artifacts, weekly re-pin and upstream seams - Pattern Map

**Mapped:** 2026-11-09
**Scope:** wave 1 only (lanes 68-01 artifacts, 68-02 re-pin, 68-03 protocol checks, 68-04 licensing; P68-37). Wave 2 (68-05 upstream seam export, 68-06 coordinator) maps onto the same analogs and is not repeated.
**Files analyzed:** 36 new or modified
**Analogs found:** 34 / 36 (two partial)

Line numbers are from this worktree at commit 1430a658. Facts about Orca's tree, the tag listing, the licence closure and runner behaviour are in 68-RESEARCH.md and are not repeated here; this file only says what to copy from where. The Flatpak manifest is the one JSON file under `flatpak/` (named `flatpak/<app-id>.json` below). The Orca remote is the one `REMOTE=` line at `scripts/fetch-orca.sh:23`; no new file repeats its value.

## File Classification

| New/Modified File | Lane | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `.github/workflows/release.yml` `windows-orca` (new job) | 01 | hosted native build | batch, digest out-of-band | `release.yml:247-350` `windows-sidecar` | exact |
| `.github/workflows/release.yml` `macos-orca-arm64`, `macos-orca-x64` (new jobs) | 01 | hosted native build | batch, digest out-of-band | `release.yml:247-350` `windows-sidecar` | role-match (macOS runner, bash gate) |
| `.github/workflows/release.yml` `macos-orca-universal` (new job) | 01 | merge + check | batch | `windows-sidecar` admission step `:329-340` + `package-macos.sh universal()` | role-match |
| `.github/workflows/release.yml` `build-linux` (mod: Orca build step, `PB_HOST_ROOT`, packaged label) | 01 | release build | batch | `release.yml:154-156`, `:179-196` | exact |
| `.github/workflows/release.yml` `build-windows` (mod: `needs`, download, env) and sign zip filter `:669` | 01 | release build | batch | `release.yml:360-361`, `:469-488`, `:669` | exact |
| `scripts/build-orca.sh` (mod: platform-guarded `objdump`, no `-printf`) | 01 | build script | batch | itself `:104`, `:133-135`, `:199` | exact |
| `powerbrowser/packaging/package-linux.sh` (mod) | 01 | staging | batch | itself `:47-95` | exact |
| `powerbrowser/packaging/package-windows.sh` (mod) | 01 | staging | batch | itself `:30-78` (sidecar admission and staging) | exact |
| `powerbrowser/packaging/package-macos.sh` (mod: per-arch Orca staging, `orca-universal` mode, magic classification) | 01 | staging + merge | batch | itself `:81-88`, `:170-193`, `:280-283`, `:337-338` | exact |
| `powerbrowser/packaging/check-win-sidecar.sh` | 01 | admission | batch | itself; reused unchanged for the Orca artifact | exact (no edit) |
| `scripts/win-sign-list.mjs` (mod) | 01 | derive-compare | transform | itself `:44-47`, `:86-119` | exact |
| `scripts/verify-package-target-natives.mjs` (mod: magic universe) | 01 | check | derive-compare | itself `:33-38`, `:60-63`, `:92-106`; `package-macos.sh:81-88` `magic_kind` | exact |
| `scripts/verify-orca-packaged-tree.mjs` (new, + `--self-test`) | 01 | check | derive-compare | `scripts/verify-orca-build-shape.mjs` | exact |
| `scripts/verify-orca-packaged-live.mjs` (new, + `--self-test`; run in wave 2) | 01 | check (live) | event-driven | `scripts/verify-orca-service-live.mjs` + `verify-orca-slotless-start.mjs` | role-match |
| `orca-macos-merge-self-test`, `build-orca-portable-self-test` (new rows) | 01 | check | derive-compare | `verify-orca-build-shape.mjs` plants; `verify-upstream-pins.mjs` text plants | role-match |
| `scripts/verify-release-shape.mjs` (mod) | 01 | check | derive-compare over YAML | itself `:90`, `:481-507`, `:644-648` | exact |
| `scripts/verify-build-windows-shape.mjs` (mod) | 01 | check | derive-compare over YAML | itself `:82-86`, `:162-175`, `:456-482` | exact |
| `flatpak/<app-id>.json` (mod: `--filesystem=home`) | 01 | config | n/a | its `finish-args` block (lines 9-17) | exact |
| `scripts/verify-flathub-manifest.mjs` (mod) | 01 | check | derive-compare | itself `:72`, `:160-164`, `:383-384` | exact |
| `powerbrowser/shell/OrcaService.sys.mjs`, `TheiaService.sys.mjs` (mod: Windows staged Node) | 01 | service | n/a | `OrcaService.sys.mjs:124-130`, `TheiaService.sys.mjs:570` | exact |
| `docs/BUILD.md` (mod: "Orca half", "macOS universal package", "Linux package") | 01 | doc | n/a | sections at lines 428, 1322, 1380 | exact |
| `.github/workflows/rebase-orca.yml` (new) | 02 | replay workflow | batch | `.github/workflows/rebase-upstream.yml` | exact |
| `scripts/rebase-orca.sh` (new, + `--self-test`, `--replay-only`) | 02 | replay script | batch | `scripts/rebase-upstream.sh`; self-test from `scripts/fetch-orca.sh:78-186` | exact |
| `.github/workflows/release-train.yml` (mod: input, `sweep-clock` step, `detect-orca`, `rebase-orca` call, `bump-pr-orca`, `report` needs) | 02 | orchestration | event-driven | `:75-79`, `:639-720`, `:358-430`, `:446-453`, `:565-637`, `:1413-1424` | exact |
| `scripts/release-train.mjs` (mod: `orcaDue`, `--orca-due`, fixtures) | 02 | pure logic | transform | `theiaDue` `:1790-1797`, `theiaDueCli` `:1925-1934`, fixtures `:2333-2341`, dispatch `:3393` | exact |
| `scripts/detect-upstreams.mjs` (mod: `--orca-select`) | 02 | pure selector | transform | `--node-select` path `:103`, `:371-400`; `openPrFor`/`parseOpenPrs` `:110-122` | exact |
| `scripts/verify-upstream-pins.mjs` (mod: `rebase-orca.yml` rules) | 02 | check | derive-compare over YAML | itself `:124`, `:190`, `:263-296`, `:745-788` | exact |
| `scripts/verify-workflows.mjs` (mod, if a new rule is needed) | 02 | check | derive-compare over YAML | itself `:251`, `:564-577` | exact |
| `scripts/verify-orca-slotless-start.mjs` (mod: `--orcad-only`) | 02 | check | request-response | itself `:114-121`, `:224`, `:370-377` | exact |
| `docs/RELEASING.md` (mod: "Train stages") | 02 | doc | n/a | its "Train stages" section | exact |
| `scripts/verify-orca-mobile-protocol.mjs` (new; rows `orca-mobile-protocol`, `orca-mobile-skew`, both with self-tests) | 03 | check | derive-compare | `scripts/verify-orca-build-shape.mjs` (structure); `verify-orca-overlay.mjs` (seam paths) | role-match (import-closure walk has no analog) |
| `orca-overlay/seams.json` (mod: `upstream` key) | 03 | config | n/a | itself (one row) | exact |
| `scripts/verify-orca-overlay.mjs` (mod: `ROW_KEYS`, `upstream` rules, plants) | 03 | check | derive-compare | itself `:53`, `:141`, `:393-415` | exact |
| `scripts/export-orca-seam-pr.mjs` (new, + `--self-test`) | 03 | tooling | batch, writes `.mozbuild/` | `scripts/regenerate-patches.sh --upstream orca --patches ...`; self-test fixture from `fetch-orca.sh:82-103` | partial |
| `scripts/generate-licensing.mjs` (mod: Orca section) | 04 | generator | transform | itself `:127-213`, `:303-321`, `:368-380` | exact |
| `scripts/lib/orca-shipped-packages.mjs` (new) | 04 | utility | transform | `theiaClosure` `generate-licensing.mjs:156-199` (output shape only) | partial (bundle derivation has no analog) |
| `THIRD-PARTY-NOTICES.txt`, `LICENSING.md` (regenerated) | 04 | generated | n/a | `renderNotices` `:303-321` | exact |
| `inventory/licence-allowlist.json` (mod: `allowed_package_spdx`, exception rows, pending row, `reason` text) | 04 | config | n/a | itself (`trees[0]`, lines 4-16) | exact |
| `scripts/verify-licence-allowlist.mjs` (mod: per-package rule, pending rows, `--rulings` full row) | 04 | check | derive-compare | itself `:44-47`, `:55-83`, `:157-191` | exact |
| `scripts/verify-platform.sh` (mod: rows) | all | registry | n/a | quick block `:3855-3883`, full block `:6453-6467`, exclusions `:6600-6616` | exact |

## Pattern Assignments

### `.github/workflows/release.yml` `windows-orca` (hosted native build)

**Analog:** `windows-sidecar`, `release.yml:240-350`. Copy the header comment's trust statement (`:240-246`): no secret, no write token, only `build-windows` needs it, so a failure never reaches a Linux job.

**Job head** (`:247-258`; copy, rename, raise `timeout-minutes` to 90 per research Pitfall 10):
```yaml
  windows-sidecar:
    runs-on: windows-latest
    timeout-minutes: 60
    permissions:
      contents: read
    outputs:
      sums_sha256: ${{ steps.sums.outputs.sha256 }}
    env:
      RELEASE_SHA: ${{ inputs.sha }}
    defaults:
      run:
        shell: bash
```
**Gate steps** (`:260-275`): ref/event refusal, full-SHA regex, checkout with `persist-credentials: false`. Copy byte for byte.

**Node pin** (`:278-290`): read `node-runtime.json` `win32-x64`, regex the version, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` with `package-manager-cache: false`. Copy byte for byte.

**New steps before the build** (P68-30): `git config --global core.longpaths true`, `core.autocrlf false`, the corepack `>= 0.34.5` gate, `rustup target add x86_64-pc-windows-msvc`, then the pins fragment through the generator's exported emitter (same `node --input-type=module -e "import { resolveConfig, ... } from './scripts/generate.mjs'"` form as `release.yml:126` and `package-linux.sh:104`):
```bash
mkdir -p generated
node --input-type=module -e "import { resolveConfig, emitUpstreamPins } from './scripts/generate.mjs'; import { writeFileSync } from 'node:fs'; const { config } = resolveConfig('./configuration.toml'); writeFileSync('generated/upstream-pins.env', emitUpstreamPins(config, 'release'));"
bash scripts/fetch-orca.sh && bash scripts/build-orca.sh
```

**Stage + manifest** (`:309-327`; same shape, Orca paths):
```bash
printf '%s\n' "$GITHUB_WORKSPACE" > "$OUT/BUILD_ROOT"
(cd "$OUT" && find . -type f ! -path ./SHA256SUMS -print | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha256sum > SHA256SUMS)
```
Stage `orca-out/package.json`, `orca-out/out/orcad/**`, `orca-out/out/web/**`, plus `orca-out/orcad-prebuilds-manifest.json` (from `orca/out/orcad-prebuilds/manifest.json`, P68-30/P68-33), `BUILD_ROOT`, `SHA256SUMS`.

**Admission and digest output** (`:329-340`; copy, with the Orca purge targets):
```bash
SUMS="$(sha256sum "$OUT/SHA256SUMS" | cut -d' ' -f1)"
bash powerbrowser/packaging/check-win-sidecar.sh check "$OUT" "$SUMS"
...
bash powerbrowser/packaging/check-win-sidecar.sh purge "$OUT" "${TARGETS[@]}"
echo "sha256=$SUMS" >> "$GITHUB_OUTPUT"
```
**Upload** (`:342-350`): `include-hidden-files: true`, `if-no-files-found: error`, `retention-days: 1`, `overwrite: true`.

Do not copy: the yarn-classic gate (`:294-298`) and the Theia build step (`:301-307`); Orca uses pnpm through corepack inside `build-orca.sh`.

---

### `.github/workflows/release.yml` `macos-orca-arm64`, `macos-orca-x64`, `macos-orca-universal`

**Analog for the thin jobs:** the `windows-orca` shape above, with `runs-on: macos-15` and `runs-on: macos-15-intel` (both match `verify-workflows.mjs:251` `HOSTED = /^(ubuntu|windows|macos)-[\w.-]+$/`). Two named jobs, never a `strategy.matrix`: each needs its own `sums_sha256` output. Add a bash-major gate (`build-orca.sh` uses `mapfile`, `:72,105`). The node-runtime key is `darwin-arm64` / `darwin-x64` (the keys `package-macos.sh:27-28` `arch_row` uses).

**Analog for the universal job:** `runs-on: ubuntu-latest`, `needs: [macos-orca-arm64, macos-orca-x64]`, two `actions/download-artifact` steps (copy the pinned action line from `release.yml:471`), `check-win-sidecar.sh check` on each with `needs.<job>.outputs.sums_sha256`, then `bash powerbrowser/packaging/package-macos.sh orca-universal <arm64-dir> <x64-dir> <out>`, then `node scripts/verify-orca-packaged-tree.mjs --target macos --stage <out> ...` and `node scripts/verify-package-target-natives.mjs --target macos --stage <out>`. No upload consumer, no `continue-on-error` (research Anti-Patterns).

---

### `.github/workflows/release.yml` `build-linux` (mod)

**Orca build step** after "Build the Theia sidecar" (`:154-156`), same `if:` gate and `nix develop` form:
```yaml
      - name: Build the Theia sidecar (package-linux.sh needs theia/applications/browser/lib/backend/main.js)
        if: steps.key_gate.outputs.build == 'true'
        run: nix develop .#theia --command bash -c 'set -euo pipefail; cd theia; yarn install --ignore-scripts --frozen-lockfile; (cd node_modules/drivelist && node-gyp rebuild); yarn build'
```
New step: `bash scripts/fetch-orca.sh` then `nix develop .#orca --command bash scripts/build-orca.sh` (P68-02).

**Host root into the container** (`:179-183`; P68-29): add `-e PB_HOST_ROOT="$PWD"` to
```bash
podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh
```
**Packaged labels** (`:194`): append `orca-packaged-tree` to the `for LABEL in ...` list; the release-shape row reads this exact line (see its self-test edits at `verify-release-shape.mjs:644-645`).

---

### `.github/workflows/release.yml` `build-windows` (mod) and the sign zip filter

**needs** (`:361`): `needs: windows-sidecar` becomes `needs: [windows-sidecar, windows-orca]`. Update the comment at `:358-359` ("Its one needs edge ...").

**Download** (`:469-474`; copy for `windows-orca` into `windows-orca/`):
```yaml
      - name: Download the hosted Windows sidecar into windows-sidecar/ (data, admitted by its digest before staging)
        if: steps.key_gate.outputs.build == 'true'
        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: windows-sidecar
          path: windows-sidecar
```
**Staging env** (`:482-488`; add the Orca pair beside the sidecar pair):
```yaml
        env:
          PB_WIN_SIDECAR_SUMS_SHA256: ${{ needs.windows-sidecar.outputs.sums_sha256 }}
        run: |
          set -euo pipefail
          podman run --rm -v "$PWD:/src:rw" -w /src -e PB_WIN_SIDECAR_DIR=/src/windows-sidecar -e PB_WIN_SIDECAR_SUMS_SHA256 \
            pb-gecko-build bash powerbrowser/packaging/package-windows.sh
```
New: `PB_WIN_ORCA_SUMS_SHA256: ${{ needs.windows-orca.outputs.sums_sha256 }}`, `-e PB_WIN_ORCA_DIR=/src/windows-orca -e PB_WIN_ORCA_SUMS_SHA256`.

**Sign zip filter** (`:669`, inside `sign-windows`):
```python
          ok_name = re.compile(r'^[A-Za-z0-9._/-]+$')
```
Admit `@` (P68-30); the `..`, leading-slash and symlink refusals on the next lines stay.

---

### `scripts/build-orca.sh` (mod)

**Listing** (`:104`), replace `-printf`:
```bash
    out="$(cd "$OVERLAY_DIR/files" && find . -type f -printf '%P\n' | LC_ALL=C sort)" || fail "overlay: listing orca-overlay/files failed"
```
with `find . -type f | sed 's|^\./||' | LC_ALL=C sort` (the form `release.yml:327` already uses).

**Shell entry** (`:132-135`), guard `objdump` by platform:
```bash
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [ "$node_major" != "24" ] || ! command -v corepack >/dev/null || ! command -v objdump >/dev/null; then
  fail "shell entry: need node 24, corepack and objdump; run inside nix develop .#orca"
fi
```
Require `objdump` only when `node -p process.platform` prints `linux`.

**Pins fragment** (`:198-199`): `. "$REPO_ROOT/generated/upstream-pins.env"` stays; on hosted runners the job writes it first (see `windows-orca`). `build-orca-portable-self-test` asserts the three properties statically over this file's text (plant style: `verify-upstream-pins.mjs:745-788`, which edits a copy of a tracked file's text in memory and requires red naming the file and line).

---

### `powerbrowser/packaging/package-linux.sh` (mod)

**Staging** (`:47-48`): extend `rm -rf "$STAGE/theia" "$STAGE/node"` and the `mkdir -p` to `orca`; copy `orca/package.json`, `orca/out/orcad`, `orca/out/web` into `$STAGE/orca` (P68-01). Nothing else from `orca/`.

**RUNPATH strip** (`:83-85`; add `"$STAGE/orca"` to the `find` roots; research Pitfall 7, `pty.node` carries a Nix RUNPATH):
```bash
while IFS= read -r staged_elf; do
    patchelf --remove-rpath "$staged_elf" 2>/dev/null || true
done < <(find "$STAGE/theia" "$STAGE/node" -type f 2>/dev/null || true)
```
**Checkout-path grep** (`:93-95`; P68-29: search `$PB_HOST_ROOT/`, not `$ROOT/`, and add `$STAGE/orca`):
```bash
while IFS= read -r hit; do
    fail "the staged sidecar still carries a checkout path: $hit"
done < <(grep -rlF "$ROOT/" "$STAGE/theia" "$STAGE/node" 2>/dev/null || true)
```
Fail when `PB_HOST_ROOT` is unset, so the grep is never vacuous. Precedent and wording: `package-windows.sh:67-73` ("in release.yml it is mounted at /src, a string every esbuild module key ... contains"). `createprecomplete.py` (`:96`) already runs after staging; no change.

---

### `powerbrowser/packaging/package-windows.sh` (mod)

**Admission** (`:30-33`; copy for Orca):
```bash
test -n "$SIDECAR_DIR" || fail "PB_WIN_SIDECAR_DIR is unset; point it at the windows-latest sidecar artifact (never a legion build)"
test -f "$SIDECAR_DIR/lib/backend/main.js" || fail "$SIDECAR_DIR/lib/backend/main.js is absent from the windows-latest sidecar artifact"
bash "$ROOT/powerbrowser/packaging/check-win-sidecar.sh" check "$SIDECAR_DIR" "${PB_WIN_SIDECAR_SUMS_SHA256:-}" || fail "the sidecar artifact was not admitted; nothing is staged"
```
Orca form: `PB_WIN_ORCA_DIR`, entry `out/orcad/orcad.js`, `PB_WIN_ORCA_SUMS_SHA256`.

**Stage** (`:49-52`):
```bash
rm -rf "$STAGE/theia" "$STAGE/node"
mkdir -p "$STAGE/theia" "$STAGE/node" "$STAGE/distribution"
cp -a "$SIDECAR_DIR/." "$STAGE/theia/"
rm -f "$STAGE/theia/SHA256SUMS" "$STAGE/theia/BUILD_ROOT"
```
Orca form adds `orca`, and also removes the provenance manifest after `orca-packaged-tree --target win64 --prebuild-manifest` has read it.

**Purge + natives** (`:73`, `:77-78`): add `"$STAGE/orca"` to the purge targets of a second `check-win-sidecar.sh purge "$ORCA_DIR" ...` call; the natives gate already walks the whole `$STAGE`.

---

### `powerbrowser/packaging/package-macos.sh` (mod)

**Magic classifier to reuse** (`:81-88`):
```bash
magic_kind() {
    case "$(od -An -N4 -tx1 "$1" 2>/dev/null | tr -d ' \n')" in
        cffaedfe|cefaedfe|feedfacf|feedface) echo thin ;;
        cafebabe|bebafeca) echo fat ;;
        7f454c46) echo elf ;;
        *) echo other ;;
    esac
}
```
**Merge loop to copy for `orca-universal`** (`:177-190`): path-set equality first, then `lipo -create` per thin pair, else `cmp -s` byte identity, red naming the file:
```bash
    if ! diff <(cd "$A" && find . ! -type d | LC_ALL=C sort) <(cd "$X" && find . ! -type d | LC_ALL=C sort) > "$WORK/paths.diff"; then
        fail "the two sidecar trees carry different files, ..."
    fi
    while IFS= read -r -d '' rel; do
        a="$A/$rel"; x="$X/$rel"
        if [ "$(magic_kind "$a")" = thin ] && [ "$(magic_kind "$x")" = thin ]; then
            "$LIPO" -create "$a" "$x" -output "$a.universal" || fail "lipo could not merge the pair ${rel#./}"
            chmod --reference="$a" "$a.universal"
            mv "$a.universal" "$a"
        elif ! cmp -s "$a" "$x"; then
            fail "${rel#./} differs between the two sidecar trees and is not a thin Mach-O pair lipo can merge"
        fi
    done < <(cd "$A" && find . -type f -print0)
```
**Dual-name staging precedent** (`:174-176`, `:191-192`): the two `better-sqlite3` names are lifted out before the path diff, merged once, and the fat file is copied back under both names. Apply the same to the arch-named pairs derived from Orca's tables (P68-31), so the path diff sees equal sets.

**Mode dispatch** (`:280-283` and the usage line at `:34`): add `orca-universal` beside `universal`; the usage refusal keeps `exit 2`.

**Per-arch name check** (`:337-338`): exclude `$RES/orca` from the `*linux*`/`*win32*` name test and classify it with `magic_kind` instead (P68-31).

---

### `scripts/win-sign-list.mjs` (mod)

**Name filter and skip set** (`:44-47`):
```js
const SKIP = ['node/', 'theia/'];
export const NAME_RE = /^[A-Za-z0-9._/-]+$/;
const PE = /\.(exe|dll)$/i;
```
**Comparison** (`:110-117`): extra/missing as named failures. The Orca rule is the same shape with the allowed set read from the admitted `SHA256SUMS` (paths ending `.exe`/`.dll`, plus PE-magic files the SUMS lists, P68-30) instead of the package manifest, compared as a set under `orca/`. Self-test plants follow `:154-163` (`['extra PE file the manifest does not name', make([...required, 'implant.dll']), 'extra: implant.dll']`).

---

### `scripts/verify-package-target-natives.mjs` (mod)

**Current name universe to replace** (`:60-63`, `:92-106`):
```js
function isNativeName(name) {
    return name.endsWith('.node') || ['rg', 'node', 'rg.exe', 'node.exe'].includes(name);
}
```
**Magic table already present** (`:33-38`, `TARGETS`), plus `peHeaderFailure` (`:67-90`) and `magicOf` (`:127`). The new universe: every regular file whose first bytes are ELF `7f454c46`, PE `4d5a`, or Mach-O `feedfacf`/`cffaedfe`/`cafebabe`/`feedface`/`cefaedfe` (the same set as `package-macos.sh:83-84`). `listForeignElf` (`:109`) becomes a special case of the magic walk. Keep the EMPTY-universe red (header `:10-13`). New self-test plants copy the existing win64 plant blocks (`:213-232`, `:256-267`).

---

### `scripts/verify-orca-packaged-tree.mjs` (new, check)

**Analog:** `scripts/verify-orca-build-shape.mjs` (274 lines).
- Import its exported `walk` (`:87-99`) and `NODE_NAMES` (`:54`, `new Set(['node', 'node.exe'])`); do not copy them.
- Node-runtime red, copy the message shape (`:125`): `fails.push(\`Node runtime ${rel(p)} (sha256 ${sha256(p)})\`)`.
- Slot-marker names derived from `orca/src/shared/orcad-artifacts.ts`, as its self-test fixture does with `.fixture-target`/`.fixture-runtime`/`.fixture-version` (`:173-175`), so a pass proves derivation.
- Self-test structure (`:214-250`): `plants` array of `{ name, naming, apply }`, each red naming the drift, final `PASS -- N planted faults each went red naming the drift`.

Core comparison (research "Code Examples"): expected set = `package.json` + `out/orcad/**` + `out/web/**` from the built `orca/`, staged set from `--stage`; extra -> `staged but not built: <p>`, missing -> `built but not staged: <p>`. `--prebuild-manifest` rules per P68-33. Exit 2 with a `Next step:` line on an unknown argument (`verify-orca-overlay.mjs:448-453`).

---

### `scripts/verify-orca-packaged-live.mjs` (new, live; wave 1 writes and self-tests it)

**Analog:** `scripts/verify-orca-service-live.mjs` (460 lines) for launch, process-tree and quit verdicts, and `scripts/verify-orca-slotless-start.mjs` for pairing. Live helpers to reuse, not rewrite: `scripts/lib/pb-relaunch.mjs` (`makeProfile`, `withShell`, `pollFor`), `scripts/lib/pb-live-probe.mjs`, `scripts/lib/firefox-bidi.mjs`. The binary is the extracted release tarball's, not `objdir/dist/bin`. `-self-test` covers only the pure verdicts, as `orca-service-live-self-test` does (registry comment `verify-platform.sh:3880-3881`).

---

### `scripts/verify-release-shape.mjs` (mod)

**Contract list** (`:90`):
```js
const PACKAGED_ROWS = ['ng063-packaged-launch', 'portable-elf', 'sidecar-no-symlinks', 'package-target-natives', 'packaged-identity', 'install-matrix'];
```
Append `orca-packaged-tree`. The rule at `:481-507` already derives the step's labels and requires each to be registered.

**Plant shape** (`:644-648`): text edits of the real `release.yml` line, e.g.
```js
['packaged-rows step drops install-matrix', edit('for LABEL in ng063-packaged-launch ... install-matrix; do', 'for LABEL in ng063-packaged-launch ... packaged-identity; do'), 'packaged-rows', 'does not run install-matrix'],
```
Update the two edit strings when the step line gains `orca-packaged-tree`, and add: Linux job `needs: windows-orca`, matrix on a macOS thin job, `PB_HOST_ROOT` absent from the packaging step.

---

### `scripts/verify-build-windows-shape.mjs` (mod)

**Producer constants** (`:82-86`): `PRODUCER = 'windows-sidecar'`, `DIGEST_REF = '${{ needs.windows-sidecar.outputs.sums_sha256 }}'`. Generalise to a list of producers (`windows-sidecar`, `windows-orca`), each with its digest env name.

**Rule 11** (`sidecarChecks`, `:162-175`): staging env reads exactly the producer output, never `vars.`; only those `needs` values are read; download lands in a path equal to the producer name before the staging step. The comment block at `:33-38` states rule 11; extend it.

**Plants** (`:456-482`, e.g. `'another needs value read'`, `'sidecar download removed'`, `'sidecar downloaded elsewhere'`): duplicate for `windows-orca`. The `sliceEdit` helper (`:445-448`) edits the producer job slice only.

---

### `flatpak/<app-id>.json` and `scripts/verify-flathub-manifest.mjs` (mod)

**Allow-list** (`verify-flathub-manifest.mjs:72`):
```js
const SANDBOX_ALLOW = ['--share=ipc', '--socket=fallback-x11', '--socket=wayland', '--socket=pulseaudio', '--share=network', '--device=dri'];
```
Append `'--filesystem=home'` with the P68-07 reason in the comment at `:70-71`. The set equality (`:160-164`) and the `host filesystem granted` plant (`:383-384`) stay. New plant copies that object shape:
```js
{
    name: 'host filesystem granted', expect: 'grants --filesystem=host',
    overrides: withManifest(d => { d['finish-args'].push('--filesystem=host'); }),
},
```
with `filter(a => a !== '--filesystem=home')` and `expect: 'lacks --filesystem=home'`. The manifest's `finish-args` (lines 9-17) gains the one entry.

---

### `OrcaService.sys.mjs`, `TheiaService.sys.mjs` (mod: Windows staged Node, P68-32)

**Analog** (`OrcaService.sys.mjs:124-130`):
```js
    const appDir = PowerBrowserAPI.getAppDir();
    const stagedNode = appDir ? `${appDir}/node/bin/node` : "";
    const configured = PowerBrowserAPI.getStringPref("powerbrowser.sidecar.nodePath", "");
    const useStagedNode =
      !PowerBrowserAPI.prefHasUserValue("powerbrowser.sidecar.nodePath") && stagedNode && (await PowerBrowserAPI.pathExists(stagedNode));
```
`TheiaService.sys.mjs:570` has the same `stagedNode` line. Both try `node/bin/node`, then `node/node.exe`, with `pathExists` only. No new boundary method, so `check-internals-boundary.sh` and the INTERNAL-APIS catalogue are unchanged; re-run them and `verify-ng-040-internals-catalogue-lines.mjs` to confirm line numbers did not move.

---

### `.github/workflows/rebase-orca.yml` (new)

**Analog:** `.github/workflows/rebase-upstream.yml` (171 lines). Copy:
- Header comment pattern (`:1-21`): no tag in the file, no `default:`, no `schedule:` (D-77), why.
- Triggers (`:25-41`): `workflow_dispatch` and `workflow_call`, each with required `tag` (here also `commit`) of type string and no default, and a `stage` output.
- Job (`:43-62`): `runs-on: ubuntu-latest`, `permissions: contents: read`, checkout with `persist-credentials: false`, the WR-09 comment explaining why; `timeout-minutes: 90` (research Pitfall 10).
- Pre-replay brand scan with no `--extra-root` (`:93-94`) and the comment that explains it.
- Rebase step with `pipefail` and `tee` (`:136-143`):
```yaml
      - name: Rebase onto requested tag
        id: rebase
        env:
          REBASE_TAG: ${{ inputs.tag }}
        run: |
          set -o pipefail
          nix develop .#theia --command bash scripts/rebase-upstream.sh --tag "$REBASE_TAG" 2>&1 | tee "$RUNNER_TEMP/rebase.log"
```
  For Orca: `REBASE_COMMIT` too, `nix develop .#orca --command bash scripts/rebase-orca.sh --tag "$REBASE_TAG" --commit "$REBASE_COMMIT"`; tag and commit pass as env, never interpolated into `run:` text.
- Stage step (`:147-158`): `if: ${{ always() }}`, first `FAIL -- ` line or `replayed`. Copy byte for byte.

---

### `scripts/rebase-orca.sh` (new)

**Analog:** `scripts/rebase-upstream.sh` (192 lines).
- Argument parse and usage refusal (`:33-41`): `rebase-upstream: FAIL -- unrecognized argument: $1`, then a usage line; exit non-zero.
- Plain-tag refusal (`:61-63`); for Orca the stricter `^v[0-9]+\.[0-9]+\.[0-9]+$` plus `^[0-9a-f]{40}$` commit.
- Stage lines: one `rebase-orca: <stage>` echo before each stage and one `rebase-orca: FAIL -- <stage> ...` on failure (`:108-123` pattern), so `rebase-orca.yml`'s stage step picks the first FAIL line.
- Deferred-red pattern for regeneration (`:133-137`, `:185-187`): record, keep checking, report at the end.
- Final PASS line (`:191`).

**Self-test fixture:** `scripts/fetch-orca.sh:78-103`, a `mktemp -d` repo with annotated tags served as `file://`, with the comment "Never touches the real orca/ and never reads a remote from the environment". Extend with a fixture `package.json` whose `typecheck:*` scripts are small Node checkers. The plants and their stage names are in P68-14 and P68-28.

**Pin move** (P68-28): the `firefox_esr_tag` move-and-verify in `release-train.yml:512-515` is the shape:
```bash
if ! grep -qx "firefox_esr_tag = \"${TAG}\"" configuration.toml; then
  echo "release-train: FAIL -- configuration.toml does not carry firefox_esr_tag = ${TAG} after the move. ..." >&2
```
for `orca_tag`/`orca_commit` (`configuration.toml:161-162`), then `nix develop .#theia --command node scripts/generate.mjs`.

---

### `.github/workflows/release-train.yml` (mod)

**Owner input** (`:75-79`):
```yaml
      renovate-theia:
        description: "Run Renovate for the Theia group now (AUTO-02). The sweep also runs it on its first sweep after a month's last Thursday"
        required: false
        type: boolean
        default: false
```
`repin-orca` copies it; add its validation beside `RENOVATE_THEIA` in `derive` (`:160-167`) and update the shortcut comment at `:62` that lists the dispatch inputs.

**Tick** (`sweep-clock`, `:648-651` outputs and `:704-715` step):
```yaml
      - name: Decide whether this sweep is the Theia inflow tick
        id: theia
        if: ${{ steps.due.outputs.due == 'true' }}
        ...
          node scripts/release-train.mjs --theia-due "$(date -u +%s)" "$LAST" > "$RUNNER_TEMP/theia.txt"
          cat "$RUNNER_TEMP/theia.txt"
          grep -E '^theia-due=(true|false)$' "$RUNNER_TEMP/theia.txt" >> "$GITHUB_OUTPUT"
```
Copy as an `orca` step with `--orca-due` and output `orca-due`.

**Detector** (`detect-node`, `:358-391`): `needs: derive`, `contents: read` + `pull-requests: read`, the "List the open PR heads (read)" step (`:377-382`) byte for byte, then one selection step:
```bash
node scripts/detect-upstreams.mjs --node-select "$RUNNER_TEMP/node-index.json" powerbrowser/packaging/node-runtime.json --open-prs "$RUNNER_TEMP/open-prs.txt" > "$RUNNER_TEMP/node-select.txt"
cat "$RUNNER_TEMP/node-select.txt" >> "$GITHUB_OUTPUT"
```
For Orca, the listing is `git ls-remote --tags "$REMOTE"` with `REMOTE` read from the one `REMOTE=` line of `scripts/fetch-orca.sh` (no second literal). The `if:` adds `(inputs.repin-orca || needs.sweep-clock.outputs.orca-due == 'true')` in the form `renovate-theia` uses (`:726`).

**Replay call** (`uptake-replay`, `:446-453`):
```yaml
  uptake-replay:
    needs: [derive, detect]
    if: ${{ ... && needs.detect.outputs.uptake-candidate != '' }}
    uses: ./.github/workflows/rebase-upstream.yml
    with:
      tag: ${{ needs.detect.outputs.uptake-candidate }}
    permissions:
      contents: read
```
`rebase-orca` copies it with `tag` and `commit`.

**Bump** (`bump-pr-node`, `:565-637`): `environment: bot`, `permissions: {}`, checkout with `persist-credentials: false`, regex re-check of every input (`:605-608`), `git switch -C <branch> "$BASE"`, explicit `git add --`, `publish-bump-branch.sh` with the `refuse` hold (`:617-622`), then `gh pr list`/`edit`/`create` (`:623-626`). Deviation (P68-35): the App-token mint step (`:576-585`) moves after the `--replay-only` step and the explicit-path staging; add `gh pr merge --auto --merge`. The explicit-path guard copies `release-train.yml:520-530`:
```bash
git add -A -- configuration.toml powerbrowser patches
UNEXPECTED=$(git status --porcelain --untracked-files=all -- . ':(exclude)configuration.toml' ':(exclude)powerbrowser' ':(exclude)patches')
```
with the P68-11 path set (`configuration.toml`, `orca-overlay/patches`, `orca-overlay/seams.json`).

**Report** (`:1413-1424`): add `detect-orca`, `rebase-orca`, `bump-pr-orca` to `needs`; the issue create/edit/reopen sequence at `:1464-1522` is the one tracking-issue mechanism (P68-13).

---

### `scripts/release-train.mjs` (mod)

**Pure tick** (`theiaDue`, `:1790-1797`):
```js
export function theiaDue(nowMs, lastSweepMs = null) {
    const today = Math.floor(nowMs / DAY_MS);
    ...
    if (typeof lastSweepMs !== 'number' || !Number.isFinite(lastSweepMs)) return true;
    return Math.floor(lastSweepMs / DAY_MS) <= thursday;
}
```
`orcaDue` keeps the unknown-last-sweep fail-safe and compares ISO week keys (research Pattern 3).

**CLI** (`theiaDueCli`, `:1925-1934`; copy with `orca-due=`), dispatch line (`:3393`):
```js
    if (args[0] === '--theia-due' && (args.length === 2 || args.length === 3)) process.exit(theiaDueCli(args.slice(1)));
```
Add the usage text at `:108-109` and to the `Next step:` list at `:3398`.

**Fixtures** (`:2333-2341`): `if (theiaDue(d(9, 29), d(9, 28))) failures.push('...')` form, plus the two `cli(['--theia-due', ...])` lines; cases listed in 68-VALIDATION `68-tick`.

---

### `scripts/detect-upstreams.mjs` (mod)

**Arg parse** (`:85-105`): add `--orca-select <listing> <configuration.toml>` beside
```js
    if (mode === '--node-select' && pos.length === 2) return { mode: 'node-select', path: pos[0], runtimePath: pos[1], openPrsPath: opts['--open-prs'] };
```
**Hold semantics** (`:379-400`): a hold prints empty values and a `NOTE --` reason on stderr, exit 0; a read error is `FAIL --` with a `Next step:`, exit 1. **Open PRs** reuse `parseOpenPrs`/`openPrFor` (`:110-122`) with a branch prefix match for `chore/orca-*`. Selector rules: P68-09 and P68-34. Self-test: add to `selfTest()` (`:456`).

---

### `scripts/verify-upstream-pins.mjs` (mod)

**Workflow rules** (`:124`, `:263-296`): no `on:` block, missing trigger, missing tag input, `default:` under a tag input, and Nix-wrapped scripts (`NIX_SCRIPTS`, `:190`). Make the workflow path a list (`rebase-upstream.yml`, `rebase-orca.yml`), add the `commit` input to the no-default rule, and add `scripts/rebase-orca.sh` to the Nix-wrapped set with `.#orca` as its shell. Plants (`:745-788`) insert `default: self-test-plant` under the input line and require red naming the file; copy for `rebase-orca.yml` and add a literal-commit plant.

---

### `scripts/verify-orca-slotless-start.mjs` (mod: `--orcad-only`)

**SKIP gate** (`:114-121`):
```js
function skipReason({ orcaDir, home, pbBin }) {
    for (const rel of ['out/orcad/orcad.js', 'out/web/web-index.html']) { ... }
    if (!existsSync(pbBin)) return `no built PowerBrowser (${pbBin} missing; see docs/BUILD.md "Firefox half")`;
```
In `--orcad-only`, the `pbBin` clause is skipped. **Pairing call** (`:224`): `if (!fails.length) await pairWebTab(run, { marker, fails });` is not reached in `--orcad-only`. **Argv** (`:370-377`): admit `--orcad-only` beside `--self-test`; any other argument keeps the `FAIL -- unknown argument` exit.

---

### `scripts/verify-orca-mobile-protocol.mjs` (new; two rows)

**Analog:** `scripts/verify-orca-build-shape.mjs` for structure (header with "Derived at check time", `NAME`, SKIP rendering, plants, entry-point guard); `scripts/verify-orca-overlay.mjs` `check()` (`:119`) for reading `seams.json` paths and `orca-overlay/files/` paths. Root rules: P68-26. Skew: P68-27; import the pinned `protocol-compat.ts` by `pathToFileURL` (research "orca-mobile-skew verdict"). The one-blob read of the app's constants uses `git clone --filter=blob:none --no-checkout --depth 1 --branch mobile-android-v<x> <REMOTE> <tmp>` with `REMOTE` read from `fetch-orca.sh`.

---

### `orca-overlay/seams.json` and `scripts/verify-orca-overlay.mjs` (mod)

**Row shape today** (`orca-overlay/seams.json`, one row): `path`, `upstream_blob`, `patch`, `reason`. **Key rule** (`verify-orca-overlay.mjs:53`, `:141`):
```js
const ROW_KEYS = ['patch', 'path', 'reason', 'upstream_blob'];
...
if (!r || typeof r !== 'object' || Object.keys(r).sort().join() !== ROW_KEYS.join()) return bad(`keys are not exactly ${ROW_KEYS.join(', ')}`);
```
Add `upstream` (sorted position after `reason`) and a validation of `{ class, pr }` per P68-19. Plants copy the one-line object form at `:394-415`, e.g.
```js
{ name: 'recorded-blob-changed', naming: 'recorded upstream_blob', apply: (s) => { s.seams[0].upstream_blob = 'f'.repeat(40); } },
```
The existing S1 row gets `"upstream": { "class": "browser-provider", "pr": null }` (P68-36).

---

### `scripts/export-orca-seam-pr.mjs` (new)

**Partial analog.** Patch production reuses `bash scripts/regenerate-patches.sh --upstream orca --patches <dir>` (62-PATTERNS "orca-overlay/ + build-orca.sh hook"). The fixture "Orca main" for the self-test copies `fetch-orca.sh:82-103`. Output goes under `.mozbuild/orca-upstream/<seam-id>/` (git-ignored, like `.mozbuild/node-dist` in `package-windows.sh:37`). PR-template headings are read at run time from the pinned `orca/.github/pull_request_template.md` (P68-36). No push, no network.

---

### `scripts/generate-licensing.mjs` and `scripts/lib/orca-shipped-packages.mjs` (lane 04)

**Per-package record** (`generate-licensing.mjs:133-151`, reuse `licenseField` and `licenceText`; export them for the lib):
```js
function licenseField(pkg) {
    const l = pkg.license ?? pkg.licenses;
    if (typeof l === 'string') return l;
    ...
    return 'no license field';
}
```
**Closure output shape** (`theiaClosure`, `:156-199`): `[{ name, version, license, text }]`, `@powerbrowser/*` walked but not listed, unresolved packages thrown as `Fail` with a `Next step:`. `orca-shipped-packages.mjs` returns the same shape from the bundle-derived set (P68-24). The bundle derivation itself has no analog in this repo.

**Grouping** (`theiaGroups`, `:202-213`): reuse for the Orca section.

**Render** (`renderNotices`, `:303-321`): add an `== Orca (orcad, web client, mobile-web) ==` section after Theia, before Node; keep the "Packages whose licence text is byte-identical share one block." sentence form.

**SKIP line** (`:392`, `:414`): `${NAME}: SKIP -- <what> not re-derived: <why> (run <command>)`. Use it when `orca/out` is absent.

---

### `inventory/licence-allowlist.json` and `scripts/verify-licence-allowlist.mjs` (lane 04)

**Refused forms** (`verify-licence-allowlist.mjs:44-47`):
```js
function refusedSpdx(id) {
    ...
    return s === '' || /^(NONE|UNLICENSED)$/i.test(s) || /^SEE LICENSE/i.test(s);
}
```
Reuse it for the per-package marker test. **Tree rule** (`:55-83`) stays as is; the per-package rule is a separate function over `orca-shipped-packages.mjs` output and the new `allowed_package_spdx` key (P68-24), with exception rows and the pending row (P68-25). **Plants** (`:157-191`) copy the `{ name, naming, apply }` form, e.g.
```js
{ name: 'spdx-see-licence', naming: 'SEE LICENSE IN README.md',
    apply: () => { const a = base(); a.trees[0].spdx = 'SEE LICENSE IN README.md'; return [a, baseLs]; } },
```
**Inventory** (`inventory/licence-allowlist.json`): update `$comment`'s "Scope limit" sentence (the per-package scan now exists), rewrite `trees[0].reason` to name `upstreams.orca_tag`/`upstreams.orca_commit` instead of `v1.4.248`/the commit, and drop `licence_surface_note`'s "belong to Phase 68" clause.

The `orca-licence-rulings` full row runs the same script with a `--rulings` mode (exit 1 naming each pending row).

---

### `scripts/verify-platform.sh` (registry rows)

**Quick rows**, append after `orca-service-live-self-test` (`:3883`), each lane in its own block with a leading `# NEW (68-0N, <req>, <picks>): <what is derived, what is planted>` comment (style of `:3855-3863`):
```bash
    # NEW (60-04, OVL-04, P60-R1): the third-party licence allow-list. ...
    "licence-allowlist|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs"
    "licence-allowlist-self-test|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs --self-test"
```
New quick labels: `orca-packaged-tree-self-test`, `orca-macos-merge-self-test`, `build-orca-portable-self-test`, `orca-packaged-live-self-test` (01); `rebase-orca-self-test` (02); `orca-mobile-protocol`, `orca-mobile-protocol-self-test`, `orca-mobile-skew-self-test`, `orca-seam-export-self-test` (03). Lane 04 adds none (it edits `licensing` and `licence-allowlist`).

**Full rows** go inside the `if [ "$QUICK" -eq 0 ]` block after `orca-service-live` (`:6466`), indented six spaces: `orca-packaged-tree` (01), `orca-packaged-live` (01), `orca-mobile-skew` (03), `orca-licence-rulings` (04). Printed SKIP plus exit 0 is the SKIP mechanism; only exit codes map to PASS/FAIL.

**Exclusions** (`:6600-6616`, form `"<label>|<WINDOWS.md id>|<reason>"`):
```bash
  "package-target-natives|30|no container-built release tarball and no N-plus-1 MAR hop record; deploy OWNER-PASS.md steps, not run"
```
`orca-licence-rulings` (and in wave 2 `orca-upstream-prs`) get rows of this form; the coordinator writes them with the WINDOWS.md ids it assigns.

## Shared Patterns

### Hosted native build admitted by an out-of-band digest
**Source:** `release.yml:247-350` and `check-win-sidecar.sh` (`check` and `purge`, header `:1-22`).
**Apply to:** `windows-orca`, `macos-orca-arm64`, `macos-orca-x64`, `macos-orca-universal`, `package-windows.sh`. The digest leaves as a job output; `SHA256SUMS` inside the artifact is never trusted alone.

### Replay with a named stage and a read-only token
**Source:** `rebase-upstream.yml:43-62`, `:136-158`; `rebase-upstream.sh` FAIL lines.
**Apply to:** `rebase-orca.yml`, `rebase-orca.sh`. Third-party code runs only where no write token exists (P68-35).

### Separate detector and bump job per upstream
**Source:** `detect-node` (`release-train.yml:358-430`), `bump-pr-node` (`:565-637`), explicit-path guard (`:520-530`).
**Apply to:** `detect-orca`, `bump-pr-orca`. An Orca failure never reaches the ESR or Node path.

### Derive-and-compare checks with plants
**Source:** `verify-orca-build-shape.mjs:214-250`, `verify-orca-overlay.mjs:380-433`, `verify-licence-allowlist.mjs:157-191`.
**Apply to:** every new check and every edited self-test. Control green first, each plant red naming the drift, cleanup re-run green, exit 2 with a `Next step:` line on an unknown argument.

### Text plants over a tracked workflow
**Source:** `verify-release-shape.mjs:644-648`, `verify-build-windows-shape.mjs:445-482`, `verify-upstream-pins.mjs:745-788`.
**Apply to:** every edit of `release.yml`, `release-train.yml` and the new `rebase-orca.yml`. Edits are made to an in-memory copy of the real file text.

### Stage before the brand scan
**Source:** CLAUDE.md; `node scripts/scan-brand-residue.mjs` iterates `git ls-files`.
**Apply to:** every new file naming Orca (`rebase-orca.*`, `verify-orca-*.mjs`, `export-orca-seam-pr.mjs`, `orca-shipped-packages.mjs`). Lanes do not edit `inventory/brand-tokens.json`; the coordinator re-measures once.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/lib/orca-shipped-packages.mjs` bundle derivation | utility | esbuild metafile + Vite sourcemap `sources` | No script in this repo reads a bundler metafile or sourcemap. The output shape copies `theiaClosure`; the derivation follows 68-RESEARCH A11 and Pattern table "Don't Hand-Roll". |
| `scripts/verify-orca-mobile-protocol.mjs` import-closure walk | check | `ts.preProcessFile` over `orca/mobile/src` and `orca/src` | No existing check walks a TypeScript import graph. Use 68-RESEARCH Pattern 6 and P68-26; fall back to the research regex with its limit stated (assumption A14). |

## Metadata

**Analog search scope:** `.github/workflows/`, `.github/settings/`, `scripts/`, `scripts/lib/`, `powerbrowser/packaging/`, `powerbrowser/shell/`, `flatpak/`, `inventory/`, `orca-overlay/`, `configuration.toml`.
**Files read:** about 25 (large files by targeted ranges: `release.yml` 72-500, 660-735; `release-train.yml` 358-430, 446-453, 510-530, 565-722, 1413-1430; `package-macos.sh` 23-40, 81-95, 170-193, 276-283; `generate-licensing.mjs` 1-40, 120-240, 300-380).
**Pattern extraction date:** 2026-11-09
