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
#   typecheck:pb-build  orca-overlay/tsconfig.pb-build.json, PB's program for the overlay files at Orca's root
#   typecheck coverage  every orca-overlay/files path is in tsc --listFilesOnly of one of the three programs
#   xpi cache           stage-bundled-xpi.sh into a scratch directory, so the pinned XPIs (sha256-checked,
#                       never executed) are in .mozbuild/bundled-xpi/ for licence-allowlist's bundled leg
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
# --stage-file <path> (ci-supply-chain-06): every FAIL line this script prints is also written to <path>,
# replacing what was there, after the command it judged has exited. The log carries everything the Orca
# build and typecheck print, so a line of theirs that looks like a FAIL line can come first there; the
# stage file holds this script's own last word. rebase-orca.yml names the stage from it, never from the log.
#
# Usage:
#   nix develop .#orca --command bash scripts/rebase-orca.sh --tag vX.Y.Z --commit <40-hex peeled commit> [--stage-file <path>]
#   bash scripts/rebase-orca.sh --replay-only --tag vX.Y.Z --commit <40-hex peeled commit>
#   bash scripts/rebase-orca.sh --self-test
#   bash scripts/rebase-orca.sh --coverage-only   (the coverage stage alone, on the fetched and built orca/)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'
COMMIT_RE='^[0-9a-f]{40}$'
# The rows the replay runs. The last four (lane H2, harness-static-hosting-01) hold security clauses derived from the
# pinned checkout (the credential store, the failure classes, the offer file, OrcaService), so a new pin is checked
# against them before it is proposed. orca-failure-classes stays red until upstream's refusal codes are mapped (G2).
ROWS=(orca-build-shape orca-overlay orca-overlay-built orca-mobile-protocol licence-allowlist orca-mobile-skew
  orca-credential-store orca-failure-classes orca-offer-file orca-service)
# The paths a bump stages (P68-11). THIRD-PARTY-NOTICES.txt reaches the bump job as
# the rebase-orca-notices artifact, never from --replay-only (A-P1).
BUMP_PATHS=(configuration.toml orca-overlay/patches orca-overlay/seams.json)
# licence-allowlist checks every fetched tree; upstream/ is the Gecko tree, absent here by design.
SKIP_OUT_OF_SCOPE='^licence-allowlist: SKIP -- upstream/ absent'
# The three typecheck programs, as tsc -p paths from orca/. Orca's two leave its root build configs out
# (its own vite.web.config.ts too); PB's root overlay files are in the third, kept beside files/.
PROGRAMS=(config/tsconfig.tc.web.json config/tsconfig.node.json ../orca-overlay/tsconfig.pb-build.json)

# This tree is worked on from inside Orca desktop; none of its variables reach an Orca process.
for name in "${!ORCA_@}"; do unset "$name"; done

say() { echo "rebase-orca: $*"; }
# The stage keywords, the first word or words of every FAIL line this script prints. The release train's stop issue
# publishes a stage only when it is one of these (scripts/release-train.mjs --orca-stage reads this line).
STAGES=(pin-move fetch seam-apply build typecheck:web typecheck:node typecheck:pb-build "typecheck coverage" "xpi cache" row "orcad-only start" notices "brand scan")
STAGE_FILE=""
red() {
  echo "rebase-orca: FAIL -- $*" >&2
  [ -z "$STAGE_FILE" ] || printf 'rebase-orca: FAIL -- %s\n' "$*" > "$STAGE_FILE" || true
  return 1
}

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

# The third program has no Orca package script; tsc runs it from orca/ like the two scripts do.
pb_build_tsc() { node node_modules/typescript/bin/tsc --noEmit -p "${PROGRAMS[2]}"; }

