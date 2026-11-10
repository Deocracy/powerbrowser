#!/usr/bin/env bash
# OVL-02 (Phase 68, P68-10/P68-14/P68-28): the Orca re-pin replay. The release
# train's weekly tick (or the owner's repin-orca dispatch) picks one newer Orca
# tag; rebase-orca.yml runs this script on it, and only a green replay becomes a
# bump PR. The script never chooses a tag: the caller passes the tag and its
# peeled commit, and both are checked by regex before anything else runs.
#
# Stages, in order. Each prints "rebase-orca: <stage>" first; the first failure
# prints "rebase-orca: FAIL -- <stage> <detail>" and stops (rebase-orca.yml takes
# that line as the release train's stage output):
#   pin-move            the orca_tag and orca_commit lines of configuration.toml, then generate.mjs
#   fetch               scripts/fetch-orca.sh, which reads the moved pin
#   seam-apply <patch>  apply-patches.sh onto orca/, regenerate-patches.sh, seams.json upstream_blob
#   build               scripts/build-orca.sh (installs Orca's dependencies, scripts off)
#   typecheck:web       Orca's own typecheck:web, then typecheck:node; a red one names <file>:<line>
#   typecheck:node
#   typecheck coverage  every orca-overlay/files path is in tsc --listFilesOnly of one of the two programs
#   row <label>         verify-platform.sh --only, for each of ROWS below
#   orcad-only start    verify-orca-slotless-start.mjs --orcad-only
#   notices             generate-licensing.mjs --write-orca (the Orca section of THIRD-PARTY-NOTICES.txt)
#   brand scan          scan-brand-residue.mjs over the tracked tree
# typecheck runs after build because Orca's typecheck scripts need the installed workspace.
#
# SKIP is red inside the replay: a row or probe that prints a SKIP line proved
# nothing, so it stops the run as "<stage> skipped". The one exception is
# SKIP_OUT_OF_SCOPE below: a SKIP about the Gecko tree upstream/, which this
# replay never fetches.
#
# Orca code (install, build, typecheck, orcad) runs only in the full replay, in
# rebase-orca.yml's read-only job. --replay-only is the bot job's half: pin-move
# without generate, fetch, seam-apply, then the explicit-path list; it runs git
# and node over tracked data and never build-orca.sh, pnpm, corepack or tsc.
#
# --self-test builds a file:// fixture Orca repository and a fixture PowerBrowser
# root and calls the same stage functions on them. The fixture is reached only
# through those functions' arguments (the root, the generate and package-run
# functions); no environment variable the production path reads selects it.
#
# Usage:
#   nix develop .#orca --command bash scripts/rebase-orca.sh --tag vX.Y.Z --commit <40-hex peeled commit>
#   bash scripts/rebase-orca.sh --replay-only --tag vX.Y.Z --commit <40-hex peeled commit>
#   bash scripts/rebase-orca.sh --self-test
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'
COMMIT_RE='^[0-9a-f]{40}$'
ROWS=(orca-build-shape orca-overlay orca-overlay-built orca-mobile-protocol licence-allowlist orca-mobile-skew)
# The paths a bump stages (P68-11). THIRD-PARTY-NOTICES.txt reaches the bump job as
# the rebase-orca-notices artifact, never from --replay-only (A-P1).
BUMP_PATHS=(configuration.toml orca-overlay/patches orca-overlay/seams.json)
# licence-allowlist checks every fetched tree; upstream/ is the Gecko tree, absent here by design.
SKIP_OUT_OF_SCOPE='^licence-allowlist: SKIP -- upstream/ absent'

# This tree is worked on from inside Orca desktop; none of its variables reach an Orca process.
for name in "${!ORCA_@}"; do unset "$name"; done

say() { echo "rebase-orca: $*"; }
red() { echo "rebase-orca: FAIL -- $*" >&2; return 1; }

# The first SKIP line in $1 that is not out of scope, or nothing.
skip_line() {
  printf '%s\n' "$1" | grep -wE 'SKIP' | grep -vE "$SKIP_OUT_OF_SCOPE" | head -1 || true
}

# Runs "$@", prints its output, and leaves it in OUT and its exit status in RC.
capture() {
  OUT="$("$@" 2>&1)" && RC=0 || RC=$?
  [ -z "$OUT" ] || printf '%s\n' "$OUT"
}

