#!/usr/bin/env bash
# scripts/fixer-isolate.sh (Phase 52, CR-02): run one command with no network, no new privileges and no
# credential in its environment. The fix-gate job runs the model's diff through the gate's executing stages
# (check-patch-surface, the brand scan, diff-theia-core, verify-platform --quick), and that code is hostile.
#
#   scripts/fixer-isolate.sh -- <command> [args...]    run the command isolated; exit with its status
#   scripts/fixer-isolate.sh --self-test               prove the isolation holds
#
# What isolation means here, in the strongest form this host allows:
#   1. A new network namespace: the command sees a down loopback and nothing else, so it cannot reach the
#      network, the metadata service or the runner's local services.
#   2. A new PID namespace with --kill-child: no process of the command outlives it, so nothing can write to a
#      runner file after the step ended.
#   3. no_new_privs and every capability dropped: sudo and setuid binaries cannot raise privilege inside it.
#   4. A scrubbed environment: every GITHUB_*, ACTIONS_*, RUNNER_* and *TOKEN*/*SECRET*/*KEY* variable is
#      unset first, so the command knows neither $GITHUB_OUTPUT nor any credential.
# Two ways to get the namespaces, tried in order:
#   a. unshare -rn (an unprivileged user namespace): needs no sudo at all.
#   b. sudo -n unshare, then setpriv back to this uid with no_new_privs: for hosts that restrict unprivileged
#      user namespaces, such as an ubuntu-latest runner with AppArmor's unprivileged-userns restriction.
# If neither works the script fails closed; it never runs the command unisolated.
#
# shortcut: the command still runs as this uid, so it can read files this uid can read (the runner work area)
# and write the files this uid owns. The gate job holds no secret and no write token, and the verdict is the
# job's exit status, which the command cannot set. Upgrade to a dedicated uid when a runner image offers one.
set -euo pipefail

NAME="fixer-isolate"

fail() {
  echo "$NAME: FAIL -- $1" >&2
  echo "  Next step: $2" >&2
  exit 1
}

scrub_env() {
  local k
  while IFS= read -r -d '' k; do
    k="${k%%=*}"
    case "$k" in
      GITHUB_* | ACTIONS_* | RUNNER_* | *TOKEN* | *SECRET* | *KEY* | *PASSWORD*) unset "$k" ;;
    esac
  done < <(env -0)
}

# Pick the strategy once: userns when it works, else sudo when it works, else nothing.
strategy() {
  if unshare -rn true 2> /dev/null; then echo userns; return; fi
  if command -v setpriv > /dev/null 2>&1 && sudo -n true 2> /dev/null && sudo -n unshare --net true 2> /dev/null; then echo sudo; return; fi
  echo none
}

DROP=(--no-new-privs --bounding-set=-all --inh-caps=-all)

# exec the command isolated. $@ is the command.
run_isolated() {
  local how
  how=$(strategy)
  scrub_env
  case "$how" in
    userns)
      exec unshare -rn --pid --fork --kill-child --mount-proc -- setpriv "${DROP[@]}" -- "$@"
      ;;
    sudo)
      exec sudo -n -E unshare --net --pid --fork --kill-child --mount-proc -- \
        setpriv --reuid="$(id -u)" --regid="$(id -g)" --clear-groups "${DROP[@]}" -- "$@"
      ;;
    *)
      fail "neither an unprivileged user namespace nor passwordless sudo is available, so the command cannot be isolated" "run the gate on a host that allows 'unshare -rn' or 'sudo -n unshare --net'; the gate never runs unisolated."
      ;;
  esac
}

self_test() {
  local exit=0 out
  bad() { echo "$NAME: --self-test FAIL -- $1" >&2; exit=1; }
  ok() { echo "  ok  $1"; }
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixer-isolate.sh"

  # Run a probe isolated, with credential-shaped variables set in the parent.
  probe() { GITHUB_OUTPUT=/nonexistent/out ACTIONS_RUNTIME_TOKEN=tok FIXER_PLANTED_SECRET=s bash "$here" -- "$@"; }

  if [ "$(strategy)" = none ]; then
    bad "no isolation strategy is available on this host (unshare -rn and sudo -n unshare --net both fail)"
    return 1
  fi

  # A. the network is gone: only a loopback interface, and a connect to a public address fails.
  out=$(probe bash -c 'tail -n +3 /proc/self/net/dev | cut -d: -f1 | tr -d " " | grep -vx lo || true') || bad "the network probe did not run"
  [ -z "$out" ] && ok "the command sees no network interface but a loopback" || bad "the command sees interface(s): $out"
  if probe bash -c 'exec 3<>/dev/tcp/1.1.1.1/53' > /dev/null 2>&1; then bad "the command opened a connection to 1.1.1.1:53"; else ok "a connection to a public address fails"; fi

  # B. privilege cannot be raised.
  out=$(probe bash -c "grep -E '^NoNewPrivs:' /proc/self/status | tr -d '[:space:]'") || true
  [ "$out" = "NoNewPrivs:1" ] && ok "no_new_privs is set" || bad "no_new_privs is not set (got '${out:-nothing}')"
  out=$(probe bash -c "grep -E '^CapEff:' /proc/self/status | awk '{print \$2}'") || true
  [ "$out" = "0000000000000000" ] && ok "no effective capability" || bad "the command holds capabilities (CapEff ${out:-unknown})"

  # C. the environment carries no credential and no runner file path.
  out=$(probe bash -c 'env | grep -E "^(GITHUB_|ACTIONS_|FIXER_PLANTED_SECRET)" || true') || bad "the environment probe did not run"
  [ -z "$out" ] && ok "GITHUB_*, ACTIONS_* and credential-shaped variables are unset" || bad "the command still sees: $(printf '%s' "$out" | cut -d= -f1 | tr '\n' ' ')"

  # D. a process the command leaves behind does not outlive it (the pid namespace kills it).
  local marker
  marker=$(mktemp -u "${TMPDIR:-/tmp}/fixer-isolate-marker.XXXXXX")
  probe bash -c "(sleep 3; : > '$marker') >/dev/null 2>&1 & exit 0" || true
  sleep 4
  if [ -e "$marker" ]; then rm -f "$marker"; bad "a background process outlived the command and wrote after it ended"; else ok "a background process does not outlive the command"; fi

  # E. the exit status and stdout pass through (control).
  probe bash -c 'exit 7' > /dev/null 2>&1 && bad "an exit status of 7 was reported as success" || { [ "$?" = 7 ] && ok "the command's exit status passes through" || bad "the exit status was altered"; }
  out=$(probe bash -c 'echo through') || true
  [ "$out" = "through" ] && ok "control: stdout passes through" || bad "stdout did not pass through"

  if [ "$exit" -eq 0 ]; then
    echo "$NAME: --self-test PASS -- strategy $(strategy): no network, no new privileges, no capability, a scrubbed environment and no surviving process"
  else
    echo "$NAME: --self-test FAIL -- see the lines above" >&2
  fi
  return "$exit"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  --)
    shift
    [ "$#" -gt 0 ] || fail "no command after --" "pass the command to isolate after --."
    run_isolated "$@"
    ;;
  *) fail "unknown argument '${1:-}'" "run with -- <command> or --self-test." ;;
esac