# Every PB-added overlay file must be in one of the three typecheck programs, or the
# typecheck above proved nothing about it.
stage_coverage() {
  local root="$1" orca list path real program
  local files=()
  say "typecheck coverage"
  if [ -d "$root/orca-overlay/files" ]; then
    mapfile -t files < <(cd "$root/orca-overlay/files" && find . -type f -printf '%P\n' | LC_ALL=C sort)
  fi
  if [ "${#files[@]}" -eq 0 ]; then
    say "typecheck coverage -- 0 overlay files at this pin (vacuous; the self-test proves the stage)"
    return 0
  fi
  # tsc names files under its physical working directory; compare against the same spelling.
  orca="$(cd "$root/orca" 2>/dev/null && pwd -P)" || { red "typecheck coverage orca/ is absent. Next step: fetch and build it (scripts/fetch-orca.sh, scripts/build-orca.sh)."; return 1; }
  list=""
  for program in "${PROGRAMS[@]}"; do
    list+="$(cd "$orca" && node node_modules/typescript/bin/tsc --listFilesOnly -p "$program")"$'\n' \
      || { red "typecheck coverage tsc --listFilesOnly -p $program failed. Next step: run it from orca/."; return 1; }
  done
  for path in "${files[@]}"; do
    real="$(realpath -es "$orca/$path" 2>/dev/null)" || { red "typecheck coverage $path is not in orca/ after the build. Next step: check build-orca.sh's overlay copy."; return 1; }
    # A here-string, not a pipe: grep -q stops at the first match and, under pipefail, a printf
    # into a closed pipe (Orca's real programs list ~40k files) would make a covered file red.
    grep -qxF -- "$real" <<<"$list" \
      || { red "typecheck coverage $path is in no typecheck program. Next step: place it where ${PROGRAMS[*]} includes it (a file at Orca's root: name it vite.pb-*.config.ts or pb-*.mjs)."; return 1; }
  done
  say "typecheck coverage -- ${#files[@]} overlay file(s), each in one of ${#PROGRAMS[@]} typecheck programs"
}

# The licence-allowlist row reads each pinned XPI's licence line 1 from .mozbuild/bundled-xpi/ and prints a
# SKIP when the file is absent, which the replay treats as red. A hosted checkout starts without that
# git-ignored cache, so the replay stages it first with the packaging scripts' own stager (a sha256-pinned
# download that runs no code). The scratch distribution directory is discarded; only the cache stays.
stage_xpi_cache() {
  local root="$1" dist
  say "xpi cache"
  dist="$(mktemp -d)" || { red "xpi cache could not create a scratch directory"; return 1; }
  capture bash "$root/powerbrowser/packaging/stage-bundled-xpi.sh" "$dist"
  rm -rf "$dist"
  [ "$RC" -eq 0 ] || { red "xpi cache stage-bundled-xpi.sh exited $RC. Next step: read its FAIL line above; a changed download needs a re-pin of powerbrowser/packaging/bundled-xpi.json."; return 1; }
}