# --- stages -------------------------------------------------------------------
# Every stage takes the PowerBrowser root as its first argument; orca/ and
# orca-overlay/ are under it. Each returns 1 after its FAIL line.

# stage_pin_move <root> <tag> <commit> [<generate function>]
stage_pin_move() {
  local root="$1" tag="$2" commit="$3" gen="${4:-}"
  local cfg="$1/configuration.toml" orca="$1/orca" cur head
  say "pin-move"
  cur="$(sed -n 's/^orca_commit = "\([0-9a-f]*\)"$/\1/p' "$cfg" 2>/dev/null | head -1)"
  [ -n "$cur" ] || { red "pin-move configuration.toml carries no orca_commit line. Next step: restore [upstreams] orca_tag and orca_commit."; return 1; }
  if [ -e "$orca" ]; then
    head="$(git -C "$orca" rev-parse HEAD 2>/dev/null || echo '<not a git checkout>')"
    if [ "$head" = "$cur" ] && [ "$head" != "$commit" ]; then
      say "pin-move -- orca/ is at the current pin ${cur:0:10}; removing it, the replay runs on a fresh checkout"
      rm -rf "$orca" || { red "pin-move could not remove orca/"; return 1; }
    elif [ "$head" != "$commit" ]; then
      red "pin-move orca/ exists at $head; the replay runs on a fresh checkout. Next step: rm -rf orca, then re-run."
      return 1
    fi
  fi
  sed -i -e "s/^orca_tag = \"[^\"]*\"\$/orca_tag = \"$tag\"/" -e "s/^orca_commit = \"[^\"]*\"\$/orca_commit = \"$commit\"/" "$cfg" \
    || { red "pin-move could not rewrite configuration.toml"; return 1; }
  if ! grep -qx "orca_tag = \"$tag\"" "$cfg" || ! grep -qx "orca_commit = \"$commit\"" "$cfg"; then
    red "pin-move configuration.toml does not carry orca_tag = \"$tag\" and orca_commit = \"$commit\" after the move. Next step: check the two line shapes in [upstreams]."
    return 1
  fi
  if [ -n "$gen" ]; then
    capture "$gen" "$root"
    [ "$RC" -eq 0 ] || { red "pin-move generate.mjs exited $RC. Next step: run node scripts/generate.mjs and read its report."; return 1; }
  fi
  say "pin-move -- configuration.toml pins $tag (${commit:0:10})"
}

# stage_fetch <root> [<tag> <commit>]: with a tag and commit they are exported to
# fetch-orca.sh (its re-pin hook); without, it reads the moved pin from generated/.
stage_fetch() {
  local root="$1"
  say "fetch"
  if [ $# -ge 3 ]; then
    capture env TAG="$2" COMMIT="$3" bash "$root/scripts/fetch-orca.sh"
  else
    capture env -u TAG -u COMMIT bash "$root/scripts/fetch-orca.sh"
  fi
  [ "$RC" -eq 0 ] || { red "fetch fetch-orca.sh exited $RC. Next step: read its FAIL line above; a moved tag needs the peeled commit."; return 1; }
}

# stage_seam_apply <root> <tag>: sets SEAM_COUNT.
stage_seam_apply() {
  local root="$1" tag="$2"
  local orca="$1/orca" overlay="$1/orca-overlay" out line path name
  local seams=() patches=()
  say "seam-apply"
  out="$(node -e 'for (const s of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).seams) console.log(s.path)' "$overlay/seams.json" 2>&1)" \
    || { red "seam-apply orca-overlay/seams.json could not be read: $out"; return 1; }
  [ -z "$out" ] || mapfile -t seams <<< "$out"
  # As build-orca.sh step 1b: an edit nobody declared is never erased.
  out="$(git -C "$orca" status --porcelain --untracked-files=no)" || { red "seam-apply git -C orca status failed"; return 1; }
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line:3}"
    printf '%s\n' "${seams[@]}" | grep -qxF -- "$path" || { red "seam-apply undeclared modification in orca/: $path. Next step: remove it or declare the seam."; return 1; }
  done <<< "$out"
  if [ "${#seams[@]}" -gt 0 ]; then
    git -C "$orca" reset -q -- "${seams[@]}" && git -C "$orca" checkout HEAD -- "${seams[@]}" \
      || { red "seam-apply could not reset the declared seam paths to $tag. Next step: a seam path is gone at $tag; rework or drop the seam."; return 1; }
  fi
  shopt -s nullglob
  patches=("$overlay"/patches/*.patch)
  shopt -u nullglob
  SEAM_COUNT="${#seams[@]}"
  [ "${#patches[@]}" -gt 0 ] || { say "seam-apply -- no seam patches"; return 0; }
  capture bash "$REPO_ROOT/scripts/apply-patches.sh" --upstream "$orca" --patches "$overlay/patches"
  if [ "$RC" -ne 0 ]; then
    name="$(printf '%s\n' "$OUT" | sed -n 's/^apply-patches: FAIL -- \([^ ]*\.patch\) .*/\1/p' | head -1)"
    red "seam-apply ${name:-<apply-patches.sh named no patch>} does not apply onto $tag. Next step: regenerate or rework the seam against $tag."
    return 1
  fi
  capture bash "$REPO_ROOT/scripts/regenerate-patches.sh" --upstream "$orca" --patches "$overlay/patches"
  [ "$RC" -eq 0 ] || { red "seam-apply regenerate-patches.sh exited $RC on $tag. Next step: read its FAIL line above."; return 1; }
  capture node -e '
    const fs = require("fs"), { execFileSync } = require("child_process");
    const [file, orca] = process.argv.slice(1);
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const s of doc.seams) s.upstream_blob = execFileSync("git", ["-C", orca, "rev-parse", `HEAD:${s.path}`], { encoding: "utf8" }).trim();
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");' "$overlay/seams.json" "$orca"
  [ "$RC" -eq 0 ] || { red "seam-apply could not rewrite seams.json upstream_blob at $tag"; return 1; }
  say "seam-apply -- $SEAM_COUNT seam(s) applied and regenerated onto $tag"
}

