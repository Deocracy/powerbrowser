#!/usr/bin/env bash
# scripts/verify-endpoints.sh
#
# D-88: BRAND-04's two negative assertions ("updates disabled", "no
# unlisted endpoint contacted") get three proof layers, each with a working
# positive control that has been observed going red -- a negative check
# without a demonstrated-red positive control proves nothing (Phase 2's own
# lesson, restated for this phase).
#
#   Layer 1 -- static prefs. Reads the effective installed default-pref
#     value for every key in powerbrowser/endpoint-allowlist.json's `prefs`
#     array (greprefs.js, then browser/defaults/preferences/firefox.js, then
#     .../firefox-branding.js, later file wins) and compares to `expect`. A
#     pref that cannot be found at all is a FAILURE, not a skip.
#   Layer 2 -- filesystem, exact-path strace (BRAND-03). Asserts a positive
#     $HOME-prefixed observation (proving strace captured real filesystem
#     activity -- empirically, nsXREDirProvider.cpp's ".mozilla" AppendNative
#     is only reached for specific, lazily-queried directory keys and is NOT
#     a reliable per-run signal, confirmed live this session) AND a negative
#     exact-prefix `$HOME/.mozilla/firefox` match, never a bare substring
#     (which would false-fail a correct build touching some other
#     ".mozilla"-containing path).
#   Layer 3 -- network, host resolution via MOZ_LOG=nsHostResolver:5. Reads
#     `<MOZ_LOG_FILE>.moz_log` and its `.child-N.moz_log` siblings
#     (GeckoChildProcessHost.cpp:945-967 appends the `.child-N` postfix
#     BEFORE the logging backend re-adds `.moz_log` -- a literal
#     `$MOZ_LOG_FILE` read, or a `.moz_log.child-N` read, finds nothing).
#     Extracts hostnames only from the anchored `Resolving host [...]`
#     pattern (nsHostResolver.cpp:455) -- an unanchored whole-log grep also
#     matches zero-network-activity names (the TRR URI, the confirmation NS,
#     localhost) that a real 35s run emits even with TRR disabled, which
#     would corrupt the allowlist with hosts that never had real traffic.
#     Matching is exact-host, or a suffix match only when the allowlist
#     entry begins with a literal dot -- a host that merely contains an
#     allowlisted string does not match. The match and the verdict are
#     scripts/lib/endpoint-verdict.mjs, called unattended: a `user-initiated`
#     host fails exactly as a `deny` host does (UPD-33).
#   Layer 4 -- the sidecar's egress (NG-069). The Theia backend is a Node process that
#   Gecko's MOZ_LOG never sees. A NODE_OPTIONS preload records every hostname any
#   sidecar Node process resolves during a session that installs one extension, and each
#   one must pass the same unattended verdict as layer 3 (an `allow` row).
#   scripts/verify-ng-069-sidecar-egress.mjs.
#
# `--layer 1|2|3|4` runs one layer; no flag runs all four. `--positive-control`
# runs each selected layer's control instead of its assertion and exits 0
# only if the control went red (layers 1-3; layer 4's control is inline, so a
# no-flag control run skips it). Idempotent: a fresh mktemp -d log directory
# per run, removed on exit; no layer mutates or deletes anything under the
# developer's real $HOME except the sandboxed layer-2 control, which never
# touches the real ~/.mozilla tree.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$REPO_ROOT/objdir/dist/bin"
BIN_PATH="$BIN_DIR/powerbrowser"
ALLOWLIST="$REPO_ROOT/powerbrowser/endpoint-allowlist.json"
BRANDING_PREF_FILE="$BIN_DIR/browser/defaults/preferences/firefox-branding.js"

HELP="Usage: verify-endpoints.sh [--layer 1|2|3|4] [--positive-control] [--help]
       verify-endpoints.sh --interrupt-self-test
       verify-endpoints.sh --disposition-self-test

