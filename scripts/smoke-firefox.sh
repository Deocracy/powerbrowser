#!/usr/bin/env bash
# Wave 0 gate for BUILD-02.
#
# WARNING: this runs a full Gecko compile and takes HOURS. It is manual-only
# per 01-VALIDATION.md, never a per-commit gate.
#
# Run from the repo root, no arguments.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream"
MOZCONFIG_FILE="$REPO_ROOT/.mozconfig"

if [ ! -d "$UPSTREAM_DIR" ]; then
  echo "smoke-firefox: FAIL -- $UPSTREAM_DIR does not exist (run scripts/fetch-upstream.sh first)" >&2
  exit 1
fi

if [ ! -f "$MOZCONFIG_FILE" ]; then
  echo "smoke-firefox: FAIL -- $MOZCONFIG_FILE does not exist" >&2
  exit 1
fi

# The version below is derived from upstream/, so first prove upstream/ is the
# pin: fetch-upstream.sh makes no network call when upstream/ exists, compares
# HEAD with the pinned tag's commit and runs the dirt classifier. TAG is unset
# so an exported rebase target cannot stand in for the pin. Its FAIL lines go
# to stderr and stay visible.
if ! env -u TAG "$REPO_ROOT/scripts/fetch-upstream.sh" >/dev/null; then
  echo "smoke-firefox: FAIL -- upstream/ is not at the pinned ESR tag (see fetch-upstream output above)" >&2
  exit 1
fi

# Derive the expected version from the tree, never a hand-kept literal. Read it
# before the build so a missing file fails before a long compile; an empty value
# must fail too, because a fixed-string grep for '' matches everything.
VERSION_FILE="$UPSTREAM_DIR/browser/config/version_display.txt"
EXPECTED_VERSION="$(tr -d '[:space:]' 2>/dev/null < "$VERSION_FILE" || true)"
if [ -z "$EXPECTED_VERSION" ]; then
  echo "smoke-firefox: FAIL -- $VERSION_FILE is absent or empty, so there is no version to compare against" >&2
  exit 1
fi

LOG_DIR="$REPO_ROOT/.mozbuild"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/smoke-firefox-build.log"

# The build starts an sccache server that outlives it. One this script's build started ends with the script; one that
# was already running is left alone.
SCCACHE_WAS_RUNNING=0
if pgrep -u "$(id -u)" -x sccache >/dev/null 2>&1; then SCCACHE_WAS_RUNNING=1; fi
stop_sccache() {
  if [ "$SCCACHE_WAS_RUNNING" -eq 0 ]; then
    nix develop "$REPO_ROOT#firefox" --command sccache --stop-server >/dev/null 2>&1 || true
  fi
}
trap stop_sccache EXIT

nix develop "$REPO_ROOT#firefox" --command bash -c "
  set -euo pipefail
  cd '$UPSTREAM_DIR'
  MOZCONFIG='$MOZCONFIG_FILE' ./mach build 2>&1 | tee '$LOG_FILE'
"

BOOTSTRAP_COUNT="$(grep -cE 'mach[[:space:]]+bootstrap' "$LOG_FILE" || true)"
if [ "$BOOTSTRAP_COUNT" -ne 0 ]; then
  echo "smoke-firefox: FAIL -- build log invoked 'mach bootstrap' ($BOOTSTRAP_COUNT times), which D-18 forbids" >&2
  exit 1
fi

VERSION_OUTPUT="$(nix develop "$REPO_ROOT#firefox" --command bash -c "cd '$UPSTREAM_DIR' && MOZCONFIG='$MOZCONFIG_FILE' ./mach run --version")"
if ! printf '%s\n' "$VERSION_OUTPUT" | grep -qF -- "$EXPECTED_VERSION"; then
  echo "smoke-firefox: FAIL -- './mach run --version' did not report $EXPECTED_VERSION (read from $VERSION_FILE)" >&2
  exit 1
fi

echo "smoke-firefox: PASS -- reports $EXPECTED_VERSION (read from upstream/browser/config/version_display.txt)"