stage_build() {
  say "build"
  capture bash "$1/scripts/build-orca.sh"
  [ "$RC" -eq 0 ] || { red "build build-orca.sh exited $RC. Next step: read the build-orca FAIL line above; its log names the step."; return 1; }
}

# stage_typecheck <root> <script> <package-run function>
stage_typecheck() {
  local root="$1" script="$2" run="$3" loc
  say "$script"
  capture eval 'cd "$root/orca" && "$run" "$script"'
  if [ "$RC" -ne 0 ]; then
    loc="$(printf '%s\n' "$OUT" | grep -oE -m1 '[A-Za-z0-9_./@-]+\.[A-Za-z]+(\([0-9]+,|:[0-9]+)' | head -1 | sed -E 's/\(([0-9]+),$/:\1/')"
    red "$script ${loc:-<no file:line in the output>}. Next step: fix the overlay file or the seam at that location against the new tag."
    return 1
  fi
}

# Every PB-added overlay file must be in one of the two typecheck programs, or the
# typecheck above proved nothing about it.
stage_coverage() {
  local root="$1" orca="$1/orca" list path real
  local files=()
  say "typecheck coverage"
  if [ -d "$root/orca-overlay/files" ]; then
    mapfile -t files < <(cd "$root/orca-overlay/files" && find . -type f -printf '%P\n' | LC_ALL=C sort)
  fi
  if [ "${#files[@]}" -eq 0 ]; then
    say "typecheck coverage -- 0 overlay files at this pin (vacuous; the self-test proves the stage)"
    return 0
  fi
  list="$(cd "$orca" && node node_modules/typescript/bin/tsc --listFilesOnly -p config/tsconfig.tc.web.json && node node_modules/typescript/bin/tsc --listFilesOnly -p config/tsconfig.node.json)" \
    || { red "typecheck coverage tsc --listFilesOnly failed. Next step: run it from orca/ on config/tsconfig.tc.web.json and config/tsconfig.node.json."; return 1; }
  for path in "${files[@]}"; do
    real="$(realpath -e "$orca/$path" 2>/dev/null)" || { red "typecheck coverage $path is not in orca/ after the build. Next step: check build-orca.sh's overlay copy."; return 1; }
    printf '%s\n' "$list" | grep -qxF -- "$real" \
      || { red "typecheck coverage $path is in neither typecheck program. Next step: place it where config/tsconfig.tc.web.json or config/tsconfig.node.json includes it."; return 1; }
  done
  say "typecheck coverage -- ${#files[@]} overlay file(s), each in a typecheck program"
}