Runs BRAND-04's three endpoint/telemetry proof layers and NG-069's sidecar
egress layer against the built binary.
No flag runs all four layers' real assertions.

  --layer 1|2|3|4        Run only the named layer (4: the sidecar's egress, NG-069)
  --positive-control     Run the selected layer(s)' positive control instead
                          of their real assertion; exits 0 only if the
                          control(s) correctly went red (layers 1-3)
  --interrupt-self-test  Sends a real SIGINT into a real running layer-3
                          positive control on purpose, and asserts the
                          installed pref file survives byte-identical.
                          Mutually exclusive with --layer/--positive-control.
  --disposition-self-test
                         Runs layer 3's host extraction and verdict over fixture
                          logs (no build): an unattended user-initiated host
                          must go red, as must every user-initiated host in the
                          real allowlist. Mutually exclusive with every other flag.
  --help                 Print this message and exit 0
"

LAYER_ARG=""
DO_CONTROL=0
INTERRUPT_SELF_TEST=0
DISPOSITION_SELF_TEST=0

args=("$@")
i=0
while [ "$i" -lt "${#args[@]}" ]; do
  arg="${args[$i]}"
  case "$arg" in
    --layer)
      i=$((i + 1))
      LAYER_ARG="${args[$i]:-}"
      case "$LAYER_ARG" in
        1|2|3|4) ;;
        *)
          echo "verify-endpoints: FAIL -- --layer requires 1, 2, 3, or 4" >&2
          exit 1
          ;;
      esac
      ;;
    --positive-control) DO_CONTROL=1 ;;
    --interrupt-self-test) INTERRUPT_SELF_TEST=1 ;;
    --disposition-self-test) DISPOSITION_SELF_TEST=1 ;;
    --help)
      echo "$HELP"
      exit 0
      ;;
    *)
      echo "verify-endpoints: FAIL -- unknown argument '$arg'" >&2
      exit 1
      ;;
  esac
  i=$((i + 1))
done

if [ "$INTERRUPT_SELF_TEST" -eq 1 ] && { [ -n "$LAYER_ARG" ] || [ "$DO_CONTROL" -eq 1 ]; }; then
  echo "verify-endpoints: FAIL -- --interrupt-self-test is mutually exclusive with --layer/--positive-control" >&2
  exit 1
fi

if [ "$DISPOSITION_SELF_TEST" -eq 1 ] && { [ -n "$LAYER_ARG" ] || [ "$DO_CONTROL" -eq 1 ] || [ "$INTERRUPT_SELF_TEST" -eq 1 ]; }; then
  echo "verify-endpoints: FAIL -- --disposition-self-test is mutually exclusive with --layer/--positive-control/--interrupt-self-test" >&2
  exit 1
fi

# Layer 4 (NG-069): the sidecar's own egress. Runs through node, not the MOZ_LOG path, and
# carries its positive control inline (the registry host must be observed), so
# --positive-control does not apply to it.
if [ "$LAYER_ARG" = "4" ]; then
  if [ "$DO_CONTROL" -eq 1 ]; then echo "verify-endpoints: FAIL -- --positive-control does not apply to layer 4 (its control is inline)" >&2; exit 1; fi
  exec node "$REPO_ROOT/scripts/verify-ng-069-sidecar-egress.mjs"
fi

# ---------------------------------------------------------------------------
# Process/temp-file hygiene, shared by every layer. Split trap: EXIT alone is
# not enough -- bash resumes the rest of the script after a non-EXIT trap
# handler returns unless that handler exits itself (verify-platform.sh
# lines 50-58, quoted in 03-PATTERNS.md).
# ---------------------------------------------------------------------------
ACTIVE_PID=""
declare -a TEMP_PATHS=()
PREF_BACKUP_SRC=""
PREF_BACKUP_DST=""

# track_pref_backup DEST -- snapshots DEST's current bytes into a fresh temp
# copy and records both paths in PREF_BACKUP_SRC/PREF_BACKUP_DST, so
# restore_pref_backup (called unconditionally from cleanup(), below) can
# write them back on every exit path: normal, error, or a trap-caught
# INT/TERM. This is what CR-02/03-VERIFICATION.md Gap 3 was missing -- the
# old bare local `backup` variable was invisible to cleanup().
track_pref_backup() {
  local dst="$1"
  local src
  src="$(mktemp)"
  cp "$dst" "$src"
  PREF_BACKUP_SRC="$src"
  PREF_BACKUP_DST="$dst"
}

