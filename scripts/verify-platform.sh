#!/usr/bin/env bash
# scripts/verify-platform.sh
#
# THE verification driver for this repo. One script, one CHECKS registry, one
# summary table. It replaces scripts/verify-phase-0{2,3,4,5}.sh, which were
# deleted in the same commit that created this file (D-21).
#
# Why the four drivers went and the checks stayed. They were named against the
# UPSTREAM PROJECT'S phase numbering, which means something entirely different
# in this repo -- "phase 04" here is not "phase 04" there, and a reader
# following a driver's name to this project's roadmap lands on the wrong work
# every time. The assertions inside them are about the PLATFORM (patch surface,
# branding identity, the token gate, the shell's supervision contract) and
# outlive any phase numbering, so they are ported here verbatim, label for
# label, and the upstream plan-file citations inside the ported comments are
# FROZEN as provenance rather than renumbered (D-08). A citation that names
# 05-04-PLAN.md points at a plan in the frozen upstream repo; renumbering it to
# this project's 05 would be a lie that reads as a fact.
#
# (That upstream project is named only in inventory/brand-tokens.json. Every
# other file in this tree is inside the D-18 residual-brand scan's scope, and
# spelling the token here would make this file fail the very check it
# registers -- which is exactly what happened when this header was first
# written, because the scan iterates `git ls-files` and an unstaged new file is
# invisible to it. Stage before you trust a green scan.)
#
# Error handling is deliberate: `set -uo pipefail` and NO `-e`. Every check runs
# even if an earlier one failed, because the value of a verification run is the
# whole table, not the first red row.
#
# Flags:
#   --quick        Only checks needing no build, no browser launch, and no
#                  display. Seconds, not minutes. This is the set that gates a
#                  commit.
#   --only <label> Exactly one named check and nothing else. Per-task sampling
#                  depends on it.
#   --gate         The full set plus the known-open ledger exclusions (D-127).
#                  Cannot be combined with --quick or --only: narrowing "every
#                  gate" to a subset would contradict the flag's own purpose, so
#                  the combination is a named, loud error rather than one flag
#                  silently winning.
#   --build        Build the Theia app before running (ported from
#                  verify-phase-02.sh, which owned that lifecycle).
#
# Every external script invocation runs under `setsid`. This script is
# non-interactive, so job control is off and a plain `cmd &` would share this
# script's own process group with every descendant a check backgrounds --
# verify-endpoints.sh backgrounds a real browser two layers deep. setsid makes
# the check the leader of its own new process group, so `kill -- "-$PID"` on
# interrupt reaches the whole group in one signal.
#
# Adding a check means appending one row to the registry near the bottom of this
# file. It does NOT mean creating a sibling driver. That rule is the entire
# reason this consolidation was necessary.
set -uo pipefail
unset PB_CONFIG_DIR # a stray export must never silently rebrand CI; fixture rows pass it per-command instead

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THEIA_DIR="$REPO_ROOT/theia"
# Not 3000: that is Theia's stock dev port and other local services (a host-networked
# container, a second dev app) commonly hold it. Override with PB_VERIFY_PORT.
PB_VERIFY_PORT="${PB_VERIFY_PORT:-3939}"
export PB_VERIFY_PORT
APP_URL="http://localhost:$PB_VERIFY_PORT"

QUICK=0
ONLY=""
GATE=0
DO_BUILD=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1; shift ;;
    --gate) GATE=1; shift ;;
    --build) DO_BUILD=1; shift ;;
    --only)
      if [ "$#" -lt 2 ]; then
        echo "verify-platform: FAIL -- --only requires a label argument" >&2
        exit 1
      fi
      ONLY="$2"
      shift 2
      ;;
    *)
      echo "verify-platform: FAIL -- unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [ "$GATE" -eq 1 ] && { [ "$QUICK" -eq 1 ] || [ -n "$ONLY" ]; }; then
  echo "verify-platform: FAIL -- --gate cannot be combined with --quick or --only (rejected combination: --gate plus $([ "$QUICK" -eq 1 ] && echo -n '--quick'; [ "$QUICK" -eq 1 ] && [ -n "$ONLY" ] && echo -n ' and '; [ -n "$ONLY" ] && echo -n "--only $ONLY"))" >&2
  exit 1
fi

CURRENT_CHECK_PID=""
BACKEND_SPAWN_PID=""
BROWSER_SPAWN_PID=""
SERVER_PID=""
declare -a TEMP_PATHS=()
track_temp() { TEMP_PATHS+=("$1"); }

# WINDOWS.md 11: one run-scoped throwaway config home for every launch this
# script makes that doesn't explicitly override it (CR-01's plant_leftover
# still points its own launches at its own parent dir via
# VERIFY05_XDG_CONFIG_HOME). Without this, TheiaService._resolveConfigDir()
# falls through to the real $HOME/.config/powerbrowser and litters it with one
# sidecar-state-<profile>.json per mktemp profile this harness ever used.
# Exported (not just passed to start_shell/start_shell_display's own setsid
# env) so scripts/lib/firefox-bidi.mjs's own child_process.spawn -- which
# inherits process.env by default and is invoked from inline node scripts
# this script itself spawns -- lands in the throwaway dir too; start_shell's
# explicit VERIFY05_XDG_CONFIG_HOME override still wins for its own launch.
#
# REAL_XDG_CONFIG_HOME preserves whatever the caller's shell had (possibly
# unset) BEFORE this export, so start_backend()'s own config_dir line --
# explicitly out of scope -- keeps resolving against the real value, not the
# harness override. Ported from verify-phase-04.sh, where start_backend lives.
REAL_XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-}"
HARNESS_CONFIG_HOME="$(mktemp -d)"; track_temp "$HARNESS_CONFIG_HOME"
export XDG_CONFIG_HOME="$HARNESS_CONFIG_HOME"

# The merged teardown. This is the UNION of the four deleted drivers' cleanup()
# bodies, not a rewrite: verify-phase-05.sh's was already a superset of 03's and
# 04's (all three tracked PIDs plus `rm -rf` over TEMP_PATHS, which carries
# throwaway profile and config DIRECTORIES, not only files), and 02's
# SERVER_PID branch is the one thing it did not carry.
cleanup() {
  if [ -n "$CURRENT_CHECK_PID" ]; then
    kill -- "-$CURRENT_CHECK_PID" 2>/dev/null || kill "$CURRENT_CHECK_PID" 2>/dev/null || true
    wait "$CURRENT_CHECK_PID" 2>/dev/null || true
    CURRENT_CHECK_PID=""
  fi
  # Safety net for a check that started the sidecar via start_backend() and was
  # interrupted before its own stop_backend() -- setsid gives the sidecar its
  # own process group, so a plain SIGINT to this script's foreground group
  # would otherwise orphan it.
  if [ -n "$BACKEND_SPAWN_PID" ]; then
    kill -- "-$BACKEND_SPAWN_PID" 2>/dev/null || kill "$BACKEND_SPAWN_PID" 2>/dev/null || true
    wait "$BACKEND_SPAWN_PID" 2>/dev/null || true
    BACKEND_SPAWN_PID=""
  fi
  # Same safety net for a check that started the built browser via start_shell().
  if [ -n "$BROWSER_SPAWN_PID" ]; then
    kill -- "-$BROWSER_SPAWN_PID" 2>/dev/null || kill "$BROWSER_SPAWN_PID" 2>/dev/null || true
    wait "$BROWSER_SPAWN_PID" 2>/dev/null || true
    BROWSER_SPAWN_PID=""
  fi
  # Ported from verify-phase-02.sh: yarn does not exec-replace itself running a
  # package script, so the Node backend actually holding $APP_URL is a GRANDCHILD
  # of the tracked PID -- signal the whole process group.
  if [ -n "$SERVER_PID" ]; then
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  # -rf (not -f): TEMP_PATHS also carries throwaway profile/config directories.
  for p in "${TEMP_PATHS[@]:-}"; do
    [ -n "$p" ] && rm -rf "$p"
  done
  TEMP_PATHS=()
}
# EXIT alone is not enough: bash resumes the rest of the script after a
# non-EXIT trap handler returns unless that handler exits itself. Discovered
# live in verify-phase-02.sh: a bare `trap cleanup EXIT INT TERM` let a SIGINT
# delivered before SERVER_PID was assigned run cleanup() as a no-op and then
# continue straight through the script as if uninterrupted, orphaning the
# backend it went on to start.
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

if [ "$DO_BUILD" -eq 1 ]; then
  echo "verify-platform: building..."
  if ! nix develop "$REPO_ROOT#theia" --command bash -c "cd '$THEIA_DIR' && yarn build"; then
    echo "verify-platform: FAIL -- build failed" >&2
    exit 1
  fi
fi

# --- Theia dev-app lifecycle, ported from verify-phase-02.sh ----------------
#
# The five ported phase-02 checks each need a live Theia frontend at $APP_URL.
# The deleted driver started it unconditionally at the top of the script; here
# it is started LAZILY by the first check that needs one, because an
# unconditional start would make `--quick` (which needs no app at all) pay a
# 60-second boot, and would make `--only allowlist-schema` boot a web app to
# assert a JSON schema. cleanup() tears it down on every path.
THEIA_APP_UP=0
theia_app_up() {
  [ "$THEIA_APP_UP" -eq 1 ] && return 0
  # The occupant may be TRANSIENT rather than stale. smoke-theia.sh boots its
  # own backend on this port and tears it down in an EXIT trap; the port is not
  # released the instant that script returns, and this function is called
  # microseconds later by the very next registry row. Registering smoke-theia
  # (01-07) turned that race into five deterministic FAILs on the first full
  # run -- diff-theia-core plus the four _run_app_check_mjs checks -- all
  # reporting a "stale run" that was actually the previous check still exiting.
  #
  # So: wait a bounded time for the port to clear before calling it stale. The
  # guard's real purpose is preserved exactly -- an occupant that is still
  # there after the wait is a genuinely stale server, and still a named FAIL,
  # because a leftover backend would let every check below pass without ever
  # proving THIS tree boots. Fixed here, in the one function all five callers
  # route through, rather than by settling one registry row.
  if curl -sf "$APP_URL" >/dev/null 2>&1; then
    echo "theia_app_up: $APP_URL is occupied; waiting up to 30s in case a previous check is still exiting..."
    local free_deadline=$((SECONDS + 30))
    while curl -sf "$APP_URL" >/dev/null 2>&1; do
      if [ "$SECONDS" -ge "$free_deadline" ]; then
        echo "theia_app_up: FAIL -- something is still listening on $APP_URL 30s later (stale run?). Kill it and re-run." >&2
        return 1
      fi
      sleep 1
    done
    echo "theia_app_up: $APP_URL cleared; continuing."
  fi
  echo "theia_app_up: starting theia start..."
  # The @powerbrowser/token-gate extension gates the backend on
  # POWERBROWSER_TOKEN; this dev loop drives it unauthenticated (including from
  # a cookie-less browser session), so it opts out via the named bypass. The
  # supervised PowerBrowser path never sets this.
  setsid env POWERBROWSER_TOKEN_DISABLE=1 nix develop "$REPO_ROOT#theia" --command yarn --cwd "$THEIA_DIR" start --port "$PB_VERIFY_PORT" &
  SERVER_PID=$!
  local deadline=$((SECONDS + 60))
  until curl -sf "$APP_URL" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "theia_app_up: FAIL -- $APP_URL did not answer within 60s" >&2
      return 1
    fi
    sleep 1
  done
  echo "theia_app_up: app is up at $APP_URL"
  THEIA_APP_UP=1
  return 0
}

# One wrapper per ported phase-02 check. They exist because the registry's
# runner takes a bare function name for anything that is not a plain external
# `bash`/`node` invocation, and because each of these has a precondition (the
# app) that the label alone cannot express.
#
# diff-theia-core.sh needs `yarn` on PATH, which the plain host shell does not
# provide (D-69 confirmed `node` and objdir/dist/bin/firefox both work outside
# nix develop; yarn does not), so only that one check runs through the theia
# dev shell.
check_diff_theia_core() {
  theia_app_up || return 1
  setsid nix develop "$REPO_ROOT#theia" --command bash "$REPO_ROOT/scripts/diff-theia-core.sh" &
  CURRENT_CHECK_PID=$!
  local rc=0; wait "$CURRENT_CHECK_PID" || rc=$?; CURRENT_CHECK_PID=""
  return "$rc"
}
_run_app_check_mjs() {
  theia_app_up || return 1
  setsid node "$REPO_ROOT/scripts/$1" "$APP_URL" &
  CURRENT_CHECK_PID=$!
  local rc=0; wait "$CURRENT_CHECK_PID" || rc=$?; CURRENT_CHECK_PID=""
  return "$rc"
}
check_verify_branding()        { _run_app_check_mjs verify-branding.mjs; }
check_verify_customize_inert() { _run_app_check_mjs verify-customize-inert.mjs; }
check_verify_dev_flag_off()    { _run_app_check_mjs verify-dev-flag-off.mjs; }
check_verify_uri_roundtrip()   { _run_app_check_mjs verify-uri-roundtrip.mjs; }
# GUI-01 (01-05): same precondition as the four above -- it reads the LIVE
# frontend's CommandRegistry, so it needs the Theia dev app up.
check_gui01_command_registered() { _run_app_check_mjs verify-gui01-command.mjs; }

# NEW (07-04): DOC-02/VER-03's downstream-fixture proof. The harness drives
# every committed fixture under --all (three EXPECTED-PASS generate-plus-verify
# at exact bytes, two EXPECTED-FAIL failing naming their rules) and proves its
# own assertions discriminate via --self-test.
#
# The fixtures root is derived by glob, never spelled: the phase directory
# name carries a residue-probe form, and this file is inside the residual
# scan's scope, so a literal path would fail the very gate this registry
# drives (the harness takes --fixtures-root as argv for exactly this reason).
# A glob matching zero or several directories fails loudly inside the harness
# on the unknown path, never as a quiet pass.
#
# Honestly --quick: the harness copies fixtures to mkdtemp, runs the
# generator only, and generates each fixture and the default comparand into
# private mkdtemp dirs; it never reads or writes generated/ (PLAT-04). No build, no
# browser, no display, no network. PB_CONFIG_DIR reaches the generator per
# child command from the harness itself; this driver unsets any inherited
# value at the top of the file, so no row relies on ambient environment.
check_verify_downstream_fixtures() {
  local root rc_brand rc_ext
  # The archived roots, no fallback: the planning-paths row fails naming either glob if it stops matching exactly one tracked dir.
  root=$(echo "$REPO_ROOT"/.planning/milestones/v1.0-phases/07-*/fixtures)
  setsid node "$REPO_ROOT/scripts/verify-downstream-fixture.mjs" --all --fixtures-root "$root" &
  CURRENT_CHECK_PID=$!
  rc_brand=0; wait "$CURRENT_CHECK_PID" || rc_brand=$?; CURRENT_CHECK_PID=""
  # NEW (09-04): the extension-kind fixture cells (npm, local-path, one real
  # pinned Open VSX entry) live under the 09 phase, so this row drives a
  # second --all over that root too -- same glob idiom, never a spelled phase
  # path, and the harness fails loudly on an unknown or empty root. Both
  # drives run even when the first is red, so one failing set cannot mask the
  # other; the row fails when either drive fails.
  local extroot
  extroot=$(echo "$REPO_ROOT"/.planning/milestones/v1.1-phases/09-*/fixtures)
  setsid node "$REPO_ROOT/scripts/verify-downstream-fixture.mjs" --all --fixtures-root "$extroot" &
  CURRENT_CHECK_PID=$!
  rc_ext=0; wait "$CURRENT_CHECK_PID" || rc_ext=$?; CURRENT_CHECK_PID=""
  if [ "$rc_brand" -ne 0 ]; then return "$rc_brand"; fi
  return "$rc_ext"
}
check_verify_downstream_fixtures_self_test() {
  setsid node "$REPO_ROOT/scripts/verify-downstream-fixture.mjs" --self-test &
  CURRENT_CHECK_PID=$!
  local rc=0; wait "$CURRENT_CHECK_PID" || rc=$?; CURRENT_CHECK_PID=""
  return "$rc"
}

# NEW (12-CODE-REVIEW.md WR-03): the @powerbrowser/tab-uris reader must
# compile against its own shipped d.ts. The committed tree once carried a
# `Database.Database` spelling its local better-sqlite3.d.ts cannot resolve
# (plus the fix as an unstaged edit the residue scan cannot see), red under
# tsc while every gate stayed green. This runs the extension's own
# toolchain (theia/node_modules/.bin/tsc, installed by the same yarn
# install smoke-theia assumes) in --noEmit over the extension project only
# -- seconds, text off disk, no build output, no browser, no display, no
# network. A missing tsc is a named FAIL (run yarn install in theia/),
# never a skip: a typecheck that goes green because it could not find its
# own compiler is the green-by-construction shape the empty-registry guard
# below exists to reject.
check_tab_uris_typecheck() {
  local tsc="$REPO_ROOT/theia/node_modules/.bin/tsc"
  if [ ! -x "$tsc" ]; then
    echo "tab-uris-typecheck: FAIL -- $tsc absent (run yarn install in theia/ first)" >&2
    return 1
  fi
  "$tsc" --noEmit -p "$REPO_ROOT/theia/extensions/tab-uris"
}

# ============================================================================
# SHARED HELPERS  (ported verbatim from verify-phase-05.sh, whose copies were
# already the supersets: its start_shell takes the optional profile override
# and user.js hooks verify-phase-04.sh's did not, and calling it with no
# arguments is byte-for-byte 04's behaviour. stop_shell, first_byte_offset and
# backend_ready_pids were already IDENTICAL in both files.)
# ============================================================================

# --- shared helpers, ported from verify-phase-04.sh (one-self-contained-
# script-per-phase idiom -- never sourced from that file) ------------------

BROWSER_LOG=""
# Set by start_shell_display() to the DISPLAY value it actually used
# (existing $DISPLAY or a freshly-started Xvfb's), so a caller doing a
# manual second/third launch against the same display doesn't have to
# re-derive it.
DISPLAY_IN_USE=""

# Spawns the built binary headless with a throwaway profile, capturing its
# combined stdout+stderr to a track_temp-registered log file. Callers poll
# BROWSER_LOG for whatever sentinel they need; stop_shell() always tears the
# process (and setsid process group) down. A missing/non-executable binary
# is a named FAIL, not a skip.
#
# Optional $1: an explicit profile directory to launch against, instead of
# a fresh mktemp -d one -- mirrors start_shell_display()'s own optional
# profile parameter (05-04). CR-01's plant_leftover() needs this: the
# planted state file's name now carries a profile-scoped suffix
# (TheiaService._profileStateKey()), so the fixture must know the profile
# path BEFORE the launch, not receive whatever start_shell() would
# otherwise mint internally.
start_shell() {
  local profile_override="${1:-}"
  local bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"
  if [ ! -x "$bin" ]; then
    echo "start_shell: FAIL -- $bin does not exist or is not executable (run the Phase 1 Firefox build first)" >&2
    return 1
  fi
  local log profile
  log="$(mktemp)"; track_temp "$log"
  if [ -n "$profile_override" ]; then
    profile="$profile_override"
  else
    profile="$(mktemp -d)"; track_temp "$profile"
  fi
  BROWSER_LOG="$log"

  local -a env_args=(env "XDG_CONFIG_HOME=${VERIFY05_XDG_CONFIG_HOME:-$HARNESS_CONFIG_HOME}")
  if [ -n "${VERIFY05_USER_JS_PROFILE:-}" ]; then
    mkdir -p "$profile"
    cp "$VERIFY05_USER_JS_PROFILE" "$profile/user.js"
  fi

  setsid "${env_args[@]}" "$bin" --headless --profile "$profile" >"$log" 2>&1 &
  BROWSER_SPAWN_PID=$!
  return 0
}

stop_shell() {
  if [ -n "$BROWSER_SPAWN_PID" ]; then
    kill -- "-$BROWSER_SPAWN_PID" 2>/dev/null || kill "$BROWSER_SPAWN_PID" 2>/dev/null || true
    wait "$BROWSER_SPAWN_PID" 2>/dev/null || true
    BROWSER_SPAWN_PID=""
  fi
}

# Byte offset (not line number) of the first line beginning with the given
# literal prefix, or empty if absent. Tolerates the PowerBrowserAPI.log()
# mirror prefix "[PowerBrowserAPI] <level>: " exactly like verify-phase-04.sh's
# own helper.
first_byte_offset() {
  grep -abom1 -E "^(\\[PowerBrowserAPI\\] [a-z]+: )?$1" "$2" 2>/dev/null | cut -d: -f1
}

# True (exit 0) when <log> contains a line beginning with the literal
# prefix <1>, tolerating the same "[PowerBrowserAPI] <level>: " mirror prefix
# first_byte_offset does.
sentinel_present() {
  grep -qE "^(\\[PowerBrowserAPI\\] [a-z]+: )?$1" "$2" 2>/dev/null
}

# Every pid announced by a POWERBROWSER_BACKEND_READY sentinel in <log>, oldest
# first, one per line.
backend_ready_pids() {
  sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$1" 2>/dev/null \
    | grep -E '^POWERBROWSER_BACKEND_READY ' \
    | sed -E 's/^POWERBROWSER_BACKEND_READY //' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n")){if(!l.trim())continue;try{const j=JSON.parse(l);if(typeof j.pid==="number")console.log(j.pid)}catch{}}})' 2>/dev/null
}

# The process group a pid belongs to; empty if the process is gone.
pgid_of() {
  ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '
}

# Hermetic replacement for a machine-wide `pgrep -f 'backend/main.js'`:
# considers ONLY backends inside process groups this run created. A backend
# inherits its browser's process group (PowerBrowserAPI's Subprocess does not
# setsid the child, so browser and backend report the same PGID -- verified
# live against a running instance) and keeps that group after the browser
# dies, so the group is a stable, run-scoped identity for exactly the orphan
# these checks hunt. An unscoped pattern match instead fails on any machine
# that has a PowerBrowser open -- which is the state a phase-5 session itself
# leaves behind, making the gate unreproducible on a developer box.
# $1: comma-separated pgid list. Prints "pid cmdline" lines, one per match.
backends_in_groups() {
  pgrep -a -g "$1" -f 'backend/main\.js' 2>/dev/null || true
}

# --- Task 1 (05-02): harness-display-available -----------------------------
#
# Discriminator A (05-02-PLAN.md): a non-headless start_shell variant.
# gfxPlatform::IsHeadless() forces mDisableRemoteClient=true whenever
# MOZ_HEADLESS/--headless is set (05-RESEARCH.md Pitfall 1) -- start_shell()
# above launches headless, so it can never exercise a real paint or Firefox's
# native remoting protocol. This helper drops --headless and supplies a
# DISPLAY: an existing one first, else a freshly-started Xvfb on a free
# display number (resolved on demand via `nix build nixpkgs#xorg.xvfb` --
# none of this repo's dev shells carry an Xvfb binary, since neither the
# Theia nor the Firefox toolchain needs one). Returns 2 (distinct from every
# other helper's 1) specifically for "no display could be obtained at all",
# so the registered check can never silently skip or vacuously pass.
XVFB_SPAWN_PID=""
XVFB_DISPLAY_NUM=""

find_free_display_num() {
  local n
  for n in $(seq 90 199); do
    [ ! -e "/tmp/.X11-unix/X$n" ] && { echo "$n"; return 0; }
  done
  return 1
}

start_virtual_display() {
  local num
  num="$(find_free_display_num)" || return 2

  local xvfb_log
  xvfb_log="$(mktemp)"; track_temp "$xvfb_log"

  local xvfb_bin
  xvfb_bin="$(timeout 60 nix build --no-link --print-out-paths 'nixpkgs#xorg.xvfb' 2>>"$xvfb_log")/bin/Xvfb"
  if [ ! -x "$xvfb_bin" ]; then
    echo "start_virtual_display: FAIL -- Xvfb unavailable on this host (nix resolution failed); see $xvfb_log" >&2
    return 2
  fi

  setsid "$xvfb_bin" ":$num" -screen 0 1280x800x24 >"$xvfb_log" 2>&1 &
  XVFB_SPAWN_PID=$!

  local deadline=$((SECONDS + 10))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -e "/tmp/.X11-unix/X$num" ]; then
      XVFB_DISPLAY_NUM="$num"
      return 0
    fi
    if ! kill -0 "$XVFB_SPAWN_PID" 2>/dev/null; then
      echo "start_virtual_display: FAIL -- Xvfb exited before creating its display socket; log:" >&2
      cat "$xvfb_log" >&2
      return 2
    fi
    sleep 0.2
  done
  echo "start_virtual_display: FAIL -- Xvfb did not create its display socket within 10s" >&2
  return 2
}

stop_virtual_display() {
  if [ -n "$XVFB_SPAWN_PID" ]; then
    kill -- "-$XVFB_SPAWN_PID" 2>/dev/null || kill "$XVFB_SPAWN_PID" 2>/dev/null || true
    wait "$XVFB_SPAWN_PID" 2>/dev/null || true
    XVFB_SPAWN_PID=""
  fi
  XVFB_DISPLAY_NUM=""
}

# The non-headless sibling of start_shell(): same log/profile capture and
# VERIFY05_USER_JS_PROFILE support, but launched against a real DISPLAY
# instead of --headless. Returns 1 for "binary missing" (matches
# start_shell()'s own convention) and 2 for "no display available at all"
# (start_virtual_display()'s propagated code) -- callers must not treat
# either as a skip.
#
# Optional $1: an explicit profile directory to launch against, instead of
# a fresh mktemp -d one. SIDE-05's second-launch checks need this -- two
# launches sharing the identical profile path is the entire mechanism
# under test (nsRemoteService keys remoting on the profile path,
# upstream/toolkit/xre/nsAppRunner.cpp:5342-5358), and the caller (not this
# helper) owns and track_temp's a profile that outlives any single launch.
start_shell_display() {
  local profile_override="${1:-}"
  local display_to_use=""
  if [ -n "${DISPLAY:-}" ]; then
    display_to_use="$DISPLAY"
  else
    start_virtual_display || return $?
    display_to_use=":$XVFB_DISPLAY_NUM"
  fi

  local bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"
  if [ ! -x "$bin" ]; then
    echo "start_shell_display: FAIL -- $bin does not exist or is not executable (run the Phase 1 Firefox build first)" >&2
    stop_virtual_display
    return 1
  fi
  local log profile
  log="$(mktemp)"; track_temp "$log"
  if [ -n "$profile_override" ]; then
    profile="$profile_override"
  else
    profile="$(mktemp -d)"; track_temp "$profile"
  fi
  BROWSER_LOG="$log"

  if [ -n "${VERIFY05_USER_JS_PROFILE:-}" ]; then
    mkdir -p "$profile"
    cp "$VERIFY05_USER_JS_PROFILE" "$profile/user.js"
  fi

  setsid env "DISPLAY=$display_to_use" "XDG_CONFIG_HOME=${VERIFY05_XDG_CONFIG_HOME:-$HARNESS_CONFIG_HOME}" "$bin" --profile "$profile" >"$log" 2>&1 &
  BROWSER_SPAWN_PID=$!
  DISPLAY_IN_USE="$display_to_use"
  return 0
}

stop_shell_display() {
  stop_shell
  stop_virtual_display
}

# Launches through start_shell_display(), asserts POWERBROWSER_SHELL_READY
# appears within a bounded poll, and stops it -- a display that cannot be
# obtained at all is a named FAIL (start_shell_display's propagated 1/2),
# never a skip and never a pass.
check_harness_display_available() {
  local rc
  start_shell_display
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "harness-display-available: FAIL -- SIDE-04 -- no usable display (neither an existing DISPLAY nor a resolvable Xvfb); see helper output above" >&2
    stop_shell_display
    return 1
  fi

  local deadline=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_READY' "$BROWSER_LOG" && { stop_shell_display; return 0; }
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "harness-display-available: FAIL -- browser process exited before POWERBROWSER_SHELL_READY appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell_display
      return 1
    fi
    sleep 0.5
  done
  echo "harness-display-available: FAIL -- POWERBROWSER_SHELL_READY did not appear within 30s; log:" >&2
  cat "$BROWSER_LOG" >&2
  stop_shell_display
  return 1
}

# --- Task 1: side04-sigkill-no-orphan / side04-unsupervised-backend-survives

# Poll /proc/<pid>/status's State: line for up to 15s, treating Z (zombie)
# as "as good as gone" (05-RESEARCH.md Pitfall 3 -- a recently-SIGKILLed
# child that hasn't been reaped yet still answers a bare-existence check).
# Returns 0 once the pid is gone or zombied, 1 on timeout.
#
# Reaps <pid> the instant it goes zombie, IF this script happens to be its
# real parent (plant_leftover's own `setsid sleep ... &`) -- `wait` on an
# already-terminated child returns immediately rather than blocking, so
# this never stalls. Without this, D-125's own planted process would sit
# as an unreaped zombie until this script's unplant_leftover() finally
# calls `wait` at cleanup time, and kill(pid,0) (PowerBrowserAPI.signalBarePid's
# liveness re-check, same zombie-blind gotcha) would see it as "still
# alive" from the browser's side for however long that takes -- exactly
# the false-alive race this helper exists to avoid. `wait` on a pid this
# script did NOT fork (the SIGKILL-orphan check's real backend pid, a
# grandchild of the killed browser) harmlessly fails with "not a child of
# this shell"; `|| true` absorbs that.
wait_pid_gone_or_zombie() {
  local pid="$1" deadline=$((SECONDS + 15)) state
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ ! -e "/proc/$pid" ]; then
      return 0
    fi
    state="$(awk '/^State:/{print $2}' "/proc/$pid/status" 2>/dev/null)"
    if [ "$state" = "Z" ] || [ -z "$state" ]; then
      wait "$pid" 2>/dev/null || true
      return 0
    fi
    sleep 0.5
  done
  return 1
}

# D-125's headline check (SIDE-04). Launches the shell, reads the announced
# backend pid from the sentinel, asserts it is ALIVE (never pass vacuously
# on a launch that silently failed), SIGKILLs the browser process ALONE
# (never its process group -- the backend is a member of that same group,
# so a group kill would make the assertion prove nothing), then asserts
# both that the announced pid disappears within a bounded poll and that no
# process whose command line contains the backend entry file remains.
check_side04_sigkill_no_orphan() {
  if ! start_shell; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_BACKEND_READY ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- browser process exited before POWERBROWSER_BACKEND_READY appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done
  if ! sentinel_present 'POWERBROWSER_BACKEND_READY ' "$BROWSER_LOG"; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- POWERBROWSER_BACKEND_READY did not appear within 60s; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  local backend_pid
  backend_pid="$(backend_ready_pids "$BROWSER_LOG" | head -1)"
  if [ -z "$backend_pid" ]; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- could not read a pid from POWERBROWSER_BACKEND_READY in the browser log" >&2
    stop_shell
    return 1
  fi

  # Must be alive BEFORE the kill, or "no orphan found" passes vacuously on
  # a launch that silently failed.
  if [ ! -e "/proc/$backend_pid" ]; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- announced backend pid $backend_pid is not running before the kill; the check cannot prove anything" >&2
    stop_shell
    return 1
  fi

  # Read the group BEFORE the kill, while the process is known alive: after
  # the browser dies an orphan is reparented to init but keeps this group,
  # so it is the identity the post-kill scan matches on.
  local backend_pgid
  backend_pgid="$(pgid_of "$backend_pid")"
  if [ -z "$backend_pgid" ]; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- could not read the process group of backend pid $backend_pid before the kill" >&2
    stop_shell
    return 1
  fi

  local result=0

  # Signal the browser process alone. BROWSER_SPAWN_PID is the setsid
  # leader wrapping "$bin" directly (start_shell's exec chain has no
  # intermediate shell), so it IS the browser pid. Signal only that pid --
  # never "-$BROWSER_SPAWN_PID" (the process-group form) -- because the
  # backend is a member of the same setsid-created group and a group kill
  # would kill it directly, making the "the watchdog did it" assertion
  # vacuous.
  if ! kill -9 "$BROWSER_SPAWN_PID" 2>/dev/null; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- could not SIGKILL the browser pid $BROWSER_SPAWN_PID" >&2
    result=1
  fi

  if ! wait_pid_gone_or_zombie "$backend_pid"; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- backend pid $backend_pid was still alive 15s after SIGKILLing the browser alone" >&2
    result=1
  fi

  local orphans
  orphans="$(backends_in_groups "$backend_pgid")"
  if [ -n "$orphans" ]; then
    echo "side04-sigkill-no-orphan: FAIL -- SIDE-04 -- a process matching 'backend/main.js' from this launch's process group ($backend_pgid) is still running after the browser was SIGKILLed:" >&2
    printf '%s\n' "$orphans" >&2
    result=1
  fi

  BROWSER_SPAWN_PID=""
  wait "$backend_pid" 2>/dev/null || true
  return "$result"
}

# D-109's negative control: a backend started directly (no supervisor, no
# POWERBROWSER_SUPERVISED marker) with stdin redirected from /dev/null must
# NOT self-terminate. Proves the watchdog cannot break yarn start,
# smoke-theia.sh, or verify-phase-04.sh's own start_backend.
check_side04_unsupervised_backend_survives() {
  local token log result=0
  token="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  log="$(mktemp)"; track_temp "$log"

  # -u, not just the assignments below: this is the NEGATIVE control, so it
  # must supply the marker's absence rather than inherit it. A harness run
  # from a shell that exported POWERBROWSER_SUPERVISED (or the dev bypass) would
  # otherwise arm the very watchdog this check proves stays inert, and fail
  # for a reason that has nothing to do with the code under test.
  setsid env -u POWERBROWSER_SUPERVISED -u POWERBROWSER_TOKEN_DISABLE \
    POWERBROWSER_TOKEN="$token" \
    THEIA_CONFIG_DIR="$(mktemp -d)" \
    VSX_REGISTRY_URL="https://open-vsx.org" \
    nix develop "$REPO_ROOT#theia" --command \
    node "$REPO_ROOT/theia/applications/browser/lib/backend/main.js" --hostname 127.0.0.1 --port 0 \
    <"/dev/null" >"$log" 2>&1 &
  BACKEND_SPAWN_PID=$!

  sleep 3
  if ! kill -0 "$BACKEND_SPAWN_PID" 2>/dev/null; then
    echo "side04-unsupervised-backend-survives: FAIL -- SIDE-04 -- an unsupervised backend with /dev/null stdin exited within 3s; log:" >&2
    cat "$log" >&2
    result=1
  fi

  kill -- "-$BACKEND_SPAWN_PID" 2>/dev/null || kill "$BACKEND_SPAWN_PID" 2>/dev/null || true
  wait "$BACKEND_SPAWN_PID" 2>/dev/null || true
  BACKEND_SPAWN_PID=""
  return "$result"
}

# --- Task 2: side04-leftover-reaped / side04-stale-identity-not-signalled