stage_rows() {
  local root="$1" label line
  for label in "${ROWS[@]}"; do
    say "row $label"
    capture bash "$root/scripts/verify-platform.sh" --only "$label"
    [ "$RC" -eq 0 ] || { red "row $label exited $RC. Next step: run scripts/verify-platform.sh --only $label and fix what it names."; return 1; }
    line="$(skip_line "$OUT")"
    [ -z "$line" ] || { red "row $label skipped: $line. Next step: a SKIP proves nothing in the replay; provide what the row needs."; return 1; }
  done
}

stage_orcad() {
  local root="$1" line
  say "orcad-only start"
  capture node "$root/scripts/verify-orca-slotless-start.mjs" --orcad-only
  [ "$RC" -eq 0 ] || { red "orcad-only start exited $RC. Next step: run node scripts/verify-orca-slotless-start.mjs --orcad-only."; return 1; }
  line="$(skip_line "$OUT")"
  [ -z "$line" ] || { red "orcad-only start skipped: $line"; return 1; }
}

stage_notices() {
  local root="$1" line
  say "notices"
  capture node "$root/scripts/generate-licensing.mjs" --write-orca
  [ "$RC" -eq 0 ] || { red "notices generate-licensing.mjs --write-orca exited $RC. Next step: run it locally and read its FAIL lines."; return 1; }
  line="$(skip_line "$OUT")"
  [ -z "$line" ] || { red "notices skipped: $line"; return 1; }
  if git -C "$root" diff --quiet -- THIRD-PARTY-NOTICES.txt; then
    say "notices -- THIRD-PARTY-NOTICES.txt unchanged"
  else
    say "notices -- THIRD-PARTY-NOTICES.txt changed (the bump carries it as the rebase-orca-notices artifact)"
  fi
}

stage_brand() {
  say "brand scan"
  capture node "$1/scripts/scan-brand-residue.mjs"
  [ "$RC" -eq 0 ] || { red "brand scan found residual brand strings after the replay. Next step: re-measure with node scripts/scan-brand-residue.mjs."; return 1; }
}

# run_replay <root> <tag> <commit> <full|replay-only> <generate function> <package-run function>
run_replay() {
  local root="$1" tag="$2" commit="$3" mode="$4" gen="$5" run="$6"
  SEAM_COUNT=0
  if [ "$mode" = replay-only ]; then
    stage_pin_move "$root" "$tag" "$commit" || return 1
    stage_fetch "$root" "$tag" "$commit" || return 1
    stage_seam_apply "$root" "$tag" || return 1
    say "replay-only -- stage by explicit path: ${BUMP_PATHS[*]}"
    return 0
  fi
  stage_pin_move "$root" "$tag" "$commit" "$gen" || return 1
  stage_fetch "$root" || return 1
  stage_seam_apply "$root" "$tag" || return 1
  stage_build "$root" || return 1
  stage_typecheck "$root" typecheck:web "$run" || return 1
  stage_typecheck "$root" typecheck:node "$run" || return 1
  stage_coverage "$root" || return 1
  stage_rows "$root" || return 1
  stage_orcad "$root" || return 1
  stage_notices "$root" || return 1
  stage_brand "$root" || return 1
  say "PASS -- $tag (${commit:0:10}) replayed: $SEAM_COUNT seam(s) regenerated, typecheck clean, ${#ROWS[@]} rows green"
}