# restore_pref_backup -- no-op when nothing is tracked (both globals empty),
# so it is safe to call unconditionally from cleanup() on every run,
# including runs that never touched a pref file, and safe to call twice.
restore_pref_backup() {
  if [ -n "$PREF_BACKUP_SRC" ] && [ -n "$PREF_BACKUP_DST" ] && [ -f "$PREF_BACKUP_SRC" ]; then
    cp "$PREF_BACKUP_SRC" "$PREF_BACKUP_DST"
    rm -f "$PREF_BACKUP_SRC"
  fi
  PREF_BACKUP_SRC=""
  PREF_BACKUP_DST=""
}

cleanup() {
  if [ -n "$ACTIVE_PID" ]; then
    kill "$ACTIVE_PID" 2>/dev/null || true
    wait "$ACTIVE_PID" 2>/dev/null || true
    ACTIVE_PID=""
  fi
  # Restore the pref-file backup (if any) before TEMP_PATHS deletion runs --
  # the temp copy must be written back before anything that could delete it.
  restore_pref_backup
  local p
  for p in "${TEMP_PATHS[@]:-}"; do
    [ -n "$p" ] && [ -e "$p" ] && find "$p" -delete 2>/dev/null
  done
  TEMP_PATHS=()
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

track_temp() { TEMP_PATHS+=("$1"); }

# ---------------------------------------------------------------------------
# Layer 1 -- static prefs
# ---------------------------------------------------------------------------
layer1_check() {
  node -e '
    const fs = require("fs");
    const path = require("path");
    const [, binDir, allowlistPath] = process.argv;
    const allow = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    const files = [
      path.join(binDir, "greprefs.js"),
      path.join(binDir, "browser", "defaults", "preferences", "firefox.js"),
      path.join(binDir, "browser", "defaults", "preferences", "firefox-branding.js"),
    ];
    const prefRe = /pref\(\s*"([^"]+)"\s*,\s*(.+?)\s*(?:,\s*[A-Za-z_][A-Za-z0-9_]*\s*)?\)\s*;/g;
    const values = new Map();
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      let m;
      prefRe.lastIndex = 0;
      while ((m = prefRe.exec(text))) values.set(m[1], m[2]);
    }
    function parseRaw(raw) {
      if (raw === "true") return true;
      if (raw === "false") return false;
      if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
      if (raw.startsWith("\"") && raw.endsWith("\"")) {
        try { return JSON.parse(raw); } catch { return raw; }
      }
      return raw;
    }
    let failures = 0;
    for (const p of allow.prefs) {
      const raw = values.get(p.name);
      if (raw === undefined) {
        console.error(`  FAIL ${p.name} -- pref not found in any installed pref file (${p.reason})`);
        failures++;
        continue;
      }
      const actual = parseRaw(raw);
      if (actual !== p.expect) {
        console.error(`  FAIL ${p.name} -- actual=${JSON.stringify(actual)} expected=${JSON.stringify(p.expect)} (${p.reason})`);
        failures++;
      } else {
        console.log(`  PASS ${p.name}`);
      }
    }
    process.exit(failures > 0 ? 1 : 0);
  ' "$BIN_DIR" "$ALLOWLIST"
}

run_layer1() {
  echo "verify-endpoints: layer 1 (static prefs)..."
  if layer1_check; then
    echo "verify-endpoints: layer 1 PASS"
    return 0
  fi
  echo "verify-endpoints: layer 1 FAIL -- see pref mismatch(es) above" >&2
  return 1
}

run_layer1_control() {
  echo "verify-endpoints: layer 1 positive control..."
  if [ ! -f "$BRANDING_PREF_FILE" ]; then
    echo "verify-endpoints: layer 1 positive control FAIL -- $BRANDING_PREF_FILE does not exist" >&2
    return 1
  fi
  # track_pref_backup registers the restore with cleanup()'s trap coverage
  # (ACTIVE_PID/TEMP_PATHS's own mechanism) -- restore even on failure or an
  # interrupt is the whole point of the control. firefox-branding.js is the
  # unpreprocessed JS_PREFERENCE_FILES branch (branding-common.mozbuild),
  # read directly at browser startup with no `mach build` step in between --
  # appending to it and immediately re-running layer1_check is sufficient,
  # no rebuild required.
  track_pref_backup "$BRANDING_PREF_FILE"
  cat >> "$BRANDING_PREF_FILE" <<'PREFEOF'

pref("media.gmp-manager.url", "https://aus5.mozilla.org/update/3/GMP/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml");
PREFEOF

  local rc=0
  layer1_check >/dev/null 2>&1 || rc=1

  restore_pref_backup

  if [ "$rc" -ne 0 ]; then
    echo "verify-endpoints: layer 1 positive control PASS -- restoring the stock media.gmp-manager.url correctly went red"
    return 0
  fi
  echo "verify-endpoints: layer 1 positive control FAIL -- restoring the stock URL did NOT go red" >&2
  return 1
}

