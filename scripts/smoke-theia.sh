#!/usr/bin/env bash
# Wave 0 gate for BUILD-01. Run from the repo root, no arguments.
#
# Install/build follow the audited constraints from 01-02-PLAN.md:
#   --ignore-scripts (verified: node-pty and esbuild ship their native
#   artifact in-tarball/sibling-package; drivelist is the one package that
#   genuinely needs its script and is rebuilt explicitly below).
#
# node-pty proof is a real spawn test, not `theia rebuild:browser` --
# that command is a no-op on a fresh browser-target tree (nothing cached
# in .browser_modules yet) and proves nothing. See 01-02-SUMMARY.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THEIA_DIR="$REPO_ROOT/theia"
# Same port the driver uses (verify-platform.sh exports it); not Theia's stock 3000.
PORT="${PB_VERIFY_PORT:-3939}"

if [ ! -f "$THEIA_DIR/package.json" ]; then
  echo "smoke-theia: FAIL -- $THEIA_DIR/package.json does not exist yet (Theia workspace not created)" >&2
  exit 1
fi

cd "$THEIA_DIR"

INSTALL_CMD="yarn install --ignore-scripts"
if [ -f yarn.lock ]; then
  INSTALL_CMD="yarn install --ignore-scripts --frozen-lockfile"
fi

nix develop "$REPO_ROOT#theia" --command bash -c "
  set -euo pipefail
  export PUPPETEER_SKIP_DOWNLOAD=1
  $INSTALL_CMD
  # drivelist ships no prebuild for 12.0.2 (zero GitHub release assets) and
  # --ignore-scripts skips its install script; @theia/core requires its
  # compiled binary at backend boot, so build it explicitly.
  (cd node_modules/drivelist && node-gyp rebuild)
"

DRIVELIST_ARTIFACT="$THEIA_DIR/node_modules/drivelist/build/Release/drivelist.node"
if [ ! -f "$DRIVELIST_ARTIFACT" ]; then
  echo "smoke-theia: FAIL -- drivelist native rebuild did not produce $DRIVELIST_ARTIFACT" >&2
  exit 1
fi

nix develop "$REPO_ROOT#theia" --command yarn --cwd applications/browser build

# node-pty's loader (lib/utils.js loadNativeModule) checks build/Release,
# build/Debug, then prebuilds/<platform>-<arch> -- this package ships no
# build/Release dir at all, it resolves via the bundled prebuilt binary.
PTY_ARTIFACT="$THEIA_DIR/node_modules/node-pty/prebuilds/linux-x64/pty.node"
if [ ! -f "$PTY_ARTIFACT" ]; then
  echo "smoke-theia: FAIL -- node-pty prebuilt artifact missing at $PTY_ARTIFACT" >&2
  exit 1
fi

# D-10's real proof: node-pty must actually spawn a shell, accept written
# input, and return real output under the pinned Node 24 -- not just report
# a zero exit code from a build step.
nix develop "$REPO_ROOT#theia" --command node -e '
  const pty = require("node-pty");
  const p = pty.spawn("bash", [], { name: "xterm-color", cols: 80, rows: 30, cwd: process.env.HOME, env: process.env });
  let output = "";
  p.onData((data) => { output += data; });
  p.write("echo PTY_PROOF_$((21+21))\r");
  setTimeout(() => {
    p.kill();
    if (output.includes("PTY_PROOF_42")) {
      console.log("smoke-theia: node-pty spawn proof PASS");
      process.exit(0);
    }
    console.error("smoke-theia: node-pty spawn proof FAIL -- output was:", JSON.stringify(output));
    process.exit(1);
  }, 1500);
'

# Refuse to start if anything already holds :$PORT. Without this the health
# check below can be satisfied by a leftover server from an earlier aborted
# run, so the script would print PASS without ever proving THIS build boots.
if curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
  echo "smoke-theia: FAIL -- something is already listening on :$PORT (stale run?). Kill it and re-run." >&2
  exit 1
fi

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    # Signal the whole process group: yarn does not exec-replace itself when
    # running a package script, so the Node backend actually holding :$PORT is a
    # grandchild of the tracked PID and would survive a plain `kill $SERVER_PID`.
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    # The backend runs in its own session and shuts down a few seconds after its parents: wait for it, then end it,
    # so nothing outlives this script.
    local pids="" i
    for i in $(seq 1 40); do
      pids="$(pgrep -f -- "^[^ ]*node $REPO_ROOT/theia/applications/browser/lib/backend/main.js --port $PORT\$" || true)"
      [ -z "$pids" ] && break
      sleep 0.25
    done
    [ -z "$pids" ] || kill -KILL $pids 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Phase 4's @powerbrowser/token-gate extension gates the backend on
# POWERBROWSER_TOKEN; this dev loop drives it unauthenticated, so it opts out
# via the named bypass. The supervised PowerBrowser path never sets this.
setsid env POWERBROWSER_TOKEN_DISABLE=1 nix develop "$REPO_ROOT#theia" --command yarn --cwd applications/browser start --port "$PORT" &
SERVER_PID=$!

DEADLINE=$((SECONDS + 60))
until curl -sf "http://localhost:$PORT" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    echo "smoke-theia: FAIL -- localhost:$PORT did not answer within 60s" >&2
    exit 1
  fi
  sleep 1
done

echo "smoke-theia: PASS"
