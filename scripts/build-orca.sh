#!/usr/bin/env bash
# Phase 60 (RUN-01, RUN-02): build Orca's orcad and web client from the pinned
# source checkout orca/, using Orca's own scripts, then remove the bundled-Node
# slot that build:orcad writes (D-14) so orcad runs on PowerBrowser's Node.
#
# Run inside the Orca dev shell:
#   nix develop .#orca --command bash scripts/build-orca.sh
#
# What it does, in order:
#   1. re-verifies orca/ at the pin (scripts/fetch-orca.sh verify path)
#   1b. applies the overlay orca-overlay/ (P62-09): refuses an undeclared
#      modification, resets the declared seam paths to the pin, applies
#      patches/ through scripts/apply-patches.sh (a silent no-op is a failure),
#      copies files/ in. Re-runnable over an applied tree.
#   2. checks the shell (node 24, corepack, objdump)
#   3. scrubs every inherited ORCA_* variable plus ELECTRON_RUN_AS_NODE,
#      NODE_OPTIONS and NODE_REPL_EXTERNAL_MODULE (this tree is worked on from
#      inside Orca desktop, whose variables must never reach the build)
#   4. sets only Orca's and corepack's own documented knobs
#   5. corepack provides the pnpm version named by orca/package.json
#   6. pnpm install --frozen-lockfile --ignore-scripts (Orca's postinstall and
#      its Electron rebuild never run), workspace packages, rebuild:node,
#      mobile/ install (also --ignore-scripts), mobile's three generators,
#      build:mobile-web, build:orcad
#   7. de-slot: removes the three slot markers and out/runtimes (Node 24.22.1)
#   8. build:web
#   9. panes: scripts/build-orca-panes.sh, the Orca pane bundle in out/web/assets/pb-panes/
#      (Phase 64). It empties pb-panes/ first, so every later step that writes into pb-panes/
#      (Phase 66's browser-host step) runs after it, here and on the --panes-only path.
#   10. browser host: scripts/build-orca-browser-host.sh, the thin browser host pb-browser-host.js beside
#      the pane bundle in out/web/assets/pb-panes/ (Phase 66, P66-02), after step 9 on both paths.
#
# --panes-only: on an already-built tree, runs step 1, step 1b, step 9 and every later step that
# writes into pb-panes/; refuses when orca/out/web/web-index.html is absent.
# orca/ is changed only by the declared seams and PB-added files of
# orca-overlay/ (D-04, D-16, P62-09). This build is separate
# from the Theia build and mach build (P59-12). Full output is kept in
# .mozbuild/orca-build/build-<UTC>.log.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/orca"
START=$(date +%s)

PANES_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --panes-only) PANES_ONLY=1 ;;
    *) echo "build-orca: unknown argument $arg" >&2; exit 2 ;;
  esac
done

LOG_DIR="$REPO_ROOT/.mozbuild/orca-build"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/build-$(date -u +%Y%m%dT%H%M%SZ).log"
echo "build-orca: log $LOG"
exec > >(tee -a "$LOG") 2>&1

fail() {
  echo "build-orca: FAIL -- $1; log $LOG" >&2
  exit 1
}

# run_step <name> <command...>: run a step, name it on failure.
run_step() {
  local name="$1"; shift
  echo "build-orca: step $name"
  "$@" || fail "step $name exited $?"
}

# 1. orca/ at the pin.
run_step fetch-verify bash "$REPO_ROOT/scripts/fetch-orca.sh"