# ---------------------------------------------------------------------------
# Layer 2 -- filesystem, exact-path strace (BRAND-03)
# ---------------------------------------------------------------------------
run_layer2_impl() {
  local control="$1"
  local home_for_run="$HOME"
  local extra_args=()
  local sandbox=""

  if [ "$control" -eq 1 ]; then
    sandbox="$(mktemp -d)"
    track_temp "$sandbox"
    mkdir -p "$sandbox/.mozilla/firefox/control-profile"
    home_for_run="$sandbox"
    extra_args=(--profile "$sandbox/.mozilla/firefox/control-profile")
  fi

  local log shot
  log="$(mktemp)"
  track_temp "$log"
  shot="$(mktemp)"
  track_temp "$shot"

  HOME="$home_for_run" strace -f -e trace=openat,open,stat,access -o "$log" \
    "$BIN_PATH" --headless "${extra_args[@]}" --screenshot "$shot" about:blank >/dev/null 2>&1 || true

  if [ ! -s "$log" ]; then
    echo "verify-endpoints: layer 2 FAIL -- strace log is empty; the check never ran" >&2
    return 1
  fi

  # Positive-observation anchor: real activity under $HOME, not the ".mozilla"
  # substring the research doc expected on every build. Empirically found
  # live this session (03-02 Task 2) to be UNRELIABLE as a per-run signal:
  # nsXREDirProvider.cpp's ".mozilla" AppendNative only fires for specific,
  # lazily-queried directory keys (XRE_USER_NATIVE_MANIFESTS, the legacy
  # update-root, the extensions-compat path) that a plain
  # `--headless --screenshot about:blank` run does not always touch --
  # confirmed by a real back-to-back pair of runs on this host, one
  # observing it and the very next observing zero. $HOME itself, by
  # contrast, is touched hundreds of times every run (the real profile at
  # ~/.config/debios/powerbrowser) and is what genuinely proves strace
  # captured live filesystem activity rather than an empty/broken log.
  local home_count exact_count
  home_count="$(grep -cF "$home_for_run" "$log" || true)"
  exact_count="$(grep -cF "\"$home_for_run/.mozilla/firefox" "$log" || true)"

  if [ "$control" -eq 1 ]; then
    if [ "$exact_count" -gt 0 ]; then
      echo "verify-endpoints: layer 2 positive control PASS -- sandboxed \$HOME/.mozilla/firefox path was correctly observed ($exact_count access(es))"
      return 0
    fi
    echo "verify-endpoints: layer 2 positive control FAIL -- sandboxed \$HOME/.mozilla/firefox path was NOT observed" >&2
    return 1
  fi

  if [ "$home_count" -eq 0 ]; then
    echo "verify-endpoints: layer 2 FAIL -- zero \$HOME-prefixed paths observed; the check did not capture real filesystem activity" >&2
    return 1
  fi
  if [ "$exact_count" -gt 0 ]; then
    echo "verify-endpoints: layer 2 FAIL -- $exact_count access(es) to \$HOME/.mozilla/firefox (real Firefox's profile tree)" >&2
    return 1
  fi
  echo "verify-endpoints: layer 2 PASS -- \$HOME activity observed ($home_count line(s)), zero touches to \$HOME/.mozilla/firefox"
  return 0
}

run_layer2() {
  echo "verify-endpoints: layer 2 (filesystem, strace)..."
  run_layer2_impl 0
}

run_layer2_control() {
  echo "verify-endpoints: layer 2 positive control..."
  run_layer2_impl 1
}