# The production generate and package-run functions. Their fixture twins are in the self-test.
theia_generate() { (cd "$1" && nix develop .#theia --command node scripts/generate.mjs); }
# build-orca.sh's corepack knobs, so pnpm is the version it installed.
# verify-deps-before-run=false: pnpm 12's default re-installs before a run, without build-orca.sh's
# store, virtual-store and --ignore-scripts knobs, relinking orca/node_modules and running lifecycle scripts.
orca_pnpm_run() {
  COREPACK_HOME="$REPO_ROOT/.mozbuild/corepack" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 DO_NOT_TRACK=1 \
    PATH="$REPO_ROOT/.mozbuild/corepack/bin:$PATH" corepack pnpm --config.verify-deps-before-run=false run "$1"
}

# --- self-test ------------------------------------------------------------------
# A fixture Orca repository with two annotated tags served as file://, and a
# fixture PowerBrowser root whose scripts/ holds a copy of fetch-orca.sh with
# its REMOTE line pointed at the fixture plus small stand-ins for the build,
# the rows, the probe, the notices writer and the brand scan. apply-patches.sh
# and regenerate-patches.sh are the real ones, given the fixture directories.

FX_GIT=(git -c user.email=test@example.invalid -c user.name=Test -c commit.gpgsign=false -c tag.gpgsign=false -c init.defaultBranch=main)

# fx_lines <prefix> <n> [<line> <text>]...: n numbered lines, with replacements.
fx_lines() {
  local prefix="$1" n="$2" i; shift 2
  declare -A repl=()
  while [ $# -ge 2 ]; do repl[$1]="$2"; shift 2; done
  for ((i = 1; i <= n; i++)); do echo "${repl[$i]:-export const $prefix$i = $i;}"; done
}

# make_remote <dir> <variant>: <dir>/repo with v1.0.1 and v1.0.2; sets FX_C1, FX_C2.
# Variants change what v1.0.2 carries: every one moves src/seam.ts outside the seam's
# context; conflict changes the seam's own pre-image line instead; typeerror plants
# a type error at src/a.ts:3; licence changes LICENSE.
make_remote() {
  local dir="$1" variant="$2" repo="$1/repo"
  mkdir -p "$repo/src" "$repo/config"
  "${FX_GIT[@]}" -C "$repo" init -q
  fx_lines a 30 > "$repo/src/a.ts"
  fx_lines s 20 > "$repo/src/seam.ts"
  echo 'MIT fixture licence' > "$repo/LICENSE"
  cat > "$repo/package.json" <<'EOF'
{
  "name": "fixture-orca",
  "private": true,
  "scripts": {
    "typecheck:web": "node config/check.mjs config/tsconfig.tc.web.json",
    "typecheck:node": "node config/check.mjs config/tsconfig.node.json"
  }
}
EOF
  echo '{ "include": ["../src/**/*"] }' > "$repo/config/tsconfig.tc.web.json"
  echo '{ "include": ["../src/**/*"] }' > "$repo/config/tsconfig.node.json"
  # The fixture typechecker: a planted marker in an included file is a type error at its line.
  cat > "$repo/config/check.mjs" <<'EOF'
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
const cfg = resolve(process.argv[2]);
const walk = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
for (const inc of JSON.parse(readFileSync(cfg, 'utf8')).include) {
  for (const f of walk(resolve(dirname(cfg), inc.split('*')[0]))) {
    const at = readFileSync(f, 'utf8').split('\n').findIndex((l) => l.includes('PLANTED-TYPE-ERROR'));
    if (at >= 0) { console.log(`${relative(process.cwd(), f)}(${at + 1},1): error TS2322: planted type error`); process.exit(1); }
  }
}
EOF
  "${FX_GIT[@]}" -C "$repo" add -A
  "${FX_GIT[@]}" -C "$repo" commit -q -m v1.0.1
  "${FX_GIT[@]}" -C "$repo" tag -a v1.0.1 -m v1.0.1
  case "$variant" in
    conflict) fx_lines s 20 10 'export const s10 = 2;' > "$repo/src/seam.ts" ;;
    *) fx_lines s 20 1 'export const s1 = 101;' > "$repo/src/seam.ts" ;;
  esac
  case "$variant" in
    typeerror) fx_lines a 30 3 "export const a3: number = 'PLANTED-TYPE-ERROR';" > "$repo/src/a.ts" ;;
    licence) echo 'MIT fixture licence, changed at v1.0.2' > "$repo/LICENSE" ;;
  esac
  "${FX_GIT[@]}" -C "$repo" commit -q -am v1.0.2
  "${FX_GIT[@]}" -C "$repo" tag -a v1.0.2 -m v1.0.2
  FX_C1="$(git -C "$repo" rev-parse 'refs/tags/v1.0.1^{commit}')"
  FX_C2="$(git -C "$repo" rev-parse 'refs/tags/v1.0.2^{commit}')"
}