# /proc/<pid>/stat field 22 (starttime), via the last-')'-then-split rule
# (05-RESEARCH.md Pattern 2 / Pitfall 2) -- must match TheiaService's own
# reader exactly, since the two are compared for exact string equality.
read_start_ticks() {
  awk '{
    line=$0
    idx=match(line, /\)[^)]*$/)
    rest=substr(line, idx+2)
    n=split(rest, f, " ")
    print f[20]
  }' "/proc/$1/stat" 2>/dev/null
}

# Mirrors TheiaService._profileStateKey() (powerbrowser/shell/
# TheiaService.sys.mjs) byte-for-byte: the CR-01 fix suffixes the sidecar
# state file's name with a sanitized form of the launch's own resolved
# profile directory path (Services.dirsvc.get("ProfD", ...).path), every
# run of non-alphanumeric characters collapsed to one "_". realpath first,
# since ProfD is the platform's own canonicalized path and a caller here
# might otherwise pass a path containing an as-yet-unresolved symlink
# component. Must match exactly, or plant_leftover()'s fixture and
# TheiaService's own reader resolve two different filenames and every
# SIDE-04 leftover-reap control below proves nothing.
profile_state_key() {
  local resolved
  resolved="$(realpath "$1")"
  printf '%s' "$resolved" | sed -E 's/[^a-zA-Z0-9]+/_/g'
}

# Plants a long-sleeping process under setsid and writes a state file into
# a throwaway config directory in the same JSON shape TheiaService writes
# (pid, port, startTicks, writtenAt), named with the exact profile-scoped
# suffix the real launch below will resolve. Sets PLANTED_PID/
# PLANTED_CONFIG_DIR/PLANTED_STATE_FILE/PLANTED_PROFILE_DIR for the caller
# -- the caller must pass PLANTED_PROFILE_DIR to start_shell() so the SAME
# profile path is what TheiaService actually resolves ProfD from.
PLANTED_PID=""
PLANTED_TICKS=""
PLANTED_CONFIG_DIR=""
PLANTED_STATE_FILE=""
PLANTED_PROFILE_DIR=""
plant_leftover() {
  local start_ticks="$1" # "" means read the real value; anything else overrides it (negative control)
  setsid sleep 300 &
  PLANTED_PID=$!
  # Let /proc/<pid>/stat settle before reading starttime.
  sleep 0.2

  local ticks
  if [ -n "$start_ticks" ]; then
    ticks="$start_ticks"
  else
    ticks="$(read_start_ticks "$PLANTED_PID")"
  fi
  PLANTED_TICKS="$ticks"

  local parent
  parent="$(mktemp -d)"; track_temp "$parent"
  PLANTED_CONFIG_DIR="$parent/powerbrowser"
  mkdir -p "$PLANTED_CONFIG_DIR"

  PLANTED_PROFILE_DIR="$(mktemp -d)"; track_temp "$PLANTED_PROFILE_DIR"
  local profile_key
  profile_key="$(profile_state_key "$PLANTED_PROFILE_DIR")"
  PLANTED_STATE_FILE="$PLANTED_CONFIG_DIR/sidecar-state-${profile_key}.json"

  node -e '
    const fs = require("fs");
    const [, path, pid, ticks] = process.argv;
    fs.writeFileSync(path, JSON.stringify({
      pid: Number(pid), port: 65000, startTicks: ticks, writtenAt: Date.now()
    }));
  ' "$PLANTED_STATE_FILE" "$PLANTED_PID" "$ticks"

  export VERIFY05_XDG_CONFIG_HOME="$parent"
}

unplant_leftover() {
  if [ -n "$PLANTED_PID" ]; then
    kill -9 "$PLANTED_PID" 2>/dev/null || true
    wait "$PLANTED_PID" 2>/dev/null || true
    PLANTED_PID=""
  fi
  PLANTED_TICKS=""
  PLANTED_PROFILE_DIR=""
  unset VERIFY05_XDG_CONFIG_HOME
}

# D-125 positive control: a state file naming a real, verified-identity
# leftover must be reaped (SIGTERM'd and removed from the state file)
# before the next startup's first spawn.
check_side04_leftover_reaped() {
  plant_leftover ""
  local result=0

  if ! start_shell "$PLANTED_PROFILE_DIR"; then
    echo "side04-leftover-reaped: FAIL -- SIDE-04 -- could not launch the built binary" >&2
    unplant_leftover
    return 1
  fi

  if ! wait_pid_gone_or_zombie "$PLANTED_PID"; then
    echo "side04-leftover-reaped: FAIL -- SIDE-04 -- planted leftover pid $PLANTED_PID was still alive after startup; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  # Compare startTicks, not pid: by the time this runs, TheiaService's own
  # first spawn has already written a NEW state-file record for the real
  # backend it just started, and Linux is free to recycle the
  # just-vacated PLANTED_PID onto that very process -- a raw pid substring
  # match would then false-positive on a perfectly healthy, unrelated
  # record. startTicks is what actually distinguishes "the same process"
  # from "a different process that happens to share a pid number", and is
  # exactly the identity signal D-111 itself relies on.
  #
  # Bounded settle poll, not a point-in-time read: _reapLeftover's own
  # internal poll (checking liveness every 100ms) and this script's
  # wait_pid_gone_or_zombie poll (checking every 500ms) run independently,
  # so a single read taken the instant wait_pid_gone_or_zombie returns can
  # race the browser's own removeStateFile()/re-write still landing.
  local settle_deadline=$((SECONDS + 10)) current_ticks=""
  while [ "$SECONDS" -lt "$settle_deadline" ]; do
    if [ -e "$PLANTED_STATE_FILE" ]; then
      current_ticks="$(node -e '
        try {
          const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
          if (typeof j.startTicks === "string") process.stdout.write(j.startTicks);
        } catch {}
      ' "$PLANTED_STATE_FILE" 2>/dev/null)"
    else
      current_ticks=""
    fi
    [ "$current_ticks" != "$PLANTED_TICKS" ] && break
    sleep 0.3
  done
  if [ -n "$current_ticks" ] && [ "$current_ticks" = "$PLANTED_TICKS" ]; then
    echo "side04-leftover-reaped: FAIL -- SIDE-04 -- state file still records the reaped leftover's own start ticks ($PLANTED_TICKS) after startup" >&2
    result=1
  fi

  stop_shell
  unplant_leftover
  return "$result"
}

# D-125 negative control: a state file whose recorded start-time ticks do
# NOT match the live process's actual start-time must NEVER be signalled
# (the recycled-pid footgun, D-111) -- the planted process must still be
# alive, and the launch log must carry the mismatch line (so the check
# cannot pass merely because the shell never reached the reap decision).
check_side04_stale_identity_not_signalled() {
  plant_leftover "999999999"
  local result=0

  if ! start_shell "$PLANTED_PROFILE_DIR"; then
    echo "side04-stale-identity-not-signalled: FAIL -- SIDE-04 -- could not launch the built binary" >&2
    unplant_leftover
    return 1
  fi

  # Give startup's reap decision time to run before asserting.
  local deadline=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$deadline" ]; do
    grep -qi 'startTicks' "$BROWSER_LOG" 2>/dev/null && break
    sentinel_present 'POWERBROWSER_BACKEND_READY ' "$BROWSER_LOG" && break
    sleep 0.5
  done

  if ! kill -0 "$PLANTED_PID" 2>/dev/null; then
    echo "side04-stale-identity-not-signalled: FAIL -- SIDE-04 -- planted process with a MISMATCHED recorded start time was signalled (it is no longer alive)" >&2
    result=1
  fi

  if ! grep -qi 'mismatch\|recycled\|stale' "$BROWSER_LOG" 2>/dev/null; then
    echo "side04-stale-identity-not-signalled: FAIL -- SIDE-04 -- launch log carries no mismatch line -- cannot confirm the reap decision was actually reached; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  stop_shell
  unplant_leftover
  return "$result"
}

# --- Task 3 (05-02): shell03-unrecoverable-immediate-error /
# shell03-budget-exhausted-error / shell03-auto-dismiss-on-selfheal --------
#
# All three drive the built binary headless via start_shell()/stop_shell()
# (Task 1's harness-display-available already proved --headless is not
# needed to exercise this chrome-JS-only surface -- no compositor/paint
# involvement, only stdout sentinels) with a VERIFY05_USER_JS_PROFILE
# forcing a fast give-up/recovery. A fourth check driving the Retry button
# itself does not exist: Task 1's Discriminator B (chrome-side Marionette
# automation) is blocked on Linux (moz:windowless is macOS-only --
# WINDOWS.md entry 7), so the Retry-button click is routed to the human
# record instead (05-02-SUMMARY.md), per the plan's own named fallback.

# D-125-style positive control: the unrecoverable case must show NO
# spawn-attempt-failure line at all, so this can never pass merely because
# the recoverable-failure detection also happens to fire zero times.
SPAWN_ATTEMPT_FAILURE_PATTERN='Backend output stream ended before announcing readiness|did not announce POWERBROWSER_BACKEND_READY within|Health probe on port .* never returned 200'

check_shell03_unrecoverable_immediate_error() {
  local user_js result=0
  user_js="$(mktemp)"; track_temp "$user_js"
  cat > "$user_js" <<'EOF'
user_pref("powerbrowser.sidecar.backendMain", "/nonexistent/powerbrowser-verify-05/main.js");
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "shell03-unrecoverable-immediate-error: FAIL -- SHELL-03 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 15))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "shell03-unrecoverable-immediate-error: FAIL -- SHELL-03 -- browser exited before the error sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.25
  done

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG"; then
    echo "shell03-unrecoverable-immediate-error: FAIL -- SHELL-03 -- POWERBROWSER_SHELL_ERROR did not appear within 15s; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  if sentinel_present 'POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG"; then
    echo "shell03-unrecoverable-immediate-error: FAIL -- SHELL-03 -- launch log carries a swap sentinel; an unrecoverable failure must never reach it" >&2
    result=1
  fi

  if grep -qE "$SPAWN_ATTEMPT_FAILURE_PATTERN" "$BROWSER_LOG"; then
    echo "shell03-unrecoverable-immediate-error: FAIL -- SHELL-03 -- launch log shows a spawn-attempt failure; an unrecoverable classification must give up before ever attempting a spawn" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  stop_shell
  return "$result"
}

# D-113's recoverable-budget-exhausted path: a backend that fails every
# time it is spawned, under a lowered attempt cap, must produce EXACTLY
# that many respawn attempts before giving up -- neither fewer (budget not
# honoured) nor more (budget not enforced).
check_shell03_budget_exhausted_error() {
  local crasher_dir crasher user_js result=0
  crasher_dir="$(mktemp -d)"; track_temp "$crasher_dir"
  crasher="$crasher_dir/main.js"
  echo 'process.exit(1);' > "$crasher"

  user_js="$(mktemp)"; track_temp "$user_js"
  cat > "$user_js" <<EOF
user_pref("powerbrowser.sidecar.backendMain", "$crasher");
user_pref("powerbrowser.sidecar.giveUpAttempts", 2);
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- browser exited before the error sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG"; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- POWERBROWSER_SHELL_ERROR did not appear within 30s; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  # Every failed spawn attempt logs one "output stream ended" fatal line
  # via PowerBrowserAPI.log(), which Firefox's own console mirror duplicates
  # onto a second stdout line (dump() + console.error(), the established
  # PowerBrowserAPI.log() shape) -- divide by 2 for the true attempt count.
  local raw_lines attempt_count
  raw_lines="$(grep -cE "$SPAWN_ATTEMPT_FAILURE_PATTERN" "$BROWSER_LOG")"
  attempt_count=$((raw_lines / 2))
  if [ "$attempt_count" -ne 2 ]; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- expected exactly 2 respawn attempts (giveUpAttempts=2), observed $attempt_count ($raw_lines raw log lines); log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  # Exactly one error sentinel even though the give-up path here is
  # reached only once per launch -- guards _showError's _errorShown flag
  # against re-painting/re-emitting for the same state.
  local error_sentinel_count
  error_sentinel_count="$(grep -c 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG")"
  if [ "$error_sentinel_count" -ne 1 ]; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- expected exactly one POWERBROWSER_SHELL_ERROR sentinel, found $error_sentinel_count" >&2
    result=1
  fi

  # The sentinel's JSON must carry only reason + classification -- never
  # the per-launch token or any other key.
  if ! grep -qE '^POWERBROWSER_SHELL_ERROR \{"reason":"[^"]*","recoverable":(true|false)\}$' "$BROWSER_LOG"; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- POWERBROWSER_SHELL_ERROR sentinel JSON does not match the expected {reason, recoverable} shape" >&2
    result=1
  fi
  if grep 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG" | grep -qi 'POWERBROWSER_TOKEN'; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- an error sentinel line mentions the token environment-variable name" >&2
    result=1
  fi

  # Positive control for verify-phase-04.sh's shell05 deck-state assertion:
  # that check demands all three layers resolve to "none" after the swap, and
  # a sentinel that reported "none" unconditionally (or a getComputedStyle
  # that does not work headless) would satisfy it forever. This run really
  # does put the error layer up, so its deck-state line must NOT say "none".
  local deck_error_line
  deck_error_line="$(sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$BROWSER_LOG" | grep -E '^POWERBROWSER_DECK_STATE .*"where":"error"' | head -1)"
  if [ -z "$deck_error_line" ]; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- no POWERBROWSER_DECK_STATE sentinel accompanied the error sentinel" >&2
    result=1
  elif grep -q '"error":"none"' <<<"$deck_error_line"; then
    echo "shell03-budget-exhausted-error: FAIL -- SHELL-03 -- the error layer reports display:none while its own error sentinel was just written: $deck_error_line" >&2
    result=1
  fi

  stop_shell
  return "$result"
}

# D-115's auto-dismiss path, driven as a genuinely MID-SESSION outage (not
# a first-launch failure): the backend succeeds once (one swap sentinel),
# then crashes on its own a few seconds later; the health loop detects it,
# the single-attempt respawn budget is immediately exhausted (error shown),
# and the background recovery probe's next respawn succeeds -- clearing the
# error with no input ever sent to the window.
check_shell03_auto_dismiss_on_selfheal() {
  local wrap_dir marker real_main user_js result=0
  wrap_dir="$(mktemp -d)"; track_temp "$wrap_dir"
  marker="$wrap_dir/count"
  echo 0 > "$marker"
  real_main="$REPO_ROOT/theia/applications/browser/lib/backend/main.js"
  cat > "$wrap_dir/main.js" <<EOF
const fs = require('fs');
const marker = '$marker';
let n = parseInt(fs.readFileSync(marker, 'utf8'), 10);
n += 1;
fs.writeFileSync(marker, String(n));
// Attempt 1: start normally, then self-destruct a few seconds in --
// simulates a real mid-session crash of an already-healthy backend.
// Attempt 2 (the health loop's own single-budget respawn): crash
// immediately, forcing the give-up/error-shown path.
// Attempt 3+ (the recovery probe's respawn): succeed cleanly.
if (n === 2) {
  process.exit(1);
}
if (n === 1) {
  setTimeout(() => process.exit(1), 3000);
}
require('$real_main');
EOF

  user_js="$(mktemp)"; track_temp "$user_js"
  cat > "$user_js" <<EOF
user_pref("powerbrowser.sidecar.backendMain", "$wrap_dir/main.js");
user_pref("powerbrowser.sidecar.giveUpAttempts", 1);
user_pref("powerbrowser.sidecar.healthIntervalSteadyMs", 1000);
user_pref("powerbrowser.sidecar.recoveryProbeIntervalMs", 2000);
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "shell03-auto-dismiss-on-selfheal: FAIL -- SHELL-03 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 40))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_ERROR_CLEARED' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "shell03-auto-dismiss-on-selfheal: FAIL -- SHELL-03 -- browser exited before the cleared sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR_CLEARED' "$BROWSER_LOG"; then
    echo "shell03-auto-dismiss-on-selfheal: FAIL -- SHELL-03 -- POWERBROWSER_SHELL_ERROR_CLEARED did not appear within 40s (no input was ever sent to the window); log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG"; then
    echo "shell03-auto-dismiss-on-selfheal: FAIL -- SHELL-03 -- cleared sentinel appeared without ever showing the error sentinel first -- this run proves nothing" >&2
    result=1
  fi

  # Mid-session invariant (D-114): the content browser's location never
  # changes while the error layer is visible -- exactly one swap sentinel
  # across the whole session (the original successful launch), never a
  # second one for the recovery.
  local swap_count
  swap_count="$(grep -c 'POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG")"
  if [ "$swap_count" -ne 1 ]; then
    echo "shell03-auto-dismiss-on-selfheal: FAIL -- SHELL-03 -- expected exactly one swap sentinel across the whole session, found $swap_count; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  stop_shell
  return "$result"
}

# --- 01-09: health-gate-recovery-swaps -------------------------------------
#
# The branch 01-VERIFICATION.md recorded FAILED, which no happy-path smoke test
# reaches: the FIRST spawn announces readiness (so the supervisor pins a port)
# and then never passes the health gate. Every check above either succeeds on
# its first spawn or fails on it terminally; none of them drives a launch that
# fails the gate and then recovers, which is exactly why the conflation between
# "a port has been pinned" and "a spawn has actually completed" shipped.
#
# The plant is a wrapper backend that counts its own invocations in a marker
# file: invocation 1 binds the requested port, announces readiness, and answers
# 503 to everything while staying alive (so the failure classifies as the
# health-probe timeout, not as a crash); invocation 2+ answers 200. The marker
# count is asserted here, OUTSIDE the analyzer, so a wrong analyzer cannot also
# excuse a fixture that never fired.
check_health_gate_recovery_swaps() {
  local wrap_dir marker user_js result=0
  wrap_dir="$(mktemp -d)"; track_temp "$wrap_dir"
  marker="$wrap_dir/count"
  echo 0 > "$marker"
  cat > "$wrap_dir/main.js" <<EOF
const fs = require('fs');
const http = require('http');
const marker = '$marker';
const n = parseInt(fs.readFileSync(marker, 'utf8'), 10) + 1;
fs.writeFileSync(marker, String(n));

const argv = process.argv;
const flag = argv.indexOf('--port');
const port = flag === -1 ? 0 : parseInt(argv[flag + 1], 10);

// Invocation 1 is the plant. Readiness announces, so the supervisor pins the
// port; the health probe can never pass; and the output stream never ends, so
// this classifies as the health-probe timeout the gap describes rather than as
// a crash. Invocation 2+ is a healthy backend.
const status = n === 1 ? 503 : 200;
const server = http.createServer((req, res) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end('powerbrowser-verification-stub');
});
// Bind 127.0.0.1 EXPLICITLY on both branches (T-01-02): a stub that answers 200
// to every request must never be reachable off-host.
server.listen(port, '127.0.0.1', () => {
  console.log('POWERBROWSER_BACKEND_READY ' + JSON.stringify({ port: server.address().port, pid: process.pid }));
});
EOF

  user_js="$(mktemp)"; track_temp "$user_js"
  cat > "$user_js" <<EOF
user_pref("powerbrowser.sidecar.backendMain", "$wrap_dir/main.js");
user_pref("powerbrowser.sidecar.startupTimeoutMs", 3000);
user_pref("powerbrowser.sidecar.giveUpAttempts", 4);
user_pref("powerbrowser.sidecar.healthIntervalSteadyMs", 30000);
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "health-gate-recovery-swaps: FAIL -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "health-gate-recovery-swaps: FAIL -- browser exited before the swap sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done

  # The fixture's own proof, held outside the analyzer: without at least two
  # invocations the plant never forced a respawn and every assertion below
  # would be about a launch that never entered the recovery branch.
  local attempts
  attempts="$(cat "$marker" 2>/dev/null || echo 0)"
  if [ "$attempts" -lt 2 ]; then
    echo "health-gate-recovery-swaps: FAIL -- the backend stub was invoked $attempts time(s); the planted health-gate failure never forced a respawn, so this run proves nothing; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  if ! node "$REPO_ROOT/scripts/verify-start-path-recovery.mjs" --log "$BROWSER_LOG"; then
    echo "health-gate-recovery-swaps: FAIL -- see the analyzer failures above; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  stop_shell
  return "$result"
}

# --- 01-07: shell-diagnostics-rows-populated -------------------------------
#
# The runtime half of the error-copy rewrite. verify-shell-error-copy.mjs is
# static and proves the DECLARED copy carries no internal identifier; this one
# drives two genuinely different real failure paths in the built binary and
# proves three things a static read cannot:
#
#   1. the string that actually painted is one of the values that script
#      derived from the source -- ties the static table to the live surface,
#      rather than trusting that the table is what reaches the element;
#   2. every identifier the rewrite removed from the message is present as a
#      labelled diagnostics row on the failure path that produced it, so
#      nothing was lost when it stopped being user-facing;
#   3. absent identifiers produce NO rows at all rather than empty-labelled
#      ones -- the missing-backendMain path has no port and no timeout.
#
# THE DISCRIMINATOR, and why (3) is not an assertion on the absence of a line
# this check's own instrumentation emits. Both runs read the SAME
# POWERBROWSER_ERROR_DIAGNOSTICS emitter, and the check requires their label
# SETS TO DIFFER. An emitter writing a constant -- the way an
# absence-of-a-line assertion silently degrades -- makes the two sets equal and
# goes red. So the per-run positive membership, the per-run absence, and the
# cross-run difference are checked together, and the last one is what stops the
# first two from passing vacuously.
#
# Both label sets are derived from the runs themselves; neither is a
# hand-maintained expected list. What IS named per run is the small set of
# identifiers that path's OLD message used to spell out, which is the actual
# claim being made ("this moved, it was not dropped").

# The user-facing sentences, read out of TheiaService.sys.mjs at check time --
# never a copy of them kept here, which could only ever agree with itself.
derived_user_messages() {
  node -e '
    const src = require("fs").readFileSync(process.argv[1], "utf8");
    const block = src.match(/const USER_MESSAGE = \{\n([\s\S]*?)\n\};/);
    if (!block) process.exit(3);
    const re = /^\s*[A-Za-z_$][\w$]*:\s*("(?:[^"\\]|\\.)*")\s*,\s*$/gm;
    let m, n = 0;
    while ((m = re.exec(block[1])) !== null) { console.log(JSON.parse(m[1])); n++; }
    if (n === 0) process.exit(3);
  ' "$REPO_ROOT/powerbrowser/shell/TheiaService.sys.mjs"
}

# The reason string carried by the first POWERBROWSER_SHELL_ERROR line in <log>.
error_sentinel_reason() {
  sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$1" 2>/dev/null \
    | grep -E '^POWERBROWSER_SHELL_ERROR \{' | head -1 \
    | sed -E 's/^POWERBROWSER_SHELL_ERROR //' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).reason??"")}catch{}})' 2>/dev/null
}

# The diagnostics rows of the first POWERBROWSER_ERROR_DIAGNOSTICS line in
# <log>, as "label\tvalue" lines. Empty output means no such line.
error_diagnostics_rows() {
  sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$1" 2>/dev/null \
    | grep -E '^POWERBROWSER_ERROR_DIAGNOSTICS \{' | head -1 \
    | sed -E 's/^POWERBROWSER_ERROR_DIAGNOSTICS //' \
    | node -e '
        let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
          try {
            const rows = JSON.parse(s).rows;
            if (!Array.isArray(rows)) return;
            for (const [label, value] of rows) console.log(`${label}\t${value}`);
          } catch {}
        })' 2>/dev/null
}

# Drives one failure path to its error state and leaves the labels in
# DIAG_LABELS (sorted, newline-separated), the reason in DIAG_REASON and the
# raw rows in DIAG_ROWS. $1 is a label for messages, $2 a user.js body.
DIAG_LABELS=""
DIAG_REASON=""
DIAG_ROWS=""
_drive_failure_to_error() {
  local what="$1" user_js_body="$2" user_js
  user_js="$(mktemp)"; track_temp "$user_js"
  printf '%s\n' "$user_js_body" > "$user_js"

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- could not launch the built binary for the $what run" >&2
    return 1
  fi

  local deadline=$((SECONDS + 40))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_ERROR_DIAGNOSTICS ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- browser exited before the $what run reached its error state; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done

  if ! sentinel_present 'POWERBROWSER_ERROR_DIAGNOSTICS ' "$BROWSER_LOG"; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run never announced POWERBROWSER_ERROR_DIAGNOSTICS within 40s; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  DIAG_REASON="$(error_sentinel_reason "$BROWSER_LOG")"
  DIAG_ROWS="$(error_diagnostics_rows "$BROWSER_LOG")"
  DIAG_LABELS="$(printf '%s\n' "$DIAG_ROWS" | cut -f1 | grep -v '^$' | sort -u)"
  stop_shell
  return 0
}

# Asserts the current DIAG_* capture: the painted string is a derived
# USER_MESSAGE value, carries no internal-identifier shape, and every row has a
# label and a non-empty value.
_assert_diag_capture() {
  # `label`/`value` MUST be local: bash scoping is dynamic, so the `read` loop
  # below would otherwise assign into run_own_checks()'s own `local label` --
  # the registry runner's summary-row label -- and every summary line printed
  # as a bare ": PASS". Caught live the first time this check ran.
  local what="$1" messages="$2" result=0 label value

  if [ -z "$DIAG_REASON" ]; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run's error sentinel carries no reason at all" >&2
    return 1
  fi
  if ! grep -Fxq "$DIAG_REASON" <<<"$messages"; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run painted a string that is not one of the USER_MESSAGE values derived from TheiaService.sys.mjs: $DIAG_REASON" >&2
    result=1
  fi
  # The same shape rule verify-shell-error-copy.mjs applies statically, applied
  # here to the string that genuinely reached the element.
  if grep -qE '\b[A-Z][A-Z0-9]*(_[A-Z0-9]+)+\b' <<<"$DIAG_REASON"; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run's painted message contains an all-caps underscored internal token: $DIAG_REASON" >&2
    result=1
  fi
  if grep -qE '\b[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){2,}\b' <<<"$DIAG_REASON"; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run's painted message contains a dotted multi-segment key: $DIAG_REASON" >&2
    result=1
  fi

  if [ -z "$DIAG_LABELS" ]; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run announced no diagnostics rows at all; every identifier its message dropped would be lost" >&2
    return 1
  fi
  # No empty-labelled and no empty-valued row: an absent identifier must
  # produce NO row, never a row reading "Port: null".
  while IFS=$'\t' read -r label value; do
    [ -z "$label$value" ] && continue
    if [ -z "$label" ] || [ -z "$value" ] || [ "$value" = "null" ] || [ "$value" = "undefined" ]; then
      echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the $what run announced an empty row (label='$label', value='$value'); an absent identifier must produce no row at all" >&2
      result=1
    fi
  done <<<"$DIAG_ROWS"

  return "$result"
}

check_shell_diagnostics_rows_populated() {
  local messages result=0 label
  if ! messages="$(derived_user_messages)" || [ -z "$messages" ]; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- could not derive the USER_MESSAGE table from TheiaService.sys.mjs; the comparison below would assert nothing" >&2
    return 1
  fi

  # Run A -- the resolve-time failure. Its OLD message spelled out the pref key
  # and the resolved path; both must now be rows.
  if ! _drive_failure_to_error "missing-backendMain" \
    'user_pref("powerbrowser.sidecar.backendMain", "/nonexistent/powerbrowser-01-07/main.js");'; then
    return 1
  fi
  local a_labels="$DIAG_LABELS" a_reason="$DIAG_REASON"
  _assert_diag_capture "missing-backendMain" "$messages" || result=1
  for label in "Preference" "Resolved path"; do
    if ! grep -Fxq "$label" <<<"$a_labels"; then
      echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the missing-backendMain run's message dropped the pref key and the resolved path, but announced no '$label' row; the identifier was lost, not moved. Rows: $(tr '\n' ',' <<<"$a_labels")" >&2
      result=1
    fi
  done
  # This path has no port and no timeout, so it must contribute neither row.
  # Guarded against vacuity by the cross-run difference assertion below.
  for label in "Health probe port" "Startup timeout"; do
    if grep -Fxq "$label" <<<"$a_labels"; then
      echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the missing-backendMain run has no port and no timeout, but announced a '$label' row" >&2
      result=1
    fi
  done

  # Run B -- a backend that crashes on every spawn. A different failure class
  # with a different identifier set: no pref key, but a raw exception text.
  local crasher_dir
  crasher_dir="$(mktemp -d)"; track_temp "$crasher_dir"
  echo 'process.exit(1);' > "$crasher_dir/main.js"
  if ! _drive_failure_to_error "crashing-backend" \
    "$(printf 'user_pref("powerbrowser.sidecar.backendMain", "%s/main.js");\nuser_pref("powerbrowser.sidecar.giveUpAttempts", 2);' "$crasher_dir")"; then
    return 1
  fi
  local b_labels="$DIAG_LABELS"
  _assert_diag_capture "crashing-backend" "$messages" || result=1
  for label in "Failed step" "Error"; do
    if ! grep -Fxq "$label" <<<"$b_labels"; then
      echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- the crashing-backend run's message dropped the underlying exception text, but announced no '$label' row. Rows: $(tr '\n' ',' <<<"$b_labels")" >&2
      result=1
    fi
  done

  # THE DISCRIMINATOR. Two real failure paths, one emitter: if the rows were a
  # constant (or the emitter had stopped reflecting the failure at all), these
  # two sets would be identical and every membership assertion above would be
  # passing for a reason that has nothing to do with the code under test.
  if [ "$a_labels" = "$b_labels" ]; then
    echo "shell-diagnostics-rows-populated: FAIL -- MIG-04 -- two different failure paths announced IDENTICAL diagnostics labels ($(tr '\n' ',' <<<"$a_labels")); the rows are not derived from the failure and this check's positive assertions prove nothing" >&2
    result=1
  fi

  # And the two paths must not merely differ in rows while painting the same
  # sentence by accident -- record which sentence each produced.
  echo "shell-diagnostics-rows-populated: missing-backendMain -> '$a_reason' rows[$(tr '\n' ',' <<<"$a_labels")]"
  echo "shell-diagnostics-rows-populated: crashing-backend    -> '$DIAG_REASON' rows[$(tr '\n' ',' <<<"$b_labels")]"

  return "$result"
}

# --- 01-10: start-failure-shows-error --------------------------------------
#
# The error-affordance half of 01-VERIFICATION.md's one FAILED must-have, and
# the failure mode no check above can reach: a REAL throw ESCAPING the
# supervisor's start path. Every launch check in this file drives a failure
# that already has a classified result and a `_showError` route; none of them
# drives a rejection that leaves `TheiaService.start()` altogether. Before
# 01-10 that rejection had nowhere to go -- `powerbrowser.js` called
# `TheiaService.start(browserElement)` with no `await` and no terminal handler,
# so the rejection became an unhandled promise rejection in chrome and the user
# was left looking at the branded loading layer with no message, no Retry and
# no Details: the identical user-visible outcome the state-gating defect 01-09
# fixed produced.
#
# THE PLANT makes the settings-folder creation step fail while everything
# before it succeeds, so the rejection originates INSIDE the start path rather
# than at the earlier sidecar-resolution step -- that step already has a
# classified failure path (shell03-unrecoverable-immediate-error drives it) and
# exercising it here would prove nothing about escapes. A regular FILE is
# planted at exactly the path `TheiaService._resolveConfigDir()` derives from
# the config-home environment variable, so `PowerBrowserAPI.ensureDirectory`
# (IOUtils.makeDirectory) cannot create a directory there and throws.
#
# Both planted directories are mktemp -d paths registered with track_temp
# (T-01-10) -- never a repo file, never a path outside the temp root.
check_start_failure_shows_error() {
  local stub_dir poison_home user_js result=0
  stub_dir="$(mktemp -d)"; track_temp "$stub_dir"
  # Exists only so the sidecar-resolution step's existence check passes. On the
  # path under test it is never spawned at all -- the settings-folder fault
  # fires first -- so all it has to do is stay alive if anything ever does
  # reach it.
  cat > "$stub_dir/main.js" <<'EOF'
setInterval(() => {}, 60000);
EOF

  poison_home="$(mktemp -d)"; track_temp "$poison_home"
  # THE FAULT: a regular file where the settings folder must be created.
  printf 'not a directory\n' > "$poison_home/powerbrowser"

  user_js="$(mktemp)"; track_temp "$user_js"
  # A recovery-probe interval far beyond this check's own deadline: the error
  # state must be observed as the start path left it, not after a background
  # respawn has had a chance to churn it.
  cat > "$user_js" <<EOF
user_pref("powerbrowser.sidecar.backendMain", "$stub_dir/main.js");
user_pref("powerbrowser.sidecar.startupTimeoutMs", 3000);
user_pref("powerbrowser.sidecar.giveUpAttempts", 1);
user_pref("powerbrowser.sidecar.recoveryProbeIntervalMs", 600000);
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  export VERIFY05_XDG_CONFIG_HOME="$poison_home"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  unset VERIFY05_XDG_CONFIG_HOME
  if [ "$start_rc" -ne 0 ]; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "start-failure-shows-error: FAIL -- MIG-04 -- browser exited before the error sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.25
  done

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG"; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- a throw out of the start path produced NO error state within 30s: the rejection was swallowed and the user is looking at the loading layer with no message, no Retry and no Details; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  # Exactly once -- `_showError`'s `_errorShown` guard holds for this path too.
  local error_sentinel_count
  error_sentinel_count="$(grep -c 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG")"
  if [ "$error_sentinel_count" -ne 1 ]; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- expected exactly one POWERBROWSER_SHELL_ERROR sentinel, found $error_sentinel_count" >&2
    result=1
  fi

  # The same anchored shape check_shell03_budget_exhausted_error applies, so an
  # added key on this path is caught here exactly as it is there.
  if ! grep -qE '^POWERBROWSER_SHELL_ERROR \{"reason":"[^"]*","recoverable":(true|false)\}$' "$BROWSER_LOG"; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- POWERBROWSER_SHELL_ERROR sentinel JSON does not match the expected {reason, recoverable} shape" >&2
    result=1
  fi

  # The copywriting contract's cheapest positive assertion: the sentence a user
  # is now reading names the product in its display form.
  local reason
  reason="$(error_sentinel_reason "$BROWSER_LOG")"
  if ! grep -Fq 'PowerBrowser' <<<"$reason"; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- the painted sentence does not name the product: '$reason'" >&2
    result=1
  fi

  # 01-10 Task 2: the failure must carry its OWN classification into the
  # diagnostics layer, not fall to the generic terminal-handler backstop. The
  # assertion above proves an error paints AT ALL; this one proves the painted
  # error belongs to the step that actually failed. Neither subsumes the other,
  # and both are kept: strip the guard from the settings-folder step and this
  # row reverts to the backstop's own label while the assertions above stay
  # green.
  local rows failed_step
  rows="$(error_diagnostics_rows "$BROWSER_LOG")"
  if [ -z "$rows" ]; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- the error state announced no diagnostics rows at all; every identifier the sentence drops would be lost" >&2
    result=1
  else
    failed_step="$(printf '%s\n' "$rows" | awk -F'\t' '$1 == "Failed step" { print $2 }' | head -1)"
    if [ -z "$failed_step" ]; then
      echo "start-failure-shows-error: FAIL -- MIG-04 -- the error state announced no 'Failed step' row; rows: $(tr '\n' ',' <<<"$rows")" >&2
      result=1
    elif ! grep -Fq 'settings folder' <<<"$failed_step"; then
      echo "start-failure-shows-error: FAIL -- MIG-04 -- the failing settings-folder step did not name itself in its diagnostics rows (Failed step = '$failed_step'); the failure fell to the generic backstop instead of carrying its own classification" >&2
      result=1
    else
      echo "start-failure-shows-error: rows[$(tr '\n' ',' <<<"$rows")]"
    fi
  fi

  # Positive control, the same one check_shell03_budget_exhausted_error carries:
  # a deck-state sentinel that reported "none" unconditionally, or a
  # getComputedStyle read that does not work headless, must not be able to
  # satisfy this check forever.
  local deck_error_line
  deck_error_line="$(sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$BROWSER_LOG" | grep -E '^POWERBROWSER_DECK_STATE .*"where":"error"' | head -1)"
  if [ -z "$deck_error_line" ]; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- no POWERBROWSER_DECK_STATE sentinel accompanied the error sentinel" >&2
    result=1
  elif grep -q '"error":"none"' <<<"$deck_error_line"; then
    echo "start-failure-shows-error: FAIL -- MIG-04 -- the error layer reports display:none while its own error sentinel was just written: $deck_error_line" >&2
    result=1
  fi

  if [ "$result" -ne 0 ]; then
    cat "$BROWSER_LOG" >&2
  else
    echo "start-failure-shows-error: painted '$reason'"
  fi

  stop_shell
  return "$result"
}