# ---------------------------------------------------------------------------
# Layer 3 -- network, host resolution
# ---------------------------------------------------------------------------
# extract_resolved_hosts LOG_BASE -- the sorted unique hostnames from the anchored
# `Resolving host [...]` lines of <base>.moz_log and its <base>.child-N.moz_log siblings.
# Naming order, confirmed against GeckoChildProcessHost.cpp:945-967: the child-specific
# postfix is appended to the (extension-stripped) base BEFORE the logging backend re-adds
# .moz_log -- so per-child logs are <base>.child-N.moz_log, not <base>.moz_log.child-N.
extract_resolved_hosts() {
  cat "${1}.moz_log" "${1}".child-*.moz_log 2>/dev/null \
    | grep -oE 'Resolving host \[[^]]+\]' \
    | sed -E 's/Resolving host \[([^]]+)\]/\1/' \
    | sort -u
}

# endpoint_violations ALLOWLIST_PATH USER_ACTION(0|1) -- reads hosts on stdin, prints the
# failing ones one per line through scripts/lib/endpoint-verdict.mjs (the one verdict rule).
endpoint_violations() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const [libPath, allowlistPath, userAction] = process.argv.slice(1);
    const { violations } = await import(pathToFileURL(libPath).href);
    const { hosts } = JSON.parse(readFileSync(allowlistPath, "utf8"));
    const observed = readFileSync(0, "utf8").split("\n").filter(Boolean);
    for (const h of violations(hosts, observed, { userAction: userAction === "1" })) console.log(h);
  ' "$REPO_ROOT/scripts/lib/endpoint-verdict.mjs" "$1" "$2"
}

run_layer3_impl() {
  local control="$1"

  # track_pref_backup registers the restore with cleanup()'s trap coverage,
  # so a SIGINT during the 35-second sleep below (previously CR-02: the
  # trap fires cleanup(); exit 130 without ever reaching this function's own
  # restore) now restores the pref file before the process exits.
  if [ "$control" -eq 1 ]; then
    track_pref_backup "$BRANDING_PREF_FILE"
    # media.gmp-gmpopenh264.enabled=true alone is a vacuous control after the
    # BRAND-04 ledger-entry-5 fix (2026-08-29): the ciscobinary.openh264.org
    # resolution comes from GMPProvider.findUpdates()'s periodic auto-update
    # task, which never reads .enabled at all -- it is gated by the global
    # extensions.update.autoUpdateDefault (the branding pref file now sets
    # false), since the per-plugin override cannot be set from a
    # default-branch pref file (GMPPrefs.isSet() requires prefHasUserValue()).
    # Re-enabling autoUpdateDefault here is what actually reproduces the
    # violation; .enabled=true is kept alongside it for continuity with the
    # plugin's user-facing visibility, though it is inert for this path.
    cat >> "$BRANDING_PREF_FILE" <<'PREFEOF'

pref("media.gmp-gmpopenh264.enabled", true);
pref("extensions.update.autoUpdateDefault", true);
PREFEOF
  fi

  local log_base profile_dir
  log_base="$(mktemp -u "${TMPDIR:-/tmp}/powerbrowser-hostresolver-XXXXXX")"
  profile_dir="$(mktemp -d)"
  track_temp "$profile_dir"

  MOZ_LOG=nsHostResolver:5 MOZ_LOG_FILE="$log_base" \
    "$BIN_PATH" --headless --profile "$profile_dir" "https://firefox.settings.services.mozilla.com/" &
  ACTIVE_PID=$!
  # 35s, not 20s (03-03 finding): app.update.timerFirstInterval defaults to
  # 30000ms (toolkit/components/timermanager/UpdateTimerManager.sys.mjs:97-103),
  # the delay before Firefox's periodic AddonManager update-check timer fires
  # for the first time. A 20-second window never observes that timer at all --
  # confirmed live this session: extending to 35s newly surfaced
  # ciscobinary.openh264.org (layer 3's own positive control, previously a
  # false-negative), services.addons.mozilla.org, update.googleapis.com and
  # www.google.com, none of which a 20-second capture could ever see. 35s
  # gives >=5s of margin past the 30s minimum for host-load jitter.
  sleep 35
  kill "$ACTIVE_PID" 2>/dev/null || true
  wait "$ACTIVE_PID" 2>/dev/null || true
  ACTIVE_PID=""

  # Empirically, every child log observed this session was 0 bytes (this
  # build's DNS activity all logs through the parent process), but
  # extract_resolved_hosts still reads them correctly if that ever changes.
  local extracted
  extracted="$(extract_resolved_hosts "$log_base")"

  rm -f "${log_base}.moz_log" "${log_base}".child-*.moz_log 2>/dev/null

  # restore_pref_backup is a no-op when nothing was tracked (the non-control
  # path), so this call site needs no `if [ "$control" -eq 1 ]` wrapper.
  restore_pref_backup

  if [ -z "$extracted" ]; then
    echo "verify-endpoints: layer 3 FAIL -- empty extracted host set; the check never ran" >&2
    return 1
  fi

  # Positive observation: a controlled probe, not a count. Zero-network
  # nsHostResolver activity (TRR URI, confirmation NS, localhost) is emitted
  # even on a run with no real traffic, so an "at least one hostname" gate
  # would pass vacuously if the capture silently broke. The URL navigated to
  # above is a deliberately allowlisted host; require it specifically.
  if ! grep -qxF "firefox.settings.services.mozilla.com" <<< "$extracted"; then
    echo "verify-endpoints: layer 3 FAIL -- controlled probe host firefox.settings.services.mozilla.com never resolved (capture may be broken)" >&2
    return 1
  fi

  # Layer 3 is an unattended capture: no user action, so a user-initiated
  # host fails exactly as a deny host does (UPD-33).
  local violations
  if ! violations="$(endpoint_violations "$ALLOWLIST" 0 <<< "$extracted")"; then
    echo "verify-endpoints: layer 3 FAIL -- the verdict call itself failed" >&2
    return 1
  fi

  if [ "$control" -eq 1 ]; then
    if [ -n "$violations" ]; then
      echo "verify-endpoints: layer 3 positive control PASS -- re-enabling OpenH264 correctly surfaced a violation"
      return 0
    fi
    echo "verify-endpoints: layer 3 positive control FAIL -- re-enabling OpenH264 did NOT surface a violation" >&2
    return 1
  fi

  if [ -n "$violations" ]; then
    echo "verify-endpoints: layer 3 FAIL -- unlisted, denied or user-initiated host(s) resolved without a user action:" >&2
    sed '/^$/d;s/^/  /' <<< "$violations" >&2
    return 1
  fi
  echo "verify-endpoints: layer 3 PASS -- all resolved hosts are allowlisted"
  return 0
}