# make_root <root> <repo> <variant>: a fixture PowerBrowser root pinned at v1.0.1. Each
# stand-in leaves an untracked ran-<stage> file in the root, so a --replay-only run that
# reached one shows in git status. Variants: uncovered and covered add an overlay file
# outside and inside the fixture programs; brand plants a token in a tracked file;
# rowskip makes the orca-overlay row print SKIP; upstreamskip makes licence-allowlist
# print its out-of-scope upstream/ SKIP; orcadskip makes the probe print SKIP.
make_root() {
  local root="$1" repo="$2" variant="$3" seed="$1.seed"
  mkdir -p "$root/scripts" "$root/orca-overlay/patches"
  "${FX_GIT[@]}" -C "$root" init -q
  printf '/orca/\n/orca.partial/\n/generated/\n' > "$root/.gitignore"
  printf '[upstreams]\norca_tag = "v1.0.1"\norca_commit = "%s"\n' "$FX_C1" > "$root/configuration.toml"
  sed "s|^REMOTE=.*|REMOTE=\"file://$repo\"|" "$REPO_ROOT/scripts/fetch-orca.sh" > "$root/scripts/fetch-orca.sh"
  [ "$(grep -c "^REMOTE=\"file://$repo\"\$" "$root/scripts/fetch-orca.sh")" = 1 ] || { echo "fixture: fetch-orca.sh no longer has one REMOTE= line" >&2; return 1; }
  cat > "$root/scripts/generate.mjs" <<'EOF'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const t = readFileSync('configuration.toml', 'utf8');
const v = (k) => new RegExp(`^${k} = "([^"]*)"$`, 'm').exec(t)[1];
mkdirSync('generated', { recursive: true });
writeFileSync('generated/upstream-pins.env', `UPSTREAM_ORCA_TAG=${v('orca_tag')}\nUPSTREAM_ORCA_COMMIT=${v('orca_commit')}\n`);
writeFileSync('ran-generate', '');
console.log('generate: PASS -- fixture');
EOF
  # The fixture build: a stand-in tsc that lists what the fixture tsconfig includes, and
  # the overlay files copied in, as build-orca.sh step 1b does.
  cat > "$root/scripts/build-orca.sh" <<'EOF'
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/orca/node_modules/typescript/bin"
cat > "$root/orca/node_modules/typescript/bin/tsc" <<'TSC'
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const cfg = resolve(process.argv[process.argv.indexOf('-p') + 1]);
const walk = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
for (const inc of JSON.parse(readFileSync(cfg, 'utf8')).include) for (const f of walk(resolve(dirname(cfg), inc.split('*')[0]))) console.log(f);
TSC
if [ -d "$root/orca-overlay/files" ]; then cp -r "$root/orca-overlay/files/." "$root/orca/"; fi
touch "$root/ran-build"
echo "build-orca: PASS -- fixture"
EOF
  # The fixture rows: licence-allowlist compares orca/LICENSE with the digest recorded at v1.0.1.
  git -C "$repo" show v1.0.1:LICENSE | sha256sum | cut -d' ' -f1 > "$root/licence.sha256"
  cat > "$root/scripts/verify-platform.sh" <<'EOF'
root="$(cd "$(dirname "$0")/.." && pwd)"
label="$2"
touch "$root/ran-row-$label"
if [ -f "$root/skip-row" ] && [ "$(cut -d'|' -f1 "$root/skip-row")" = "$label" ]; then cut -d'|' -f2- "$root/skip-row"; exit 0; fi
if [ "$label" = licence-allowlist ] && [ "$(sha256sum < "$root/orca/LICENSE" | cut -d' ' -f1)" != "$(cat "$root/licence.sha256")" ]; then
  echo "licence-allowlist: FAIL -- orca LICENSE digest changed"; exit 1
fi
echo "$label: PASS -- fixture row"
EOF
  local probe='PASS -- fixture orcad half only'
  [ "$variant" != orcadskip ] || probe='SKIP -- no built orca/ (fixture)'
  echo "import { writeFileSync } from 'node:fs'; writeFileSync('$root/ran-orcad', ''); console.log('orca-slotless-start: $probe');" > "$root/scripts/verify-orca-slotless-start.mjs"
  echo "import { writeFileSync } from 'node:fs'; writeFileSync('$root/ran-notices', ''); console.log('licensing: wrote the Orca section (0 packages, fixture)');" > "$root/scripts/generate-licensing.mjs"
  cat > "$root/scripts/scan-brand-residue.mjs" <<'EOF'
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
writeFileSync(`${root}/ran-brand`, '');
const token = ['FIXTURE', 'BRAND'].join('');
const hits = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n').filter((f) => f && readFileSync(`${root}/${f}`, 'utf8').includes(token));
if (hits.length) { console.log(`scan-brand-residue: FAIL -- ${hits.join(', ')}`); process.exit(1); }
console.log('scan-brand-residue: PASS -- fixture');
EOF
  # One seam on src/seam.ts, made by the real regenerate-patches.sh against the pinned fixture.
  git -c advice.detachedHead=false clone -q --branch v1.0.1 "file://$repo" "$seed"
  fx_lines s 20 10 'export const s10 = 1010; // fixture seam' > "$seed/src/seam.ts"
  git -C "$seed" diff --abbrev=10 HEAD -- src/seam.ts > "$root/orca-overlay/patches/010-fixture-seam.patch"
  bash "$REPO_ROOT/scripts/regenerate-patches.sh" --upstream "$seed" --patches "$root/orca-overlay/patches" >/dev/null
  printf '{\n  "seams": [\n    {\n      "path": "src/seam.ts",\n      "upstream_blob": "%s",\n      "patch": "patches/010-fixture-seam.patch",\n      "reason": "fixture"\n    }\n  ]\n}\n' \
    "$(git -C "$seed" rev-parse HEAD:src/seam.ts)" > "$root/orca-overlay/seams.json"
  rm -rf "$seed"
  case "$variant" in
    uncovered) mkdir -p "$root/orca-overlay/files/extra" && echo 'export const x = 1;' > "$root/orca-overlay/files/extra/x.ts" ;;
    covered) mkdir -p "$root/orca-overlay/files/src" && echo 'export const pbAdded = 1;' > "$root/orca-overlay/files/src/pb-added.ts" ;;
    brand) printf 'notes: %s%s\n' FIXTURE BRAND > "$root/notes.txt" ;;
    rowskip) echo 'orca-overlay|orca-overlay: SKIP -- no built thing' > "$root/skip-row" ;;
    upstreamskip) echo 'licence-allowlist|licence-allowlist: SKIP -- upstream/ absent; its LICENSE digest is unchecked' > "$root/skip-row" ;;
  esac
  "${FX_GIT[@]}" -C "$root" add -A
  "${FX_GIT[@]}" -C "$root" commit -q -m fixture
}