# 1b. Overlay (P62-09). run_step calls this under ||, so errexit is off in here:
# every command that can fail is checked by hand.
OVERLAY_DIR="$REPO_ROOT/orca-overlay"
# A plain relative path: letters, digits, dot, underscore, hyphen, slash; no empty, . or .. segment.
overlay_path_ok() {
  case "/$1/" in *//*|*/./*|*/../*) return 1 ;; esac
  [[ "$1" =~ ^[A-Za-z0-9._/-]+$ ]]
}
upstream_has() { git -C "$SRC_DIR" cat-file -e "HEAD:$1" 2>/dev/null; }
apply_overlay() {
  local seams=() files=() patches=() out path line
  if [ -f "$OVERLAY_DIR/seams.json" ]; then
    out="$(node -e 'for (const s of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).seams) console.log(s.path)' "$OVERLAY_DIR/seams.json")" \
      || fail "overlay: orca-overlay/seams.json could not be read"
    [ -z "$out" ] || mapfile -t seams <<< "$out"
  fi
  for path in "${seams[@]}"; do
    overlay_path_ok "$path" || fail "overlay: seams.json path '$path' is not a plain relative path"
    [ "$(git -C "$SRC_DIR" cat-file -t "HEAD:$path" 2>/dev/null)" = blob ] || fail "overlay: seams.json path $path is not a file at the pin"
  done

  # An edit nobody declared is never erased.
  out="$(git -C "$SRC_DIR" status --porcelain --untracked-files=no)" || fail "overlay: git -C orca status failed"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line##* }"
    printf '%s\n' "${seams[@]}" | grep -qxF -- "$path" || fail "undeclared modification in orca/: $path"
  done <<< "$out"

  # Back to the pin (also clears the --3way staging of an earlier run), then apply.
  if [ "${#seams[@]}" -gt 0 ]; then
    git -C "$SRC_DIR" reset -q -- "${seams[@]}" || fail "overlay: git reset of the declared seam paths failed"
    git -C "$SRC_DIR" checkout HEAD -- "${seams[@]}" || fail "overlay: git checkout of the declared seam paths failed"
  fi
  shopt -s nullglob
  patches=("$OVERLAY_DIR"/patches/*.patch)
  shopt -u nullglob
  if [ "${#patches[@]}" -gt 0 ]; then
    bash "$REPO_ROOT/scripts/apply-patches.sh" --upstream "$SRC_DIR" --patches "$OVERLAY_DIR/patches" \
      || fail "overlay: apply-patches.sh exited $?"
    for path in "${seams[@]}"; do echo "build-orca: overlay applied $path"; done
  fi

  # PB-added files, at their in-tree path. .pb-overlay-copied remembers the last copy so a file
  # removed from files/ is removed from orca/ too.
  if [ -d "$OVERLAY_DIR/files" ]; then
    out="$(cd "$OVERLAY_DIR/files" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)" || fail "overlay: listing orca-overlay/files failed"
    [ -z "$out" ] || mapfile -t files <<< "$out"
  fi
  for path in "${files[@]}"; do
    overlay_path_ok "$path" || fail "overlay: file path '$path' is not a plain relative path"
    if upstream_has "$path"; then fail "overlay file shadows upstream path $path"; fi
  done
  if [ -f "$SRC_DIR/.pb-overlay-copied" ]; then
    while IFS= read -r path; do
      [ -n "$path" ] || continue
      overlay_path_ok "$path" || fail "overlay: orca/.pb-overlay-copied names '$path', not a plain relative path"
      if upstream_has "$path"; then fail "overlay: orca/.pb-overlay-copied names the upstream path $path"; fi
      [ -f "$OVERLAY_DIR/files/$path" ] || rm -f -- "$SRC_DIR/$path" || fail "overlay: could not remove stale $path"
    done < "$SRC_DIR/.pb-overlay-copied"
  fi
  for path in "${files[@]}"; do
    mkdir -p "$(dirname "$SRC_DIR/$path")" && cp -- "$OVERLAY_DIR/files/$path" "$SRC_DIR/$path" || fail "overlay: could not copy $path"
    echo "build-orca: overlay copied $path"
  done
  if [ "${#files[@]}" -gt 0 ]; then
    printf '%s\n' "${files[@]}" > "$SRC_DIR/.pb-overlay-copied" || fail "overlay: could not write orca/.pb-overlay-copied"
  else
    rm -f -- "$SRC_DIR/.pb-overlay-copied"
  fi
  if [ "${#seams[@]}" -eq 0 ] && [ "${#files[@]}" -eq 0 ]; then echo "build-orca: overlay empty"; fi
}
run_step overlay apply_overlay

# --panes-only: step 9 and every later step that writes into pb-panes/, on a built tree.
if [ "$PANES_ONLY" = 1 ]; then
  [ -f "$SRC_DIR/out/web/web-index.html" ] || fail "--panes-only: orca/out/web/web-index.html is missing; run scripts/build-orca.sh without --panes-only first"
  run_step panes bash "$REPO_ROOT/scripts/build-orca-panes.sh"
  run_step browser-host bash "$REPO_ROOT/scripts/build-orca-browser-host.sh"
  echo "build-orca: PASS -- panes only in $(( $(date +%s) - START ))s; log $LOG"
  exit 0
fi

# 2. Shell entry. objdump is Orca's linuxSlotRecord tool, so it is required on Linux only (P68-30): the
# hosted macOS and Windows Orca jobs run this script with the runner's toolchain, not nix develop .#orca.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
node_platform="$(node -p 'process.platform' 2>/dev/null || true)"
if [ "$node_major" != "24" ] || ! command -v corepack >/dev/null; then
  fail "shell entry: need node 24 and corepack; on Linux run inside nix develop .#orca, elsewhere in the hosted Orca job"
fi
if [ "$node_platform" = "linux" ]; then
  command -v objdump >/dev/null || fail "shell entry: need objdump on Linux; run inside nix develop .#orca"
fi

# 3. Scrub. ${!ORCA_@} rather than compgen -e: the dev shell's non-interactive
# bash is built without the completion builtins, so compgen does not exist there.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE
if env | grep -q '^ORCA_'; then fail "scrub: an ORCA_ variable survived the scrub"; fi

# 4. Orca's and corepack's own knobs only.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export COREPACK_HOME="$REPO_ROOT/.mozbuild/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export DO_NOT_TRACK=1
export ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0
export ORCA_NODE_RUNTIME_CACHE_DIR="$REPO_ROOT/.mozbuild/orca-node-runtime-cache"

# 5. pnpm from corepack, version derived from orca/package.json packageManager.
want_pnpm="$(node -p 'require(process.argv[1]).packageManager.split("@")[1].split("+")[0]' "$SRC_DIR/package.json")"
mkdir -p "$COREPACK_HOME/bin"
run_step corepack-enable corepack enable --install-directory "$COREPACK_HOME/bin" pnpm
export PATH="$COREPACK_HOME/bin:$PATH"
cd "$SRC_DIR"
got_pnpm="$(pnpm --version)" || fail "step pnpm-version exited $?"
[ "$got_pnpm" = "$want_pnpm" ] || fail "step pnpm-version: pnpm is $got_pnpm, orca/package.json names $want_pnpm"
echo "build-orca: node $(node --version), corepack $(corepack --version), pnpm $got_pnpm"

# 6. Install without lifecycle scripts, then Orca's own build steps.
STORE="$REPO_ROOT/.mozbuild/pnpm-store"
run_step install pnpm install --frozen-lockfile --ignore-scripts --store-dir "$STORE"
run_step build-workspace-packages node config/scripts/build-workspace-packages.mjs
run_step rebuild:node pnpm run rebuild:node
# build:orcad stages out/mobile-web unconditionally (build-orcad.mjs
# stageOrcadMobileWebBundle); Orca's own build:desktop and build:release run
# build:mobile-web first, so this does too. mobile/ is its own pnpm workspace
# with its own lockfile; it is installed scripts-off like the root (P60-R3), so
# mobile's postinstall code generators never run.
run_step install:mobile pnpm -C mobile install --frozen-lockfile --ignore-scripts --store-dir "$STORE"
# mobile's own postinstall is the three generators below; with scripts off they
# are run directly, in its order, so build:mobile-web finds the *.generated
# modules. No third-party lifecycle script runs (P60-R4).
run_step gen:terminal-webview-engine node mobile/scripts/build-terminal-webview-engine.mjs
run_step gen:mermaid-page-engine node mobile/scripts/build-mermaid-page-engine.mjs
run_step gen:terminal-document-script node mobile/scripts/build-terminal-document-script.mjs
run_step build:mobile-web pnpm run build:mobile-web
run_step build:orcad pnpm run build:orcad

# 7. De-slot (D-14): print what build:orcad wrote, then remove it.
for rel in out/orcad/.server-target out/orcad/.runtime-node out/orcad/.version out/runtimes; do
  if [ -e "$rel" ]; then
    rm -rf -- "$rel"
    echo "build-orca: de-slot removed $rel"
  else
    echo "build-orca: de-slot found no $rel"
  fi
done

# 8. Web client.
run_step build:web pnpm run build:web
for rel in out/web/web-index.html out/orcad/orcad.js; do
  [ -f "$rel" ] || fail "step outputs: orca/$rel is missing"
done

# 9. The pane bundle (Phase 64); later pb-panes/ writers go after it.
run_step panes bash "$REPO_ROOT/scripts/build-orca-panes.sh"

# 10. The thin browser host (Phase 66), into pb-panes/ after the pane step emptied it.
run_step browser-host bash "$REPO_ROOT/scripts/build-orca-browser-host.sh"

# shellcheck source=/dev/null
. "$REPO_ROOT/generated/upstream-pins.env"
echo "build-orca: PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT) in $(( $(date +%s) - START ))s; log $LOG"