# verify-platform.sh --only exits 0 for a row that SKIPped (exit 77, or a SKIP last line) and prints "  <label>: SKIP"
# in its summary (SKIP-PROTOCOL.md), so the exit status alone cannot tell a skip from a pass: skip_line turns that
# summary line, like any SKIP line, red here. A row's 77 never reaches this script as a status.
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
  line="$(skip_line "$OUT")"
  # 77 is the probe's "did not run" (SKIP-PROTOCOL.md): in the replay a probe that did not run proves nothing, so it is
  # red, named as a skip rather than as a failed exit status.
  [ "$RC" -ne 77 ] || { red "orcad-only start skipped: ${line:-the probe exited 77 with no SKIP line}. Next step: provide what the probe needs (a built orca/, no installed Orca on the runner)."; return 1; }
  [ "$RC" -eq 0 ] || { red "orcad-only start exited $RC. Next step: run node scripts/verify-orca-slotless-start.mjs --orcad-only."; return 1; }
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
  stage_typecheck "$root" typecheck:pb-build pb_build_tsc || return 1
  stage_coverage "$root" || return 1
  stage_xpi_cache "$root" || return 1
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
    const text = readFileSync(f, 'utf8');
    // The forged variant: upstream output that imitates this script's FAIL line, then a real error.
    if (text.includes('PLANTED-FORGED-STAGE')) console.log('rebase-orca: FAIL -- build: forged by upstream, see https://example.invalid/fix');
    const at = text.split('\n').findIndex((l) => l.includes('PLANTED-TYPE-ERROR') || l.includes('PLANTED-FORGED-STAGE'));
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
    forged) fx_lines a 30 3 "export const a3: number = 'PLANTED-FORGED-STAGE';" > "$repo/src/a.ts" ;;
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
  # The real third program: the fixture tsc reads its include globs as tsc would.
  cp "$REPO_ROOT/orca-overlay/tsconfig.pb-build.json" "$root/orca-overlay/"
  "${FX_GIT[@]}" -C "$root" init -q
  printf '/orca/\n/orca.partial/\n/generated/\n/.mozbuild/\n' > "$root/.gitignore"
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
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, relative, resolve } = require('node:path');
const cfg = resolve(process.argv[process.argv.indexOf('-p') + 1]);
const walk = (d) => existsSync(d) ? readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]) : [];
const glob = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$');
const files = JSON.parse(readFileSync(cfg, 'utf8').replace(/^\s*\/\/.*$/gm, '')).include
  .flatMap((inc) => { const p = resolve(dirname(cfg), inc); return walk(dirname(p.split('*')[0] + 'x')).filter((f) => glob(p).test(f)); });
if (process.argv.includes('--listFilesOnly')) { for (const f of files) console.log(f); process.exit(0); }
// Without --listFilesOnly it typechecks: a planted marker in an included file is a type error at its line.
for (const f of files) {
  const at = readFileSync(f, 'utf8').split('\n').findIndex((l) => l.includes('PLANTED-TYPE-ERROR'));
  if (at >= 0) { console.log(`${relative(process.cwd(), f)}(${at + 1},1): error TS2322: planted type error`); process.exit(1); }
}
TSC
if [ -d "$root/orca-overlay/files" ]; then cp -r "$root/orca-overlay/files/." "$root/orca/"; fi
touch "$root/ran-build"
echo "build-orca: PASS -- fixture"
EOF
  # The fixture rows: licence-allowlist compares orca/LICENSE with the digest recorded at v1.0.1, and,
  # as the real row's bundled leg does, prints a SKIP and exits 0 when the pinned XPI is not cached.
  git -C "$repo" show v1.0.1:LICENSE | sha256sum | cut -d' ' -f1 > "$root/licence.sha256"
  cat > "$root/scripts/verify-platform.sh" <<'EOF'
root="$(cd "$(dirname "$0")/.." && pwd)"
label="$2"
touch "$root/ran-row-$label"
if [ -f "$root/skip-row" ] && [ "$(cut -d'|' -f1 "$root/skip-row")" = "$label" ]; then cut -d'|' -f2- "$root/skip-row"; exit 0; fi
if [ -f "$root/fail-row" ] && [ "$(cat "$root/fail-row")" = "$label" ]; then echo "$label: FAIL -- fixture: a planted fault at the new tag"; exit 1; fi
if [ "$label" = licence-allowlist ] && [ "$(sha256sum < "$root/orca/LICENSE" | cut -d' ' -f1)" != "$(cat "$root/licence.sha256")" ]; then
  echo "licence-allowlist: FAIL -- orca LICENSE digest changed"; exit 1
fi
if [ "$label" = licence-allowlist ] && [ ! -f "$root/.mozbuild/bundled-xpi/fixture@example.invalid-1.0.0.xpi" ]; then
  echo "licence-allowlist: SKIP -- fixture@example.invalid 1.0.0 is not cached in .mozbuild/bundled-xpi/; its LICENSE line 1 is unchecked (run bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>)"; exit 0