# --- Task 2 (05-03): shell04-diagnostics-with-backend-down -----------------
#
# SHELL-04's risky edge (this plan's flagged_assumption): the diagnostics
# surface must answer while the backend is dead, not just while it is
# healthy. Launches with backendMain pointed at a nonexistent path (same
# unrecoverable-immediate shape as shell03-unrecoverable-immediate-error --
# no backend spawn is ever attempted, so there is genuinely no backend at
# all), then asserts what this repo can automate without chrome-context
# driving:
#
#   1. The startup identity sentinel (POWERBROWSER_APP_IDENTITY) is present
#      with all three fields populated -- written unconditionally, right
#      after the sidecar prefs sentinel and BEFORE TheiaService.start(), so
#      it can never depend on a live backend. This is the fully-automated
#      half of "the surface is alive precisely when the backend is not."
#   2. The error layer's details control is present and enabled in the
#      shipped markup (powerbrowser.xhtml has no `disabled` attribute on
#      #powerbrowser-error-diagnostics) -- the plan's own named fallback for
#      when no chrome-context driver exists.
#
# What this check does NOT do, and why: opening the diagnostics layer
# itself (the chord, or clicking the Details control) is chrome-context
# automation, and Discriminator B (05-02-PLAN.md Task 1, WINDOWS.md #7)
# found that blocked on Linux -- capabilities.alwaysMatch['moz:windowless']
# is silently ignored outside AppInfo.isMac, so WebDriver:NewSession can
# never create a session against the shell's own windowtype="powerbrowser:main"
# chrome window. scripts/lib/firefox-marionette.mjs does not exist (05-02
# confirmed it cannot). With no driver, this check cannot click the Details
# control or evaluate the show global, so it cannot produce a live
# POWERBROWSER_DIAGNOSTICS sentinel to read the rendered health/port/pid
# fields from. That gap is routed to the human record (05-03-SUMMARY.md),
# exactly as 05-02 routed the Retry-button click -- not fabricated as a
# pass.
check_shell04_diagnostics_with_backend_down() {
  local user_js result=0
  user_js="$(mktemp)"; track_temp "$user_js"
  cat > "$user_js" <<'EOF'
user_pref("powerbrowser.sidecar.backendMain", "/nonexistent/powerbrowser-verify-05/shell04-main.js");
EOF

  export VERIFY05_USER_JS_PROFILE="$user_js"
  start_shell
  local start_rc=$?
  unset VERIFY05_USER_JS_PROFILE
  if [ "$start_rc" -ne 0 ]; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 15))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG" && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- browser exited before the error sentinel appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.25
  done

  if ! sentinel_present 'POWERBROWSER_SHELL_ERROR ' "$BROWSER_LOG"; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- POWERBROWSER_SHELL_ERROR did not appear within 15s (no backend was ever supposed to exist); log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  # There is genuinely no backend in this run -- confirm the unrecoverable
  # classification, so a later assertion can never be read as "it happened
  # to recover before we checked."
  if ! grep -qE '^(\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_SHELL_ERROR \{"reason":"[^"]*","recoverable":false\}$' "$BROWSER_LOG"; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- error sentinel is not classified recoverable:false; this run does not prove 'no backend at all'; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  fi

  # Identity half: alive independent of the backend, fully automated.
  local identity_line
  identity_line="$(grep -E '^(\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_APP_IDENTITY ' "$BROWSER_LOG" | head -1 | sed -E 's/^(\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_APP_IDENTITY //')"
  if [ -z "$identity_line" ]; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- no POWERBROWSER_APP_IDENTITY sentinel with the backend unreachable; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  elif ! node -e '
    let s = "";
    process.stdin.on("data", d => (s += d)).on("end", () => {
      let j;
      try { j = JSON.parse(s); } catch { process.exit(1); }
      if (typeof j.name === "string" && j.name && typeof j.vendor === "string" && j.vendor && typeof j.version === "string" && j.version) {
        process.exit(0);
      }
      process.exit(1);
    });
  ' <<<"$identity_line"; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- POWERBROWSER_APP_IDENTITY sentinel is not populated ($identity_line)" >&2
    result=1
  fi

  stop_shell

  # Fallback half (no chrome-context driver in this repo -- WINDOWS.md #7):
  # the details control is present and enabled in the shipped markup.
  local xhtml="$REPO_ROOT/powerbrowser/shell/powerbrowser.xhtml"
  if ! grep -q 'id="powerbrowser-error-diagnostics"' "$xhtml"; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- #powerbrowser-error-diagnostics is not present in powerbrowser.xhtml" >&2
    result=1
  elif grep 'id="powerbrowser-error-diagnostics"' "$xhtml" | grep -q 'disabled'; then
    echo "shell04-diagnostics-with-backend-down: FAIL -- SHELL-04 -- #powerbrowser-error-diagnostics still carries a disabled attribute" >&2
    result=1
  fi

  echo "shell04-diagnostics-with-backend-down: NOTE -- chrome-context driving (the chord, the Details click, and reading the live POWERBROWSER_DIAGNOSTICS sentinel) is routed to the human record, per WINDOWS.md #7 / Discriminator B; see 05-03-SUMMARY.md" >&2

  return "$result"
}

# --- MED-02 / WINDOWS.md 10: shell04-log-redacts-token ----------------------
#
# Behavioral (not a grep) proof that TheiaService._pushLog scrubs the
# per-launch token before buffering a line into the SHELL-04 diagnostics ring
# buffer. Imports the shipped module directly under plain node after
# stubbing its one chrome dependency (ChromeUtils.importESModule), then
# drives _pushLog on a bare receiver -- no browser, no display, no built
# tree needed.
check_shell04_log_redacts_token() {
  local shipped="$REPO_ROOT/powerbrowser/shell/TheiaService.sys.mjs"
  local out result=0
  out="$(SHIPPED_THEIA_SERVICE="$shipped" node --input-type=module -e '
    globalThis.ChromeUtils = { importESModule: () => ({ PowerBrowserAPI: { getIntPref: (_k, d) => d } }) };
    const { TheiaService } = await import(process.env.SHIPPED_THEIA_SERVICE);

    if (typeof TheiaService._pushLog !== "function") {
      console.error("FAIL -- TheiaService._pushLog is not a function (renamed or removed)");
      process.exit(1);
    }

    // (a) real token, real line -- token must not survive, and a redaction
    // marker must be present.
    {
      const receiver = { _token: "TOK-11111111", _log: [] };
      TheiaService._pushLog.call(receiver, "Cookie: powerbrowser-token=TOK-11111111");
      const entry = receiver._log[receiver._log.length - 1];
      if (receiver._log.length !== 1) {
        console.error("FAIL -- case (a): expected exactly one buffered entry, got " + receiver._log.length);
        process.exit(1);
      }
      if (entry.includes("TOK-11111111")) {
        console.error("FAIL -- case (a): token survived unredacted: " + entry);
        process.exit(1);
      }
      if (!entry.includes("[redacted]")) {
        console.error("FAIL -- case (a): no redaction marker in: " + entry);
        process.exit(1);
      }
    }

    // (b) null token -- must not throw, line must survive unchanged.
    {
      const receiver = { _token: null, _log: [] };
      const line = "an ordinary log line";
      TheiaService._pushLog.call(receiver, line);
      const entry = receiver._log[receiver._log.length - 1];
      if (receiver._log.length !== 1) {
        console.error("FAIL -- case (b): expected exactly one buffered entry, got " + receiver._log.length);
        process.exit(1);
      }
      if (!entry.endsWith(line)) {
        console.error("FAIL -- case (b): null-token line was altered: " + entry);
        process.exit(1);
      }
    }

    // (c) empty-string token -- the splicing-bug case. replaceAll("", X)
    // would splice X between every character.
    {
      const receiver = { _token: "", _log: [] };
      const line = "an ordinary log line";
      TheiaService._pushLog.call(receiver, line);
      const entry = receiver._log[receiver._log.length - 1];
      if (receiver._log.length !== 1) {
        console.error("FAIL -- case (c): expected exactly one buffered entry, got " + receiver._log.length);
        process.exit(1);
      }
      if (!entry.endsWith(line)) {
        console.error("FAIL -- case (c): empty-token line was spliced/altered: " + entry);
        process.exit(1);
      }
    }

    console.log("PASS");
  ' 2>&1)" || result=1

  if [ "$result" -ne 0 ] || ! grep -q "^PASS$" <<<"$out"; then
    echo "shell04-log-redacts-token: FAIL -- MED-02 -- $out" >&2
    return 1
  fi
  return 0
}

# --- Task 2 (05-04): side05-second-launch-focuses / side05-no-second-backend
#
# SIDE-05: a second launch against the SAME profile must focus the already-
# open window (never a second one) and never spawn a second backend --
# never headless (05-RESEARCH.md Pitfall 1: gfxPlatform::IsHeadless()
# disables Firefox's native remoting protocol outright, the entire
# mechanism this requirement depends on), and both launches share one
# profile directory because nsRemoteService keys remoting on the profile
# path (upstream/toolkit/xre/nsAppRunner.cpp:5342-5358) -- two different
# profiles would never remote into each other and the check would prove
# nothing. Both checks assert the first launch actually reached readiness
# before drawing any conclusion, so neither can pass vacuously against a
# launch that silently failed.

# Launches the shell twice against ONE shared profile (bare, then with a
# file-path argument -- D-123/D-124's "arguments are ignored" truth), and
# asserts each time: the second process exits (never runs on as an
# independent instance), the first process is still running, and exactly
# one POWERBROWSER_SHELL_READY sentinel exists in the first process's own log
# (a second window opening would paint and announce its own readiness
# through the SAME process's stdout, since remoting delivers the second
# launch's command line into the first process in-process -- never a
# second OS process's own separate log).
check_side05_second_launch_focuses() {
  local bin profile result=0
  bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"
  if [ ! -x "$bin" ]; then
    echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- $bin does not exist or is not executable (run the Phase 1 Firefox build first)" >&2
    return 1
  fi

  profile="$(mktemp -d)"; track_temp "$profile"

  local rc
  start_shell_display "$profile"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- could not launch the first instance (no usable display or missing binary)" >&2
    return "$rc"
  fi
  local first_log="$BROWSER_LOG"
  local first_pid="$BROWSER_SPAWN_PID"
  local display_to_use="$DISPLAY_IN_USE"

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_BACKEND_READY ' "$first_log" && break
    if ! kill -0 "$first_pid" 2>/dev/null; then
      echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- first launch exited before POWERBROWSER_BACKEND_READY appeared; log:" >&2
      cat "$first_log" >&2
      stop_shell_display
      return 1
    fi
    sleep 0.5
  done
  if ! sentinel_present 'POWERBROWSER_BACKEND_READY ' "$first_log"; then
    echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- POWERBROWSER_BACKEND_READY did not appear within 60s; log:" >&2
    cat "$first_log" >&2
    stop_shell_display
    return 1
  fi

  local round arg_path
  arg_path="$profile/side05-argument-does-not-matter.txt"
  for round in bare argument; do
    local second_log second_rc
    second_log="$(mktemp)"; track_temp "$second_log"

    if [ "$round" = "bare" ]; then
      timeout 30 env "DISPLAY=$display_to_use" "$bin" --profile "$profile" >"$second_log" 2>&1
    else
      timeout 30 env "DISPLAY=$display_to_use" "$bin" --profile "$profile" "$arg_path" >"$second_log" 2>&1
    fi
    second_rc=$?

    if [ "$second_rc" -eq 124 ]; then
      echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- second launch ($round) against the same profile did not exit within 30s -- ran on as an independent instance; log:" >&2
      cat "$second_log" >&2
      result=1
    fi

    if ! kill -0 "$first_pid" 2>/dev/null; then
      echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- first instance is no longer running after the second launch ($round)" >&2
      result=1
    fi

    local ready_count
    ready_count="$(grep -c 'POWERBROWSER_SHELL_READY' "$first_log")"
    if [ "$ready_count" -ne 1 ]; then
      echo "side05-second-launch-focuses: FAIL -- SIDE-05 -- expected exactly one POWERBROWSER_SHELL_READY in the first process's log after the second launch ($round), found $ready_count -- a second window opened; log:" >&2
      cat "$first_log" >&2
      result=1
    fi
  done

  stop_shell_display
  return "$result"
}