run_layer3() {
  echo "verify-endpoints: layer 3 (network, MOZ_LOG)..."
  run_layer3_impl 0
}

run_layer3_control() {
  echo "verify-endpoints: layer 3 positive control..."
  run_layer3_impl 1
}

# ---------------------------------------------------------------------------
# Interrupt self-test -- proves the Task 1 fix with a real SIGINT sent to a
# real running control, not an assertion that the code looks correct.
# ---------------------------------------------------------------------------
run_interrupt_self_test() {
  echo "verify-endpoints: interrupt self-test..."

  if [ ! -f "$BRANDING_PREF_FILE" ]; then
    echo "verify-endpoints: interrupt self-test FAIL -- $BRANDING_PREF_FILE does not exist" >&2
    return 1
  fi

  # Independent guard copy -- this self-test's own safety net, entirely
  # separate from the child process's own PREF_BACKUP_SRC/DST below.
  # Restored unconditionally at the end regardless of outcome, and
  # registered with track_temp so this script's own cleanup() removes it
  # even if this function itself is interrupted.
  local guard expected_sha
  guard="$(mktemp)"
  track_temp "$guard"
  cp "$BRANDING_PREF_FILE" "$guard"
  expected_sha="$(sha256sum "$BRANDING_PREF_FILE" | awk '{print $1}')"

  # Launch the layer-3 positive control as the leader of its own process
  # group, so a negative-PID kill below reaches both this script instance
  # and the real browser it backgrounds of its own -- necessary because a
  # bare PID kill would orphan that browser instead of killing it.
  #
  # `set -m` (job control), not `setsid`: bash's async-command SIGINT/SIGQUIT
  # handling means a plain `cmd &` launched from a non-interactive script
  # (job control off, the default for a sourced/executed script) is forked
  # with SIGINT already SIG_IGN -- POSIX/bash then permanently refuse to let
  # `trap ... INT` un-ignore a signal that was "ignored upon entry to the
  # shell," so the recursed script's own INT trap (and everything downstream
  # of it, including this fix) would silently never fire. `set -m` makes
  # bash assign the job its own fresh process group and NOT pre-ignore
  # INT/QUIT for it, which is what actually lets the SIGINT below reach and
  # be trapped by the child. `setsid` was tried first and rejected: layered
  # under `set -m` it forces an internal fork (a process already made its
  # own group leader by job control cannot setsid() without forking), which
  # decouples $! from the real leader's PID and defeats PID-based tracking.
  local child_log
  child_log="$(mktemp)"
  track_temp "$child_log"
  set -m
  bash "$0" --layer 3 --positive-control >"$child_log" 2>&1 &
  local group_pid=$!
  set +m

  # Poll for the mutation rather than sleeping blind: wait until the control
  # has actually appended media.gmp-gmpopenh264.enabled to the pref file, so
  # the SIGINT below lands inside its real 35-second capture window rather
  # than before the control has mutated anything at all.
  local waited=0 max_wait=30 mutated=0
  while [ "$waited" -lt "$max_wait" ]; do
    # The pristine pref file already contains this key set to false (it's
    # one of layer 1's own asserted prefs) -- match the APPENDED true value
    # specifically, not the bare key name, or this would fire instantly on
    # the pre-existing line and never actually observe the control's mutation.
    if grep -qE 'pref\("media\.gmp-gmpopenh264\.enabled",[[:space:]]*true\)' "$BRANDING_PREF_FILE" 2>/dev/null; then
      mutated=1
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if [ "$mutated" -eq 0 ]; then
    echo "verify-endpoints: interrupt self-test FAIL -- control never mutated the pref file within ${max_wait}s" >&2
    kill -- "-$group_pid" 2>/dev/null || true
    wait "$group_pid" 2>/dev/null || true
    cp "$guard" "$BRANDING_PREF_FILE"
    return 1
  fi

  echo "verify-endpoints: interrupt self-test observed the mutated pref after ${waited}s -- sending SIGINT to the control's process group"
  kill -INT -- "-$group_pid" 2>/dev/null || true
  wait "$group_pid" 2>/dev/null

  local actual_sha
  actual_sha="$(sha256sum "$BRANDING_PREF_FILE" | awk '{print $1}')"

  local rc=0
  if [ "$actual_sha" = "$expected_sha" ]; then
    echo "verify-endpoints: interrupt self-test PASS -- pref file digest unchanged after interrupt ($actual_sha)"
  else
    echo "verify-endpoints: interrupt self-test FAIL -- pref file digest mismatch after interrupt" >&2
    echo "  expected: $expected_sha" >&2
    echo "  observed: $actual_sha" >&2
    diff "$guard" "$BRANDING_PREF_FILE" >&2 || true
    rc=1
  fi

  # Restore the guard copy unconditionally regardless of outcome, then
  # re-verify the digest after restore before returning -- this is what
  # keeps a FAILED self-test from leaving the real binary corrupted.
  cp "$guard" "$BRANDING_PREF_FILE"
  local restored_sha
  restored_sha="$(sha256sum "$BRANDING_PREF_FILE" | awk '{print $1}')"
  if [ "$restored_sha" != "$expected_sha" ]; then
    echo "verify-endpoints: interrupt self-test FAIL -- guard restore itself did not converge to the pre-run digest" >&2
    return 1
  fi

  return "$rc"
}