fixture_generate() { (cd "$1" && node scripts/generate.mjs); }
fixture_pnpm_run() { touch "../ran-$1"; sh -c "$(node -p 'require("./package.json").scripts[process.argv[1]]' "$1")"; }

run_self_test() {
  local tmp n=0 misses=0 runs=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  ok() { echo "  ok $1"; }
  miss() { echo "  MISS $1: $2" >&2; misses=$((misses + 1)); }

  # fixture <remote variant> <root variant>: a fresh fixture in its own directory; sets FX_ROOT
  # and FX_LOG.
  fixture() {
    runs=$((runs + 1))
    FX_LOG="$tmp/run$runs.log"
    make_remote "$tmp/run$runs" "$1" && make_root "$tmp/run$runs/pb" "$tmp/run$runs/repo" "$2" && FX_ROOT="$tmp/run$runs/pb"
  }
  # expect_pass <name> [<remote variant> <root variant>]
  expect_pass() {
    local name="$1" log
    fixture "${2:-control}" "${3:-control}" >"$tmp/fixture.log" 2>&1 || { miss "$name" "fixture: $(tail -1 "$tmp/fixture.log")"; return; }
    log="$FX_LOG"
    if (run_replay "$FX_ROOT" v1.0.2 "$FX_C2" full fixture_generate fixture_pnpm_run) >"$log" 2>&1 \
      && tail -1 "$log" | grep -q '^rebase-orca: PASS -- v1.0.2'; then
      ok "$name -> green: $(tail -1 "$log" | sed 's/^rebase-orca: PASS -- //')"
    else
      miss "$name" "the fixture replay did not pass: $(grep -m1 '^rebase-orca: FAIL -- ' "$log" || tail -1 "$log")"
    fi
  }
  # expect_stop <name> <remote variant> <root variant> <stage string>
  expect_stop() {
    local name="$1" want="$4" log line
    fixture "$2" "$3" >"$tmp/fixture.log" 2>&1 || { miss "$name" "fixture: $(tail -1 "$tmp/fixture.log")"; return; }
    log="$FX_LOG"
    if (run_replay "$FX_ROOT" v1.0.2 "$FX_C2" full fixture_generate fixture_pnpm_run) >"$log" 2>&1; then
      miss "$name" "the replay passed; it must stop at '$want'"
      return
    fi
    line="$(grep -m1 '^rebase-orca: FAIL -- ' "$log" || true)"
    if [[ "$line" == "rebase-orca: FAIL -- $want"* ]]; then
      n=$((n + 1))
      ok "$name -> stopped at ${line#rebase-orca: FAIL -- }"
    else
      miss "$name" "stopped elsewhere: ${line:-<no FAIL line>}"
    fi
    # The control again, on a fresh fixture: nothing a plant did leaks into the next run.
    expect_pass "control after $name"
  }

  expect_pass control
  expect_stop "seam conflict" conflict control "seam-apply 010-"
  expect_stop "type error" typeerror control "typecheck:web src/a.ts:3"
  expect_stop "overlay file outside both programs" control uncovered "typecheck coverage"
  expect_pass "overlay file inside a program (coverage is not vacuous)" control covered
  expect_stop "brand token" control brand "brand scan"
  expect_stop "changed LICENSE" licence control "row licence-allowlist"
  expect_stop "row prints SKIP" control rowskip "row orca-overlay skipped"
  expect_pass "upstream/ SKIP is out of scope" control upstreamskip
  expect_stop "probe prints SKIP" control orcadskip "orcad-only start skipped"

  # --replay-only on the control fixture changes exactly the bump paths and runs none
  # of the stand-ins (each would leave an untracked ran-<stage> file).
  local log got want
  if ! fixture control control >"$tmp/fixture.log" 2>&1; then
    miss replay-only "fixture: $(tail -1 "$tmp/fixture.log")"
  elif log="$FX_LOG"; ! (run_replay "$FX_ROOT" v1.0.2 "$FX_C2" replay-only fixture_generate fixture_pnpm_run) >"$log" 2>&1; then
    miss replay-only "failed: $(grep -m1 '^rebase-orca: FAIL -- ' "$log" || tail -1 "$log")"
  else
    got="$(git -C "$FX_ROOT" status --porcelain --untracked-files=all | cut -c4- | LC_ALL=C sort)"
    want="$(printf '%s\n' configuration.toml orca-overlay/patches/010-fixture-seam.patch orca-overlay/seams.json)"
    if [ "$got" = "$want" ]; then
      ok "replay-only -> changed exactly $(echo $got)"
    else
      miss replay-only "changed $(echo $got), not exactly $(echo $want)"
    fi
  fi

  if [ "$misses" -eq 0 ]; then
    echo "rebase-orca self-test: PASS -- $n planted faults each stopped at its named stage"
  else
    echo "rebase-orca self-test: FAIL -- $misses case(s) missed" >&2
    return 1
  fi
}