fi
echo "$label: PASS -- fixture row"
EOF
  # The fixture XPI stager writes the one cached file the fixture row reads. Variant xpinostage writes
  # nothing (the replay before 68-CR-01, which never staged the cache); xpifail exits 1 (a changed download).
  mkdir -p "$root/powerbrowser/packaging"
  local stage_body='mkdir -p "$root/.mozbuild/bundled-xpi" && : > "$root/.mozbuild/bundled-xpi/fixture@example.invalid-1.0.0.xpi"'
  [ "$variant" != xpinostage ] || stage_body=':'
  [ "$variant" != xpifail ] || stage_body='echo "stage-bundled-xpi: FAIL -- fixture: the download hashes to 00, the pin is 11" >&2; exit 1'
  printf '%s\n' 'root="$(cd "$(dirname "$0")/../.." && pwd)"' '[ "$#" -eq 1 ] || exit 2' "$stage_body" 'touch "$root/ran-xpi"' > "$root/powerbrowser/packaging/stage-bundled-xpi.sh"
  local probe='PASS -- fixture orcad half only'
  local probe_exit=0
  if [ "$variant" = orcadskip ]; then probe='SKIP -- no built orca/ (fixture)'; probe_exit=77; fi
  echo "import { writeFileSync } from 'node:fs'; writeFileSync('$root/ran-orcad', ''); console.log('orca-slotless-start: $probe'); process.exitCode = $probe_exit;" > "$root/scripts/verify-orca-slotless-start.mjs"
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
    real*) cp -r "$REPO_ROOT/orca-overlay/files" "$root/orca-overlay/" ;;
  esac
  # The real overlay files plus one more at Orca's root: a near-miss of the naming rule, a name
  # inside it, and a name inside it carrying a type error.
  case "$variant" in
    realuncovered) echo 'export const extra = 1;' > "$root/orca-overlay/files/vite.pb-extra.ts" ;;
    realcovered) echo 'export const extra = 1;' > "$root/orca-overlay/files/vite.pb-extra.config.ts" ;;
    realtypeerror) printf 'export const ok = 1\nexport const bad = PLANTED-TYPE-ERROR\n' > "$root/orca-overlay/files/pb-planted.mjs" ;;
    brand) printf 'notes: %s%s\n' FIXTURE BRAND > "$root/notes.txt" ;;
    rowskip) echo 'orca-overlay|orca-overlay: SKIP -- no built thing' > "$root/skip-row" ;;
    upstreamskip) echo 'licence-allowlist|licence-allowlist: SKIP -- upstream/ absent; its LICENSE digest is unchecked' > "$root/skip-row" ;;
    rowfail-*) echo "${variant#rowfail-}" > "$root/fail-row" ;;
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
  expect_stop "overlay file outside every program" control uncovered "typecheck coverage"
  expect_pass "overlay file inside a program (coverage is not vacuous)" control covered
  # The real overlay files, at commit time: each must be in a program, and the stage must count them all.
  local real_n
  real_n="$(find "$REPO_ROOT/orca-overlay/files" -type f | wc -l)"
  [ "$real_n" -gt 0 ] || miss "real overlay files" "orca-overlay/files is empty; the real-file cases prove nothing"
  expect_pass "the real orca-overlay/files" control real
  grep -qF "typecheck coverage -- $real_n overlay file(s)" "$FX_LOG" \
    && ok "the real orca-overlay/files -> coverage counted all $real_n" \
    || miss "the real orca-overlay/files" "the coverage line does not count $real_n file(s): $(grep -m1 'typecheck coverage --' "$FX_LOG" || echo '<no coverage line>')"
  expect_stop "real overlay plus an uncovered root file" control realuncovered "typecheck coverage vite.pb-extra.ts is in no typecheck program"
  expect_pass "real overlay plus a covered root file" control realcovered
  expect_stop "type error in a root overlay file" control realtypeerror "typecheck:pb-build pb-planted.mjs:2"
  expect_stop "brand token" control brand "brand scan"
  expect_stop "changed LICENSE" licence control "row licence-allowlist"
  expect_stop "row prints SKIP" control rowskip "row orca-overlay skipped"
  expect_pass "upstream/ SKIP is out of scope" control upstreamskip
  # 68-CR-01: a replay that never staged the XPI cache stops at the row's bundled-leg SKIP; a failed stage
  # stops at its own stage. Every control above stages the cache and passes.
  expect_stop "XPI cache not staged" control xpinostage "row licence-allowlist skipped"
  expect_stop "XPI stage fails" control xpifail "xpi cache"
  expect_stop "probe exits 77 with its SKIP line" control orcadskip "orcad-only start skipped: orca-slotless-start: SKIP"

  # Lane H2 (harness-static-hosting-01): the pin-derived security rows run in every replay. Each one failing at the new
  # tag stops the replay at its row, and a ROWS that lacks one of them is red naming it. Every ROWS label is a row of
  # the real registry, read from scripts/verify-platform.sh, so a misspelt label cannot pass by running nothing.
  local sec want_sec=(orca-credential-store orca-failure-classes orca-offer-file orca-service) reg lbl unreg=""
  for sec in "${want_sec[@]}"; do expect_stop "security row $sec fails at the new tag" control "rowfail-$sec" "row $sec exited 1"; done
  # Here-strings, not pipes: under pipefail a grep -q that stops early makes the printf into it fail (SIGPIPE).
  missing_rows() { local r all; all="$(printf '%s\n' "$@")"; for r in "${want_sec[@]}"; do grep -qxF -- "$r" <<<"$all" || echo "$r"; done; }
  [ -z "$(missing_rows "${ROWS[@]}")" ] && ok "security rows -> all four are in ROWS" || miss "security rows" "ROWS lacks $(missing_rows "${ROWS[@]}" | tr '\n' ' ')"
  [ "$(missing_rows "${ROWS[@]/orca-service/}")" = orca-service ] && ok "a ROWS without orca-service -> red naming it" || miss "missing security row plant" "a ROWS without orca-service was not reported"
  reg="$(sed -nE 's/^[[:space:]]*"([a-z0-9-]+)\|.*/\1/p' "$REPO_ROOT/scripts/verify-platform.sh")"
  for lbl in "${ROWS[@]}"; do grep -qxF -- "$lbl" <<<"$reg" || unreg+="$lbl "; done
  [ -z "$unreg" ] && ok "ROWS -> every label is a registered row" || miss "ROWS labels" "not registered in scripts/verify-platform.sh: $unreg"

  # ci-supply-chain-06: upstream output prints a FAIL line of its own before this script's. The log's first
  # FAIL line is the forged one (the hazard); the stage file holds this script's typecheck:web line.
  local sf flog first staged
  if ! fixture forged control >"$tmp/fixture.log" 2>&1; then
    miss "forged stage line" "fixture: $(tail -1 "$tmp/fixture.log")"
  else
    sf="$tmp/stage-forged.txt"
    flog="$FX_LOG"
    (STAGE_FILE="$sf"; run_replay "$FX_ROOT" v1.0.2 "$FX_C2" full fixture_generate fixture_pnpm_run) >"$flog" 2>&1 || true
    first="$(grep -m1 '^rebase-orca: FAIL -- ' "$flog" || true)"
    staged="$(head -n1 "$sf" 2>/dev/null || true)"
    if [[ "$first" != *"forged by upstream"* ]]; then
      miss "forged stage line" "the fixture did not print the forged line first (got '${first:-<none>}'), so the case proves nothing"
    elif [[ "$staged" == "rebase-orca: FAIL -- typecheck:web src/a.ts:3"* ]]; then
      n=$((n + 1))
      ok "forged stage line -> the log's first FAIL line is upstream's, the stage file names ${staged#rebase-orca: FAIL -- }"
    else
      miss "forged stage line" "the stage file holds '${staged:-<empty>}', not this script's typecheck:web line"
    fi
  fi

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

  # Every FAIL line the fixtures produced starts with a keyword of STAGES, so the stop issue can name each stage. The
  # forged case's log is left out: its first FAIL line is upstream's on purpose.
  local stray lf logs=()
  for lf in "$tmp"/run*.log; do [ "$lf" = "${flog:-}" ] || logs+=("$lf"); done
  stray="$(cat "${logs[@]}" 2>/dev/null | grep -h '^rebase-orca: FAIL -- ' | sed 's/^rebase-orca: FAIL -- //' | while IFS= read -r l; do
    known=0; for st in "${STAGES[@]}"; do case "$l" in "$st" | "$st "*) known=1 ;; esac; done
    [ "$known" = 1 ] || printf '%s\n' "$l"
  done | head -1 || true)"
  if [ -n "$stray" ]; then miss "stage keywords" "a FAIL line starts with no STAGES keyword: $stray"; else ok "stage keywords -> every FAIL line starts with a STAGES keyword"; fi

  if [ "$misses" -eq 0 ]; then
    echo "rebase-orca self-test: PASS -- $n planted faults each stopped at its named stage"
  else
    echo "rebase-orca self-test: FAIL -- $misses case(s) missed" >&2
    return 1
  fi
}