# ---------------------------------------------------------------------------
# Disposition self-test (UPD-33) -- layer 3's real extraction and verdict over
# fixture logs. Reads no objdir, so it needs no build, browser, display or network.
# ---------------------------------------------------------------------------
run_disposition_self_test() {
  echo "verify-endpoints: disposition self-test..."
  local tmp rc=0
  tmp="$(mktemp -d)"
  track_temp "$tmp"
  local fixture="$tmp/allowlist.json"
  cat > "$fixture" <<'JSONEOF'
{ "hosts": [
  { "host": "allowed.example.test", "disposition": "allow", "reason": "fixture" },
  { "host": "denied.example.test", "disposition": "deny", "reason": "fixture" },
  { "host": "clicked.example.test", "disposition": "user-initiated", "reason": "fixture" }
], "prefs": [] }
JSONEOF

  # plant NAME HOST -- writes <base>.moz_log with one anchored resolution of HOST among noise
  # lines the anchored pattern must ignore, then extracts it the way layer 3 does.
  plant() {
    local base="$tmp/$1"
    printf '%s\n' \
      "[Parent 100: Main Thread]: D/nsHostResolver TRR URI noise.example.test" \
      "[Parent 100: Socket Thread]: D/nsHostResolver Resolving host [$2] <Address family 0>." \
      > "$base.moz_log"
    extract_resolved_hosts "$base"
  }

  # verdict CASE ALLOWLIST USER_ACTION HOST red|green
  verdict() {
    local got
    got="$(plant "$1" "$4" | endpoint_violations "$2" "$3")"
    if [ "$5" = red ] && grep -qxF "$4" <<< "$got"; then
      echo "verify-endpoints: disposition self-test PASS -- $1: red, names $4"
    elif [ "$5" = green ] && [ -z "$got" ]; then
      echo "verify-endpoints: disposition self-test PASS -- $1: green"
    else
      echo "verify-endpoints: disposition self-test FAIL -- $1: expected $5 for $4, violations: [${got//$'\n'/ }]" >&2
      rc=1
    fi
  }

  verdict "user-initiated-unattended" "$fixture" 0 clicked.example.test red
  verdict "user-initiated-after-click" "$fixture" 1 clicked.example.test green
  verdict "deny-unattended" "$fixture" 0 denied.example.test red
  verdict "deny-after-click" "$fixture" 1 denied.example.test red
  verdict "allow-unattended" "$fixture" 0 allowed.example.test green
  verdict "unlisted-unattended" "$fixture" 0 unlisted.example.test red
  # 46 WR-07 ruling (2026-10-25): github.com is user-initiated, so an unattended
  # request to it (the update download must never reach it) fails against the real allowlist.
  verdict "github-com-unattended-real-allowlist" "$ALLOWLIST" 0 github.com red
  verdict "github-com-after-click-real-allowlist" "$ALLOWLIST" 1 github.com green

  # Every user-initiated host in the real allowlist, planted unattended, must go red naming it.
  local real_hosts host n=0
  real_hosts="$(node -e '
    const a = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const h of a.hosts) if (h.disposition === "user-initiated") console.log(h.host.startsWith(".") ? "x" + h.host : h.host);
  ' "$ALLOWLIST")" || { echo "verify-endpoints: disposition self-test FAIL -- could not read $ALLOWLIST" >&2; return 1; }
  while IFS= read -r host; do
    [ -z "$host" ] && continue
    n=$((n + 1))
    verdict "real-allowlist-unattended-$host" "$ALLOWLIST" 0 "$host" red
  done <<< "$real_hosts"
  echo "verify-endpoints: disposition self-test -- $n user-initiated host(s) in the real allowlist: ${real_hosts//$'\n'/ }"

  return "$rc"
}

# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
if [ "$DISPOSITION_SELF_TEST" -eq 1 ]; then
  run_disposition_self_test && exit 0
  exit 1
fi

if [ "$INTERRUPT_SELF_TEST" -eq 1 ]; then
  if run_interrupt_self_test; then
    exit 0
  else
    exit 1
  fi
fi

LAYERS_TO_RUN=(1 2 3 4)
if [ -n "$LAYER_ARG" ]; then
  LAYERS_TO_RUN=("$LAYER_ARG")
fi

FAILED=0
for layer in "${LAYERS_TO_RUN[@]}"; do
  if [ "$DO_CONTROL" -eq 1 ]; then
    case "$layer" in
      1) run_layer1_control || FAILED=1 ;;
      2) run_layer2_control || FAILED=1 ;;
      3) run_layer3_control || FAILED=1 ;;
      4) ;; # inline control: the check fails unless it observes the registry host
    esac
  else
    case "$layer" in
      1) run_layer1 || FAILED=1 ;;
      2) run_layer2 || FAILED=1 ;;
      3) run_layer3 || FAILED=1 ;;
      4) node "$REPO_ROOT/scripts/verify-ng-069-sidecar-egress.mjs" || FAILED=1 ;;
    esac
  fi
done

if [ "$FAILED" -eq 0 ]; then
  echo "verify-endpoints: PASS"
  exit 0
else
  echo "verify-endpoints: FAIL -- see above" >&2
  exit 1
fi