# --- main -----------------------------------------------------------------------
usage() { echo "  usage: rebase-orca.sh --tag vX.Y.Z --commit <40-hex peeled commit> [--replay-only] | --self-test" >&2; }

MODE=full
REPIN_TAG=""
REPIN_COMMIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --self-test)
      [ $# -eq 1 ] || { echo "rebase-orca: FAIL -- --self-test takes no other argument" >&2; usage; exit 2; }
      run_self_test
      exit $? ;;
    --tag|--commit)
      [ $# -ge 2 ] || { echo "rebase-orca: FAIL -- $1 needs a value" >&2; usage; exit 2; }
      if [ "$1" = --tag ]; then REPIN_TAG="$2"; else REPIN_COMMIT="$2"; fi
      shift 2 ;;
    --replay-only) MODE=replay-only; shift ;;
    *) echo "rebase-orca: FAIL -- unrecognized argument: $1" >&2; usage; exit 2 ;;
  esac
done
if ! [[ "$REPIN_TAG" =~ $TAG_RE ]] || ! [[ "$REPIN_COMMIT" =~ $COMMIT_RE ]]; then
  echo "rebase-orca: FAIL -- --tag must match $TAG_RE and --commit $COMMIT_RE (got tag '$REPIN_TAG', commit '$REPIN_COMMIT')" >&2
  usage
  exit 2
fi
say "target $REPIN_TAG ($REPIN_COMMIT), $MODE"
run_replay "$REPO_ROOT" "$REPIN_TAG" "$REPIN_COMMIT" "$MODE" theia_generate orca_pnpm_run || exit 1