# --- main -----------------------------------------------------------------------
usage() { echo "  usage: rebase-orca.sh --tag vX.Y.Z --commit <40-hex peeled commit> [--replay-only] [--stage-file <path>] | --self-test | --coverage-only" >&2; }

MODE=full
REPIN_TAG=""
REPIN_COMMIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --self-test)
      [ $# -eq 1 ] || { echo "rebase-orca: FAIL -- --self-test takes no other argument" >&2; usage; exit 2; }
      run_self_test
      exit $? ;;
    --coverage-only)
      [ $# -eq 1 ] || { echo "rebase-orca: FAIL -- --coverage-only takes no other argument" >&2; usage; exit 2; }
      # The stage on this tree's fetched orca/, as the replay runs it after build. Without Orca's
      # installed tsc, or before build-orca.sh copied an overlay file in, it is a named SKIP; the
      # self-test's real-overlay cases hold the commit-time line.
      [ -f "$REPO_ROOT/orca/node_modules/typescript/bin/tsc" ] \
        || { echo "rebase-orca-coverage: SKIP -- no installed orca/ (nix develop .#orca --command bash scripts/build-orca.sh)"; exit 0; }
      while IFS= read -r f; do
        [ -e "$REPO_ROOT/orca/$f" ] || { echo "rebase-orca-coverage: SKIP -- orca/$f is not copied in yet (run scripts/build-orca.sh)"; exit 0; }
      done < <(cd "$REPO_ROOT/orca-overlay/files" && find . -type f -printf '%P\n')
      stage_coverage "$REPO_ROOT" || exit 1
      exit 0 ;;
    --tag|--commit)
      [ $# -ge 2 ] || { echo "rebase-orca: FAIL -- $1 needs a value" >&2; usage; exit 2; }
      if [ "$1" = --tag ]; then REPIN_TAG="$2"; else REPIN_COMMIT="$2"; fi
      shift 2 ;;
    --replay-only) MODE=replay-only; shift ;;
    --stage-file)
      [ $# -ge 2 ] && [ -n "$2" ] || { echo "rebase-orca: FAIL -- --stage-file needs a path" >&2; usage; exit 2; }
      STAGE_FILE="$2"
      : > "$STAGE_FILE" || { echo "rebase-orca: FAIL -- --stage-file $STAGE_FILE cannot be written" >&2; exit 2; }
      shift 2 ;;
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
