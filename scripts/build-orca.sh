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
#   2. checks the shell (node 24, corepack, objdump)
#   3. scrubs every inherited ORCA_* variable plus ELECTRON_RUN_AS_NODE,
#      NODE_OPTIONS and NODE_REPL_EXTERNAL_MODULE (this tree is worked on from
#      inside Orca desktop, whose variables must never reach the build)
#   4. sets only Orca's and corepack's own documented knobs
#   5. corepack provides the pnpm version named by orca/package.json
#   6. pnpm install --frozen-lockfile --ignore-scripts (Orca's postinstall and
#      its Electron rebuild never run), workspace packages, rebuild:node,
#      build:mobile-web, build:orcad
#   7. de-slot: removes the three slot markers and out/runtimes (Node 24.22.1)
#   8. build:web
# Orca's source and scripts are never edited (D-16). This build is separate
# from the Theia build and mach build (P59-12). Full output is kept in
# .mozbuild/orca-build/build-<UTC>.log.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/orca"
START=$(date +%s)

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

# 2. Shell entry.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [ "$node_major" != "24" ] || ! command -v corepack >/dev/null || ! command -v objdump >/dev/null; then
  fail "shell entry: need node 24, corepack and objdump; run inside nix develop .#orca"
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
run_step install pnpm install --frozen-lockfile --ignore-scripts --store-dir "$REPO_ROOT/.mozbuild/pnpm-store"
run_step build-workspace-packages node config/scripts/build-workspace-packages.mjs
run_step rebuild:node pnpm run rebuild:node
# build:orcad stages out/mobile-web unconditionally (build-orcad.mjs
# stageOrcadMobileWebBundle); Orca's own build:desktop and build:release run
# build:mobile-web first, so this does too.
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

# shellcheck source=/dev/null
. "$REPO_ROOT/generated/upstream-pins.env"
echo "build-orca: PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT) in $(( $(date +%s) - START ))s; log $LOG"