# D-125's invariant assertion, paired with its own positive control. Does
# its own two-launch-same-profile session (not a reuse of the previous
# check's state -- --only must be able to run this alone) and asserts:
# exactly one POWERBROWSER_BACKEND_READY sentinel across both launches, the
# announced backend pid unchanged, and exactly one live process matching
# 'backend/main.js' among this run's own process groups. Then a THIRD
# launch against a DIFFERENT profile must
# start its own window and its own backend -- proving the guard is scoped
# to the profile, not simply "second launches never work at all."
check_side05_no_second_backend() {
  local bin profile result=0
  bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"
  if [ ! -x "$bin" ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- $bin does not exist or is not executable (run the Phase 1 Firefox build first)" >&2
    return 1
  fi

  profile="$(mktemp -d)"; track_temp "$profile"

  local rc
  start_shell_display "$profile"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- could not launch the first instance (no usable display or missing binary)" >&2
    return "$rc"
  fi
  local first_log="$BROWSER_LOG"
  local first_pid="$BROWSER_SPAWN_PID"
  local display_to_use="$DISPLAY_IN_USE"

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_BACKEND_READY ' "$first_log" && break
    if ! kill -0 "$first_pid" 2>/dev/null; then
      echo "side05-no-second-backend: FAIL -- SIDE-05 -- first launch exited before POWERBROWSER_BACKEND_READY appeared; log:" >&2
      cat "$first_log" >&2
      stop_shell_display
      return 1
    fi
    sleep 0.5
  done
  if ! sentinel_present 'POWERBROWSER_BACKEND_READY ' "$first_log"; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- POWERBROWSER_BACKEND_READY did not appear within 60s; log:" >&2
    cat "$first_log" >&2
    stop_shell_display
    return 1
  fi

  local first_backend_pid
  first_backend_pid="$(backend_ready_pids "$first_log" | head -1)"
  if [ -z "$first_backend_pid" ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- could not read a pid from POWERBROWSER_BACKEND_READY in the first process's log" >&2
    stop_shell_display
    return 1
  fi

  local second_log second_rc
  second_log="$(mktemp)"; track_temp "$second_log"
  timeout 30 env "DISPLAY=$display_to_use" "$bin" --profile "$profile" >"$second_log" 2>&1
  second_rc=$?
  if [ "$second_rc" -eq 124 ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- second launch against the same profile did not exit within 30s; log:" >&2
    cat "$second_log" >&2
    result=1
  fi

  local ready_pids_after ready_count
  ready_pids_after="$(backend_ready_pids "$first_log")"
  ready_count="$(printf '%s\n' "$ready_pids_after" | grep -c .)"
  if [ "$ready_count" -ne 1 ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- expected exactly one POWERBROWSER_BACKEND_READY sentinel across both launches, found $ready_count; log:" >&2
    cat "$first_log" >&2
    result=1
  fi
  if [ "$(printf '%s\n' "$ready_pids_after" | head -1)" != "$first_backend_pid" ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- announced backend pid changed across the session (was $first_backend_pid)" >&2
    result=1
  fi

  # Two groups make up this check's world: the first launch's own group
  # (start_shell_display setsid's it, so its backend and any orphan of that
  # backend live there), and this script's group, where a backend spawned by
  # the SECOND launch would land -- that launch runs in the foreground and
  # so inherits the harness's group. A backend outside both belongs to some
  # other PowerBrowser on the machine and is not this check's business.
  local scope_pgids backends backend_proc_count
  scope_pgids="$(pgid_of "$first_backend_pid"),$(pgid_of $$)"
  backends="$(backends_in_groups "$scope_pgids")"
  backend_proc_count="$(printf '%s' "$backends" | grep -c . || true)"
  if [ "$backend_proc_count" -ne 1 ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- expected exactly one process matching 'backend/main.js' in this run's process groups ($scope_pgids) while the session is up, found $backend_proc_count:" >&2
    printf '%s\n' "$backends" >&2
    result=1
  fi

  stop_shell_display

  # D-125's positive control: a DIFFERENT profile must get its own window
  # and its own backend.
  local control_profile
  control_profile="$(mktemp -d)"; track_temp "$control_profile"
  start_shell_display "$control_profile"
  local control_rc=$?
  if [ "$control_rc" -ne 0 ]; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- positive control (different profile) could not launch" >&2
    return 1
  fi
  local control_log="$BROWSER_LOG"
  local control_pid="$BROWSER_SPAWN_PID"

  local control_deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$control_deadline" ]; do
    sentinel_present 'POWERBROWSER_BACKEND_READY ' "$control_log" && break
    if ! kill -0 "$control_pid" 2>/dev/null; then
      echo "side05-no-second-backend: FAIL -- SIDE-05 -- positive control exited before POWERBROWSER_BACKEND_READY appeared; log:" >&2
      cat "$control_log" >&2
      stop_shell_display
      return 1
    fi
    sleep 0.5
  done
  if ! sentinel_present 'POWERBROWSER_BACKEND_READY ' "$control_log"; then
    echo "side05-no-second-backend: FAIL -- SIDE-05 -- positive control (different profile) never announced its own backend -- the guard is not profile-scoped, it broke second launches globally; log:" >&2
    cat "$control_log" >&2
    result=1
  else
    local control_backend_pid
    control_backend_pid="$(backend_ready_pids "$control_log" | head -1)"
    if [ -z "$control_backend_pid" ] || [ "$control_backend_pid" = "$first_backend_pid" ]; then
      echo "side05-no-second-backend: FAIL -- SIDE-05 -- positive control did not announce a distinct backend pid of its own ($control_backend_pid)" >&2
      result=1
    fi
  fi

  stop_shell_display
  return "$result"
}

# --- CR-01 regression (05-REVIEW.md): the sidecar state file must be
# profile-scoped -----------------------------------------------------------
#
# The bug this guards against: TheiaService._resolveConfigDir()/
# _stateFilePath were keyed only on XDG_CONFIG_HOME/HOME, with no profile
# component -- every instance under the same OS user shared one
# sidecar-state.json. A second instance's startup reap (_reapLeftover,
# D-111's verified-identity check) would then find a FIRST, still-healthy
# instance's backend pid in that shared file, confirm its live start ticks
# matched exactly (they genuinely did -- the identity check itself was
# sound, only its scope was wrong), and SIGTERM it.
#
# Unlike side05-no-second-backend (which always stops the first instance
# before starting a different-profile control -- SIDE-05's own timing gap
# that let CR-01 through Phase 5's own review), this check keeps instance A
# RUNNING and launches instance B under a genuinely different profile while
# A is still alive, then asserts A's backend survived B's entire startup
# (including B's own _reapLeftover pass, already run by the time B
# announces its own POWERBROWSER_BACKEND_READY). Reuses start_shell_display
# (never headless -- SIDE-05's own display requirement applies equally
# here, since this is the same nsRemoteService-adjacent profile-keyed
# machinery) for both launches; no new launch scaffolding.
check_cr01_different_profile_backend_survives() {
  local profile_a profile_b result=0
  profile_a="$(mktemp -d)"; track_temp "$profile_a"
  profile_b="$(mktemp -d)"; track_temp "$profile_b"

  # Whether *we* end up owning the Xvfb this check starts (so cleanup below
  # is the one place that tears it down) vs. an already-real $DISPLAY this
  # check must never touch.
  local had_display=0
  [ -n "${DISPLAY:-}" ] && had_display=1
  local prev_display="${DISPLAY:-}"

  local rc
  start_shell_display "$profile_a"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- could not launch instance A (no usable display or missing binary)" >&2
    return "$rc"
  fi
  local log_a="$BROWSER_LOG"
  local pid_a="$BROWSER_SPAWN_PID"
  local display_to_use="$DISPLAY_IN_USE"
  # This check tracks pid_a/pid_b itself (two concurrent instances, not
  # one) -- clear the shared global so a second start_shell_display() call
  # below for instance B doesn't leave the trap-driven cleanup() confused
  # about which pid is which; this function kills both explicitly itself.
  BROWSER_SPAWN_PID=""

  local pid_b="" log_b=""

  local a_deadline=$((SECONDS + 60)) a_ready=0
  while [ "$SECONDS" -lt "$a_deadline" ]; do
    if sentinel_present 'POWERBROWSER_BACKEND_READY ' "$log_a"; then
      a_ready=1
      break
    fi
    if ! kill -0 "$pid_a" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if [ "$a_ready" -ne 1 ]; then
    echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- instance A never announced POWERBROWSER_BACKEND_READY within 60s; log:" >&2
    cat "$log_a" >&2
    result=1
  fi

  local backend_pid_a=""
  if [ "$a_ready" -eq 1 ]; then
    backend_pid_a="$(backend_ready_pids "$log_a" | head -1)"
    # Must be alive BEFORE instance B launches, or "still alive afterward"
    # proves nothing (D-125's own established discipline for this class of
    # check).
    if [ -z "$backend_pid_a" ] || [ ! -e "/proc/$backend_pid_a" ]; then
      echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- instance A's announced backend pid is not running before instance B launches; the check cannot prove anything" >&2
      result=1
      backend_pid_a=""
    fi
  fi

  if [ -n "$backend_pid_a" ]; then
    # Reuse instance A's exact display for B (the `-n "${DISPLAY:-}"`
    # branch in start_shell_display), rather than spinning a second Xvfb --
    # CR-01 is about profile scoping, not display plumbing.
    export DISPLAY="$display_to_use"
    start_shell_display "$profile_b"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- could not launch instance B under a different profile" >&2
      result=1
    else
      log_b="$BROWSER_LOG"
      pid_b="$BROWSER_SPAWN_PID"
      BROWSER_SPAWN_PID=""

      local b_deadline=$((SECONDS + 60)) b_ready=0
      while [ "$SECONDS" -lt "$b_deadline" ]; do
        if sentinel_present 'POWERBROWSER_BACKEND_READY ' "$log_b"; then
          b_ready=1
          break
        fi
        if ! kill -0 "$pid_b" 2>/dev/null; then
          break
        fi
        sleep 0.5
      done
      if [ "$b_ready" -ne 1 ]; then
        echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- instance B never announced POWERBROWSER_BACKEND_READY within 60s; log:" >&2
        cat "$log_b" >&2
        result=1
      fi

      # The headline assertion: by the time B has announced its own
      # POWERBROWSER_BACKEND_READY, B's start() has already run _reapLeftover()
      # (called before B's own first spawn attempt) -- pre-fix, that reap
      # read the SHARED state file, found A's still-healthy pid, and
      # SIGTERM'd it.
      if [ ! -e "/proc/$backend_pid_a" ]; then
        echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- instance A's backend (pid $backend_pid_a) was killed by instance B's startup under a DIFFERENT profile -- the sidecar state file is not profile-scoped; log A:" >&2
        cat "$log_a" >&2
        echo "cr01-different-profile-backend-survives: log B:" >&2
        cat "$log_b" >&2
        result=1
      fi

      # A second, narrower invariant: B must announce its OWN distinct
      # backend pid, never A's -- catches a scoping bug that merely
      # deduplicates spawns rather than one that kills the other instance.
      local backend_pid_b
      backend_pid_b="$(backend_ready_pids "$log_b" | head -1)"
      if [ -n "$backend_pid_b" ] && [ "$backend_pid_b" = "$backend_pid_a" ]; then
        echo "cr01-different-profile-backend-survives: FAIL -- CR-01 -- instance B announced the SAME backend pid as instance A ($backend_pid_a) -- two different profiles must never share a backend" >&2
        result=1
      fi
    fi
  fi

  if [ -n "$pid_b" ]; then
    kill -- "-$pid_b" 2>/dev/null || kill "$pid_b" 2>/dev/null || true
    wait "$pid_b" 2>/dev/null || true
  fi
  if [ -n "$pid_a" ]; then
    kill -- "-$pid_a" 2>/dev/null || kill "$pid_a" 2>/dev/null || true
    wait "$pid_a" 2>/dev/null || true
  fi
  if [ "$had_display" -eq 0 ]; then
    stop_virtual_display
  fi
  if [ -n "$prev_display" ]; then
    export DISPLAY="$prev_display"
  else
    unset DISPLAY
  fi

  return "$result"
}

# --- shell-csp-inline-attrs -------------------------------------------------
#
# powerbrowser.xhtml declares `default-src chrome:` with no 'unsafe-inline', and
# Gecko applies that policy to inline style/event-handler ATTRIBUTES too:
# nsStyledElement::ParseStyleAttribute calls nsStyleUtil::CSPAllowsInlineStyle,
# whose STYLE_SRC_ATTR lookup falls back to default-src, and simply never
# builds the declaration. Phase 5 hid both deck overlays with
# `style="display:none;"`; the attributes were inert, so their `display: flex`
# base rules won and both overlays painted over a healthy Theia at every
# startup. Gecko logs NOTHING to stdout/stderr when it drops the declaration
# (only nsIConsoleService, reachable via MOZ_LOG=PageMessages:5), so no
# launch-log grep can catch this -- verified live against the pre-fix build.
# Static markup is the only place it is observable for free.
#
# `setAttribute("style"|"on...")` in the shipped scripts is banned for the
# same reason: it routes through the same CSP-checked attribute-parse path.
# CSSOM writes (`el.style.display = ...`) are deliberately NOT banned -- they
# never touch attribute parsing and are how the shell legitimately shows a
# layer.
#
# Prints "  file:line: reason" per offense on stderr; 0 clean, 1 offenses,
# 2 nothing was scanned (a clean sweep of an empty file list is not a pass).
scan_inline_attrs() {
  node -e '
    const fs = require("fs");
    const files = process.argv.slice(1);
    if (!files.length) { process.exit(2); }
    let bad = 0;
    for (const f of files) {
      let src;
      try { src = fs.readFileSync(f, "utf8"); } catch { console.error(`  ${f}: unreadable`); bad++; continue; }
      // Blank comments before matching (preserving newlines, so the reported
      // line numbers stay exact) -- a comment explaining this very rule, or
      // the header comment in powerbrowser.css, must not flag itself.
      const blank = (m) => m.replace(/[^\n]/g, " ");
      src = src.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank);
      // Branch on extension: the markup attribute pattern applied to a script
      // false-positives on ordinary identifiers (`once`, `only`, ...).
      const re = /\.(xhtml|html|xul)$/i.test(f)
        ? /[\s"\x27](style|on[a-z]+)\s*=\s*["\x27]/gi
        : /setAttribute\s*\(\s*["\x27](style|on[a-z]+)["\x27]/gi;
      let m;
      while ((m = re.exec(src)) !== null) {
        console.error(`  ${f}:${src.slice(0, m.index).split("\n").length}: inline ${m[1]}= attribute`);
        bad++;
      }
    }
    process.exit(bad ? 1 : 0);
  ' "$@"
}

check_shell_csp_inline_attrs() {
  local shell_dir xhtml result=0
  shell_dir="$REPO_ROOT/powerbrowser/shell"
  xhtml="$shell_dir/powerbrowser.xhtml"

  # The policy is the whole justification for the ban. If it ever goes away,
  # or gains 'unsafe-inline', that is a decision to argue explicitly -- not
  # something this check should quietly start tolerating.
  local csp_line
  csp_line="$(grep -i 'http-equiv="Content-Security-Policy"' "$xhtml")"
  if [ -z "$csp_line" ]; then
    echo "shell-csp-inline-attrs: FAIL -- powerbrowser.xhtml no longer declares a Content-Security-Policy meta" >&2
    result=1
  elif grep -qi 'unsafe-inline' <<<"$csp_line"; then
    echo "shell-csp-inline-attrs: FAIL -- the shell CSP was loosened with 'unsafe-inline' ($csp_line); re-argue this check rather than weakening the policy" >&2
    result=1
  fi

  # Self-test first: a scanner that silently matched nothing would report a
  # clean tree forever. The fixture reproduces the pre-fix markup verbatim
  # plus one planted handler, and a comment decoy that must NOT be counted --
  # so "exactly 2", never "at least 1".
  local fixture_dir fixture rc rows
  fixture_dir="$(mktemp -d)"; track_temp "$fixture_dir"
  fixture="$fixture_dir/fixture.xhtml"
  cat > "$fixture" <<'EOF'
<!-- decoy: style="display:none;" inside a comment must not be flagged -->
<div id="powerbrowser-error" style="display:none;"></div>
<button id="powerbrowser-error-retry" onclick="powerbrowserRetry()">Retry</button>
<div id="powerbrowser-loading">PowerBrowser</div>
EOF
  rows="$(scan_inline_attrs "$fixture" 2>&1 >/dev/null)"
  rc=$?
  if [ "$rc" -ne 1 ] || [ "$(grep -c . <<<"$rows")" -ne 2 ]; then
    echo "shell-csp-inline-attrs: FAIL -- self-test: the scanner did not report exactly 2 offenses on the known-bad fixture (rc=$rc):" >&2
    echo "$rows" >&2
    result=1
  fi

  # Scan every markup/script file jar.mn actually ships -- derived, never
  # hardcoded, so a file added to the package is covered the day it lands.
  local -a files=()
  local rel
  while read -r rel; do
    [ -z "$rel" ] && continue
    if [ ! -f "$shell_dir/$rel" ]; then
      echo "shell-csp-inline-attrs: FAIL -- jar.mn ships '$rel' but $shell_dir/$rel does not exist" >&2
      result=1
      continue
    fi
    files+=("$shell_dir/$rel")
  done < <(sed -E 's/#.*//' "$shell_dir/jar.mn" | grep -oE '\(([^)]+\.(xhtml|html|xul|js|mjs))\)' | tr -d '()')

  if [ "${#files[@]}" -eq 0 ]; then
    echo "shell-csp-inline-attrs: FAIL -- parsed zero shippable files out of $shell_dir/jar.mn; nothing was scanned" >&2
    return 1
  fi

  if ! scan_inline_attrs "${files[@]}"; then
    echo "shell-csp-inline-attrs: FAIL -- the shipped chrome surface contains inline attributes the CSP silently drops (see rows above); put the state in powerbrowser.css or set it from JS via the CSSOM instead" >&2
    result=1
  fi

  return "$result"
}

# --- SIDE-04 addendum: the supervisor handshake must not leak the token ----
#
# Two separate exposures of TheiaService._spawnAndGate's handshake, asserted
# together because a fix for either one alone leaves the credential reachable.
#
#   A. THE BACKEND'S OWN /proc/<pid>/environ. This is the exec-time snapshot.
#      It is NOT rewritten by `delete process.env.X` (glibc's unsetenv edits
#      the pointer array, never the original stack region), it stays readable
#      by every same-uid process for the whole life of the backend, and with
#      Yama's ptrace_scope=1 -- the setting on this project's own target --
#      /proc/<pid>/mem is unreadable while this file is not. So it is the one
#      place a credential in the environment stays legible to a co-resident
#      process: one `tr '\0' '\n' < /proc/<backend>/environ` from any process
#      the user runs recovers it, and that recovered value authenticates. The
#      only fix is not putting the token in the environment at all, which is
#      why the supervisor writes it on the backend's stdin pipe instead
#      (PowerBrowserAPI.writeStdinLine -> powerbrowser-env.ts's readTokenFromStdin).
#      POWERBROWSER_TOKEN must therefore be absent here entirely.
#      POWERBROWSER_SUPERVISED is expected to be present -- it is a marker, not a
#      secret -- so only the token is asserted.
#
#   B. EVERY CHILD'S environ. Node's process.env is inherited by every child
#      the backend spawns, and a child's environ is built fresh from the
#      parent's LIVE process.env at fork/exec -- which is what makes a child
#      the only witness for the module-load scrub in powerbrowser-env.ts.
#      Without that scrub POWERBROWSER_SUPERVISED reaches every IDE terminal,
#      task, debug adapter and the plugin host running third-party
#      extensions, so a NESTED backend (`yarn start`, smoke-theia.sh,
#      verify-phase-04.sh) arms a watchdog nobody supervises and dies on its
#      own stdin EOF. The backend forks a parcel filesystem-watcher IPC child
#      unconditionally at startup (@theia/filesystem's
#      filesystem-backend-module.js, `env: process.env`), with no frontend and
#      no workspace, so a child reliably exists to scan; a terminal
#      ShellProcess -- the exact mergeProcessEnv path from the defect --
#      appears too whenever one is open, which is why the scan covers every
#      child rather than one named process.
#
# Both are asserted from OUTSIDE the process, on a real supervised launch,
# because the only in-process alternative is trusting the code under test.
#
# The VERIFY05_LEAK_CANARY export IS this check's self-test, and it runs on
# every invocation rather than behind a flag: it rides the identical chain
# (harness -> browser -> spawnProcess environmentAppend:true -> backend
# process.env -> fork) through the identical loop, grep and procfs read, and
# differs only in its name. It must be found in the backend's own environ
# (self-test for A) and in a child's (self-test for B). A scanner that cannot
# see a variable that IS there proves nothing by failing to see the one that
# should not be, so its absence is a FAIL, never a vacuous pass. Same for "no
# children" and "no readable environ".
#
# POWERBROWSER_SHELL_SWAP is the positive control for the replacement channel: it
# is only ever printed after _pollUntilHealthy got a 200 from
# /powerbrowser/health, and that probe authenticates with the token. A backend
# that never received the stdin line exits 78 and never reaches it, so a
# passing scan cannot be bought by simply never delivering a token.
#
# On its own this check is satisfiable by never setting POWERBROWSER_SUPERVISED
# at all, which would silently disarm the dies-with-the-browser watchdog. It
# is only meaningful alongside side04-sigkill-no-orphan and
# side04-unsupervised-backend-survives, which prove the marker still arms and
# still stays inert.
check_side04_token_not_in_environment() {
  local result=0
  local canary="verify05-canary-$$-${RANDOM}"
  export VERIFY05_LEAK_CANARY="$canary"

  if ! start_shell; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- could not launch the shell" >&2
    unset VERIFY05_LEAK_CANARY
    return 1
  fi
  local log="$BROWSER_LOG"

  local deadline=$((SECONDS + 90)) backend_pid=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    backend_pid="$(backend_ready_pids "$log" | tail -n1)"
    [ -n "$backend_pid" ] && break
    kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null || break
    sleep 0.5
  done
  if [ -z "$backend_pid" ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- the backend never announced POWERBROWSER_BACKEND_READY within 90s; last 30 log lines:" >&2
    tail -30 "$log" >&2
    stop_shell
    unset VERIFY05_LEAK_CANARY
    return 1
  fi

  # Positive control for the stdin credential channel (see the header): the
  # swap is printed only after a token-authenticated 200 from
  # /powerbrowser/health.
  local swap_deadline=$((SECONDS + 60)) swapped=0
  while [ "$SECONDS" -lt "$swap_deadline" ]; do
    if grep -q '^POWERBROWSER_SHELL_SWAP ' "$log"; then
      swapped=1
      break
    fi
    kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null || break
    sleep 0.5
  done
  if [ "$swapped" -eq 0 ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- the shell never printed POWERBROWSER_SHELL_SWAP, so the token handed over stdin never authenticated a health probe; an environ scan that finds no token would only mean no token was ever delivered. Last 30 log lines:" >&2
    tail -30 "$log" >&2
    result=1
  fi

  # Exposure A: the backend's own exec-time environment snapshot.
  local backend_env
  backend_env="$(tr '\0' '\n' < "/proc/$backend_pid/environ" 2>/dev/null)"
  if [ -z "$backend_env" ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- backend pid $backend_pid has no readable /proc/<pid>/environ; nothing was scanned, so a clean result would prove nothing" >&2
    result=1
  elif ! grep -qxF "VERIFY05_LEAK_CANARY=$canary" <<<"$backend_env"; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- self-test: VERIFY05_LEAK_CANARY was exported into this harness but is absent from backend pid $backend_pid's own /proc/<pid>/environ, so the harness -> browser -> spawnProcess chain this scan reads is broken and a clean scan means nothing" >&2
    result=1
  elif grep -q '^POWERBROWSER_TOKEN=' <<<"$backend_env"; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- backend pid $backend_pid carries POWERBROWSER_TOKEN= in its OWN /proc/<pid>/environ. That file is the exec-time snapshot: no process.env delete rewrites it, and it stays readable by every same-uid process for the life of the backend. Hand the token over the stdin pipe instead (PowerBrowserAPI.writeStdinLine)" >&2
    result=1
  fi

  # Exposure B: every child's environment, built from the backend's LIVE
  # process.env at fork/exec.
  local kids="" kid_deadline=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$kid_deadline" ]; do
    kids="$(pgrep -P "$backend_pid" 2>/dev/null)"
    [ -n "$kids" ] && break
    sleep 0.5
  done
  if [ -n "$kids" ]; then
    # The watcher fork lands within a second of readiness; a terminal
    # ShellProcess can land later. Re-enumerate after a settle window so the
    # scan covers whatever else appeared, instead of only the first child.
    sleep 5
    kids="$(pgrep -P "$backend_pid" 2>/dev/null)"
  fi

  local read_any=0 saw_canary=0 kid env_dump cmd var
  for kid in $kids; do
    env_dump="$(tr '\0' '\n' < "/proc/$kid/environ" 2>/dev/null)"
    [ -z "$env_dump" ] && continue
    read_any=1
    cmd="$(tr '\0' ' ' < "/proc/$kid/cmdline" 2>/dev/null | cut -c1-100)"
    if grep -qxF "VERIFY05_LEAK_CANARY=$canary" <<<"$env_dump"; then
      saw_canary=1
    fi
    # The trailing '=' anchors each name: without it POWERBROWSER_TOKEN would
    # also match a POWERBROWSER_TOKEN_DISABLE line and misattribute the leak.
    for var in POWERBROWSER_TOKEN POWERBROWSER_SUPERVISED POWERBROWSER_TOKEN_DISABLE; do
      if grep -q "^$var=" <<<"$env_dump"; then
        echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- backend child pid $kid ($cmd) inherited $var from the backend's process.env" >&2
        result=1
      fi
    done
  done

  if [ -z "$kids" ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- backend pid $backend_pid had no children at all; nothing was scanned, so a clean result would prove nothing" >&2
    result=1
  elif [ "$read_any" -eq 0 ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- no child of backend pid $backend_pid had a readable /proc/<pid>/environ; nothing was scanned" >&2
    result=1
  elif [ "$saw_canary" -eq 0 ]; then
    echo "side04-token-not-in-environment: FAIL -- SIDE-04 -- self-test: VERIFY05_LEAK_CANARY was exported into this harness but reached no backend child, so the harness -> browser -> backend -> child environment chain this check probes is broken and a clean scan means nothing" >&2
    result=1
  fi

  stop_shell
  unset VERIFY05_LEAK_CANARY
  return "$result"
}

# ============================================================================
# PORTED FROM verify-phase-03.sh -- the patch-surface, allowlist and
# branding-variant checks and their self-tests.
# ============================================================================

# --- --quick's standalone .desktop/config.status equality check ---
check_desktop_entry_quick() {
  node -e '
    const fs = require("fs");
    const path = require("path");
    const repoRoot = process.argv[1];
    const desktopPath = path.join(repoRoot, "powerbrowser", "powerbrowser.desktop");
    const configStatusPath = path.join(repoRoot, "objdir", "config.status");

    if (!fs.existsSync(desktopPath)) {
      console.error(`check-desktop-entry-quick: FAIL -- ${desktopPath} does not exist`);
      process.exit(1);
    }
    if (!fs.existsSync(configStatusPath)) {
      console.error(`check-desktop-entry-quick: FAIL -- ${configStatusPath} does not exist`);
      process.exit(1);
    }

    const configText = fs.readFileSync(configStatusPath, "utf8");
    function readVar(name) {
      const re = new RegExp("\x27" + name + "\x27:\\s*\x27([^\x27]*)\x27");
      const m = configText.match(re);
      return m ? m[1] : undefined;
    }
    const expectedName = readVar("MOZ_APP_DISPLAYNAME");
    const expectedWmClass = readVar("MOZ_APP_REMOTINGNAME");

    const lines = fs.readFileSync(desktopPath, "utf8").split(/\r?\n/);
    const nameLine = lines.find(l => l.startsWith("Name="));
    const wmClassLine = lines.find(l => l.startsWith("StartupWMClass="));
    const name = nameLine !== undefined ? nameLine.slice("Name=".length) : undefined;
    const wmClass = wmClassLine !== undefined ? wmClassLine.slice("StartupWMClass=".length) : undefined;

    if (expectedName && expectedWmClass && name === expectedName && wmClass === expectedWmClass) {
      console.log(`check-desktop-entry-quick: PASS -- Name=${name}, StartupWMClass=${wmClass}`);
      process.exit(0);
    }
    console.error(`check-desktop-entry-quick: FAIL -- Name=${JSON.stringify(name)} (expected ${JSON.stringify(expectedName)}), StartupWMClass=${JSON.stringify(wmClass)} (expected ${JSON.stringify(expectedWmClass)})`);
    process.exit(1);
  ' "$REPO_ROOT"
}

# --- the allowlist schema check ---
check_allowlist_schema() {
  # The accepted disposition set is derived from scripts/lib/endpoint-verdict.mjs DISPOSITIONS,
  # the one verdict rule, never a literal list here (UPD-33).
  node --input-type=module -e '
    import fs from "node:fs";
    import { pathToFileURL } from "node:url";
    const [allowlistPath, libPath] = process.argv.slice(1);
    const { DISPOSITIONS } = await import(pathToFileURL(libPath).href);
    if (!fs.existsSync(allowlistPath)) {
      console.error(`allowlist-schema: FAIL -- ${allowlistPath} does not exist`);
      process.exit(1);
    }
    const a = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    if (!Array.isArray(a.hosts) || !Array.isArray(a.prefs)) {
      console.error("allowlist-schema: FAIL -- hosts/prefs are not both arrays");
      process.exit(1);
    }
    for (const h of a.hosts) {
      if (!h.host || !DISPOSITIONS.includes(h.disposition) || !h.reason) {
        console.error(`allowlist-schema: FAIL -- malformed host entry (disposition must be one of ${DISPOSITIONS.join(", ")}): ${JSON.stringify(h)}`);
        process.exit(1);
      }
    }
    for (const p of a.prefs) {
      if (!p.name || p.expect === undefined || !p.reason) {
        console.error(`allowlist-schema: FAIL -- malformed pref entry: ${JSON.stringify(p)}`);
        process.exit(1);
      }
    }
    console.log(`allowlist-schema: PASS -- ${a.hosts.length} host(s), ${a.prefs.length} pref(s)`);
  ' "$REPO_ROOT/powerbrowser/endpoint-allowlist.json" "$REPO_ROOT/scripts/lib/endpoint-verdict.mjs"
}

# --- allowlist-to-document consistency (03-VERIFICATION.md Gap 2) ---
#
# Shared inner helper: takes an allowlist path as its one argument, always
# reads the real ROADMAP.md/REQUIREMENTS.md (the documents Task 1 amended).
# Selects every allow-dispositioned mozilla.com/mozilla.net host and requires
# a whole-token occurrence of each in both documents. Whole-token matching is
# load-bearing: a plain substring search would let a documented host's own
# suffix (e.g. "cdn.mozilla.net" inside "content-signature-2.cdn.mozilla.net")
# pass vacuously, so the regex requires the character on each side of the
# match to be absent or outside the hostname character class
# (letters/digits/dot/hyphen). An empty filtered set is a FAIL, not a vacuous
# PASS. Output (host list order, violation order) is fully determined by the
# allowlist's own on-disk order plus a sort of the violation list, so two runs
# against unchanged input are byte-identical.
_allowlist_doc_consistency_impl() {
  local allowlist_path="$1"
  node -e '
    const fs = require("fs");
    const [allowlistPath, roadmapPath, requirementsPath] = process.argv.slice(1);
    const a = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    const roadmap = fs.readFileSync(roadmapPath, "utf8");
    const requirements = fs.readFileSync(requirementsPath, "utf8");

    const hosts = (a.hosts || [])
      .filter(h => h.disposition === "allow" && /(^|\.)mozilla\.(com|net)$/i.test(h.host))
      .map(h => h.host);

    if (hosts.length === 0) {
      console.error(`allowlist-doc-consistency: FAIL -- filter matched no allow-dispositioned mozilla.com/mozilla.net host in ${allowlistPath}`);
      process.exit(1);
    }

    function hasWholeToken(text, host) {
      const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^A-Za-z0-9.-])" + escaped + "($|[^A-Za-z0-9.-])");
      return re.test(text);
    }

    const violations = [];
    let roadmapFound = 0, requirementsFound = 0;
    for (const host of hosts) {
      const inRoadmap = hasWholeToken(roadmap, host);
      const inRequirements = hasWholeToken(requirements, host);
      if (inRoadmap) roadmapFound++;
      if (inRequirements) requirementsFound++;
      if (!inRoadmap || !inRequirements) {
        const missing = [];
        if (!inRoadmap) missing.push("ROADMAP.md");
        if (!inRequirements) missing.push("REQUIREMENTS.md");
        violations.push(`${host}: missing from ${missing.join(", ")}`);
      }
    }
    violations.sort();

    if (violations.length > 0) {
      console.error(`allowlist-doc-consistency: FAIL -- ${hosts.length} Mozilla allow host(s) checked, ${violations.length} violation(s):`);
      for (const v of violations) console.error(`  ${v}`);
      process.exit(1);
    }

    console.log(`allowlist-doc-consistency: PASS -- ${hosts.length} Mozilla allow host(s) checked, found in both ROADMAP.md (${roadmapFound}) and REQUIREMENTS.md (${requirementsFound})`);
  ' "$allowlist_path" "$REPO_ROOT/.planning/ROADMAP.md" "$REPO_ROOT/.planning/REQUIREMENTS.md"
}

# Argument-free wrapper for the CHECKS array (see the dispatch guard below --
# a function-branch CHECKS entry must be a bare name, never a command carrying
# arguments).
check_allowlist_doc_consistency() {
  _allowlist_doc_consistency_impl "$REPO_ROOT/powerbrowser/endpoint-allowlist.json"
}

# Plants a temp copy of the real allowlist carrying two additional allow
# entries -- one undocumented host, one that is a proper suffix of two
# genuinely-documented hosts (proving whole-token, not substring, matching --
# a bare substring search would let this second one pass vacuously) -- and
# requires the helper to reject both. Never writes to the real allowlist; the
# temp copy is registered with track_temp so the script's own trap-covered
# cleanup() removes it on every exit path, including an interrupt mid-test.
check_allowlist_doc_consistency_self_test() {
  local real="$REPO_ROOT/powerbrowser/endpoint-allowlist.json"
  local tmp
  tmp="$(mktemp)"
  track_temp "$tmp"

  node -e '
    const fs = require("fs");
    const [realPath, outPath] = process.argv.slice(1);
    const a = JSON.parse(fs.readFileSync(realPath, "utf8"));
    a.hosts.push({
      host: "powerbrowser-selftest-control.cdn.mozilla.net",
      disposition: "allow",
      reason: "allowlist-doc-consistency-self-test: undocumented host, must be rejected"
    });
    a.hosts.push({
      host: "cdn.mozilla.net",
      disposition: "allow",
      reason: "allowlist-doc-consistency-self-test: proper suffix of two documented hosts, must be rejected (proves whole-token matching)"
    });
    fs.writeFileSync(outPath, JSON.stringify(a, null, 2));
  ' "$real" "$tmp"

  local out
  if out="$(_allowlist_doc_consistency_impl "$tmp" 2>&1)"; then
    echo "allowlist-doc-consistency-self-test: FAIL -- planted undocumented/suffix hosts were NOT rejected" >&2
    echo "$out" >&2
    return 1
  fi

  if echo "$out" | grep -qF 'powerbrowser-selftest-control.cdn.mozilla.net' \
     && echo "$out" | grep -qE '^  cdn\.mozilla\.net:'; then
    echo "allowlist-doc-consistency-self-test: PASS -- both planted hosts (undocumented control, suffix-adjacency) correctly rejected"
    return 0
  fi

  echo "allowlist-doc-consistency-self-test: FAIL -- rejected, but output doesn't name both planted hosts" >&2
  echo "$out" >&2
  return 1
}

# --- branding-variant-divergence (03-11-PLAN.md, closes BRAND-06's gap) ---
#
# Shared inner helper: takes four path arguments -- dev brand.properties,
# release brand.properties, dev branding pref file, release branding pref
# file -- so the self-test can point it at temp files without ever touching
# the real tree. Asserts all four of: (1) dev brandFullName == "PowerBrowser
# Dev", (2) release brandFullName == "PowerBrowser", (3) the dev pref
# file sets
# browser.tabs.inTitlebar to 0 via a pref() call, (4) the release pref file
# sets no value for that same pref name. A missing/unreadable input path is
# a FAIL naming that path, never a skip.
_branding_variant_divergence_impl() {
  local dev_properties="$1"
  local release_properties="$2"
  local dev_pref="$3"
  local release_pref="$4"
  node -e '
    const fs = require("fs");
    const [devPropPath, relPropPath, devPrefPath, relPrefPath] = process.argv.slice(1);

    function readPropsFullName(path) {
      if (!fs.existsSync(path)) {
        console.error(`branding-variant-divergence: FAIL -- ${path} does not exist`);
        process.exit(1);
      }
      let text;
      try {
        text = fs.readFileSync(path, "utf8");
      } catch (err) {
        console.error(`branding-variant-divergence: FAIL -- ${path} could not be read: ${err.message}`);
        process.exit(1);
      }
      // Selection and matching both operate on the TRIMMED line -- WR-01
      // (03-REVIEW.md) already fixed this exact selection-vs-matching
      // mismatch once in scripts/verify-branding-identity.mjs; do not
      // reintroduce it here.
      const line = text.split(/\r?\n/).find(l => l.trim().startsWith("brandFullName"));
      if (!line) {
        console.error(`branding-variant-divergence: FAIL -- ${path} has no brandFullName entry`);
        process.exit(1);
      }
      const trimmed = line.trim();
      const m = trimmed.match(/^brandFullName\s*=\s*(.*)$/);
      if (!m) {
        console.error(`branding-variant-divergence: FAIL -- ${path} brandFullName line has an unexpected shape: ${JSON.stringify(line)}`);
        process.exit(1);
      }
      // .properties values are unquoted -- trim trailing whitespace only,
      // compare with exact string equality, never includes/case-insensitive.
      return m[1].trim();
    }

    function readTitlebarPref(path) {
      if (!fs.existsSync(path)) {
        console.error(`branding-variant-divergence: FAIL -- ${path} does not exist`);
        process.exit(1);
      }
      let text;
      try {
        text = fs.readFileSync(path, "utf8");
      } catch (err) {
        console.error(`branding-variant-divergence: FAIL -- ${path} could not be read: ${err.message}`);
        process.exit(1);
      }
      for (const l of text.split(/\r?\n/)) {
        const trimmed = l.trim();
        // A mention inside a `//` line comment must not satisfy this --
        // skip such lines entirely rather than regex-matching them.
        if (trimmed.startsWith("//")) continue;
        const m = trimmed.match(/pref\(\s*"browser\.tabs\.inTitlebar"\s*,\s*([^)]+?)\s*\)/);
        if (m) return m[1].trim();
      }
      return undefined; // no pref() call sets this name at all
    }

    const devValue = readPropsFullName(devPropPath);
    const relValue = readPropsFullName(relPropPath);
    const devTitlebar = readTitlebarPref(devPrefPath);
    const relTitlebar = readTitlebarPref(relPrefPath);

    const failures = [];
    if (devValue !== "PowerBrowser Dev") {
      failures.push(`dev brand.properties brandFullName=${JSON.stringify(devValue)} (expected "PowerBrowser Dev") at ${devPropPath}`);
    }
    if (relValue !== "PowerBrowser") {
      failures.push(`release brand.properties brandFullName=${JSON.stringify(relValue)} (expected "PowerBrowser") at ${relPropPath}`);
    }
    if (devTitlebar !== "0") {
      failures.push(`dev pref file browser.tabs.inTitlebar=${JSON.stringify(devTitlebar)} (expected a pref() call setting 0) at ${devPrefPath}`);
    }
    if (relTitlebar !== undefined) {
      failures.push(`release pref file sets browser.tabs.inTitlebar=${JSON.stringify(relTitlebar)} (expected no pref() call for this name) at ${relPrefPath}`);
    }

    if (failures.length > 0) {
      for (const f of failures) console.error(`branding-variant-divergence: FAIL -- ${f}`);
      process.exit(1);
    }

    console.log(`branding-variant-divergence: PASS -- dev brand.properties brandFullName=${JSON.stringify(devValue)}, release brand.properties brandFullName=${JSON.stringify(relValue)}, dev titlebar pref=${JSON.stringify(devTitlebar)}, release titlebar pref=unset`);
  ' "$dev_properties" "$release_properties" "$dev_pref" "$release_pref"
}

# Argument-free wrapper for the CHECKS array -- feeds the four INSTALLED
# paths under objdir/dist/bin and objdir-release/dist/bin (symlinks into
# powerbrowser/branding/<variant>/, D-70 tier 1), proving the divergence reaches
# a built tree, not just the repo-root source.
check_branding_variant_divergence() {
  _branding_variant_divergence_impl \
    "$REPO_ROOT/objdir/dist/bin/browser/chrome/en-US/locale/branding/brand.properties" \
    "$REPO_ROOT/objdir-release/dist/bin/browser/chrome/en-US/locale/branding/brand.properties" \
    "$REPO_ROOT/objdir/dist/bin/browser/defaults/preferences/firefox-branding.js" \
    "$REPO_ROOT/objdir-release/dist/bin/browser/defaults/preferences/firefox-branding.js"
}

# Synthesises its own known-good quartet into mktemp files (registered with
# track_temp -- the script's existing trap-covered cleanup() removes them on
# every exit path), asserts the comparator goes green on it, then re-runs it
# twice more -- once with the dev suffix stripped, once with the titlebar
# default also present in the release pref file -- requiring each mutation
# to be rejected by name (D-88: a working positive control in both
# directions). Synthesising rather than copying the repo's current files
# makes this self-test's verdict independent of whether Task 2 has run yet.
check_branding_variant_divergence_self_test() {
  local dev_props rel_props dev_pref rel_pref
  dev_props="$(mktemp)"; track_temp "$dev_props"
  rel_props="$(mktemp)"; track_temp "$rel_props"
  dev_pref="$(mktemp)"; track_temp "$dev_pref"
  rel_pref="$(mktemp)"; track_temp "$rel_pref"

  printf 'brandFullName=PowerBrowser Dev\n' > "$dev_props"
  printf 'brandFullName=PowerBrowser\n' > "$rel_props"
  printf 'pref("browser.tabs.inTitlebar", 0);\n' > "$dev_pref"
  printf '// release: no titlebar override\n' > "$rel_pref"

  local out
  if ! out="$(_branding_variant_divergence_impl "$dev_props" "$rel_props" "$dev_pref" "$rel_pref" 2>&1)"; then
    echo "branding-variant-divergence-self-test: FAIL -- synthesised correct quartet did not go green" >&2
    echo "$out" >&2
    return 1
  fi

  # Mutation 1: strip the dev suffix.
  local dev_props_bad
  dev_props_bad="$(mktemp)"; track_temp "$dev_props_bad"
  printf 'brandFullName=PowerBrowser\n' > "$dev_props_bad"
  local out1
  if out1="$(_branding_variant_divergence_impl "$dev_props_bad" "$rel_props" "$dev_pref" "$rel_pref" 2>&1)"; then
    echo "branding-variant-divergence-self-test: FAIL -- planted properties-suffix mutation was NOT rejected" >&2
    echo "$out1" >&2
    return 1
  fi
  if ! echo "$out1" | grep -qF 'brand.properties'; then
    echo "branding-variant-divergence-self-test: FAIL -- properties mutation rejected, but output doesn't name the properties divergence" >&2
    echo "$out1" >&2
    return 1
  fi

  # Mutation 2: titlebar default copied into the release pref file too.
  local rel_pref_bad
  rel_pref_bad="$(mktemp)"; track_temp "$rel_pref_bad"
  printf 'pref("browser.tabs.inTitlebar", 0);\n' > "$rel_pref_bad"
  local out2
  if out2="$(_branding_variant_divergence_impl "$dev_props" "$rel_props" "$dev_pref" "$rel_pref_bad" 2>&1)"; then
    echo "branding-variant-divergence-self-test: FAIL -- planted titlebar mutation was NOT rejected" >&2
    echo "$out2" >&2
    return 1
  fi
  if ! echo "$out2" | grep -qF 'browser.tabs.inTitlebar'; then
    echo "branding-variant-divergence-self-test: FAIL -- titlebar mutation rejected, but output doesn't name the titlebar divergence" >&2
    echo "$out2" >&2
    return 1
  fi

  echo "branding-variant-divergence-self-test: PASS -- synthesised correct quartet went green; properties-suffix mutation and titlebar mutation both went red"
  return 0
}

# ============================================================================
# PORTED FROM verify-phase-04.sh -- the token-gate/bind-scope backend checks
# and the end-to-end shell checks. Its own start_shell/stop_shell/
# first_byte_offset/backend_ready_pids definitions are NOT ported: the copies
# above are identical or strict supersets, and a second definition would
# silently shadow them depending on file order.
# ============================================================================

# --- Task 2: backend-facing checks (SIDE-01, SIDE-02) -----------------------
#
# Every check below is expected to FAIL until plan 04-02 lands the
# @powerbrowser/token-gate extension: start_backend spawns the STOCK Theia
# backend (no token gate wired in yet), so POWERBROWSER_BACKEND_READY never
# appears in its log and every check that depends on it fails via the
# "backend never became ready" branch. That is the correct Wave 0 signal,
# not a broken harness (04-01-PLAN.md must_haves).
#
# start_backend/stop_backend set/clear a shared set of globals
# (BACKEND_TOKEN, BACKEND_PORT, BACKEND_PID, BACKEND_LOG, BACKEND_SPAWN_PID)
# rather than being passed around, mirroring this script's own CURRENT_CHECK_PID
# convention -- each check function calls start_backend, uses the globals,
# and always calls stop_backend before returning, on every path.
BACKEND_TOKEN=""
BACKEND_PORT=""
BACKEND_PID=""
BACKEND_LOG=""

# Spawns theia/applications/browser/lib/backend/main.js directly (D-101,
# Pitfall 2 -- never through the yarn/bash `theia start` wrapper, which
# would make kill() only reach a shell and orphan the real backend), inside
# `nix develop $REPO_ROOT#theia --command` so it gets the pinned Node 24.
# Binds --hostname 127.0.0.1 --port 0 (SIDE-01). Polls BACKEND_LOG for a
# `POWERBROWSER_BACKEND_READY {"port":N,"pid":N}` line for up to 90s. Returns
# 0 with BACKEND_TOKEN/BACKEND_PORT/BACKEND_PID/BACKEND_SPAWN_PID all set
# on success; on failure/timeout, prints the captured log and returns 1
# with BACKEND_SPAWN_PID left set so the caller's stop_backend still reaps
# whatever did spawn.
start_backend() {
  BACKEND_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  local log
  log="$(mktemp)"
  track_temp "$log"
  BACKEND_LOG="$log"

  local config_dir="${REAL_XDG_CONFIG_HOME:-$HOME/.config}/powerbrowser"
  mkdir -p "$config_dir"

  # -u: this is one of the three unsupervised callers the watchdog's marker
  # gate exists to protect. Run from a terminal inside a PowerBrowser instance,
  # an inherited POWERBROWSER_SUPERVISED would arm the watchdog in this backend,
  # which then self-terminates the moment its own stdin EOFs -- every check
  # below it failing for a reason that has nothing to do with Phase 4. The
  # dev bypass is cleared for the same reason: it must never be inherited
  # into a run that mints its own token.
  setsid env -u POWERBROWSER_SUPERVISED -u POWERBROWSER_TOKEN_DISABLE \
    POWERBROWSER_TOKEN="$BACKEND_TOKEN" \
    THEIA_CONFIG_DIR="$config_dir" \
    VSX_REGISTRY_URL="https://open-vsx.org" \
    nix develop "$REPO_ROOT#theia" --command \
    node "$REPO_ROOT/theia/applications/browser/lib/backend/main.js" --hostname 127.0.0.1 --port 0 \
    >"$log" 2>&1 &
  BACKEND_SPAWN_PID=$!

  local deadline=$((SECONDS + 90))
  local line json
  while [ "$SECONDS" -lt "$deadline" ]; do
    if line="$(grep -m1 '^POWERBROWSER_BACKEND_READY ' "$log" 2>/dev/null)"; then
      json="${line#POWERBROWSER_BACKEND_READY }"
      BACKEND_PORT="$(node -e 'try{const j=JSON.parse(process.argv[1]);if(typeof j.port==="number")console.log(j.port)}catch{}' "$json" 2>/dev/null)"
      BACKEND_PID="$(node -e 'try{const j=JSON.parse(process.argv[1]);if(typeof j.pid==="number")console.log(j.pid)}catch{}' "$json" 2>/dev/null)"
      if [ -n "$BACKEND_PORT" ] && [ -n "$BACKEND_PID" ]; then
        return 0
      fi
    fi
    if ! kill -0 "$BACKEND_SPAWN_PID" 2>/dev/null; then
      echo "start_backend: FAIL -- backend process exited before printing POWERBROWSER_BACKEND_READY; log:" >&2
      cat "$log" >&2
      return 1
    fi
    sleep 0.5
  done

  echo "start_backend: FAIL -- POWERBROWSER_BACKEND_READY did not appear within 90s; log:" >&2
  cat "$log" >&2
  return 1
}

stop_backend() {
  if [ -n "$BACKEND_SPAWN_PID" ]; then
    kill -- "-$BACKEND_SPAWN_PID" 2>/dev/null || kill "$BACKEND_SPAWN_PID" 2>/dev/null || true
    wait "$BACKEND_SPAWN_PID" 2>/dev/null || true
    BACKEND_SPAWN_PID=""
  fi
}

# Negative control (SIDE-02, Pitfall 1): a request with no cookie must be
# 403 AND must carry no Set-Cookie header at all -- a 403 that still leaks
# the stock theia-connection-token cookie is a FAIL, not just a status-code
# check.
check_side02_token_negative() {
  if ! start_backend; then
    echo "side02-token-negative: FAIL -- SIDE-02 -- backend never became ready, cannot test the token gate" >&2
    stop_backend
    return 1
  fi
  local headers status result=0
  headers="$(mktemp)"; track_temp "$headers"
  status="$(curl -sS -o /dev/null -w '%{http_code}' -D "$headers" "http://127.0.0.1:$BACKEND_PORT/powerbrowser/health")"
  if [ "$status" != "403" ]; then
    echo "side02-token-negative: FAIL -- SIDE-02 -- expected 403 without a token, got $status" >&2
    result=1
  fi
  if grep -qi '^Set-Cookie:' "$headers"; then
    echo "side02-token-negative: FAIL -- SIDE-02 -- 403 response leaked a Set-Cookie header:" >&2
    grep -i '^Set-Cookie:' "$headers" >&2
    result=1
  fi
  stop_backend
  return "$result"
}

# Paired positive control (D-68 idiom): the same route, with the token
# cookie, must be 200 with a JSON body carrying ok:true and a numeric pid
# (D-103 -- one request proves both liveness and enforcement).
check_side02_token_positive() {
  if ! start_backend; then
    echo "side02-token-positive: FAIL -- SIDE-02 -- backend never became ready, cannot test the token gate" >&2
    stop_backend
    return 1
  fi
  local body status result=0
  body="$(mktemp)"; track_temp "$body"
  status="$(curl -sS -o "$body" -w '%{http_code}' -b "POWERBROWSER_TOKEN=$BACKEND_TOKEN" "http://127.0.0.1:$BACKEND_PORT/powerbrowser/health")"
  if [ "$status" != "200" ]; then
    echo "side02-token-positive: FAIL -- SIDE-02 -- expected 200 with a valid token, got $status" >&2
    result=1
  elif ! node -e '
    const fs = require("fs");
    const b = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(b.ok === true && typeof b.pid === "number" ? 0 : 1);
  ' "$body" 2>/dev/null; then
    echo "side02-token-positive: FAIL -- SIDE-02 -- 200 response body is not {ok:true, pid:<number>}: $(cat "$body")" >&2
    result=1
  fi
  stop_backend
  return "$result"
}

# D-98's clause that static assets and index.html are gated too (the stock
# Theia token does not do this -- it only enforces on WS upgrade and
# opt-in routes).
check_side02_index_gated() {
  if ! start_backend; then
    echo "side02-index-gated: FAIL -- SIDE-02 -- backend never became ready, cannot test the token gate" >&2
    stop_backend
    return 1
  fi
  local status_no status_yes result=0
  status_no="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/")"
  if [ "$status_no" != "403" ]; then
    echo "side02-index-gated: FAIL -- SIDE-02 -- expected 403 for / without a token, got $status_no" >&2
    result=1
  fi
  status_yes="$(curl -sS -o /dev/null -w '%{http_code}' -b "POWERBROWSER_TOKEN=$BACKEND_TOKEN" "http://127.0.0.1:$BACKEND_PORT/")"
  if [ "$status_yes" = "403" ]; then
    echo "side02-index-gated: FAIL -- SIDE-02 -- expected a non-403 for / with a valid token, still got 403" >&2
    result=1
  fi
  stop_backend
  return "$result"
}

# SIDE-01: the announced port must be bound to 127.0.0.1 only (never
# 0.0.0.0/[::]), and must be OS-assigned (port 0 requested), not the fixed
# stock default 3000.
check_side01_bind_scope() {
  if ! start_backend; then
    echo "side01-bind-scope: FAIL -- SIDE-01 -- backend never became ready, cannot inspect its bind scope" >&2
    stop_backend
    return 1
  fi
  local result=0 rows non_loopback_rows
  rows="$(ss -ltnH "sport = :$BACKEND_PORT" 2>/dev/null)"
  if [ -z "$rows" ]; then
    echo "side01-bind-scope: FAIL -- SIDE-01 -- ss found no listening socket on port $BACKEND_PORT" >&2
    result=1
  else
    non_loopback_rows="$(echo "$rows" | awk '{print $4}' | grep -vE '^127\.0\.0\.1:' || true)"
    if [ -n "$non_loopback_rows" ]; then
      echo "side01-bind-scope: FAIL -- SIDE-01 -- a listening row's local address is not 127.0.0.1:*: $non_loopback_rows" >&2
      result=1
    fi
    if echo "$rows" | awk '{print $4}' | grep -qE '^(0\.0\.0\.0:|\[::\]:)'; then
      echo "side01-bind-scope: FAIL -- SIDE-01 -- found a 0.0.0.0/[::] listening row: $rows" >&2
      result=1
    fi
  fi
  if [ "$BACKEND_PORT" = "3000" ]; then
    echo "side01-bind-scope: FAIL -- SIDE-01 -- announced port is the fixed default 3000, not OS-assigned" >&2
    result=1
  fi
  stop_backend
  return "$result"
}

# --- Task 3: end-to-end checks (SHELL-01, SHELL-05, SIDE-03) ----------------
#
# All three launch $REPO_ROOT/objdir/dist/bin/powerbrowser, the same binary
# scripts/lib/firefox-bidi.mjs targets by default (its FIREFOX_BIN export).
# shell05/side03 need the launched process's own stdout+stderr (to read the
# POWERBROWSER_SHELL_READY/POWERBROWSER_BACKEND_READY/POWERBROWSER_SHELL_SWAP
# sentinels) -- withFirefoxPage's spawn discards stdout, so those two use
# start_shell/stop_shell below (this script's own setsid + log-file
# capture, exactly like start_backend/stop_backend). shell01 needs real
# page evaluation (DOM presence of Theia's own shell) instead, so it is
# generated as a small temp .mjs runner that imports
# scripts/lib/firefox-bidi.mjs's withFirefoxPage/waitFor UNCHANGED
# (04-PATTERNS.md key_link) -- never a second driver, and never a
# persisted sibling file: the runner lives only under mktemp, registered
# with track_temp like every other self-test fixture in this file.

# The port announced alongside <pid> in <log>.
backend_ready_port_for_pid() {
  sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //' "$1" 2>/dev/null \
    | grep -E '^POWERBROWSER_BACKEND_READY ' \
    | sed -E 's/^POWERBROWSER_BACKEND_READY //' \
    | node -e 'let s="";const want=Number(process.argv[1]);process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n")){if(!l.trim())continue;try{const j=JSON.parse(l);if(j.pid===want&&typeof j.port==="number"){console.log(j.port);return}}catch{}}})' "$2" 2>/dev/null
}

# SHELL-05: window show must never wait on backend readiness. The shell-
# ready sentinel must appear strictly before the backend-ready sentinel,
# and the shell-swap sentinel after both. Also the Pitfall 4 residual-risk
# smoke check: zero occurrences of "gBrowser is undefined" in the log.
check_shell05_paint_before_backend() {
  if ! start_shell; then
    echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if grep -q '^POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  local result=0 shell_off backend_off swap_off
  shell_off="$(first_byte_offset 'POWERBROWSER_SHELL_READY ' "$BROWSER_LOG")"
  backend_off="$(first_byte_offset 'POWERBROWSER_BACKEND_READY ' "$BROWSER_LOG")"
  swap_off="$(first_byte_offset 'POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG")"

  if [ -z "$shell_off" ] || [ -z "$backend_off" ] || [ -z "$swap_off" ]; then
    echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- one or more of POWERBROWSER_SHELL_READY/POWERBROWSER_BACKEND_READY/POWERBROWSER_SHELL_SWAP never appeared within 60s; log:" >&2
    cat "$BROWSER_LOG" >&2
    result=1
  else
    if [ "$shell_off" -ge "$backend_off" ]; then
      echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- POWERBROWSER_SHELL_READY (byte $shell_off) did not appear strictly before POWERBROWSER_BACKEND_READY (byte $backend_off)" >&2
      result=1
    fi
    if [ "$swap_off" -le "$backend_off" ] || [ "$swap_off" -le "$shell_off" ]; then
      echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- POWERBROWSER_SHELL_SWAP (byte $swap_off) did not appear after both READY sentinels (shell $shell_off, backend $backend_off)" >&2
      result=1
    fi
  fi

  if grep -q 'gBrowser is undefined' "$BROWSER_LOG" 2>/dev/null; then
    echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- log contains 'gBrowser is undefined' (Pitfall 4 residual-risk check)" >&2
    result=1
  fi

  # "Theia is the only GUI" is not proven by the swap sentinel: the swap
  # genuinely happened in the build where BOTH deck overlays painted on top
  # of it (a CSP-dropped style attribute -- see powerbrowser.css's header), and
  # every DOM/screenshot assertion in this file targets the CONTENT browsing
  # context, which stays perfectly healthy underneath an occluding chrome
  # overlay. The shell's own POWERBROWSER_DECK_STATE sentinel reports resolved
  # visibility from inside the chrome document, the one place that can see
  # it. Positive control lives in verify-phase-05.sh's
  # shell03-budget-exhausted-error, so this "none" can never pass vacuously.
  if [ -n "$swap_off" ]; then
    local deck_off deck_line
    deck_off="$(grep -abo -E '^(\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_DECK_STATE ' "$BROWSER_LOG" 2>/dev/null | awk -F: -v s="$swap_off" '$1 > s { print $1; exit }')"
    if [ -z "$deck_off" ]; then
      echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- no POWERBROWSER_DECK_STATE sentinel after the swap (byte $swap_off); overlay occlusion is unproven; log:" >&2
      cat "$BROWSER_LOG" >&2
      result=1
    else
      deck_line="$(tail -c +$((deck_off + 1)) "$BROWSER_LOG" | head -1)"
      if ! grep -q '"loading":"none","error":"none","diagnostics":"none"' <<<"$deck_line"; then
        echo "shell05-paint-before-backend: FAIL -- SHELL-05 -- a deck overlay is painted over the swapped-in Theia: $deck_line" >&2
        result=1
      fi
    fi
  fi

  stop_shell
  return "$result"
}

# SIDE-03: kill the backend the chrome side spawned and assert TheiaService
# recovers it on the SAME port with a DIFFERENT pid (D-104 -- a fresh port
# would break the already-loaded page's reconnect), without the browser
# process itself ever exiting.
#
# Known limitation (documented, not silently assumed): D-99's chrome-set
# token cookie is not observable to a bash/curl driver with no chrome-side
# access -- reading it would need a WebDriver BiDi storage.getCookies call,
# which scripts/lib/firefox-bidi.mjs does not currently export (adding it
# would touch the "reused unchanged" file this phase's own key_link
# forbids touching). This check proves the pid/port half of D-104 (the
# actually load-bearing half -- a fresh port silently breaks reconnect)
# against the currently-ungated health route. The cookie-continuity half
# is deferred to whichever future task extends firefox-bidi.mjs's exported
# surface with cookie access; recorded here rather than asserted falsely.
check_side03_kill_and_recover() {
  if ! start_shell; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- could not launch the built binary" >&2
    return 1
  fi

  local deadline=$((SECONDS + 60)) result=0
  while [ "$SECONDS" -lt "$deadline" ]; do
    grep -q '^POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG" 2>/dev/null && break
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "side03-kill-and-recover: FAIL -- SIDE-03 -- browser process exited before POWERBROWSER_SHELL_SWAP appeared; log:" >&2
      cat "$BROWSER_LOG" >&2
      stop_shell
      return 1
    fi
    sleep 0.5
  done
  if ! grep -q '^POWERBROWSER_SHELL_SWAP ' "$BROWSER_LOG" 2>/dev/null; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- POWERBROWSER_SHELL_SWAP did not appear within 60s; log:" >&2
    cat "$BROWSER_LOG" >&2
    stop_shell
    return 1
  fi

  local ready_line json port
  # Same PowerBrowserAPI.log() prefix as first_byte_offset() above: in the browser
  # log this sentinel is mirrored, not raw. Strip any prefix before parsing.
  ready_line="$(grep -m1 -E '^(\[PowerBrowserAPI\] [a-z]+: )?POWERBROWSER_BACKEND_READY ' "$BROWSER_LOG" 2>/dev/null | sed -E 's/^\[PowerBrowserAPI\] [a-z]+: //')"
  if [ -z "$ready_line" ]; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- POWERBROWSER_BACKEND_READY never appeared, cannot recover the port" >&2
    stop_shell
    return 1
  fi
  json="${ready_line#POWERBROWSER_BACKEND_READY }"
  port="$(node -e 'try{const j=JSON.parse(process.argv[1]);if(typeof j.port==="number")console.log(j.port)}catch{}' "$json" 2>/dev/null)"
  if [ -z "$port" ]; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- could not parse a port out of POWERBROWSER_BACKEND_READY's JSON" >&2
    stop_shell
    return 1
  fi

  # D-99's chrome-minted token gates EVERY backend route including
  # /powerbrowser/health, and a bash/curl driver has no chrome-side access to it,
  # so the health endpoint is unreadable from here (403, no body). The
  # supervisor's own POWERBROWSER_BACKEND_READY sentinel carries the same
  # {port,pid} pair and needs no token, so read both generations from the
  # browser log instead. This asserts strictly more than the old health probe
  # did: it proves the supervisor itself observed the respawn, not merely that
  # something is listening on the port.
  local pid1
  pid1="$(backend_ready_pids "$BROWSER_LOG" | head -1)"
  if [ -z "$pid1" ]; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- could not read a pid from POWERBROWSER_BACKEND_READY in the browser log" >&2
    stop_shell
    return 1
  fi

  kill -9 "$pid1" 2>/dev/null || true

  local recover_deadline=$((SECONDS + 60)) pid2="" port2=""
  while [ "$SECONDS" -lt "$recover_deadline" ]; do
    # A respawn announces a fresh sentinel; take the newest one that is not pid1.
    pid2="$(backend_ready_pids "$BROWSER_LOG" | grep -vx "$pid1" | tail -1)"
    if [ -n "$pid2" ]; then
      port2="$(backend_ready_port_for_pid "$BROWSER_LOG" "$pid2")"
      break
    fi
    if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
      echo "side03-kill-and-recover: FAIL -- SIDE-03 -- browser process exited during the recovery wait" >&2
      result=1
      break
    fi
    sleep 0.5
  done

  if [ -z "$pid2" ] && [ "$result" -eq 0 ]; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- no POWERBROWSER_BACKEND_READY with a pid different from $pid1 appeared within 60s of killing it" >&2
    result=1
  fi

  # D-104's load-bearing half: the respawn MUST reuse the same port, or the
  # already-loaded page's reconnect silently breaks.
  if [ -n "$pid2" ] && [ "$port2" != "$port" ]; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- respawn (pid $pid2) came back on port $port2, not the pinned port $port (D-104)" >&2
    result=1
  fi

  if ! kill -0 "$BROWSER_SPAWN_PID" 2>/dev/null; then
    echo "side03-kill-and-recover: FAIL -- SIDE-03 -- browser process itself exited during the check" >&2
    result=1
  fi

  stop_shell
  return "$result"
}

# SHELL-01: builds a temp .mjs runner (never a persisted repo file) that
# imports withFirefoxPage/waitFor from scripts/lib/firefox-bidi.mjs
# unchanged. Asserts the top-level content context's URL starts with
# http://127.0.0.1: and that Theia's own application shell, a menu bar and
# a status bar are all present after a bounded 60s poll -- never a point-
# in-time assertion (02-LEARNINGS). Paired with a static assertion that
# powerbrowser/shell/powerbrowser.xhtml adds no custom chrome (zero occurrences
# of tabbrowser/nav-bar/toolbarbutton/urlbar).
SHELL01_MJS=""
if [ "$QUICK" -eq 0 ]; then
  SHELL01_MJS="$(mktemp --suffix=.mjs)"
  track_temp "$SHELL01_MJS"
  cat > "$SHELL01_MJS" <<MJSEOF
import { withFirefoxPage } from '$REPO_ROOT/scripts/lib/firefox-bidi.mjs';
import { readFileSync, existsSync } from 'node:fs';

const xhtmlPath = '$REPO_ROOT/powerbrowser/shell/powerbrowser.xhtml';
const forbidden = ['tabbrowser', 'nav-bar', 'toolbarbutton', 'urlbar'];
let ok = true;

if (!existsSync(xhtmlPath)) {
  console.error(\`shell01-theia-is-the-window: FAIL -- SHELL-01 -- \${xhtmlPath} does not exist yet\`);
  ok = false;
} else {
  const text = readFileSync(xhtmlPath, 'utf8');
  for (const term of forbidden) {
    if (text.includes(term)) {
      console.error(\`shell01-theia-is-the-window: FAIL -- SHELL-01 -- \${xhtmlPath} contains forbidden custom-chrome string '\${term}'\`);
      ok = false;
    }
  }
}

try {
  // WINDOWS 14 (08-03): empty URL -- this check reads the shell's own swap,
  // never a URL page. An 'about:blank' argument would open a second window
  // carrying the same URL the shell starts at, leaving evaluate's target
  // ambiguous; with no argument there is exactly one context.
  await withFirefoxPage('', async ({ evaluate, waitFor }) => {
    // SHELL-05 requires the shell to paint BEFORE the backend is ready, so the
    // swap to the Theia URL is necessarily asynchronous and the first context
    // URL seen here is the shell's own about:blank placeholder. Poll for the
    // swap rather than sampling once (02-LEARNINGS: never a point-in-time
    // assertion); the assertion itself is unchanged -- the top-level content
    // context must end up on the loopback backend.
    try {
      await waitFor('location.href.startsWith("http://127.0.0.1:")', { timeoutMs: 60000 });
    } catch {
      // fall through to report the actual URL below
    }
    const contextUrl = await evaluate('location.href');
    if (typeof contextUrl !== 'string' || !contextUrl.startsWith('http://127.0.0.1:')) {
      console.error(\`shell01-theia-is-the-window: FAIL -- SHELL-01 -- top-level context URL '\${contextUrl}' does not start with http://127.0.0.1:\`);
      ok = false;
    }
    // Selectors verified against the pinned Theia v1.74.1 DOM, not guessed:
    // 1.74 renders on Lumino, so the menu bar is \`#theia:menubar\` with classes
    // \`lm-Widget lm-MenuBar\` -- the PhosphorJS-era \`.p-MenuBar\` and a
    // \`.theia-menubar\` class do not exist -- and the status bar is the id
    // \`#theia-statusBar\`, not a class of that name.
    await waitFor('!!document.querySelector("#theia-app-shell")', { timeoutMs: 60000 });
    await waitFor('!!document.querySelector("#theia-app-shell .lm-MenuBar")', { timeoutMs: 60000 });
    await waitFor('!!document.querySelector("#theia-statusBar")', { timeoutMs: 60000 });
  });
} catch (err) {
  console.error(\`shell01-theia-is-the-window: FAIL -- SHELL-01 -- \${err.message}\`);
  ok = false;
}

if (!ok) process.exitCode = 1;
else console.log('shell01-theia-is-the-window: PASS');
process.exit(process.exitCode || 0);
MJSEOF
fi

# --- 01-05 (GUI-01/GUI-04): gui01-single-shell-window ----------------------
#
# The startup-window selection moved out of the compiled BROWSER_CHROME_URL
# define and into PowerBrowserSingleInstanceHandler (01-SPIKE-GUI-01.md,
# ratified at 01-05 Task 2). This check is the one that goes red if that move
# regresses, and it asserts the two failure modes the move actually has:
#
#   * The handler's initial-launch branch never fires, so no shell window
#     opens at all, or fires twice. Caught by the first-launch count.
#   * The handler's initial-launch branch fires on a REMOTE handoff, so a
#     second launch of the same binary opens a second shell (and, via
#     TheiaService, a second backend). Caught by the second-launch assertion.
#
# It deliberately overlaps side05-second-launch-focuses on the second-launch
# half. That check predates the move and asserts remoting works AT ALL; this
# one asserts the moved code did not change what remoting produces. Losing
# either would lose a distinct signal.
#
# What this check deliberately does NOT assert is window COMPOSITION -- "the
# shell opened and no stock browser window opened beside it". There is no
# signal for that on the shell's stdout, which is all this check can see.
# 01-SPIKE-GUI-01.md observation 1 inferred it from the absence of
# `chrome://browser/content` lines in the launch log; that inference is wrong,
# and was an artifact of the spike's own instrumentation dumping chrome hrefs
# itself. Measured live (01-05 Task 3): a run that demonstrably opened a stock
# browser window logged ZERO such lines, so grepping for them here would be a
# green assertion that can never go red. The real instrument is BiDi's
# browsing-context tree, and the composition assertion lives in
# gui01-browser-close-does-not-quit, which already has one open.
#
# The other obvious instrument -- counting X windows -- is not used either, for
# the cause the spike recorded: this is a Wayland host, Gecko ignores the Xvfb
# DISPLAY, and xwininfo reported 0 beside a demonstrably open window.
#
# Never headless, and one shared profile across both launches, for the same
# two reasons side05's own comment gives: gfxPlatform::IsHeadless() disables
# Firefox's native remoting protocol outright, and nsRemoteService keys
# remoting on the profile path.
check_plan_gate_streams_self_test() {
  python3 "$REPO_ROOT/scripts/plan-gate.py" --self-test
}

check_gui01_single_shell_window() {
  local bin profile result=0
  bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"
  if [ ! -x "$bin" ]; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- $bin does not exist or is not executable (run the Firefox build first)" >&2
    return 1
  fi

  profile="$(mktemp -d)"; track_temp "$profile"

  local rc
  start_shell_display "$profile"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- could not launch the first instance (no usable display or missing binary)" >&2
    return "$rc"
  fi
  local first_log="$BROWSER_LOG"
  local first_pid="$BROWSER_SPAWN_PID"
  local display_to_use="$DISPLAY_IN_USE"

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    sentinel_present 'POWERBROWSER_SHELL_READY' "$first_log" && break
    if ! kill -0 "$first_pid" 2>/dev/null; then
      echo "gui01-single-shell-window: FAIL -- GUI-01 -- first launch exited before POWERBROWSER_SHELL_READY appeared; log:" >&2
      cat "$first_log" >&2
      stop_shell_display
      return 1
    fi
    sleep 0.5
  done
  if ! sentinel_present 'POWERBROWSER_SHELL_READY' "$first_log"; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- POWERBROWSER_SHELL_READY did not appear within 60s; log:" >&2
    cat "$first_log" >&2
    stop_shell_display
    return 1
  fi

  # Let a second shell window, if the handler wrongly opened one, finish
  # announcing itself before concluding none did. A negative assertion taken
  # the instant the positive one lands would pass on a race.
  sleep 5

  local ready_count
  ready_count="$(grep -c 'POWERBROWSER_SHELL_READY' "$first_log")"
  if [ "$ready_count" -ne 1 ]; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- expected exactly one POWERBROWSER_SHELL_READY on first launch, found $ready_count; log:" >&2
    cat "$first_log" >&2
    result=1
  fi

  # Second launch against the SAME profile: no new window anywhere. Remoting
  # delivers the second launch's command line into the FIRST process, so a
  # second window would announce itself on the first process's stdout, never
  # in the second process's own (0-byte) log.
  local second_log second_rc
  second_log="$(mktemp)"; track_temp "$second_log"
  timeout 30 env "DISPLAY=$display_to_use" "$bin" --profile "$profile" >"$second_log" 2>&1
  second_rc=$?

  if [ "$second_rc" -eq 124 ]; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- the second launch did not exit within 30s: it ran on as an independent instance instead of handing off; log:" >&2
    cat "$second_log" >&2
    result=1
  fi

  if ! kill -0 "$first_pid" 2>/dev/null; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- the first instance is no longer running after the second launch" >&2
    result=1
  fi

  ready_count="$(grep -c 'POWERBROWSER_SHELL_READY' "$first_log")"
  if [ "$ready_count" -ne 1 ]; then
    echo "gui01-single-shell-window: FAIL -- GUI-01 -- expected the POWERBROWSER_SHELL_READY count to still be 1 after the second launch, found $ready_count -- a second shell window opened; log:" >&2
    cat "$first_log" >&2
    result=1
  fi

  stop_shell_display
  return "$result"
}

# ============================================================================
# THE REGISTRY
# ============================================================================
#
# Every check in this repo, in one array. Each entry is "label|command", where
# command is either a bare argument-free shell function name or a plain
# `bash <path> [args]` / `node <path> [args]` external invocation.
#
# The label is the contract: `--only <label>` runs exactly that row, and the
# summary table prints it verbatim. Labels are ported UNCHANGED from the four
# deleted drivers so an existing citation of a label -- in a plan, a summary, a
# ledger entry, or a commit message -- still resolves.
#
# Provenance of every ported label (44 rows, matching the four deleted drivers'
# registries exactly: verify-phase-02.sh had 5, -03 had 14, -04 had 10, -05 had
# 15). Rows marked NEW were added by this project's own plans -- 01-03 and
# 01-04's static/build gates, 01-05's three GUI-01 window checks, and 01-06's
# GUI-04 registry-shape pair -- and are the only rows with no upstream
# provenance.
run_own_checks() {
  # The --quick set: no build, no browser launch, no display, no network. These
  # run in BOTH modes -- --quick is a narrowing, never a different set.
  local -a CHECKS=(
    # NEW (01-03): the two cheap static gates. Registered first and OUTSIDE any
    # build-dependent guard on purpose -- Pitfall 6 measures a full tier-3
    # rebuild at ~39 minutes, so a typo in a hand-written branding literal must
    # cost seconds here rather than forty minutes after the build.
    "scan-brand-residue|node $REPO_ROOT/scripts/scan-brand-residue.mjs"
    # NEW (01-08): the residual-brand gate's own self-test, registered here for
    # the reason every other self-test row in this registry gives. The row above
    # was green for its whole life without anyone having seen it go red, and it
    # could not have: condition 4 sat below reconcile()'s post-rename early
    # return, so it was unreachable on the only branch this tree occupies, and
    # its verdict was gated behind --reconcile, which no registered caller
    # passes. The self-test plants an unclaimed form on a post-rename fixture
    # and requires this exact un-flagged invocation's decision function to
    # reject it, with a clean control proving the red is plant-caused.
    "scan-brand-residue-self-test|node $REPO_ROOT/scripts/scan-brand-residue.mjs --self-test"
    "branding-preflight|node $REPO_ROOT/scripts/verify-branding-preflight.mjs"
    "branding-preflight-self-test|node $REPO_ROOT/scripts/verify-branding-preflight.mjs --self-test"
    # NEW (06-01): VER-01's static layer -- the manifest's own display
    # strings (per-variant full display names, vendor display, trademark
    # notice, all derived from configuration.toml at check time) must not
    # be hardcoded outside the manifest-owned surfaces. The residue scan
    # covers the originating product's tokens and check-patch-surface
    # covers patches/; this row covers the leak neither sees, with a
    # committed allowlist that itself fails on stale entries.
    #
    # Honestly --quick: it reads text files off disk only. No build, no
    # browser, no display, no network.
    #
    # verify-manifest-literals-self-test rides alongside for the reason
    # every other self-test row in this array gives: it plants a display
    # literal (red, naming file and value), a boundary control (green),
    # and one stale allowlist entry of each kind (removed literal,
    # rewritten file, deleted file -- each red, naming the entry), with
    # the unplanted control green first.
    "verify-manifest-literals|node $REPO_ROOT/scripts/verify-manifest-literals.mjs"
    "verify-manifest-literals-self-test|node $REPO_ROOT/scripts/verify-manifest-literals.mjs --self-test"
    # NEW (06-03): the trademark-surface gate -- the mechanical half of the
    # brand/ human review. Derives everything at check time: the tracked
    # asset walk (no hand-kept file list), the display-field scan over the
    # manifest-derived variant surfaces plus the theia fragments and the
    # desktop Name lines, the legal-keys presence out of configuration.toml,
    # and the brand/ listing versus the signed list in HUMAN-REVIEW.md as
    # set equality, so a new brand/ file fails until the ritual is
    # re-recorded.
    #
    # Honestly --quick: reads text files off disk only. No build, no
    # browser, no display, no network.
    #
    # verify-trademark-surface-self-test rides alongside for the reason
    # every other self-test row in this array gives: it plants an asset
    # basename, a display-field token, an emptied legal key, and an
    # unlisted brand file -- each red, naming the drift -- with the
    # unplanted control green first.
    "verify-trademark-surface|node $REPO_ROOT/scripts/verify-trademark-surface.mjs"
    "verify-trademark-surface-self-test|node $REPO_ROOT/scripts/verify-trademark-surface.mjs --self-test"
    # NEW (06-05): the rebranding-doc coverage gate -- the completeness half
    # of DOC-01. Derives the documented-field list at check time from the
    # generator's own known-setting schema table (the same table that
    # rejects unknown settings, so a setting added without a guide row
    # fails), requires each dotted path as inline code or a heading, and
    # requires the walkthrough's load-bearing commands as code spans.
    #
    # Honestly --quick: reads text files off disk only. No build, no
    # browser, no display, no network.
    #
    # verify-rebranding-docs-self-test rides alongside for the reason
    # every other self-test row in this array gives: it runs the real
    # guide unmutated (green first), then a field's mentions removed and
    # a command removed -- each red, naming the removal.
    "verify-rebranding-docs|node $REPO_ROOT/scripts/verify-rebranding-docs.mjs"
    "verify-rebranding-docs-self-test|node $REPO_ROOT/scripts/verify-rebranding-docs.mjs --self-test"

    # from verify-phase-03.sh
    "check-patch-surface|bash $REPO_ROOT/scripts/check-patch-surface.sh"
    "check-patch-surface-self-test|bash $REPO_ROOT/scripts/check-patch-surface.sh --self-test"
    # NEW (05-01): the brand-value mode's own rows. The default
    # check-patch-surface row above already runs both modes, but --only
    # sampling needs a label per mode: --brand-values runs the
    # manifest-derived scan alone, and its self-test plants a display-name
    # offender (red, naming patch and value) with the shipped hook-only
    # stack as the clean control proving the red is plant-caused.
    "check-patch-surface-brand-values|bash $REPO_ROOT/scripts/check-patch-surface.sh --brand-values"
    "check-patch-surface-brand-values-self-test|bash $REPO_ROOT/scripts/check-patch-surface.sh --self-test-brand"
    "fetch-upstream-self-test|bash $REPO_ROOT/scripts/fetch-upstream.sh --self-test"
    # NEW (05-02): the ESR pin-agreement gate -- configuration.toml's
    # [upstreams] tag equals the generated shell fragment, the workflow
    # mirror default and fetch-upstream.sh's effective default, with no
    # second tag literal anywhere else in scope. Static: parses text,
    # never clones. The self-test rides alongside for the reason every
    # other self-test row in this array gives.
    "verify-upstream-pins|node $REPO_ROOT/scripts/verify-upstream-pins.mjs"
    "verify-upstream-pins-self-test|node $REPO_ROOT/scripts/verify-upstream-pins.mjs --self-test"
    "allowlist-schema|check_allowlist_schema"
    "allowlist-doc-consistency|check_allowlist_doc_consistency"
    "allowlist-doc-consistency-self-test|check_allowlist_doc_consistency_self_test"
    "branding-variant-divergence-self-test|check_branding_variant_divergence_self_test"
    # from verify-phase-04.sh
    "internals-boundary-self-test|bash $REPO_ROOT/scripts/check-internals-boundary.sh --self-test"
    "internals-boundary|bash $REPO_ROOT/scripts/check-internals-boundary.sh"
    "internals-catalogue|bash $REPO_ROOT/scripts/check-internals-boundary.sh --catalogue"
    # NG-039 (non-GUI wave C): the boundary guard detects the two Firefox
    # internals the 2026-09-25 audit found uncatalogued (wrappedJSObject,
    # drawSnapshot), and every occurrence of either has a catalogue row. It
    # plants its own fixtures and reads text only: honestly --quick.
    "ng-039-internals-detects-waivers|node $REPO_ROOT/scripts/verify-ng-039-internals-waivers.mjs"
    # NG-040: every INTERNAL-APIS.md line reference matches the file, both
    # directions (occurrence -> row through check-internals-boundary.sh
    # --catalogue; row -> line and method here). The self-test runs on
    # scratch fixtures only, for the reason every self-test row gives.
    "ng-040-internals-catalogue-lines|node $REPO_ROOT/scripts/verify-ng-040-internals-catalogue-lines.mjs"
    "ng-040-internals-catalogue-lines-self-test|node $REPO_ROOT/scripts/verify-ng-040-internals-catalogue-lines.mjs --self-test"

    # from verify-phase-05.sh -- registered outside the --quick guard there too,
    # for the reason its own comment gives: they need no browser, no display and
    # no built tree, run in milliseconds, and a --quick that iterated an empty
    # array would print "PASS -- all checks passed" having asserted nothing.
    "shell-csp-inline-attrs|check_shell_csp_inline_attrs"
    "shell04-log-redacts-token|check_shell04_log_redacts_token"

    # NEW (14.1.1-04): G-14.1.1-19's gBrowser stand-in gate. The shell window
    # carries a `window.gBrowser` stand-in because privileged upstream code
    # reaches it, and those call sites optional-chain the RECEIVER, not the
    # member -- so a stand-in missing a member threw once per overlay creation
    # and buried the next real chrome-side error in the same log. The reported
    # symptom is an absent log line, which CLAUDE.md's first verification rule
    # forbids asserting on directly (the emitter is Gecko's, not ours), so this
    # row asserts the POSITIVE invariant instead: the members upstream calls on
    # a gBrowser receiver, derived from three read-only upstream files at check
    # time, EQUAL the members of the stand-in literal, parsed with comment
    # lines skipped. Red on an upstream rebase adding a call AND on a member
    # deleted or added here unreviewed -- seconds, not a forty-minute build,
    # which is why it belongs in the same --quick set rebase-upstream.sh runs.
    # Honestly --quick: text reads only, and `upstream/` is read, never
    # written. The self-test rides alongside for the reason every other
    # self-test row in this array gives.
    "shell-gbrowser-standin|node $REPO_ROOT/scripts/verify-shell-gbrowser-standin.mjs"
    "shell-gbrowser-standin-self-test|node $REPO_ROOT/scripts/verify-shell-gbrowser-standin.mjs --self-test"

    # NEW (01-06): GUI-04's bridge-contract assertion. Reads the TypeScript
    # sources, never a compiled artifact, so it is honestly --quick: no build,
    # no browser, no display, no network. The self-test is registered
    # alongside it for the same reason every other self-test in this registry
    # is -- a shape comparison that can only go green is not a check, and
    # 01-05 shipped two assertions resting on a non-discriminating instrument
    # before that was caught.
    "gui04-registry-shape|node $REPO_ROOT/scripts/verify-registry-shape.mjs"
    "gui04-registry-shape-self-test|node $REPO_ROOT/scripts/verify-registry-shape.mjs --self-test"

    # NEW (13-03): GUI-06's command-registry gate. Derives the bar's five
    # command ids from the commands source and compares as set equality,
    # plus the four contracted labels verbatim and the labelless focus
    # command. Honestly --quick: text reads only. No build, no browser, no
    # display, no network. The self-test rides alongside for the reason
    # every other self-test row in this array gives -- a gate nobody has
    # seen go red is not a check.
    "gui06-chrome-bar-commands|node $REPO_ROOT/scripts/verify-chrome-bar-commands.mjs"
    "gui06-chrome-bar-commands-self-test|node $REPO_ROOT/scripts/verify-chrome-bar-commands.mjs --self-test"

    # NEW (13-02): GUI-06's suggestion-search gate. Static half derives the
    # search statement from the query-service source and compares
    # projection/escape/order/limit as set equality; live half runs the
    # derived statement against a scratch fixture through the stdlib
    # `node:sqlite` engine (second-writer carve-out), plus the held-out activation backstop (STAGED until the 13-03
    # widget lands). Honestly --quick: text reads plus a mkdtemp fixture
    # only. No build, no browser, no display, no network. The self-test
    # rides alongside for the reason every other self-test row in this
    # array gives -- a gate nobody has seen go red is not a check.
    "gui06-chrome-bar-suggestions|node $REPO_ROOT/scripts/verify-chrome-bar-suggestions.mjs"
    "gui06-chrome-bar-suggestions-self-test|node $REPO_ROOT/scripts/verify-chrome-bar-suggestions.mjs --self-test"

    # NEW (13-05): GUI-06's bar-placement gate. Derives the contribution area
    # from the widget's addWidget call and the ratified order from the
    # UI-SPEC order line at check time and compares both; honestly --quick
    # (text reads only, no build, no browser, no display, no network).
    "gui06-chrome-bar-placement|node $REPO_ROOT/scripts/verify-chrome-bar-placement.mjs"
    # The placement self-test rides alongside for the reason every other
    # self-test row in this array gives -- a gate nobody has seen go red is
    # not a check.
    "gui06-chrome-bar-placement-self-test|node $REPO_ROOT/scripts/verify-chrome-bar-placement.mjs --self-test"

    # NEW (14.1-03): GUI-02's bridge-contract gate. Derives the webTab* kind
    # set from the chrome dispatch and the frontend message union, the wire
    # event names across the actor child and its three frontend spellers,
    # the open-handler priority, the overlay attribute order, the
    # embedder-is-primary wall and the no-stock-window rule (with a
    # positive control) from the tree at check time and compares them as
    # set equality. Honestly --quick: text reads only, no build, no
    # browser, no display, no network. The self-test rides alongside for
    # the reason every other self-test row in this array gives -- a gate
    # nobody has seen go red is not a check.
    "gui02-web-tab-bridge|node $REPO_ROOT/scripts/verify-web-tab-bridge.mjs"
    "gui02-web-tab-bridge-self-test|node $REPO_ROOT/scripts/verify-web-tab-bridge.mjs --self-test"

    # NEW (Phase 20, PLAT-02, G-14.1.1-10): the PowerBrowserGroup channel's
    # static contract. The five 15-01 faults that kept the channel dead for a
    # phase -- no wantUntrusted on the child events entry, a chrome:// child
    # module, the jar.mn resource alias, document dispatch with bubbles, and
    # the content-compartment reply clone -- plus event-name agreement and
    # window response listeners, all derived from the tree (D0-D6). Honestly
    # --quick: text reads only, upstream/ read-only. In a clone without
    # upstream/ it fails like the other upstream readers (R33).
    # gui02-web-tab-live stays the runtime proof.
    "group-channel|node $REPO_ROOT/scripts/verify-group-channel.mjs"
    "group-channel-self-test|node $REPO_ROOT/scripts/verify-group-channel.mjs --self-test"

    # NEW (13-02): GUI-07's spike-verdict gate. Parses the strip-relocation
    # record for a one-line GREEN/RED verdict with a cause on RED plus the
    # Variant routing, and checks the zero-core claim against the
    # core-diff instrument itself (invoked, never reimplemented), an empty
    # upstream diff, and no spike-shipped file under theia/ or scripts/.
    # Honestly --quick: text reads, git plumbing, and the core-diff
    # instrument through the theia shell (seconds, like tab-uris-typecheck).
    # No build, no browser, no display, no network. The self-test rides
    # alongside for the reason every other self-test row in this array
    # gives.
    "gui07-strip-spike-verdict|node $REPO_ROOT/scripts/verify-strip-spike-verdict.mjs"
    "gui07-strip-spike-verdict-self-test|node $REPO_ROOT/scripts/verify-strip-spike-verdict.mjs --self-test"

    # NEW (14-01): GUI-07's shipped-mode defaults gate. Derives descriptor
    # ids, labels, order, and the placement map from the modes sources plus
    # the widget MODES literal at check time and compares as set equality
    # against one EXPECTED const; fails distinctly on empty derivation and
    # proves modes ship as data with a scoped negated search for manifest
    # flags. Honestly --quick: text reads only. No build, no browser, no
    # display, no network. The self-test rides alongside for the reason
    # every other self-test row in this array gives.
    "gui07-mode-toggle-commands|node $REPO_ROOT/scripts/verify-mode-toggle-commands.mjs"
    "gui07-mode-toggle-commands-self-test|node $REPO_ROOT/scripts/verify-mode-toggle-commands.mjs --self-test"

    # NEW (14-02; wording corrected 14-04): GUI-07's switch-path invariant
    # gate. This row is a TEXT derivation over two of our own source trees
    # plus stock's type declarations. It never runs a shell. The wording that
    # stood here until 14-04 -- "the shell-mutating calls on every mode-switch
    # path ... red on any addition and any removal" -- claimed far more than
    # the row can do, and reading it that way is part of why the mode switch
    # shipped destroying main-area tabs with this row green. What it actually
    # proves is three things:
    #   1. the call NAMES reached through three receivers (this.shell,
    #      this.perspectives, this.statusBar) plus the organising-slot seam,
    #      inside FIVE named function bodies in mode-service.ts and
    #      chrome-bar-widget.tsx, set-equal against one declared allowlist;
    #   2. the forbidden layout vocabulary -- every method stock's
    #      PerspectiveService and PerspectiveServiceInternal d.ts declare plus
    #      every *LayoutData method of the shell d.ts -- searched whole-file
    #      and receiverless across every .ts/.tsx under the modes and
    #      chrome-bar sources, per name set-equal against the declared
    #      exceptions. This half survives a mutation moved one hop into a
    #      private helper, and it is the only thing in the tree that goes red
    #      when an upstream re-pin ADDS a layout-swapping method our code then
    #      calls;
    #   3. that stock still calls descriptor.onDeactivate BEFORE it saves the
    #      live layout and before it reads the target's snapshot back, derived
    #      from perspective-service.js at check time -- the ordering the
    #      main-area exemption depends on, which a re-pin could otherwise
    #      rewrite with nothing in this tree noticing.
    # What it CANNOT see is behaviour. It reads text, so it cannot tell
    # whether a mode's SECOND visit leaves main-area tabs attached -- that is
    # gui07-mode-switch-tabs-live in the full tier below, and this row is not
    # a substitute for it. Within the anchored half, REMOVING a call shrinks
    # the derived set and is reported as a dropped invariant surface, which is
    # a prompt to review, not proof the surface was safe to drop; and a
    # mutation reached through a receiver it does not name, or from a file
    # outside those two src trees, is invisible to it. Honestly --quick: text
    # reads only. No build, no browser, no display, no network. The self-test
    # rides alongside for the reason every other self-test row in this array
    # gives.
    "gui07-mode-switch-tabs-invariant|node $REPO_ROOT/scripts/verify-mode-switch-tabs-invariant.mjs"
    "gui07-mode-switch-tabs-invariant-self-test|node $REPO_ROOT/scripts/verify-mode-switch-tabs-invariant.mjs --self-test"

    # NEW (Phase 23, G-32, MODE-03): side-panel motion. Derives the motion
    # 14-UI-SPEC declares (the Motion "Side panels" sentence and the E4+E7
    # loading row) and the motion the code ships (the one
    # ApplicationShellOptions rebind, its per-panel expandDuration and
    # expandThreshold 0, and any shrink before collapse in activateMode) and
    # requires them equal to one of Chris's three kinds. The live half is
    # modes-panel-motion-live under a slide; under option a (instant) there is
    # no motion to measure and no live row. Honestly --quick: text reads only.
    "modes-panel-motion|node $REPO_ROOT/scripts/verify-panel-motion.mjs"
    "modes-panel-motion-self-test|node $REPO_ROOT/scripts/verify-panel-motion.mjs --self-test"

    # NEW (14-03): GUI-09's setup roundtrip gate. Derives the setups schema,
    # the four command ids, and the contracted labels and copy at check time
    # and runs a node JSON roundtrip over save, list, restore, and delete.
    # Honestly --quick: text reads only. No build, no browser, no display,
    # no network. The self-test rides alongside for the reason every other
    # self-test row in this array gives.
    "gui09-setup-roundtrip|node $REPO_ROOT/scripts/verify-setup-roundtrip.mjs"
    "gui09-setup-roundtrip-self-test|node $REPO_ROOT/scripts/verify-setup-roundtrip.mjs --self-test"

    # NEW (Phase 23, G-23): the Save as Mode and Save Setup name fields are cut at the cap while
    # typing through inputCappedName, and 14-UI-SPEC states the rule. Text reads only; the live half
    # is modes-name-cap-at-input-live.
    "modes-name-cap-at-input|node $REPO_ROOT/scripts/verify-name-cap-at-input.mjs"
    "modes-name-cap-at-input-self-test|node $REPO_ROOT/scripts/verify-name-cap-at-input.mjs --self-test"

    # NEW (14-03): GUI-09's dependent-window content gate. The static half
    # derives the built secondary asset, the membership pins, and the
    # closed-state copy at check time; the live half (extraction, geometry,
    # close-matrix through the probe harness) runs in the full suite only,
    # so this row is honestly --quick while its live counterpart is not.
    # The self-test rides alongside for the reason every other self-test
    # row in this array gives.
    "gui09-dependent-window-content|node $REPO_ROOT/scripts/verify-dependent-window-content.mjs"
    "gui09-dependent-window-content-self-test|node $REPO_ROOT/scripts/verify-dependent-window-content.mjs --self-test"

    # NEW (15-01): GUI-08's persistence-roundtrip gate. Derives the groups
    # DDL, the schema head, the group write/read method names, GROUP_PATH,
    # and the title cap at check time and runs a mkdtemp-stage migration +
    # CRUD + quarantine + downgrade-refusal roundtrip through the stdlib
    # `node:sqlite` engine (second-writer carve-out). Honestly --quick: text
    # reads plus a mkdtemp fixture only. No build, no browser, no display,
    # no network. The self-test rides alongside for the reason every other
    # self-test row in this array gives.
    "gui08-persistence-roundtrip|node $REPO_ROOT/scripts/verify-gui08-persistence-roundtrip.mjs"
    "gui08-persistence-roundtrip-self-test|node $REPO_ROOT/scripts/verify-gui08-persistence-roundtrip.mjs --self-test"

    # NEW (non-GUI wave A): the wave's quick-tier checks, one file per row
    # (decisions.md R1). ng-016 requires the gui08 roundtrip and its self-test
    # green at the writer's head; ng-019 derives the schema from the writer's
    # DDL markers and compares docs/TAB-STORE.md, then plants drifts; ng-020
    # plants a comment-only startup wiring into the absence instrument's gate.
    # Honestly --quick: text reads, in-memory plants and a mkdtemp stage.
    "ng-016-gui08-persistence-at-head|node $REPO_ROOT/scripts/verify-ng-016-gui08-persistence-at-head.mjs"
    "ng-019-tab-store-doc|node $REPO_ROOT/scripts/verify-ng-019-tab-store-doc.mjs"
    "ng-020-absence-wiring-by-call|node $REPO_ROOT/scripts/verify-ng-020-absence-wiring-by-call.mjs"

    # NEW (Phase 20, PLAT-03): tab store schema v3 (x, y) and v4 (ord) from
    # 7b7a1f7, one file per row. ng-087 runs the real writer through a restart
    # and re-track and reads loose positions with the listUngroupedTabs SQL;
    # ng-088 does the same for a hand-set group order with the getGroupTabs SQL.
    # Each self-test plants writer and reader faults. Honestly --quick:
    # node:sqlite in a mkdtemp stage, no build, no browser, no network.
    "ng-087-loose-position-across-restart|node $REPO_ROOT/scripts/verify-ng-087-loose-position-across-restart.mjs"
    "ng-087-loose-position-across-restart-self-test|node $REPO_ROOT/scripts/verify-ng-087-loose-position-across-restart.mjs --self-test"
    "ng-088-group-order-across-restart|node $REPO_ROOT/scripts/verify-ng-088-group-order-across-restart.mjs"
    "ng-088-group-order-across-restart-self-test|node $REPO_ROOT/scripts/verify-ng-088-group-order-across-restart.mjs --self-test"

    # NEW (non-GUI wave A, ruling T2-R4): the tab-store writer offline. Loads
    # the real PowerBrowserAPI.sys.mjs in node over node:sqlite with the rules
    # Sqlite.sys.mjs enforces (an unbound LIKE refused, bindByName on names the
    # statement has, no nested transaction), and runs the migration from every
    # shipped version, the key rule, the row lifecycle, the quarantine rebuild
    # and the close at shutdown; it plants an unbound LIKE to prove its guard.
    # Honestly --quick: a mkdtemp stage, no build, no browser, no network.
    "tab-store-offline|node $REPO_ROOT/scripts/verify-tab-store-offline.mjs"

    # NEW (15-02; derived from 15-UI-SPEC since Phase 21): GUI-08's
    # canvas-geometry gate. Derives the canvas geometry and type from
    # 15-UI-SPEC's Canvas Geometry and Typography tables through
    # scripts/lib/ui-spec.mjs at check time and compares them with the
    # tree's consts and CSS, with the thumbnail-fallback shape and the
    # panorama command registry. Since Phase 22 that includes the Undo
    # Close Group rows (UNDO_CLOSE_MS, UNDO_FADE_MS, .pb-org-undo) and the
    # card-close rows (.pb-org-card-close). Its live DOM half is the full-tier row
    # gui08-loose-cards-live. Honestly --quick: text reads only. No build, no browser, no display, no
    # network. The self-test rides alongside for the reason every other
    # self-test row in this array gives.
    "gui08-canvas-geometry|node $REPO_ROOT/scripts/verify-gui08-canvas-geometry.mjs"
    "gui08-canvas-geometry-self-test|node $REPO_ROOT/scripts/verify-gui08-canvas-geometry.mjs --self-test"

    # NEW (15-03): GUI-08's view-parity gate. Derives the single-model
    # assertion at check time (exactly the widget reads the model outside
    # the model itself, the tree module carries no fetch, the widget owns
    # the tree render functions, the flip is visibility-only) and compares
    # as set equality against one EXPECTED const; live membership and flip
    # halves ride as HELD-OUT backstops, honestly reserved for the full
    # suite. Honestly --quick: text reads only. No build, no browser, no
    # display, no network. The self-test rides alongside for the reason
    # every other self-test row in this array gives.
    "gui08-view-parity|node $REPO_ROOT/scripts/verify-gui08-view-parity.mjs"
    "gui08-view-parity-self-test|node $REPO_ROOT/scripts/verify-gui08-view-parity.mjs --self-test"

    # NEW (15-03; rewritten for PAN-04 and PAN-06 in 22-04 and 22-05):
    # GUI-08's close-exactness gate. Derives the deferred close at check
    # time: x builds no dialog and closes the group into its undo window;
    # the close is written only by commitClose, which the UNDO_CLOSE_MS
    # timer and the quit flush (onWillFlush to commitAllClosing) reach;
    # Undo clears the timer and writes nothing; the last-group guard
    # (canCloseGroup) refuses the close and hides the x on the canvas and
    # in the tree. It also derives the unchanged chrome-side close surface
    # (the closeGroup dispatch arm reaching the per-tab stock close loop).
    # It compares as set equality against one EXPECTED const; the live
    # halves ride as HELD-OUT backstops, proved live by
    # pan04-undo-close-group-live and ng-006. Honestly --quick: text reads
    # only. No build, no browser, no display, no network. The self-test
    # rides alongside for the reason every other self-test row in this array
    # gives.
    "gui08-close-exactness|node $REPO_ROOT/scripts/verify-gui08-close-exactness.mjs"
    "gui08-close-exactness-self-test|node $REPO_ROOT/scripts/verify-gui08-close-exactness.mjs --self-test"

    # NEW (15-03; derived from 15-UI-SPEC since Phase 21): GUI-08's
    # panorama-copy gate. Takes the contracted strings and the retired list
    # from the 15-UI-SPEC Copywriting Contract at check time and compares
    # them with the Theia sources as set equality, proves zero retired
    # copy in shipped sources by negated search, and runs the no-internals
    # shape check over the same strings. Honestly --quick: text reads only.
    # No build, no browser, no display, no network. The self-test rides
    # alongside for the reason every other self-test row in this array
    # gives.
    "gui08-panorama-copy|node $REPO_ROOT/scripts/verify-gui08-panorama-copy.mjs"
    "gui08-panorama-copy-self-test|node $REPO_ROOT/scripts/verify-gui08-panorama-copy.mjs --self-test"

    # NEW (14.1.1-03): GUI-09's setups-copy gate, closing G-14.1.1-21 -- one
    # failure constant was flashed for three different failures, so a failed
    # save reported a failed restore and a failed delete told the user to
    # delete. It derives BOTH sides -- the literal at every setups paint site
    # in setups-service.ts, and the bolded literals of 14-UI-SPEC.md's
    # Copywriting Contract rows that name a setups surface -- and compares
    # them as set equality, so unreviewed copy and dropped contract each go
    # red by name. The no-internals shape check rides the same derived
    # strings. Honestly --quick: two text reads. No build, no browser, no
    # display, no network. The self-test rides alongside for the reason every
    # other self-test row in this array gives.
    "gui09-setups-copy|node $REPO_ROOT/scripts/verify-gui09-setups-copy.mjs"
    "gui09-setups-copy-self-test|node $REPO_ROOT/scripts/verify-gui09-setups-copy.mjs --self-test"

    # NEW (14.1.1-08): the Theia extension build-order gate, closing
    # G-14.1.1-9 -- `build:extensions` hand-ordered tab-uris ahead of
    # token-gate while tab-query-service.ts imports token-gate's lib and
    # `theia/**/lib/` is gitignored, so a clean checkout compiled tab-uris
    # against a lib that did not exist yet; the same edge was undeclared in
    # tab-uris's own manifest, invisible to the workspace graph. The pair
    # DERIVES all three inputs -- the chain out of `build:extensions`, the
    # extension set out of the directory listing, and the edges out of
    # import/export specifiers only -- then asserts set equality in both
    # directions, no duplicate, every edge pointing backwards in the chain
    # and every edge declared by its importer. It proves the ordering and
    # declaration invariants a clean build depends on, NOT the clean build
    # itself: the literal clean-lib build is deferred to pass 3, because
    # running it here would delete a concurrent session's live
    # `theia/**/lib` trees. Honestly --quick: text reads only. No build, no
    # browser, no display, no network. The self-test rides alongside for the
    # reason every other self-test row in this array gives.
    "theia-build-order|node $REPO_ROOT/scripts/verify-theia-build-order.mjs"
    "theia-build-order-self-test|node $REPO_ROOT/scripts/verify-theia-build-order.mjs --self-test"

    # NEW (01-07): MIG-04's user-facing-copy gate. Static -- it reads
    # TheiaService.sys.mjs, never a built artifact -- so it is honestly
    # --quick, and that placement is the point: a leaked pref key must cost
    # seconds here rather than a forty-minute rebuild followed by a headless
    # launch. Its runtime counterpart is shell-diagnostics-rows-populated in
    # the full set below. The self-test rides alongside it for the same reason
    # every other self-test in this registry does.
    "shell-error-copy-no-internals|node $REPO_ROOT/scripts/verify-shell-error-copy.mjs"
    "shell-error-copy-no-internals-self-test|node $REPO_ROOT/scripts/verify-shell-error-copy.mjs --self-test"

    # NEW (01-09): the start path's recovery contract, static half. Derives the
    # instance field named in `_swap()`'s early-return guard and the one named
    # in `_spawnAndGate`'s one-time initialisation block guard, and compares
    # them -- neither is a literal kept in the checker, so a rename at BOTH
    # sites stays green (the invariant holds) while a re-keying goes red naming
    # both derived values. It reads source and a synthetic log, needs no build,
    # no browser, no display and no network, so a regression in the recovery
    # contract costs seconds here rather than a rebuild plus a headless launch.
    # Its runtime counterpart is health-gate-recovery-swaps in the full set
    # below. The self-test rides alongside it for the reason every other
    # self-test row in this array gives -- a comparison that can only go green
    # is not a check, and this one guards the defect 01-VERIFICATION.md caught
    # only because a human looked.
    "start-path-recovery|node $REPO_ROOT/scripts/verify-start-path-recovery.mjs"
    "start-path-recovery-self-test|node $REPO_ROOT/scripts/verify-start-path-recovery.mjs --self-test"

    # NEW (01-11): the error state's REPAINT contract, closing
    # 01-VERIFICATION.md's failed truth 2c. What it drives: a launch whose spawn
    # cannot succeed, followed by two consecutive failing Retry clicks, and it
    # requires the error-family sentinel stream to read paint, clear, repaint,
    # clear, repaint -- five PRESENCE assertions, never an absence assertion.
    # The two source files are not re-implemented and not text-transformed: the
    # supervisor is imported with ChromeUtils faked and the chrome bootstrap is
    # evaluated in a node:vm sandbox that is also its own window, so the drive
    # goes through the bootstrap's own DOMContentLoaded handler and every
    # sentinel it reads comes from a dump( call site in the file under test
    # (proven before any scenario runs).
    #
    # Honestly --quick: it evaluates source in-process with no build, no
    # browser, no display and no network, and finishes in well under a second.
    # It has NO runtime counterpart in the full set and deliberately claims
    # none: its perceptual half -- a human clicking Retry in a real window and
    # seeing the layer come back -- stays on the WINDOWS.md human record,
    # because chrome-context Marionette is platform-blocked on Linux (ledger
    # item 7), which is the same fallback 05-02-SUMMARY.md already recorded for
    # the Retry button. The self-test rides alongside for the reason every other
    # self-test row in this array gives, and with particular force here: this
    # defect survived three full verification runs precisely because the
    # registered checks could not go red on it.
    "shell-error-contract|node $REPO_ROOT/scripts/verify-shell-error-contract.mjs"
    "shell-error-contract-self-test|node $REPO_ROOT/scripts/verify-shell-error-contract.mjs --self-test"

    # NEW (01-20): the About dialog's suppression-selector gate, hermetic half.
    # Honestly --quick because the self-test's fixture is a mkdtemp directory
    # carrying its own authored markup: no build, no browser, no display, no
    # network, and NO `upstream/` clone. Its non-hermetic counterpart --
    # about-dialog-suppression, which reads the real upstream markup -- is in
    # the full set below, in the RE-TIERED block, for exactly that dependency.
    # The self-test rides here for the reason every other self-test row in this
    # array gives, and with the same particular force as shell-error-contract:
    # the defect this check closes (a container-wide rule that hid the internal
    # about:license disclosure along with the two mozilla.org links) shipped in
    # 01-18 and survived because nothing was comparing the shipped selectors
    # against the document they target.
    "about-dialog-suppression-self-test|node $REPO_ROOT/scripts/verify-about-dialog-suppression.mjs --self-test"

    # NEW (02-05): GEN-04's byte-identity gate -- what scripts/generate.mjs
    # emits from configuration.toml is byte-for-byte the five build surfaces
    # Phase 1 wrote by hand (.mozconfig, both branding configure.sh files, both
    # .desktop files), plus the assertion that generated/ is git-ignored and
    # tracked-empty. This is Phase 2's acceptance test made mechanical, and it
    # is the reason CLAUDE.md forbade a generator in Phase 1: those five
    # hand-written files are the INDEPENDENT comparand, and they are never
    # edited to make this row green.
    #
    # Honestly --quick, and deliberately so on a point that is easy to get
    # wrong: it emits its comparand into its own mkdtemp directory and never
    # reads generated/, which is git-ignored and therefore ABSENT on every
    # fresh clone and every CI runner. A row that read generated/ would be red
    # on a tree with no defect, and a gate that is red for a non-defect is a
    # gate its readers learn to skip. Whether generated/ itself is stale is a
    # different question with its own instrument, `generate.mjs --check`. No
    # build, no browser, no display, no network.
    #
    # The self-test rides alongside for the reason every other self-test row in
    # this array gives: it plants a one-byte drift in each emitter
    # and requires each to go red naming that file, plus a surplus target and a
    # missing one, and it refuses to report at all when the unmodified tree is
    # already red. A byte comparison that nobody has seen go red is not a check.
    # The case set now carries two polarities: one case stays green at a
    # different checkout root -- a gate that could only ever go red at a
    # foreign checkout is the defect this row was fixed for -- while every
    # planted drift still goes red naming its file.
    "generated-byte-identity|node $REPO_ROOT/scripts/verify-generated-identity.mjs"
    "generated-byte-identity-self-test|node $REPO_ROOT/scripts/verify-generated-identity.mjs --self-test"

    # NEW (02-06): the generator's own two rows, completing the four this phase
    # registers. They assert something DIFFERENT from the pair above, which is
    # why both pairs exist rather than one.
    #
    # generate-check asserts IDEMPOTENCE, and only that: on a tree where the
    # generator has already run, a second run produces the same bytes as the
    # first. Anything stronger would be a claim about a tree this row cannot
    # observe. Whether the emitted bytes match the thirty-three HAND-WRITTEN files is
    # the separate question generated-byte-identity answers, and it answers it
    # without needing a prior generate at all.
    #
    # ON A TREE WITH NO generated/, THIS ROW SKIPS AND PASSES. generated/ is
    # git-ignored, so that is the state of every fresh clone -- and a tree that
    # has never generated cannot disagree with itself, which is the only thing
    # this row claims. It used to exit 1 there while printing "This is not a
    # mismatch", which put --quick, the documented commit gate, in a FAIL state
    # on every fresh clone. Nothing goes unchecked as a result: the emitters
    # are gated by generated-byte-identity above, which reads nothing under
    # generated/ at all. The generator's own --self-test pins both halves --
    # the skip message and its zero exit.
    #
    # generate-self-test rides alongside for the reason every other self-test
    # row in this array gives, and here it carries more weight than most:
    # thirty-nine planted faults -- a missing required key, an invalid basename,
    # a misspelled section header, a whitespace-only value, a short downstream
    # array, an incomplete variant, a duplicated variant id, an unused variant
    # id, a partially-stated identity table, a stale generated file, an absent
    # generated directory, a malformed manifest, a drifted locale full name,
    # the locale agreement holding on the emitted pairs, a non-square icon
    # source, a missing icon source, a drifted icon raster, the container
    # writers holding on the emitted buffers, a truncated ICO payload, a
    # wrong-magic ICNS, a hostile double quote in the display name, a hostile
    # variable reference in the support URL, a hostile ampersand in the
    # display name, a hostile double quote driven past validation at the
    # theia frontend-config emitter and the frontend-config fragment holding
    # as valid JSON on the emitted pairs, an extension entry without its
    # version pin, an extension entry with an unimplemented source, an
    # extension entry with a malformed sha256 pin, the declared extensions
    # resolving to their exact versioned URLs, an emptied downstream
    # extensions array resolving to zero entries, a telemetry level enabled
    # without an endpoint, a telemetry level outside the four-value enum, a
    # telemetry endpoint outside https, the telemetry fragment carrying
    # the stated pair and defaulting an unset section to off, a theia theme
    # outside the builtin theme ids, a markup-bearing theia welcome text, a
    # crash-report URL outside https, the theia branding riding the
    # runtime channel fragments and defaulting unset texts to null, and the
    # manifest endpoint hosts deriving the stated hosts with the prefs
    # repointed -- each required
    # to go red NAMING the drift (or resolve as pinned), plus a
    # cross-cutting assertion that no case's output carries a stack frame, a
    # module specifier, or this machine's path to the project. Every one of the
    # generator's failure messages is user-facing copy under CLAUDE.md's
    # no-internals rule, and this row is what enforces that rule by pattern
    # rather than by a reviewer's memory.
    #
    # Both are honestly --quick. The generator reads configuration.toml and a
    # JSON schema and writes under generated/; the self-test emits into mkdtemp
    # directories and spawns short-lived node children. No build, no browser,
    # no display, no network.
    "generate-check|node $REPO_ROOT/scripts/generate.mjs --check"
    "generate-self-test|node $REPO_ROOT/scripts/generate.mjs --self-test"

    # NEW (03-01): the branding-directory agreement gate -- what the generator
    # emits under generated/branding/ is a complete drop-in branding directory
    # per variant whose locale halves agree.
    #
    # It asserts something DIFFERENT from the three pairs above, which is why
    # another pair of rows exists rather than none. generated-byte-identity
    # proves each emitted file equals its hand-written counterpart;
    # generate-check proves the generated/ tree matches the manifest right
    # now. Neither sees the directory AS a directory: a deleted emitter row
    # leaves its file out of the set without failing any per-file comparison,
    # and the two locale files can disagree on a shared name while each still
    # matching nothing that checks them against each other. This row derives
    # the emitted file set per variant at check time and compares as set
    # equality in three directions (every emitted file declared by TARGETS,
    # every TARGETS branding row present on disk, dev versus release
    # destination sets equal), then re-asserts the ftl-versus-properties term
    # equality off the generated files -- the same agreement the emitter
    # asserts in memory before writing, now proved on the bytes on disk.
    #
    # ON A TREE WITH NO generated/branding/, THIS ROW SKIPS AND PASSES, for
    # the same reason generate-check does: generated/ is git-ignored, so that
    # is the state of every fresh clone, and a tree that has never generated
    # cannot disagree with itself. A PRESENT but empty or partial tree is a
    # defect and fails -- the self-test's emptied-directory case pins the
    # distinction.
    #
    # branding-dir-agreement-self-test rides alongside for the reason every
    # other self-test row in this array gives: it mirrors the real tree into
    # mkdtemp with the true TARGETS rows and emitters, asserts the unmutated
    # control is green first, then plants one mutation per case (a drifted
    # full-name term, a removed layout file, an emptied directory) requiring
    # red naming the file and both values, plus the absent-tree SKIP.
    #
    # Both are honestly --quick. The check reads text files off disk only;
    # the self-test emits into mkdtemp directories. No build, no browser, no
    # display, no network.
    "branding-dir-agreement|node $REPO_ROOT/scripts/verify-branding-agreement.mjs"
    "branding-dir-agreement-self-test|node $REPO_ROOT/scripts/verify-branding-agreement.mjs --self-test"

    # NEW (03-02): the icon-output gate -- the five PNG rasters per variant
    # are IHDR-exact and the ICO/ICNS containers wrapping them are
    # structurally valid.
    #
    # It asserts something DIFFERENT from the two rows above it, which is why
    # another pair of rows exists rather than none. generated-byte-identity
    # proves each raster equals its hand-written counterpart, and
    # branding-dir-agreement proves the directory holds the declared set --
    # but the four containers have no hand-written originals, so no per-file
    # comparison can see a directory entry pointing past the end of the file
    # or a missing icns magic. This row reads the five defaultN.png files per
    # variant and asserts PNG signature plus IHDR width and height both equal
    # to N; asserts firefox.ico opens with reserved 0, type 1 and a count
    # equal to its directory entries with each entry's payload slice
    # byte-identical to the corresponding raster; and asserts firefox.icns
    # opens with the icns magic and a total length equal to the file size
    # with each chunk's payload slice byte-identical to its raster while
    # walking the chunk chain.
    #
    # ON A TREE WITH NO generated/branding/, THIS ROW SKIPS AND PASSES, for
    # the same reason generate-check does: generated/ is git-ignored, so that
    # is the state of every fresh clone, and a tree that has never generated
    # cannot disagree with itself. A PRESENT but empty or partial tree is a
    # defect and fails -- the self-test's plants pin the distinction.
    #
    # icon-ihdr-self-test rides alongside for the reason every other
    # self-test row in this array gives: it mirrors the real icon set into
    # mkdtemp, asserts the unmutated control is green first, then plants one
    # mutation per case (a wrong-height PNG, a truncated ICO, a bad ICNS
    # magic) requiring red naming the file and both values.
    #
    # Both are honestly --quick. The check reads PNG, ICO and ICNS bytes off
    # disk only; the self-test copies into mkdtemp directories. No build, no
    # browser, no display, no network.
    "icon-ihdr|node $REPO_ROOT/scripts/verify-icon-ihdr.mjs"
    "icon-ihdr-self-test|node $REPO_ROOT/scripts/verify-icon-ihdr.mjs --self-test"

    # NEW (03-03): the installer-fragment gate -- the NSIS defines, MSIX
    # fields, macOS bundle fields and tile manifest the generator emits are
    # present and schema-complete.
    #
    # It asserts something DIFFERENT from the three pairs above it, which is
    # why another pair of rows exists rather than none. generated-byte-identity
    # proves each emitted file equals its hand-written counterpart,
    # branding-dir-agreement proves the directory holds the declared set, and
    # icon-ihdr proves the rasters and containers are structurally valid --
    # but the eight installer fragments have no hand-written originals, so no
    # per-file comparison can see a dropped !define, a malformed XML document,
    # or a BackgroundColor line that defies the manifest's tile_color state.
    # This row derives the fragment set from the generator's frozen TARGETS
    # table at check time and compares as set equality in both directions;
    # asserts each branding.nsi carries all six !define names with non-empty
    # values; asserts each AppxManifest fragment is tag-balanced XML carrying
    # DisplayName, Description and Identity Name; asserts each Info-plist
    # fragment carries CFBundleName and CFBundleIdentifier; and asserts each
    # tile manifest is tag-balanced XML whose BackgroundColor presence matches
    # the tile_color set-or-unset state read from configuration.toml at check
    # time. An empty derived set is its own failure, never a pass.
    #
    # Schema-complete ONLY, never build-verified -- GEN-03's honest split for
    # the foreign hosts, whose builds land with the packaging hosts under v2
    # PKG-01. No row label or message here claims a Windows or macOS build.
    #
    # ON A TREE WITH NO generated/branding/ AND NO generated/installer/, THIS
    # ROW SKIPS AND PASSES, for the same reason generate-check does:
    # generated/ is git-ignored, so that is the state of every fresh clone,
    # and a tree that has never generated cannot disagree with itself. A
    # PRESENT tree yielding no installer fragments is a defect and fails --
    # the self-test's plants pin the distinction.
    #
    # installer-schema-self-test rides alongside for the reason every other
    # self-test row in this array gives: it mirrors the real installer set
    # into mkdtemp, asserts the unmutated control is green first, then plants
    # one mutation per case (a dropped !define, malformed XML, a tile-color
    # state mismatch) requiring red naming the file and both values.
    #
    # Both are honestly --quick. The check reads text files off disk only;
    # the self-test mirrors into mkdtemp directories. No build, no browser,
    # no display, no network.
    "installer-schema|node $REPO_ROOT/scripts/verify-installer-schema.mjs"
    "installer-schema-self-test|node $REPO_ROOT/scripts/verify-installer-schema.mjs --self-test"

    # NEW: the vendored settings parser's provenance record, machine-checked.
    #
    # scripts/lib/toml.cjs's header records a sha256 and a body size and
    # forbids hand-editing the body. Nothing read any of it: the only reference
    # to the file anywhere outside itself was the import in generate.mjs, so a
    # re-vendor to a different upstream version, a hand-edit, or a
    # supply-chain substitution passed every gate this repo has. That is the
    # hand-kept-expectation pattern CLAUDE.md forbids, minus the comparison.
    #
    # BOTH SIDES ARE DERIVED. The expected digest is read out of the file's own
    # header and the actual one is computed over the file's own body, so a
    # legitimate re-vendor updates the header and the row follows it. The body
    # boundary is derived from the upstream banner rather than the header's
    # `tail -n +23`, whose line count nothing enforced.
    #
    # Honestly --quick: one file read and one hash.
    "vendored-parser-digest|node $REPO_ROOT/scripts/verify-vendored-parser.mjs"
    "vendored-parser-digest-self-test|node $REPO_ROOT/scripts/verify-vendored-parser.mjs --self-test"

    # NEW (04-02): EXT-01's declared-extensions pin gate -- every
    # [[extensions]] entry reaches the sidecar build as the exact bytes its
    # pin names, and nothing else does.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. generate-check proves
    # the generated/ tree matches the manifest right now, and
    # generated-byte-identity proves each emitted file equals its
    # hand-written counterpart -- but the theiaPlugins block lives in a
    # yarn-managed package.json with no tracked comparand, and neither row
    # reads the downloaded archives at all. A manifest with entries and a
    # stock package.json, a latest-floating block URL faithfully copied from
    # a drifted fragment, or one flipped byte in a downloaded vsix would
    # stay green under every row above. This row derives the expected map
    # from the manifest at check time and compares as set equality in both
    # directions (generated fragment, tracked block), asserts every Open
    # VSX block URL carries its pinned version segment, and asserts each
    # packed archive under the derived plugins directory hashes to its pin.
    # An empty derived set is NOT vacuous here: with no entries declared it
    # still reads the tracked package.json and requires the block absent, so
    # a stale block left behind by a removed entry goes red.
    #
    # extension-pins-self-test rides alongside for the reason every other
    # self-test row in this array gives: it builds a fully synthetic
    # fixture (two entries, random-byte archives pinned by their own
    # hashes), asserts the unmutated control is green first, then plants
    # one mutation per case (a corrupted archive byte, a latest-floating
    # URL in both fragment and block, a drifted block URL) requiring red
    # naming the entry.
    #
    # Both are honestly --quick. The check reads text files and archive
    # bytes off disk only; the self-test mirrors into mkdtemp directories.
    # No build, no browser, no display, no network. (The download step
    # itself is a build step, not a --quick check.)
    "extension-pins|node $REPO_ROOT/scripts/verify-extension-pins.mjs"
    "extension-pins-self-test|node $REPO_ROOT/scripts/verify-extension-pins.mjs --self-test"

    # NEW (04-03): TEL-01/TEL-02's telemetry gate -- the manifest's
    # [telemetry] reaches the sidecar as the powerbrowserTelemetry block,
    # and the batching sender's unit suite is green.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. generate-check proves
    # the generated/ tree matches the manifest right now, but the
    # powerbrowserTelemetry block lives in a yarn-managed package.json
    # with no tracked comparand, so a block still carrying an endpoint the
    # manifest no longer emits would stay green under every row above.
    # This row derives the expected pair from the manifest at check time
    # and compares as equality in both directions (generated fragment,
    # tracked block); then proves the sender compiles (tsc -b on the one
    # extension -- seconds, honestly --quick) and runs its plain-node
    # suite (dependency-free: bare node, no install, no build).
    #
    # telemetry-self-test rides alongside for the reason every other
    # self-test row in this array gives: it runs the suite against the
    # always-send stub requiring the off assertion red, and plants a
    # drifted block and a drifted fragment each requiring red naming the
    # drift -- with the unmutated control green first in both halves.
    #
    # Both are honestly --quick, with one named SKIP each for trees that
    # have never generated or never installed: an absent fragment skips
    # the fragment half (generate-check's own rule), and an absent theia
    # install skips the tsc half (the suite needs neither). No build, no
    # browser, no display, no network.
    "telemetry|node $REPO_ROOT/scripts/verify-telemetry.mjs"
    "telemetry-self-test|node $REPO_ROOT/scripts/verify-telemetry.mjs --self-test"

    # NEW (04-04): GEN-05 remainder's branding gate -- the manifest's
    # [theia]/[installer] display values plus brand/mark.svg reach the
    # sidecar as the theia.frontend.config applicationName/defaultTheme
    # keys and the powerbrowserBranding block, and the branding extension
    # compiles.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. generate-check proves
    # the generated/ tree matches the manifest right now, but the branding
    # keys live in a yarn-managed package.json with no tracked comparand,
    # so a block still carrying a repo URL the manifest no longer emits
    # would stay green under every row above. This row derives the expected
    # maps from the manifest at check time and compares as equality in
    # both directions (generated fragments, tracked keys and block); then
    # proves the extension compiles (tsc -b on the one extension --
    # seconds, honestly --quick).
    #
    # theia-branding-self-test rides alongside for the reason every other
    # self-test row in this array gives: it plants a drifted block, a
    # drifted fragment and a removed block each requiring red naming the
    # drift -- with the unmutated control green first.
    #
    # Both are honestly --quick, with the same two named SKIPs as the
    # telemetry pair: an absent fragment skips the fragment half
    # (generate-check's own rule), and an absent theia install skips the
    # tsc half. No build, no browser, no display, no network.
    "theia-branding|node $REPO_ROOT/scripts/verify-theia-branding.mjs"
    "theia-branding-self-test|node $REPO_ROOT/scripts/verify-theia-branding.mjs --self-test"

    # NEW (04-04): TEL-03's endpoint-allowlist coverage gate -- every host
    # the manifest names (telemetry endpoint, [urls] values, support URL)
    # is present in powerbrowser/endpoint-allowlist.json, and the two
    # manifest-driven pref expects stay in sync with the manifest
    # derivation.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. verify-endpoints.sh
    # layer 1 compares the INSTALLED pref files against the allowlist's
    # `expect` values, but it needs the built binary; without this row a
    # manifest repoint that nobody carried into the allowlist would stay
    # green through every --quick row and fail only after a tier-3 build.
    # This row derives the expected hosts and pref values from the
    # manifest at check time (the same derivation the generator emits
    # from -- one source, so the two gates cannot disagree) and compares
    # as set equality in both directions for marked entries
    # (generated fragment, tracked allowlist), requires every derived
    # host present in the allowlist naming the host, and requires the
    # driven pref expects to agree naming the pref.
    #
    # theia-endpoints-self-test rides alongside for the reason every other
    # self-test row in this array gives: it plants a manifest endpoint
    # host absent from the allowlist and a marked allowlist entry covering
    # no manifest host, each requiring red naming the drift -- with the
    # unmutated control green first.
    #
    # Both are honestly --quick: text off disk only, with the same absent
    # fragment SKIP as every other fragment gate (generate-check's own
    # rule). No build, no browser, no display, no network.
    "theia-endpoints|node $REPO_ROOT/scripts/verify-theia-endpoints.mjs"
    "theia-endpoints-self-test|node $REPO_ROOT/scripts/verify-theia-endpoints.mjs --self-test"

    # NEW (07-04): the downstream-fixture proof rows -- the harness drives the
    # committed fixture set plus its self-test (wrappers above; glob-derived
    # root, honestly --quick, per-command config env). Both layers of the
    # VER-03 argument run here: the static sweep stays green on the restored
    # default tree and the generate-level brand agreement is asserted per
    # fixture inside the harness.
    # NEW (09-04): the wrapper above drives a second --all over the 09
    # extension-kind fixture cells (npm, local-path, one real pinned Open VSX
    # entry) with the per-kind download-map oracle, so this same full row is
    # the enforcement for the BLD-02 generate-level cells, never the
    # self-tests alone.
    "verify-downstream-fixtures|check_verify_downstream_fixtures"
    "verify-downstream-fixtures-self-test|check_verify_downstream_fixtures_self_test"

    # NEW (08-04): the self-hosted MAR-hop proof rows. The full row
    # re-verifies a completed N to N-plus-1 proof from its evidence files
    # (.mozbuild/mar-hop/): distinct versions and build IDs, hash-pinned
    # descriptor byte-identical to a fresh emission, fork-server access-log
    # entries for descriptor and MAR, and zero Mozilla hosts in the
    # client resolver log. It FAILS when the evidence is absent -- a check
    # that goes green because it could not find its own subject is the
    # green-by-construction shape, so the full row names docs/BUILD.md's
    # packaging procedure instead of skipping.
    #
    # mar-update-hop-self-test rides alongside for the reason every other
    # self-test row in this array gives: it runs a mock proof through the
    # same runChecks (control green first), then requires red naming file
    # and values for a same-version loop, a stale-hash descriptor, a
    # Mozilla host in the resolver log, plus the 46-03 plants (notification
    # absent, version not N+1, layout not restored, read-only ready string,
    # read-only empty).
    #
    # Honestly --quick for the twin only: node:crypto plus text files in
    # mkdtemp. No build, no browser, no display, no network. The full row
    # is emphatically not --quick.
    "mar-update-hop-self-test|node $REPO_ROOT/scripts/verify-mar-update-hop.mjs --self-test"
    # NEW (Phase 46, UPD-27): the exposure self-test twin. Fixture doubles
    # only (silent/throwing/recording) plus the comparand-missing plant;
    # each red naming its signal. Honestly --quick: node only, no build,
    # browser, display or network.
    "nimbus-exposure-self-test|node $REPO_ROOT/scripts/verify-nimbus-exposure.mjs --self-test"

    # NEW (08-04): the NSIS-on-Nix build-proof rows. The full row stages
    # the pinned installer inputs from the tree at check time (real
    # installer.nsi plus includes, toolkit files, plugin DLLs, the real
    # generated branding.nsi, defines.nsi preprocessed with check-time
    # values, locales through the real preprocess-locale.py), compiles
    # with makensis, and requires setup.exe. Stand-ins stay labeled, never
    # blessed: wizard bitmaps plus defines.nsi Mozilla literals are
    # upstream's, and the PASS line says the compile only.
    #
    # installer-build-proof-self-test rides alongside: a synthetic script
    # plus a copy of the real generated branding.nsi (control green
    # first), then red for a dropped !define, a missing include, and a
    # deleted artifact.
    #
    # Honestly --quick for the twin only: one local makensis compile in
    # mkdtemp, seconds. The compiler is host tooling, self-provided via
    # nix shell nixpkgs#nsis when not on PATH (first run fetches, later
    # runs are local) -- absent tooling fails naming the shell, never
    # skips green. The full row is emphatically not --quick.
    "installer-build-proof-self-test|node $REPO_ROOT/scripts/verify-installer-build-proof.mjs --self-test"

    # NEW (09-02): the crash-collector contract rows -- the Antenna-protocol
    # surface stays pinned while the native reporter stays compiled out.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. Every row above pins
    # manifest-derived fragments, tracked blocks, or downloaded bytes, and
    # none of them reads the collector's wire vocabulary at all. This row
    # derives the expected literals from the collector's own exports at
    # check time and requires the written policy to state each one (submit
    # path, minidump part name, CrashID=/Discarded= shapes, rejection
    # reasons, retention window, throttle rule and budget, annotation
    # allowlist), so a policy edit that drops a literal goes red naming it.
    #
    # crash-collector-self-test rides alongside for the reason every other
    # self-test row in this array gives: it answers a well-formed submit
    # with CrashID plus a matching store record first (control green),
    # then requires red naming the rule for a non-multipart submit, a
    # submit with no minidump part, an over-cap body, an over-count part
    # set, and a tripped throttle (soft-reject on the success status) --
    # with the store dir proven empty after every rejection, so no plant
    # passes vacuously.
    #
    # Both are honestly --quick: node:crypto plus text/bytes in mkdtemp.
    # No build, no browser, no display, no network.
    "crash-collector|node $REPO_ROOT/scripts/verify-crash-collector.mjs"
    "crash-collector-self-test|node $REPO_ROOT/scripts/verify-crash-collector.mjs --self-test"

    # --- non-GUI wave E (NG-068, NG-070, NG-074): quick rows. No build, no browser,
    # no display; ng068 binds a loopback port only and reads upstream/'s report.rs.
    "ng068-crash-extra-part|node $REPO_ROOT/scripts/verify-ng-068-crash-extra-part.mjs"
    "ng070-no-spaced-name|node $REPO_ROOT/scripts/verify-ng-070-no-spaced-name.mjs"
    "ng070-no-spaced-name-self-test|node $REPO_ROOT/scripts/verify-ng-070-no-spaced-name.mjs --self-test"
    "ng074-ci-green-on-main-self-test|node $REPO_ROOT/scripts/verify-ng-074-ci-main.mjs --self-test"
    # NG-089 (Phase 24, UAT-01): the UAT-sheet check's plant self-test; quick.
    "ng089-uat-sheets-self-test|node $REPO_ROOT/scripts/verify-ng-089-uat-sheets.mjs --self-test"

    # NEW (Phase 45, PKG-22/PKG-18/PKG-23): the portability self-test twins.
    # Each twin is honestly --quick (node plus text/bytes in mkdtemp only: no
    # build, no browser, no display, no network); the full rows live in the
    # full set below beside ng063 and FAIL naming the container-build
    # procedure when the container tarball is absent, never skip green.
    # NEW (Phase 45, PKG-04/PKG-05): the packaged-identity self-test twin.
    # Honestly --quick for the same reason (mkdtemp fixtures, derivation
    # reads only); the full row lives beside ng063 below.
    "portable-elf-self-test|node $REPO_ROOT/scripts/verify-portable-elf.mjs --self-test"
    "sidecar-no-symlinks-self-test|node $REPO_ROOT/scripts/verify-sidecar-no-symlinks.mjs --self-test"
    "package-target-natives-self-test|node $REPO_ROOT/scripts/verify-package-target-natives.mjs --self-test"
    "packaged-identity-self-test|node $REPO_ROOT/scripts/verify-packaged-identity.mjs --self-test"
    # NEW (Phase 45, CR-05): the drift comparator behind the container baseline.
    # Planted mismatched sysroot and UNMEASURED lines must go red; no host state read.
    "toolchain-baseline-self-test|bash $REPO_ROOT/scripts/toolchain-baseline.sh --self-test"
    # NEW (Phase 45, CR-03): the release objdir name is read from mozconfig.release,
    # so the packager and the release rows share one value. Planted mozconfig text only.
    "release-objdir-self-test|node $REPO_ROOT/scripts/lib/release-objdir.mjs --self-test"
    # NEW (Phase 45, WR-04): the CLI URL admission predicate, read from the shell
    # module and probed with planted refusal shapes; the self-test plants two mutants.
    "cli-url-admission|node $REPO_ROOT/scripts/verify-cli-url.mjs"
    "cli-url-admission-self-test|node $REPO_ROOT/scripts/verify-cli-url.mjs --self-test"
    # NEW (Phase 45, WR-03): the pre-45 sidecar state file moves once into ProfD and a
    # failed move keeps it findable; read from TheiaService and run against a fake store.
    "sidecar-state-migration|node $REPO_ROOT/scripts/verify-sidecar-state-migration.mjs"
    "sidecar-state-migration-self-test|node $REPO_ROOT/scripts/verify-sidecar-state-migration.mjs --self-test"

    # NEW (09-03): the WebExtensions declaration rows -- the manifest's
    # [[webextensions]] table reaches the policy engine as the tracked
    # ExtensionSettings key.
    #
    # It asserts something DIFFERENT from the rows above it, which is why
    # another pair of rows exists rather than none. Every row above pins
    # manifest-derived fragments, tracked blocks, downloaded bytes, or the
    # collector's wire vocabulary, and none of them reads the distribution
    # policy at all. This row derives the expected ExtensionSettings map
    # from the manifest at check time through the generator's own emitter
    # and requires the tracked key to equal it in both directions (a key
    # outliving its manifest entry goes red naming the add-on id), plus
    # install_url origin coverage against the endpoint allowlist naming
    # the host -- so a declared add-on the policy engine would fetch from
    # an untracked host goes red here in seconds rather than at runtime.
    #
    # webextensions-self-test rides alongside for the reason every other
    # self-test row in this array gives: it proves the unmutated control
    # green first, then requires red naming the defect for a drifted
    # tracked key, a drifted fragment, a stale tracked key, and an
    # uncovered fixture origin -- with all fixtures synthetic Acme data in
    # mkdtemp, so the tracked allowlist stays free of fixture hosts.
    #
    # Both are honestly --quick: text off disk only, with the same absent
    # fragment SKIP as every other fragment gate (generate-check's own
    # rule). No build, no browser, no display, no network.
    "webextensions|node $REPO_ROOT/scripts/verify-webextensions.mjs"
    "webextensions-self-test|node $REPO_ROOT/scripts/verify-webextensions.mjs --self-test"

    # NEW (12-03): SQL-05's store gates, static halves. Honestly --quick: the
    # second-writer scan reads tracked source only (git ls-files, never the
    # upstream clone), and the soak default entry runs the static fixture
    # interleave only -- stage copies under mktemp, never a profile path, and
    # it never launches anything (the live half is the separate --live row in
    # the full set below). No build, no browser, no display, no network. Each
    # self-test rides alongside for the reason every other self-test row in
    # this array gives: a gate that can only go green is not a check, and both
    # instruments prove both directions (planted open plus stripped flag;
    # tampered copy tripping plus clean copy single-ok).
    "sql-store-second-writer|node $REPO_ROOT/scripts/verify-sql-store-second-writer.mjs"
    "sql-store-second-writer-self-test|node $REPO_ROOT/scripts/verify-sql-store-second-writer.mjs --self-test"
    "sql-store-soak|node $REPO_ROOT/scripts/verify-sql-store-soak.mjs"
    "sql-store-soak-self-test|node $REPO_ROOT/scripts/verify-sql-store-soak.mjs --self-test"
    # NEW (14.1.1-04): G-14.1.1-24's backend environment gate, the nearest
    # structural sibling of the second-writer scan above and registered beside
    # it for that reason. powerbrowser-env.ts scrubs every product-prefixed key
    # out of process.env at MODULE LOAD, so a backend module that reads the live
    # environment directly finds nothing and fails SILENTLY -- GUI-DEFECTS item
    # 9, guarded until now by a comment in tab-query-service.ts, and a comment
    # is not a check. Two derived assertions: the set of backend files touching
    # the live environment at all equals a one-entry allowlist carrying its
    # reason (red on an ungated new reader AND on a stale entry), and the set
    # reading a prefixed key straight off it is empty. The prefix is derived
    # from the capture loop itself, so the rebrand cannot leave the gate
    # matching a dead prefix. Assertion B is negated, so the row reports its
    # scanned-file count and fails distinctly at zero -- a clean result over an
    # empty walk proves nothing. Honestly --quick: text reads only. No build,
    # no browser, no display, no network. The self-test rides alongside for the
    # reason every other self-test row in this array gives.
    "backend-env-readers|node $REPO_ROOT/scripts/verify-backend-env-readers.mjs"
    "backend-env-readers-self-test|node $REPO_ROOT/scripts/verify-backend-env-readers.mjs --self-test"
    # NEW (non-GUI wave B, NG-027): every PowerBrowserAPI and TabQueryService
    # reader has a caller on the runtime path. Readers and call sites are
    # derived from the tree at check time; a reader called only by a dead
    # reader is dead too. Honestly --quick: text reads only. The self-test runs
    # the analyzer over a synthetic tree and requires red on a removed call
    # site, a planted reader and an empty scan.
    "ng-027-reader-callers|node $REPO_ROOT/scripts/verify-ng-027-reader-callers.mjs"
    "ng-027-reader-callers-self-test|node $REPO_ROOT/scripts/verify-ng-027-reader-callers.mjs --self-test"
    # NEW (12-CODE-REVIEW.md WR-03): the tab-uris reader typecheck. Honestly
    # --quick per the function comment above: the extension's own tsc over
    # its own project, --noEmit, seconds, no build/browser/display/network.
    "tab-uris-typecheck|check_tab_uris_typecheck"
    # NEW (Phase 19, UPD-10): judge() of the live first-boot check against planted faults
    # (surplus tab, getting-started, startup editor, telemetry copy, boot errors). Honestly
    # --quick: text reads of the tree and pure comparisons, no build, browser or network.
    "first-boot-surface-self-test|node $REPO_ROOT/scripts/verify-first-boot-surface.mjs --self-test"
    # NEW (Phase 19, UPD-08): exactly one installed copy each of react, react-dom,
    # @types/react, @types/react-dom and inversify under theia/, walked without following
    # symlinks. An absent theia/node_modules is a FAIL, not a skip; CI installs before
    # --quick. Honestly --quick: text reads of installed manifests only, no build, browser,
    # display or network. The self-test plants a nested and a symlinked duplicate, a
    # missing package and an absent install in mkdtemp trees.
    "single-copy-deps|node $REPO_ROOT/scripts/verify-single-copy-deps.mjs"
    "single-copy-deps-self-test|node $REPO_ROOT/scripts/verify-single-copy-deps.mjs --self-test"
    # NEW (NG-086, Phase 19, UPD-07..UPD-09): the installed @theia/* closure equals
    # configuration.toml's theia_release (monaco-editor-core excepted), the installed React
    # packages satisfy @theia/core's peers, and flake.nix's Node major meets engines.node.
    # Honestly --quick: text reads of manifests and installed package.json files only, no
    # build, browser, display or network. Its demonstrated red is the record-fail taken
    # with the manifest pin moved ahead of the install.
    "ng086-theia-react-node|node $REPO_ROOT/scripts/verify-ng-086-theia-react-node.mjs"
    "ng086-theia-react-node-self-test|node $REPO_ROOT/scripts/verify-ng-086-theia-react-node.mjs --self-test"
    # NEW (Phase 19, 19-08, WR-05): the packaged Node major in node-runtime.json agrees with
    # flake.nix's nodejs_NN, and both meet theia/package.json engines.node. Honestly --quick:
    # three text reads, no build, browser, display or network. The self-test plants each
    # fault in mkdtemp copies of the three files.
    "node-major-agreement|node $REPO_ROOT/scripts/verify-node-major-agreement.mjs"
    "node-major-agreement-self-test|node $REPO_ROOT/scripts/verify-node-major-agreement.mjs --self-test"
    # NEW (Phase 20, PLAT-05): every planning-path literal in tracked scripts/ and .github/
    # resolves against git ls-files (a file, a dir prefix, or a glob matching exactly one).
    # Honestly --quick: git ls-files and text reads only. Red on any unresolved literal or on
    # zero references. The v1.4 closeout turns it red on purpose if a script still points
    # into a live phase dir.
    "planning-paths|node $REPO_ROOT/scripts/verify-planning-paths.mjs"
    "planning-paths-self-test|node $REPO_ROOT/scripts/verify-planning-paths.mjs --self-test"
    # NEW (v1.6 workstream deploy): plan-gate.py --stream scopes due rows to one planning
    # stream, because a GSD workstream numbers its phases independently of main. Honestly
    # --quick: temp-dir plants only. Red when a stream-less row stops counting in the default
    # stream, or a row leaks across streams.
    "plan-gate-streams-self-test|check_plan_gate_streams_self_test"
    # NEW (Phase 40, AUTO-10): every tracked patch equals its regeneration from the applied
    # upstream/ (git diff HEAD --abbrev=10 over the paths of the patch's own diff --git
    # headers, user git config off; a path the regeneration drops is refused, WR-01). A file upstream moved since the patch was generated (an ESR bump) is compared on
    # its added and removed lines only, with a regenerate NOTE (CR-01, phase 40 review).
    # Honestly --quick: git plumbing over the existing upstream/ checkout, no build,
    # browser, display or network. upstream/ is required: CI's verify.yml provides an applied
    # checkout.
    "patches-regenerated|bash $REPO_ROOT/scripts/regenerate-patches.sh --check"
    # patches-regenerated-self-test rides alongside for the reason every other self-test row
    # in this array gives: a hermetic fixture repo, green control first, then a hand-edited
    # hunk, a pristine upstream, two patches naming one path and an unsafe write -- each red,
    # naming the patch -- plus a clean replay onto a moved upstream (green) and a hand-edited
    # hunk on that moved upstream (red), a two-file patch with one file unchanged upstream
    # (red, naming it) and a patch deleting a file (green, deletion kept).
    "patches-regenerated-self-test|bash $REPO_ROOT/scripts/regenerate-patches.sh --self-test"
    # NEW (Phase 40, REL-01): the release key v<ESR>-<revision> derived by releaseIdentity()
    # agrees with both version files, the upstream milestone, every tracked update.xml
    # descriptor and every release-shaped git tag HEAD contains. Honestly --quick: git plumbing and text
    # reads only, no build, browser, display or network.
    "release-identity|node $REPO_ROOT/scripts/verify-release-identity.mjs"
    # release-identity-self-test plants thirteen faults in one mkdtemp git repo (two version
    # literals, an off-pin milestone, two descriptor versions, six no-update descriptor
    # fragments that must not pass as a no-update document (WR-01), two tags) and keeps six
    # controls green, among them a commit after a release tag and a higher tag on a commit
    # HEAD does not contain (WR-02); it writes nothing in the repository.
    "release-identity-self-test|node $REPO_ROOT/scripts/verify-release-identity.mjs --self-test"
    # NEW (Phase 40, UPD-11): the update channel and the MAR channel id derive from
    # UPDATE_CHANNEL through the .mozconfig emission, and every structured channel mention in
    # the tracked tree equals the value of its own kind. Honestly --quick: git ls-files and text
    # reads plus an in-memory emit, no build, browser, display or network.
    "update-channel|node $REPO_ROOT/scripts/verify-update-channel.mjs"
    # update-channel-self-test plants each mismatch kind in memory (a release descriptor path, a
    # backticked <app_basename>-release, the tracked .mozconfig channel, a doc MAR_CHANNEL_ID, the
    # MAR id under the channel kind, letter case, the emitter, zero mentions, and the update-URL
    # policy key with an https and an empty value) and keeps the MAR key store and runner unit
    # names green; it writes nothing.
    "update-channel-self-test|node $REPO_ROOT/scripts/verify-update-channel.mjs --self-test"
    # NEW (Phase 40, UPD-33): layer 3's real `Resolving host [...]` extraction and the shared
    # verdict (scripts/lib/endpoint-verdict.mjs) over fixture logs. An unattended user-initiated
    # host goes red naming it, passes after a user action; deny fails in both modes; allow passes;
    # every real user-initiated host is planted unattended. Honestly --quick: bash and node over
    # fixture logs, no build, browser, display or network.
    "endpoint-dispositions-self-test|bash $REPO_ROOT/scripts/verify-endpoints.sh --disposition-self-test"
    # NEW (Phase 40, UPD-25): both variants' firefox-branding.js, emitted in memory from the
    # generator's TARGETS rows, set no app.update.* pref outside the set the generator owns
    # (releaseLinkPrefs names plus app.update.langpack.enabled, derived; WR-05), keep
    # app.update.langpack.enabled false, and carry the About-dialog links
    # releaseLinkPrefs derives. Honestly --quick: in-memory emission and text parsing only; it
    # writes no file and runs no build, browser, display or network.
    "update-prefs|node $REPO_ROOT/scripts/verify-update-prefs.mjs"
    # update-prefs-self-test plants six update prefs the generator does not own (the five
    # UPD-25 cadence prefs and app.update.background.enabled), a langpack line flipped to
    # true, an unparseable app.update.url.manual, no emitter rows and no release row in emitted
    # text, each red naming the pref and variant; an added extensions.update.autoUpdateDefault
    # line stays green (a different pref family). It writes nothing.
    "update-prefs-self-test|node $REPO_ROOT/scripts/verify-update-prefs.mjs --self-test"
    # NEW (Phase 40, PKG-08): LICENSING.md and THIRD-PARTY-NOTICES.txt equal their re-derivation
    # from configuration.toml and about:license, preprocessed from the applied upstream/ checkout
    # with Mozilla's own mozbuild preprocessor. Honestly --quick: python over upstream/ plus file
    # reads; no build, browser, display or network. The byte comparison with the built
    # license.html runs only where an objdir exists, otherwise one named SKIP line.
    "licensing|node $REPO_ROOT/scripts/generate-licensing.mjs --check"
    # licensing-self-test builds a fixture node_modules and node-runtime.json in a temp dir: two
    # byte-identical MIT texts render as one block, a licence-less package is listed with its
    # marker, and a tampered line, an added package, a removed package, a Node header version off
    # the pin and an unresolvable dependency each go red naming the file, package or versions.
    # It writes nothing in the tree.
    "licensing-self-test|node $REPO_ROOT/scripts/generate-licensing.mjs --self-test"
    # NEW (Phase 41, GH-02): repo-controls-self-test serves the declared .github/settings/
    # bodies back in GitHub's live response shape and plants each widening -- allowed_actions
    # all, sha_pinning_required false, an orphan, missing or empty settings set, and a getter
    # that throws -- each red naming the control. Honestly --quick: in-memory, with no network
    # and no gh; it writes nothing. The live read-back is the full-tier repo-controls row.
    "repo-controls-self-test|node $REPO_ROOT/scripts/verify-repo-controls.mjs --self-test"
    # NEW (Phase 47, DIST-03): updates-repo-static-self-test plants, in memory only, a functions
    # hook file, a root-level _worker.js, a nested functions path, a truncated listing, a non-array
    # tree, an empty listing, a throwing getter, a malformed result, a non-github release_notes host
    # and an unknown argument, each red naming its path, endpoint or key over a clean static tree
    # that must stay green first. Honestly --quick: in-memory, no network and no gh; it writes nothing.
    # The live read-back is the full-tier updates-repo-static row.
    "updates-repo-static-self-test|node $REPO_ROOT/scripts/verify-updates-repo-static.mjs --self-test"
    # NEW (Phase 47, WR-02): the privacy page's unattended-host list equals, as a set, the
    # allow-dispositioned hosts of powerbrowser/endpoint-allowlist.json (loopback excluded).
    # Derived from the allowlist at check time; red naming any host on one side only.
    # Honestly --quick: two text reads, no build, browser, display or network.
    "privacy-hosts|node $REPO_ROOT/scripts/verify-privacy-hosts.mjs"
    # privacy-hosts-self-test plants an extra page host, a missing page host, an allowlist addition
    # the page omits, an allowlist removal the page still lists, and a page with no marked host, each
    # red naming its host or attribute; the real page and allowlist stay green first. It writes nothing.
    "privacy-hosts-self-test|node $REPO_ROOT/scripts/verify-privacy-hosts.mjs --self-test"
    # NEW (Phase 47, WR-04): website-publish-ready-self-test plants an OWNER TO FILL marker, a
    # class="pending" block and an empty site over a clean fixture that carries a CSS .pending
    # selector (which must stay green); each red naming its file or marker. It writes nothing.
    # The live read of website-staging/ is the full-tier website-publish-ready row.
    "website-publish-ready-self-test|node $REPO_ROOT/scripts/verify-website-publish-ready.mjs --self-test"
    # NEW (Phase 47, WR-05): the legal page carries the configuration.toml [legal] license, copyright
    # holder and trademark notice verbatim. Values come from generate.mjs resolveConfig, not a regex
    # over the TOML. Honestly --quick: one manifest resolution and one text read.
    "legal-page-verbatim|node $REPO_ROOT/scripts/verify-legal-page.mjs"
    # legal-page-verbatim-self-test plants one edited value per [legal] key over a fixture carrying
    # each value verbatim; each edit goes red naming its key. It writes nothing.
    "legal-page-verbatim-self-test|node $REPO_ROOT/scripts/verify-legal-page.mjs --self-test"
    # NEW (Phase 41, GH-12 and GH-08): the trust-boundary rules over every workflow --
    # SHA-pinned and admitted uses:, set equality with actions-selected.json, and the GH-12
    # runner, permission, trigger, cache and event-text rules. Honestly --quick: YAML parsing
    # (js-yaml from theia/) and file reads only; no build, browser, display or network.
    "workflows|node $REPO_ROOT/scripts/verify-workflows.mjs"
    # workflows-self-test plants, in memory, unpinned, short, uppercase and docker:// uses:, an
    # unadmitted foo/bar, an unused admission, an empty patterns_allowed, a duplicate on:, zero
    # workflows, and each GH-12 fault over a good release.yml fixture; each red naming file and
    # job. It writes nothing.
    "workflows-self-test|node $REPO_ROOT/scripts/verify-workflows.mjs --self-test"
    # NEW (Phase 41, AUTO-09): zizmor --offline over .github/workflows/ at its default persona,
    # green only on exit 0. Honestly --quick, offline audit; the zizmor binary comes from the
    # theia shell or is self-provided through nix develop on first use, and absent tooling fails
    # naming the shell, never skips.
    "zizmor|node $REPO_ROOT/scripts/verify-zizmor.mjs"
    # zizmor-self-test audits the mkdtemp bad and clean fixtures: bad (event text in run:,
    # actions/checkout@v4) must exit non-zero naming template-injection and unpinned-uses, clean
    # must exit 0. It writes nothing in the tree.
    "zizmor-self-test|node $REPO_ROOT/scripts/verify-zizmor.mjs --self-test"
    # NEW (Phase 46, UPD-19): the chrome/frontend shell-request kind contract.
    # Derives the accepted kinds from handleShellMessage cases plus
    # SHELL_MESSAGE_KINDS and the dispatched kinds from the Theia shell-state
    # channel clients plus the ShellStateMessage union, and compares as set
    # equality; out-of-scope kinds (other dispatches, pushes) derive from
    # their own unions. Honestly --quick: text reads only.
    "shell-request-kinds|node $REPO_ROOT/scripts/verify-shell-request-kinds.mjs"
    # shell-request-kinds-self-test plants, in memory only, a stray accepted
    # kind, a stray dispatched kind, a removed kind on each side, and a
    # throwing default case; each must go red naming the kind and the side.
    "shell-request-kinds-self-test|node $REPO_ROOT/scripts/verify-shell-request-kinds.mjs --self-test"
    # NEW (Phase 46, UPD-32): the update-copy shape gate. Derives the seven
    # contracted strings from the @powerbrowser/branding contribution and
    # applies the no-internal-identifier shape test (names PowerBrowser, no
    # ALL-CAPS token or dotted key, body wired to its on-screen affordance in
    # the client). Honestly --quick: text reads only.
    "update-copy|node $REPO_ROOT/scripts/verify-update-copy.mjs"
    # update-copy-self-test plants, in memory only, a pref key, an ALL-CAPS
    # token, a missing product name, an unwired affordance, a status with no
    # next step, an unclassified string, client literals (whitespace-bearing
    # and single-word) and the two Check-again faults, each red naming its
    # drift. The once-per-session rule is driven through the real client
    # (prompts 1, 1, 2), not a constant stub (CR-06, WR-05, WR-06).
    "update-copy-self-test|node $REPO_ROOT/scripts/verify-update-copy.mjs --self-test"
    # NEW (Phase 46, review CR-01): the update observer is started from the real
    # startup path (TheiaService._swap) and its stop function is invoked on
    # shutdown. Derived from the tree; self-test plants a removed call site, a
    # dropped stop call and a definer-only tree.
    "update-observer-wired|node $REPO_ROOT/scripts/verify-update-observer-wired.mjs"
    "update-observer-wired-self-test|node $REPO_ROOT/scripts/verify-update-observer-wired.mjs --self-test"
    # NEW (Phase 46, review CR-02): currentState is a numeric long in the shipped
    # IDL; the shell compares it to a named STATE_* constant, never a string or
    # a bare number. Derived from the IDL and the shell at check time.
    "update-state-contract|node $REPO_ROOT/scripts/verify-update-state-contract.mjs"
    "update-state-contract-self-test|node $REPO_ROOT/scripts/verify-update-state-contract.mjs --self-test"
    # NEW (Phase 46, WR-07 owner ruling 2026-10-25): no tracked descriptor template,
    # generator output or fixture names a github.com /releases/download/ URL as an
    # update download (github.com is user-initiated; the MAR fetch must not touch it).
    # Derived from git ls-files; self-test plants three github forms and two controls.
    "update-download-host|node $REPO_ROOT/scripts/verify-update-download-host.mjs"
    "update-download-host-self-test|node $REPO_ROOT/scripts/verify-update-download-host.mjs --self-test"
  )

  if [ "$QUICK" -eq 0 ]; then
    CHECKS+=(
      # NEW (01-07): the Theia half's smoke gate. It was the ONLY member of
      # 01-VALIDATION.md's full-suite command with no row in this registry --
      # a real superset gap, found by reconciling the two at the phase gate
      # rather than by assuming consolidation had been exhaustive. Its
      # sibling `smoke-firefox` was already here.
      #
      # Registered FIRST in the full set, ahead of every check that boots the
      # Theia app: it runs `yarn install --frozen-lockfile` and rebuilds
      # drivelist's native module, which is the state those checks assume. It
      # needs the theia dev shell and mutates node_modules, so it is
      # emphatically not --quick.
      "smoke-theia|bash $REPO_ROOT/scripts/smoke-theia.sh"

      # from verify-phase-02.sh -- each needs a live Theia frontend, started
      # lazily by the wrapper (see theia_app_up above).
      "diff-theia-core|check_diff_theia_core"
      "verify-branding|check_verify_branding"
      "verify-customize-inert|check_verify_customize_inert"
      "verify-dev-flag-off|check_verify_dev_flag_off"
      "verify-uri-roundtrip|check_verify_uri_roundtrip"

      # RE-TIERED, not weakened. Both of these were registered in a deleted
      # driver's --quick set while actually depending on something --quick
      # promises not to need, so `--quick` could never be green on a fresh
      # checkout and was therefore useless as a commit gate -- the failure it
      # printed was always the same two rows and carried no information.
      #
      #   desktop-entry-quick     reads objdir/config.status, i.e. a BUILT tree.
      #                           verify-phase-03.sh registered it ONLY under
      #                           --quick, so it was also unreachable in a full
      #                           run; here it runs in the full set and under
      #                           --only, which is strictly more reach.
      #   apply-patches-self-test derives its fixture from
      #                           upstream/browser/moz.configure -- the 1.1 GB
      #                           clone scripts/fetch-upstream.sh materialises,
      #                           which is git-ignored and absent on a fresh
      #                           checkout.
      #
      # Neither is excused: both still run, and `--only <label>` reaches each.
      # What changed is which tier honestly describes their prerequisites.
      "desktop-entry-quick|check_desktop_entry_quick"
      "apply-patches-self-test|bash $REPO_ROOT/scripts/apply-patches.sh --self-test"

      # NEW (01-20), and RE-TIERED for the same reason as apply-patches-self-test
      # above, not excused. This row reads
      # upstream/browser/base/content/aboutDialog.xhtml -- the same git-ignored
      # 1.1 GB clone, absent on a fresh checkout -- so it cannot honestly claim
      # --quick's promises. It is the half of the About-dialog gate that
      # compares the shipped suppression selectors against the REAL upstream
      # markup rather than an authored fixture, which is what makes it the gate;
      # about-dialog-suppression-self-test in the --quick array proves the
      # instrument discriminates.
      #
      # It FAILS rather than SKIPS when the clone is absent: the script names
      # the missing path and scripts/fetch-upstream.sh and exits 1. A check that
      # goes green because it could not find its own subject is the
      # green-by-construction shape deferred-items.md rows 4, 9 and 10 record.
      # It still runs in every full run, and `--only about-dialog-suppression`
      # reaches it.
      "about-dialog-suppression|node $REPO_ROOT/scripts/verify-about-dialog-suppression.mjs"

      # from verify-phase-03.sh -- branding-variant-divergence reads from BOTH
      # objdir/dist/bin and objdir-release/dist/bin, so it needs a full dev AND
      # release build; verify-branding-identity.mjs's about-support surface
      # launches a real browser session.
      "branding-variant-divergence|check_branding_variant_divergence"
      "verify-branding-identity-dev|node $REPO_ROOT/scripts/verify-branding-identity.mjs"
      "verify-branding-identity-release|node $REPO_ROOT/scripts/verify-branding-identity.mjs --variant release"
      "verify-branding-identity-brand-ftl-control|node $REPO_ROOT/scripts/verify-branding-identity.mjs --variant release --positive-control brand-full-name"
      # NEW (01-04): the runtime-identity positive control. The brand-ftl
      # control above proves the comparison discriminates on a value read out
      # of a packaged .ftl; runtime-identity is read from the LAUNCHED binary
      # via BiDi, a different read path with its own way of agreeing with
      # everything, so it needs its own control rather than inheriting the
      # other surface's.
      "verify-branding-identity-runtime-control|node $REPO_ROOT/scripts/verify-branding-identity.mjs --positive-control runtime-identity"
      # NEW (01-04): the Gecko smoke script. On an already-built tree its
      # `./mach build` is an incremental no-op and what it actually asserts is
      # post-build -- that the build never invoked `mach bootstrap` (D-18) and
      # that `./mach run --version` reports the version in upstream/'s
      # version_display.txt. Before the build it runs fetch-upstream.sh, which
      # fails unless upstream/ HEAD is the pinned tag's commit.
      "smoke-firefox|bash $REPO_ROOT/scripts/smoke-firefox.sh"
      "verify-endpoints|bash $REPO_ROOT/scripts/verify-endpoints.sh"
      "verify-endpoints-interrupt-self-test|bash $REPO_ROOT/scripts/verify-endpoints.sh --interrupt-self-test"

      # NEW (08-04, extended 46-03 UPD-24): the self-hosted MAR-hop proof
      # (PKG-02, T-08-04a). Reads the effective update URL from
      # configuration.toml [urls] update (UPD-12; never user-branch prefs)
      # and re-verifies the .mozbuild/mar-hop/ evidence of one real Linux N
      # to N-plus-1 hop: two distinct versions and build IDs, a hash-pinned
      # descriptor byte-identical to a fresh emission from the MAR bytes,
      # fork-server access-log entries, a zero-Mozilla-host resolver log,
      # plus the UI transcript (ready notification with N+1, Restart-now
      # click, N+1 landing, layout restored) and the read-only
      # cannot-update variant, both derived against the contracted copy.
      # Needs the proof run (tier-3 N and N-plus-1 builds plus the hop drive
      # per docs/BUILD.md), so it lives in the full set and FAILS when the
      # evidence is absent. The Phase 45 packaged re-run stays Phase 50's
      # criterion.
      "mar-update-hop|node $REPO_ROOT/scripts/verify-mar-update-hop.mjs"
      # NEW (Phase 46, UPD-27): the Nimbus exposure probe. Full-tier: drives
      # the available + manual UpdateListener paths in-Gecko with a fixture
      # update carrying detailsURL and asserts recordExposureEvent returned
      # plus the probe-window resolver observation is empty (set-difference
      # over the derived contacted set, never an own-log absence). Needs a
      # browser, so it lives in the full set and FAILs naming the evidence
      # when none exists.
      "nimbus-exposure|node $REPO_ROOT/scripts/verify-nimbus-exposure.mjs"

      # NEW (08-04): the NSIS-on-Nix build proof (PKG-01). Stages the
      # pinned installer inputs from the tree at check time and compiles
      # installer.nsi with makensis, requiring setup.exe. Needs makensis
      # on PATH (nix shell nixpkgs#nsis), python3, a generated/ tree and a
      # built objdir, so it lives in the full set and FAILS naming each
      # missing prerequisite. Wizard bitmaps and defines.nsi Mozilla
      # literals stay labeled upstream stand-ins (see the script header);
      # fork wizard artwork plus the defines rebrand are 08-05 work.
      "installer-build-proof|node $REPO_ROOT/scripts/verify-installer-build-proof.mjs"

      # --- non-GUI wave E (NG-063..NG-067, NG-069, NG-071..NG-074): each needs a
      # Gecko build, the packaged tree, the built sidecar, a browser, or the network.
      # Commands and live-main/live-clone markers: docs/non-gui/checks-wave-e.tsv.
      "ng063-packaged-launch|node $REPO_ROOT/scripts/verify-ng-063-packaged-launch.mjs"
      # NEW (Phase 45, PKG-22/PKG-18/PKG-23): the portability gates. Each needs
      # the container-built tarball (full tier, beside ng063): the Nix-built
      # tree is red-by-design here, which is exactly what the container build
      # fixes. Each FAILs naming the container-build procedure when the
      # tarball is absent; full green waits on the plan 45-04 owner gate.
      "portable-elf|node $REPO_ROOT/scripts/verify-portable-elf.mjs"
      "sidecar-no-symlinks|node $REPO_ROOT/scripts/verify-sidecar-no-symlinks.mjs"
      "package-target-natives|node $REPO_ROOT/scripts/verify-package-target-natives.mjs"
      # NEW (Phase 45, PKG-04/PKG-05): the packaged-identity gate. Derives the
      # release-variant identity at check time and compares field-by-field
      # against the staged package; FAILs naming the container-build procedure
      # when the tarball is absent, like its three neighbours above.
      "packaged-identity|node $REPO_ROOT/scripts/verify-packaged-identity.mjs"
      "ng064-update-url-from-manifest|node $REPO_ROOT/scripts/verify-ng-064-update-url.mjs"
      "ng065-mar-signature-enforced|node $REPO_ROOT/scripts/verify-ng-065-mar-signature.mjs"
      "ng066-nsis-branding-no-ping|node $REPO_ROOT/scripts/verify-ng-066-nsis-branding.mjs"
      "ng067-frontend-errors-reach-telemetry|node $REPO_ROOT/scripts/verify-ng-067-frontend-errors.mjs"
      "ng069-sidecar-egress|node $REPO_ROOT/scripts/verify-ng-069-sidecar-egress.mjs"
      "ng071-tarball-extensions-build|node $REPO_ROOT/scripts/verify-ng-071-tarball-extensions.mjs"
      "ng072-policies-packaged-webextension|node $REPO_ROOT/scripts/verify-ng-072-policies-webextension.mjs"
      "ng073-declared-extension-loads|node $REPO_ROOT/scripts/verify-ng-073-declared-extension-loads.mjs"
      "ng074-ci-green-on-main|node $REPO_ROOT/scripts/verify-ng-074-ci-main.mjs"
      # NG-089 (Phase 24, UAT-01): no pending result on the listed sheets; full only, red until Chris runs them.
      "ng089-uat-sheets|node $REPO_ROOT/scripts/verify-ng-089-uat-sheets.mjs"

      # from verify-phase-04.sh
      "side02-token-negative|check_side02_token_negative"
      "side02-token-positive|check_side02_token_positive"
      "side02-index-gated|check_side02_index_gated"
      "side01-bind-scope|check_side01_bind_scope"
      "shell01-theia-is-the-window|node $SHELL01_MJS"
      "shell05-paint-before-backend|check_shell05_paint_before_backend"
      "side03-kill-and-recover|check_side03_kill_and_recover"

      # from verify-phase-05.sh
      "side04-sigkill-no-orphan|check_side04_sigkill_no_orphan"
      "side04-unsupervised-backend-survives|check_side04_unsupervised_backend_survives"
      "side04-leftover-reaped|check_side04_leftover_reaped"
      "side04-stale-identity-not-signalled|check_side04_stale_identity_not_signalled"
      "harness-display-available|check_harness_display_available"
      "shell03-unrecoverable-immediate-error|check_shell03_unrecoverable_immediate_error"
      "shell03-budget-exhausted-error|check_shell03_budget_exhausted_error"
      "shell03-auto-dismiss-on-selfheal|check_shell03_auto_dismiss_on_selfheal"
      "shell04-diagnostics-with-backend-down|check_shell04_diagnostics_with_backend_down"

      # NEW (01-09): the start path's recovery contract, driven on the FAILING
      # branch. Every other launch check here either succeeds on its first
      # spawn or fails on it terminally; none of them drives a launch whose
      # first spawn announces readiness, pins a port, fails the health gate,
      # and then recovers -- which is precisely the branch 01-VERIFICATION.md
      # recorded FAILED and the reason the defect shipped green. Launches the
      # built binary, so it is emphatically not --quick; its static half is
      # start-path-recovery in the --quick set above, and both drive the SAME
      # analyzer, so the assertion that ships is the one the self-test proves.
      "health-gate-recovery-swaps|check_health_gate_recovery_swaps"

      # NEW (01-10): the other half of the same FAILED must-have -- a REAL
      # throw ESCAPING the start path. The row above drives a launch that
      # RECOVERS; this one drives a launch that cannot, and requires the error
      # layer to paint rather than the rejection to vanish. Launches the built
      # binary with a poisoned config home, so it is emphatically not --quick;
      # its static counterpart is start-path-recovery's terminal-handler
      # coverage rule in the --quick set above. Observed RED before the
      # supervisor's terminal handler existed (01-10-SUMMARY.md records the
      # output verbatim), which is the only reason it is known to discriminate.
      "start-failure-shows-error|check_start_failure_shows_error"

      # NEW (01-07): the runtime half of the error-copy rewrite. Drives two
      # different real failure paths in the built binary and asserts that the
      # string which actually painted is one of the values derived from
      # TheiaService.sys.mjs, and that every identifier the rewrite removed
      # from that path's message reappears as a labelled diagnostics row. Needs
      # a built binary and two headless launches, so it cannot be --quick.
      "shell-diagnostics-rows-populated|check_shell_diagnostics_rows_populated"
      "side05-second-launch-focuses|check_side05_second_launch_focuses"
      "side05-no-second-backend|check_side05_no_second_backend"
      "cr01-different-profile-backend-survives|check_cr01_different_profile_backend_survives"
      "side04-token-not-in-environment|check_side04_token_not_in_environment"

      # NEW (01-05): GUI-01's three window checks. All three need a built
      # binary; the first two launch one, the third needs the live Theia dev
      # app (and so goes through the same lazy-start wrapper the phase-02
      # checks use). None of them opens a browser window during the shell's
      # own startup -- 01-SPIKE-GUI-01.md observation 4 found that a window
      # opened from inside the shell's DOMContentLoaded comes up with gURLBar
      # permanently undefined, so a check that did would be asserting against
      # a window upstream itself left half-initialised.
      "gui01-single-shell-window|check_gui01_single_shell_window"
      "gui01-browser-close-does-not-quit|node $REPO_ROOT/scripts/verify-gui01-window.mjs"
      "gui01-command-registered|check_gui01_command_registered"

      # NEW (12-03): SQL-05's store gates, live halves. All five rows need the
      # built binary, so none is --quick; STAGED-exit-clean (binary or startup
      # wiring absent) counts as registration proof, a real drive counts as
      # the gate. The soak live entry runs the temp-profile interleave through
      # the binary once startup wiring lands (shares its one self-test row
      # with the static half above -- the self-test proves the static
      # procedure plus the tamper predicate both halves rely on). The
      # roundtrip rows promote the plan 12-01 proof script by invocation only:
      # the committed drive replays restart→reopen over throwaway databases,
      # and it registers at the tier of the live restart proof it belongs to
      # (temp-profile restart through the real writer) rather than moving
      # tiers when that drive lands. The absence rows promote the plan 12-02
      # instrument the same way: its static halves read the writer source,
      # but the default invocation also attempts the live private-window run,
      # which needs the binary and a launch-capable harness (headless-first,
      # Xvfb fallback per harness-display-available), so the whole script
      # rides full-tier. No logic duplicated -- the registry invokes, the
      # scripts prove.
      "sql-store-soak-live|node $REPO_ROOT/scripts/verify-sql-store-soak.mjs --live"
      "sql-store-roundtrip|node $REPO_ROOT/scripts/verify-sql-store-roundtrip.mjs"
      "sql-store-roundtrip-self-test|node $REPO_ROOT/scripts/verify-sql-store-roundtrip.mjs --self-test"
      "sql-store-absence|node $REPO_ROOT/scripts/verify-sql-store-absence.mjs"
      "sql-store-absence-self-test|node $REPO_ROOT/scripts/verify-sql-store-absence.mjs --self-test"

      # NEW (non-GUI wave A): the wave's live checks, one file per row
      # (decisions.md R1). Each launches the built binary on a kept profile
      # (scripts/lib/ng-a-live.mjs) and drives the behaviour through the Theia
      # frontend's own services -- opener, GroupModel, GroupActorClient, the
      # Close Group command, card double-clicks -- then reads tabs.sqlite from
      # outside. Restart rows quit and relaunch on the same profile. Not
      # --quick: binary, Theia build, headless browser.
      "ng-001-one-key-rule|node $REPO_ROOT/scripts/verify-ng-001-one-key-rule.mjs"
      "ng-002-navigation-keeps-row|node $REPO_ROOT/scripts/verify-ng-002-navigation-keeps-row.mjs"
      "ng-003-same-url-two-rows|node $REPO_ROOT/scripts/verify-ng-003-same-url-two-rows.mjs"
      "ng-004-new-tab-row-unknown-uri-error|node $REPO_ROOT/scripts/verify-ng-004-new-tab-row-unknown-uri-error.mjs"
      "ng-005-prune-keeps-open-rows|node $REPO_ROOT/scripts/verify-ng-005-prune-keeps-open-rows.mjs"
      "ng-006-close-group-closes-web-tabs|node $REPO_ROOT/scripts/verify-ng-006-close-group-closes-web-tabs.mjs"
      "ng-007-shell-tabs-keep-group-across-restart|node $REPO_ROOT/scripts/verify-ng-007-shell-tabs-keep-group-across-restart.mjs"
      "ng-008-panorama-card-reopens-through-opener|node $REPO_ROOT/scripts/verify-ng-008-panorama-card-reopens-through-opener.mjs"
      # NEW (Phase 21, PAN-07): the live DOM half that gui08-canvas-geometry
      # holds out -- loose cards on the Organising canvas with zero groups and
      # with one, no tray element, ArrowRight between loose cards, and three
      # in-run probe controls. Not --quick: binary, Theia build, headless
      # browser.
      "gui08-loose-cards-live|node $REPO_ROOT/scripts/verify-gui08-loose-cards-live.mjs"
      # NEW (Phase 22, PAN-03): the strip filter, the + join, Coding scope
      # and the relaunch load, with two in-run probe controls. Not --quick:
      # binary, Theia build, headless browser.
      "pan03-strip-group-live|node $REPO_ROOT/scripts/verify-pan03-strip-group-live.mjs"
      # NEW (Phase 22, PAN-04): the undo window on the group model -- hide,
      # undo, the timer commit and mode switches inside the window, with
      # in-run probe controls. Not --quick: binary, Theia build, headless
      # browser.
      "pan04-undo-close-group-live|node $REPO_ROOT/scripts/verify-pan04-undo-close-group-live.mjs"
      # NEW (Phase 22, PAN-05): the card x and Delete close exactly that tab,
      # a dirty editor prompts, a not-open card stays closed, one tab stop per
      # scope, with two in-run probe controls. Not --quick: binary, Theia
      # build, headless browser.
      "pan05-card-close-live|node $REPO_ROOT/scripts/verify-pan05-card-close-live.mjs"
      "ng-009-content-age-columns|node $REPO_ROOT/scripts/verify-ng-009-content-age-columns.mjs"
      "ng-010-closed-tab-history|node $REPO_ROOT/scripts/verify-ng-010-closed-tab-history.mjs"
      "ng-011-settings-table-read|node $REPO_ROOT/scripts/verify-ng-011-settings-table-read.mjs"
      "ng-012-reader-reports-schema-errors|node $REPO_ROOT/scripts/verify-ng-012-reader-reports-schema-errors.mjs"
      "ng-013-unopenable-store-quarantined|node $REPO_ROOT/scripts/verify-ng-013-unopenable-store-quarantined.mjs"
      "ng-014-rebuild-at-head|node $REPO_ROOT/scripts/verify-ng-014-rebuild-at-head.mjs"
      "ng-015-real-migration-from-every-version|node $REPO_ROOT/scripts/verify-ng-015-real-migration-from-every-version.mjs"
      "ng-017-sql05-restarts-real-browser|node $REPO_ROOT/scripts/verify-ng-017-sql05-restarts-real-browser.mjs"
      "ng-018-scheduled-integrity-check|node $REPO_ROOT/scripts/verify-ng-018-scheduled-integrity-check.mjs"
      "ng-085-quit-closes-store|node $REPO_ROOT/scripts/verify-ng-085-quit-closes-store.mjs"

      # NEW (14-04): GUI-07's tabs invariant, BEHAVIOURAL half -- the part
      # gui07-mode-switch-tabs-invariant in the --quick set structurally
      # cannot be. It boots the built binary headless, drives the shell's own
      # supervised frontend over BiDi (withFirefoxPage(''), the same harness
      # and the same empty-URL reason as gui01-browser-close-does-not-quit),
      # and walks a mode route in which every MEASURED hop is a SECOND visit.
      # That protocol is the whole point: stock's teardown is conditional on
      # the target already having a saved layout (perspective-service.js:131),
      # so a once-per-mode walk is green on a broken tree. It asserts the
      # main-area AND bottom-area widget id sets as set equality in both
      # directions plus isAttached per widget OBJECT (never re-looked-up by
      # id -- shell.getWidgetById resolves against a FocusTracker that retains
      # detached widgets), and derives every expectation -- shipped mode ids,
      # both registerPerspective sinks, the seed's declared area, the
      # organising slot id -- from the tree at check time.
      #
      # Registered as a plain `node` invocation like gui01-browser-close-does-
      # not-quit rather than through _run_app_check_mjs: it launches and reaps
      # its own browser, and needs no theia dev app on $APP_URL. It needs the
      # built binary, so it is emphatically not --quick. The self-test boots
      # five sessions (~2m15s: a clean control first, then four plants, each
      # in its own session so one plant's damage cannot redden the next) and
      # rides alongside for the reason every other self-test row gives.
      "gui07-mode-switch-tabs-live|node $REPO_ROOT/scripts/verify-mode-switch-tabs-live.mjs"
      "gui07-mode-switch-tabs-live-self-test|node $REPO_ROOT/scripts/verify-mode-switch-tabs-live.mjs --self-test"
      # NEW (non-GUI wave B, NG-021..NG-026, NG-028): live checks. Each launches
      # the built binary through firefox-bidi.mjs, serves its own pages on a
      # second loopback port, and drives its row through a real entry point (an
      # actor message from the Theia frame, a DI-bound service, a registered
      # command, or the documented endpoint), plus the hostile-page wall. They
      # need the built binary and the last Theia build, so none is --quick.
      "ng-021-places-reads-via-actor|node $REPO_ROOT/scripts/verify-ng-021-places-reads.mjs"
      "ng-022-sessionstore-projection-via-actor|node $REPO_ROOT/scripts/verify-ng-022-sessionstore-projection.mjs"
      "ng-023-suggestions-history-bookmarks|node $REPO_ROOT/scripts/verify-ng-023-suggestions-places.mjs"
      "ng-024-tabs-places-join|node $REPO_ROOT/scripts/verify-ng-024-tabs-places-join.mjs"
      "ng-025-store-read-endpoint|node $REPO_ROOT/scripts/verify-ng-025-store-read-endpoint.mjs"
      "ng-026-store-write-endpoint|node $REPO_ROOT/scripts/verify-ng-026-store-write-endpoint.mjs"
      "ng-028-saved-page-copy|node $REPO_ROOT/scripts/verify-ng-028-saved-page.mjs"

      # NEW (14.1-03): GUI-02's behavioural half. Drives the built shell over
      # WebDriver BiDi through "+", a typed address, a second typed address,
      # the five-hop mode walk, the chrome-side tab store and close, and
      # asserts the overlay context is aligned to the placeholder within
      # 1 CSS px (read INSIDE the overlay with evaluateIn), navigated in
      # place, hidden when not current, its store row present then absent,
      # and removed on close -- with zero window.open calls. Every
      # expectation is derived from the tree at check time. Registered as a
      # plain `node` invocation like gui07 (it launches and reaps its own
      # browser and serves its own pages). It needs the built binary and the
      # last Theia app build, so it is emphatically not --quick. The
      # self-test boots seven sessions (a clean control, then six plants,
      # each in its own session) and rides alongside for the reason every
      # other self-test row gives.
      "gui02-web-tab-live|node $REPO_ROOT/scripts/verify-web-tab-live.mjs"
      "gui02-web-tab-live-self-test|node $REPO_ROOT/scripts/verify-web-tab-live.mjs --self-test"

      # NG-029..NG-038 (non-GUI wave C): the built shell driven through the
      # command registry, the actor channel, the core window's close button in
      # the chrome document and real quit-and-relaunch cycles on one kept
      # profile (withFirefoxPage's profileDir, via scripts/lib/pb-relaunch.mjs).
      # Each launches and reaps its own browser, so each is a plain node row
      # like gui07 above; none is --quick. Their demonstrated red is each row's
      # pre-build record-fail (docs/non-gui/checks-wave-c.tsv).
      "ng-029-setup-restore-activates-mode|node $REPO_ROOT/scripts/verify-ng-029-setup-restore-mode.mjs"
      "ng-030-setup-restore-opens-tabs-once|node $REPO_ROOT/scripts/verify-ng-030-setup-restore-dedup.mjs"
      "ng-031-setup-commands-reachable|node $REPO_ROOT/scripts/verify-ng-031-setup-commands-reachable.mjs"
      "ng-032-quit-restores-session|node $REPO_ROOT/scripts/verify-ng-032-quit-restores-session.mjs"
      "ng-033-layout-survives-relaunch|node $REPO_ROOT/scripts/verify-ng-033-layout-survives-relaunch.mjs"
      "ng-034-web-tab-history-survives-restart|node $REPO_ROOT/scripts/verify-ng-034-web-tab-history-restart.mjs"
      "ng-035-custom-mode-saves-layout|node $REPO_ROOT/scripts/verify-ng-035-custom-mode-layout.mjs"
      "ng-036-setup-records-dock-layout|node $REPO_ROOT/scripts/verify-ng-036-setup-dock-layout.mjs"
      # NEW (Phase 23, G-23, MODE-02): the Save as Mode and Save Setup name fields cut at the cap
      # while typing, with the stock uncapped input as the probe control. Not --quick (binary, sidecar,
      # headless browser); the static half is modes-name-cap-at-input.
      "modes-name-cap-at-input-live|node $REPO_ROOT/scripts/verify-name-cap-at-input-live.mjs"
      "ng-037-core-close-quits|node $REPO_ROOT/scripts/verify-ng-037-core-close-quits.mjs"
      "ng-038-actor-refuses-hostile-senders|node $REPO_ROOT/scripts/verify-ng-038-actor-sender-wall.mjs"

      # NEW (Phase 19, UPD-10): the first-boot surface on a fresh config dir -- main area,
      # launch mode, telemetry Settings copy, zero boot errors and a forced render error
      # through the supervised shell. Full tier: it needs the built binary and sidecar.
      "first-boot-surface-fresh|node $REPO_ROOT/scripts/verify-first-boot-surface.mjs"
      # The same check on a carried-over config dir: the fixture named by PB_FIRST_BOOT_FIXTURE,
      # outside the repo, copied before launch; unset prints a notice (decisions.md R7).
      "first-boot-surface-carried|node $REPO_ROOT/scripts/verify-first-boot-surface.mjs --carried"

      # NEW (Phase 20, PLAT-01, G-14.1.1-9): a build from a clean checkout passes. A fresh
      # clone of committed HEAD (uncommitted work is invisible to it, Pitfall 2) runs the CI
      # step "Install and build the Theia workspace", read from verify.yml at check time.
      # Full tier: dev shell, yarn cache, minutes. The static `theia-build-order` row cannot
      # see P2 (a lib-only import) or P3 (the web-tab.css path); the self-test plants both.
      "theia-fresh-clone-build|bash $REPO_ROOT/scripts/verify-theia-fresh-clone-build.sh"
      "theia-fresh-clone-build-self-test|bash $REPO_ROOT/scripts/verify-theia-fresh-clone-build.sh --self-test"

      # NEW (Phase 41, GH-02): the live org and repo equal the declared .github/settings/
      # bodies, by projection and set equality, failing closed on any unreadable endpoint.
      # Full tier: read-only gh api against the live org and repo (network, gh auth with repo
      # and read:org); green only after the owner applies the settings at plan 41-04.
      "repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"

      # NEW (Phase 47, DIST-03): the live updates repo holds no functions/ directory and no root
      # _worker.js, by the absence property over one read-only recursive tree listing. Full tier:
      # read-only gh api against the live updates repo (network, gh auth with repo and read:org);
      # green only after the owner pushes the static tree at plan 47-04. Fails closed when unreadable.
      "updates-repo-static|node $REPO_ROOT/scripts/verify-updates-repo-static.mjs"

      # NEW (Phase 47, WR-04): the staged website pages carry no OWNER TO FILL marker and no
      # class="pending" block. Full tier, deliberately: the placeholders are intentional until the
      # owner fills them, so this row stays red until then. It must be green before the website
      # push (docs/RELEASING.md, the website section).
      "website-publish-ready|node $REPO_ROOT/scripts/verify-website-publish-ready.mjs"
    )
  fi

  # A --quick run with an empty registry would print "all checks passed" having
  # asserted nothing. That is not a clean result, it is an unrun one, and the
  # two are indistinguishable from the exit code alone. Fail loudly instead.
  if [ "${#CHECKS[@]}" -eq 0 ]; then
    echo "verify-platform: FAIL -- the check set is EMPTY, so nothing was scanned. A clean result from an empty set proves nothing; this is a registry bug, not a pass." >&2
    return 1
  fi

  if [ -n "$ONLY" ]; then
    local -a FILTERED=()
    local ONLY_FOUND=0
    for entry in "${CHECKS[@]}"; do
      local label="${entry%%|*}"
      if [ "$label" = "$ONLY" ]; then
        FILTERED+=("$entry")
        ONLY_FOUND=1
      fi
    done
    if [ "$ONLY_FOUND" -eq 0 ]; then
      echo "verify-platform: FAIL -- unknown --only label '$ONLY'" >&2
      return 1
    fi
    CHECKS=("${FILTERED[@]}")
  fi

  local FAILED=0
  local -a SUMMARY=()

  for entry in "${CHECKS[@]}"; do
    local label="${entry%%|*}"
    local cmd="${entry#*|}"
    echo "verify-platform: running $label..."
    # External bash/node script invocations get their own process group via
    # setsid, so an interrupt's group-kill in cleanup() can reach whatever they
    # background (verify-endpoints.sh's own powerbrowser child, two layers
    # deep). Plain function calls run inline -- setsid cannot exec a shell
    # function, and each such function is itself responsible for setsid'ing
    # whatever it spawns (start_shell/start_backend already do).
    case "$cmd" in
      bash\ */*|node\ */*)
        setsid $cmd &
        CURRENT_CHECK_PID=$!
        if wait "$CURRENT_CHECK_PID"; then
          SUMMARY+=("$label: PASS")
        else
          SUMMARY+=("$label: FAIL")
          FAILED=1
        fi
        CURRENT_CHECK_PID=""
        ;;
      *)
        # Every entry reaching this branch must be a bare, argument-free shell
        # function name (WR-02: `eval "$cmd"` is the wrong tool for a
        # statically-known function name). A future entry that needs arguments
        # must add a wrapper function, not smuggle a command string here --
        # guarded loudly rather than silently mis-invoked.
        if [[ "$cmd" == *[[:space:]]* ]]; then
          echo "verify-platform: FAIL -- check '$label' has a non-function-name command ('$cmd'); add a wrapper function instead" >&2
          SUMMARY+=("$label: FAIL")
          FAILED=1
        elif "$cmd"; then
          SUMMARY+=("$label: PASS")
        else
          SUMMARY+=("$label: FAIL")
          FAILED=1
        fi
        ;;
    esac
  done

  echo ""
  echo "verify-platform: summary"
  for line in "${SUMMARY[@]}"; do
    echo "  $line"
  done

  if [ "$FAILED" -eq 0 ]; then
    echo "verify-platform: PASS -- all checks passed"
    return 0
  else
    echo "verify-platform: FAIL -- see summary above" >&2
    return 1
  fi
}

# --- --gate mode (D-127) ----------------------------------------------------
#
# Reads the broken-windows ledger's own JSON block (the fenced array at the
# bottom of .planning/WINDOWS.md -- the markdown table above it is the
# human-readable mirror of the same data, not a second source of truth) and
# prints the named entry's current status. Exits 2 (distinct from 0/1, never
# treated as a plain pass/fail) if the ledger or the entry cannot be read at
# all, so a malformed/missing ledger can never be silently read as "open".
ledger_entry_status() {
  local id="$1"
  local windows_md="$REPO_ROOT/.planning/WINDOWS.md"
  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const id = Number(process.argv[2]);
    let text;
    try { text = fs.readFileSync(path, "utf8"); } catch { process.exit(2); }
    const m = text.match(/````json\n([\s\S]*?)\n````/);
    if (!m) { process.exit(2); }
    let arr;
    try { arr = JSON.parse(m[1]); } catch { process.exit(2); }
    const entry = arr.find((e) => e.id === id);
    if (!entry || typeof entry.status !== "string") { process.exit(2); }
    process.stdout.write(entry.status);
  ' "$windows_md" "$id"
}

# True (exit 0) only when ledger entry <id> is still status "open". A "fixed" or
# "waived" entry (or an unreadable ledger) returns false -- the exclusion this
# backs must stop applying the instant the entry stops being open.
ledger_entry_is_open() {
  local id="$1" status
  status="$(ledger_entry_status "$id")" || return 1
  [ "$status" = "open" ]
}

# Failing-check labels are read off this run's OWN printed summary lines
# ("  <label>: FAIL") rather than by re-deriving or re-running anything.
extract_failed_labels() {
  grep -E '^  [A-Za-z0-9_.-]+: FAIL$' "$1" | sed -E 's/^  ([A-Za-z0-9_.-]+): FAIL$/\1/'
}

# The known-open exclusion list (D-127). Keyed on the broken-windows ledger id,
# never on a bare assertion -- see ledger_entry_is_open above.
# label|ledger_id|reason
declare -a GATE_KNOWN_OPEN_EXCLUSIONS=(
  "verify-endpoints|5|Gecko resolves 3 hosts absent from the BRAND-04 allowlist once the shell actually works (127.0.0.1 the Theia sidecar, ciscobinary.openh264.org the GMP manager, and the welcome widget's own project link) -- not a code defect, needs a product/privacy decision that phase's scope explicitly excluded"
  # 01-07: both of these read objdir-release/, i.e. a SECOND full ~47-minute
  # release build that 01-04-PLAN.md explicitly declined to spend. Neither is a
  # code defect and neither has ever been red for a code reason -- each fails
  # with "objdir-release/... does not exist" and nothing else. They become
  # runnable, unchanged, the moment a release objdir exists, which is why they
  # stay registered rather than being deleted or narrowed. Keyed on ledger
  # entry 10, so the exclusion stops applying the instant that entry stops
  # being open.
  "verify-branding-identity-release|10|reads objdir-release/dist/bin, which does not exist -- 01-04-PLAN.md declined the second ~47m release build; runnable unchanged once one exists"
  "branding-variant-divergence|10|reads BOTH objdir/dist/bin and objdir-release/dist/bin; the release half does not exist -- same declined build as above"
)

# Before consolidation, --gate ran this script's own set and then SHELLED OUT to
# verify-phase-04.sh and verify-phase-03.sh, parsing their summaries back. With
# one registry there is nothing to shell out to: --gate is the full set in one
# process, and the only thing it adds over a plain full run is the ledger-backed
# exclusion pass over the failures. That is a simplification the consolidation
# paid for, not a capability lost.
run_gate_mode() {
  local gate_start="$SECONDS"
  local commit
  commit="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"
  echo "verify-platform: --gate -- commit $commit"
  echo "verify-platform: --gate -- proving every registered check is green (or a named, still-open ledger exclusion) at this one commit (D-127)"
  echo ""

  local log
  log="$(mktemp)"; track_temp "$log"
  local rc=0
  # NOT `run_own_checks 2>&1 | tee "$log"`. That pipeline hung --gate forever
  # on any run where a check lazily started the Theia dev app, which since the
  # consolidation is every full one. Two compounding reasons, both from the
  # pipeline:
  #
  #   1. Bash runs each pipeline stage in a SUBSHELL, so theia_app_up()'s
  #      `SERVER_PID=$!` was set in a child and the EXIT trap's cleanup() --
  #      running in the parent -- saw it empty and never killed the app.
  #   2. That surviving app inherited the subshell's stdout, i.e. the pipe to
  #      `tee`, so tee never reached EOF and the pipeline never completed.
  #
  # The plain (non-gate) path never had either problem because it calls
  # run_own_checks directly in this shell. Redirecting to a FILE restores that:
  # SERVER_PID is visible to cleanup again, and a regular-file fd inherited by
  # a background process blocks nothing. The whole log is printed below, so no
  # output is lost -- only the live streaming, which a batch gate does not need.
  run_own_checks > "$log" 2>&1 || rc=$?
  cat "$log"

  local gate_failed=0
  local excluded_count=0
  if [ "$rc" -ne 0 ]; then
    while IFS= read -r label; do
      [ -z "$label" ] && continue
      local excused=0
      local matched_known_exclusion=0
      local excl_entry
      for excl_entry in "${GATE_KNOWN_OPEN_EXCLUSIONS[@]}"; do
        local excl_label="${excl_entry%%|*}"
        local rest="${excl_entry#*|}"
        local excl_ledger_id="${rest%%|*}"
        local excl_reason="${rest#*|}"
        if [ "$label" = "$excl_label" ]; then
          matched_known_exclusion=1
          if ledger_entry_is_open "$excl_ledger_id"; then
            echo "  EXCLUDED (known-open): $label -- WINDOWS.md ledger entry $excl_ledger_id -- $excl_reason"
            excused=1
            excluded_count=$((excluded_count + 1))
          else
            echo "  FAIL (exclusion no longer applies): $label -- WINDOWS.md ledger entry $excl_ledger_id is no longer 'open' (fixed or waived); this check must be green now, not silently excused" >&2
            gate_failed=1
          fi
          break
        fi
      done
      if [ "$excused" -ne 1 ] && [ "$matched_known_exclusion" -ne 1 ]; then
        echo "  FAIL (not excluded): $label" >&2
        gate_failed=1
      fi
    done < <(extract_failed_labels "$log")
  fi

  local gate_elapsed=$((SECONDS - gate_start))
  echo ""
  echo "verify-platform: --gate -- total runtime ${gate_elapsed}s"

  if [ "$gate_failed" -eq 0 ] && [ "$excluded_count" -gt 0 ]; then
    echo "verify-platform: --gate PASS-WITH-EXCLUSIONS -- commit $commit -- $excluded_count named known-open exclusion(s)"
    return 0
  elif [ "$gate_failed" -eq 0 ]; then
    echo "verify-platform: --gate PASS -- commit $commit -- every registered check is green at this commit"
    return 0
  else
    echo "verify-platform: --gate FAIL -- commit $commit -- see output above" >&2
    return 1
  fi
}

if [ "$GATE" -eq 1 ]; then
  run_gate_mode
  exit $?
else
  run_own_checks
  exit $?
fi
