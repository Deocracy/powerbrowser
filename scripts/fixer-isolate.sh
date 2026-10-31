#!/usr/bin/env bash
# scripts/fixer-isolate.sh (Phase 52, CR-02, re-review WR-02..WR-05): run one command with no network, no new
# privileges, no credential in its environment and no way to write outside a scratch directory. The fix-gate job
# runs the model's diff through the gate's executing stages (check-patch-surface, the brand scan, diff-theia-core,
# verify-platform --quick), and that code is hostile.
#
#   scripts/fixer-isolate.sh -- <command> [args...]    run the command isolated; exit with its status
#   scripts/fixer-isolate.sh --self-test               prove the isolation holds
#   scripts/fixer-isolate.sh --print-overlay           the names laid read-only over the gate's worktree
#
# What isolation means here, in the strongest form this host allows:
#   1. A new network namespace: the command sees its own private loopback (brought up, because quick rows talk to a
#      server they start on 127.0.0.1) and nothing else, so it cannot reach the network, the metadata service or
#      the runner's local services.
#   2. A new PID namespace with --kill-child: no process of the command outlives it, so nothing can write to a
#      runner file after the step ended.
#   3. A new mount namespace in which every mount is remounted read-only except a per-run scratch directory
#      ($FIXER_SCRATCH, also bound over /tmp and /var/tmp, and the command's TMPDIR and HOME). The command can write
#      nothing outside the scratch directory: not the checkout, not the runner's GitHub file-command files
#      (GITHUB_ENV, GITHUB_PATH, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, GITHUB_STATE and their directory), which are
#      also bound read-only by name, so a later step or post-step of the job cannot be steered through them (WR-02).
#   4. The trusted script overlay ($FIXER_SCRATCH/tree/{scripts,inventory,.github,...}) is a read-only bind mount of
#      the trusted checkout's directories, so no stage can rewrite the scripts a later stage runs (WR-05).
#   5. no_new_privs, every capability dropped, and (sudo form) the supplementary groups cleared; a scrubbed
#      environment: every GITHUB_*, ACTIONS_*, RUNNER_* and *TOKEN*/*SECRET*/*KEY*/*PASSWORD* variable is unset.
#   6. Filesystem unix sockets are not reachable through a network namespace's isolation: every socket file under
#      /run, /var/run, /dev/shm and $XDG_RUNTIME_DIR is masked by a bind of /dev/null, so a group-readable
#      docker.sock cannot be connected to (WR-03). The unprivileged-userns form cannot clear supplementary groups
#      (setgroups is denied there), which is why the mask exists.
# Two ways to get the namespaces, tried in order:
#   a. unshare -rn (an unprivileged user namespace): needs no sudo at all.
#   b. sudo -n unshare, then setpriv back to this uid with no_new_privs: for hosts that restrict unprivileged
#      user namespaces, such as an ubuntu-latest runner with AppArmor's unprivileged-userns restriction.
# If neither works the script fails closed; it never runs the command unisolated.
#
# The mount-based confinement cannot be applied after the command starts (it holds no capability), so the gate's
# worktree is built under $FIXER_SCRATCH/tree around the read-only overlay mount points (scripts/verify-fix-gate.mjs
# reads FIXER_SCRATCH). The dynamic gate stages (5-8) remain ADVISORY against a hostile diff: code a stage runs can
# still lie about its own exit status, so a green stage means "the rows ran and reported green", not "the diff
# passed them". The binding check is fix-pr's static re-run of the pure stages on the hashed bytes.
#
# shortcut: the command still runs as this uid, so it can read files this uid can read (the runner work area) and
# connect to a same-uid unix socket outside /run, /var/run, /dev/shm and $XDG_RUNTIME_DIR. The gate job holds no
# secret and no write token. Upgrade to a dedicated uid when a runner image offers one.
set -euo pipefail

NAME="fixer-isolate"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
# The trusted names laid read-only over the gate's worktree. scripts/verify-fix-gate.mjs keeps TRUSTED_OVERLAY and its
# self-test requires set equality with this list (--print-overlay).
OVERLAY=(scripts inventory .github quick-baseline.txt toolchain-baseline.txt flake.lock)

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

# Does this form work on this host? userns: an unprivileged user namespace. sudo: passwordless sudo, setpriv, and a net
# namespace made by root.
form_works() {
  case "$1" in
    userns) unshare -rn true 2> /dev/null ;;
    sudo) command -v setpriv > /dev/null 2>&1 && sudo -n true 2> /dev/null && sudo -n unshare --net true 2> /dev/null ;;
    *) return 1 ;;
  esac
}

# Pick the strategy once: userns when it works, else sudo when it works, else nothing. FIXER_ISOLATE_FORCE=userns|sudo
# (the self-test only) names one form and never falls back to the other.
strategy() {
  case "${FIXER_ISOLATE_FORCE:-}" in
    userns | sudo) if form_works "$FIXER_ISOLATE_FORCE"; then echo "$FIXER_ISOLATE_FORCE"; else echo none; fi; return ;;
  esac
  if form_works userns; then echo userns; return; fi
  if form_works sudo; then echo sudo; return; fi
  echo none
}

# The setpriv options, in the order setpriv(1) documents for "a more restrictive setup": ids, groups, inheritable
# capabilities, the bounding set, then no_new_privs. The sudo form puts --reuid, --regid and --clear-groups in front.
DROP=(--inh-caps=-all --bounding-set=-all --no-new-privs)

# Runs inside the new namespaces, with the capabilities of the namespace, before they are dropped. $@ is the setpriv
# command line followed by the isolated command. It fails closed: a mount that cannot be made read-only aborts.
INNER='
set -eu
SC=$FIXER_SCRATCH
mount --make-rprivate /
# The one writable place: the scratch directory, which also stands in for /tmp and /var/tmp.
mount --bind "$SC" "$SC"
keep=" $SC "
case "$SC" in
  /tmp/* | /var/tmp/*) ;;
  *) for d in /tmp /var/tmp; do if [ -d "$d" ]; then mount --bind "$SC/tmp" "$d"; keep="$keep$d "; fi; done ;;
esac
# The runner file-command files and their directory, by name (read-only below with everything else).
IFS=:
for p in $FIXER_ISOLATE_RO; do
  if [ -n "$p" ] && [ -e "$p" ]; then mount --bind "$p" "$p"; fi
done
unset IFS
# Unix sockets (after the binds above, which would otherwise uncover a masked socket) on the filesystem cross a network namespace: mask every one in the places a daemon puts one.
for d in /run /var/run /dev/shm ${XDG_RUNTIME_DIR:-}; do
  [ -d "$d" ] || continue
  find "$d" -xdev -type s 2> /dev/null | while IFS= read -r s; do mount --bind /dev/null "$s" 2> /dev/null || true; done
done
# The trusted script overlay: mount points under the worktree, bound from the trusted checkout.
for n in $FIXER_ISOLATE_OVERLAY; do
  [ -e "$FIXER_ISOLATE_ROOT/$n" ] || continue
  if [ -d "$FIXER_ISOLATE_ROOT/$n" ]; then mkdir -p "$SC/tree/$n"; else mkdir -p "$(dirname "$SC/tree/$n")"; : > "$SC/tree/$n"; fi
  mount --bind "$FIXER_ISOLATE_ROOT/$n" "$SC/tree/$n"
done
# Everything that is not the scratch directory becomes read-only, the fresh /proc excepted.
awk "{for (i = 7; i <= NF; i++) if (\$i == \"-\") { print \$5, \$(i + 1); break }}" /proc/self/mountinfo | while read -r mp fs; do
  mp=$(printf "%b" "$mp")
  case "$keep" in *" $mp "*) continue ;; esac
  [ "$fs" = proc ] && continue
  [ -c "$mp" ] && continue   # a socket masked by /dev/null: writes go to the null device
  mount -o remount,bind,ro "$mp" || { echo "fixer-isolate: FAIL -- could not make $mp read-only, so the command could write there" >&2; exit 97; }
done
unset FIXER_ISOLATE_RO FIXER_ISOLATE_ROOT
echo "fixer-isolate: NOTE -- node: $(command -v node || echo none), yarn: $(command -v yarn || echo none), makensis: $(command -v makensis || echo none)" >&2
ip link set lo up 2> /dev/null || echo "fixer-isolate: NOTE -- could not bring the private loopback up (is ip installed?); a row that serves on 127.0.0.1 will fail" >&2
exec "$@"
'

# Run the command isolated (as a child, so the scratch directory is removed after). $@ is the command.
run_isolated() {
  local how scratch base rc=0 ro="" v p
  how=$(strategy)
  [ "$how" != none ] || fail "neither an unprivileged user namespace nor passwordless sudo is available, so the command cannot be isolated" "run the gate on a host that allows 'unshare -rn' or 'sudo -n unshare --net'; the gate never runs unisolated."
  base="${FIXER_SCRATCH_BASE:-${RUNNER_TEMP:-}}"
  [ -n "$base" ] || base="$(git -C "$ROOT" rev-parse --absolute-git-dir 2> /dev/null || echo "${TMPDIR:-/tmp}")"
  scratch=$(mktemp -d "$base/fixer-scratch.XXXXXX") || fail "could not create a scratch directory under $base" "set FIXER_SCRATCH_BASE to a writable directory."
  mkdir -p "$scratch/tmp" "$scratch/home" "$scratch/tree"
  # The runner's file-command files and their directories, read before the environment is scrubbed (directories first).
  for v in GITHUB_ENV GITHUB_PATH GITHUB_OUTPUT GITHUB_STEP_SUMMARY GITHUB_STATE; do
    p="${!v:-}"
    if [ -n "$p" ] && [ -e "$p" ]; then ro="$(dirname "$p"):$ro$p:"; fi
  done
  scrub_env
  export FIXER_ISOLATED=1 FIXER_SCRATCH="$scratch" FIXER_ISOLATE_RO="$ro" FIXER_ISOLATE_ROOT="$ROOT" FIXER_ISOLATE_OVERLAY="${OVERLAY[*]}"
  export TMPDIR="$scratch/tmp" HOME="$scratch/home"
  case "$how" in
    userns)
      unshare -rn --pid --fork --kill-child --mount-proc -- bash -c "$INNER" _ setpriv "${DROP[@]}" -- "$@" || rc=$?
      ;;
    sudo)
      # sudo's secure_path would replace PATH (the nix shell's node and yarn would be lost), so it is passed explicitly.
      sudo -n -E env "PATH=$PATH" "TMPDIR=$TMPDIR" "HOME=$HOME" "FIXER_ISOLATED=1" "FIXER_SCRATCH=$scratch" "FIXER_ISOLATE_RO=$ro" "FIXER_ISOLATE_ROOT=$ROOT" "FIXER_ISOLATE_OVERLAY=${OVERLAY[*]}" \
        unshare --net --pid --fork --kill-child --mount --mount-proc -- bash -c "$INNER" _ \
        setpriv --reuid="$(id -u)" --regid="$(id -g)" --clear-groups "${DROP[@]}" -- "$@" || rc=$?
      ;;
  esac
  case "$scratch" in "$base"/fixer-scratch.*) rm -rf -- "$scratch" ;; esac
  return "$rc"
}

self_test() {
  local exit=0 out how forms=() untested=""
  bad() { echo "$NAME: --self-test FAIL -- $1" >&2; exit=1; }
  ok() { echo "  ok  $1"; }

  # Run a probe isolated, with credential-shaped variables set in the parent.
  probe() {
    env GITHUB_OUTPUT=/nonexistent/out ACTIONS_RUNTIME_TOKEN=tok GITHUB_TOKEN=tok RUNNER_TEMP="$PLANT/rt" FIXER_PLANTED_SECRET=s FIXER_ISOLATE_FORCE="${FORCE:-}" bash "$HERE/fixer-isolate.sh" -- "$@"
  }

  if [ "${FIXER_ISOLATED:-}" = 1 ]; then
    # The gate's stage 8 runs every --quick row, this one included, inside the isolation: a second unshare is impossible
    # there (no capability, no_new_privs). The wrapper sets FIXER_ISOLATED, so only a real nested run reaches this branch
    # (IN-05: ambient state alone, such as a container with no network, no longer qualifies). It checks what the
    # mechanism produced: no interface, no privilege, a scrubbed environment, and that writes outside the scratch directory fail.
    local nested_ok=1 w
    [ -z "$(tail -n +3 /proc/self/net/dev | cut -d: -f1 | tr -d ' ' | grep -vx lo || true)" ] || { bad "nested: a network interface other than lo exists"; nested_ok=0; }
    [ "$(grep -E '^NoNewPrivs:' /proc/self/status | tr -d '[:space:]')" = "NoNewPrivs:1" ] || { bad "nested: no_new_privs is not set"; nested_ok=0; }
    [ "$(grep -E '^CapEff:' /proc/self/status | awk '{print $2}')" = "0000000000000000" ] || { bad "nested: the command holds capabilities"; nested_ok=0; }
    [ -z "$(env | grep -E '^(GITHUB_|ACTIONS_|RUNNER_)' || true)" ] || { bad "nested: a GITHUB_*, ACTIONS_* or RUNNER_* variable is set"; nested_ok=0; }
    # ROOT is the gate's own worktree here (inside the scratch directory), so the paths that must refuse a write are the
    # read-only overlay beside this script, /etc, and the directory that holds the scratch directory.
    for w in "$HERE/.fixer-isolate-probe" "/etc/.fixer-isolate-probe" "$(dirname "${FIXER_SCRATCH:-/nonexistent}")/.fixer-isolate-probe"; do
      if { : > "$w"; } 2> /dev/null; then rm -f "$w"; bad "nested: a write to $w succeeded"; nested_ok=0; fi
    done
    if { : > "${TMPDIR:-/tmp}/.fixer-isolate-probe"; } 2> /dev/null; then rm -f "${TMPDIR:-/tmp}/.fixer-isolate-probe"; else bad "nested: TMPDIR is not writable"; nested_ok=0; fi
    if [ "$nested_ok" = 1 ]; then
      ok "already inside the isolation (FIXER_ISOLATED=1): no interface but lo, no_new_privs, no capability, no GITHUB_*/ACTIONS_*/RUNNER_* variable, writes outside the scratch directory fail"
      echo "$NAME: --self-test PASS -- ran inside the isolation (no new namespace is possible there): the wrapper's effects hold"
      return 0
    fi
    return 1
  fi

  # The forms this host can run; sudo is tested only when passwordless sudo works, and reported untested otherwise.
  PLANT="" SRVPID=""
  if form_works userns; then forms+=(userns); fi
  if form_works sudo; then forms+=(sudo); else untested="sudo form UNTESTED here (needs passwordless sudo; this host has none)"; fi
  if [ "${#forms[@]}" -eq 0 ]; then
    bad "no isolation strategy is available on this host (unshare -rn and sudo -n unshare --net both fail) and this process is not inside the isolation"
    return 1
  fi

  # Planted files and a live unix socket live outside every writable place of the isolation.
  local plant f
  plant=$(mktemp -d "${XDG_RUNTIME_DIR:-/dev/shm}/fixer-isolate-plant.XXXXXX")
  PLANT="$plant"
  mkdir -p "$plant/rt"
  trap 'if [ -n "${SRVPID:-}" ]; then kill "$SRVPID" 2> /dev/null || true; fi; rm -rf -- "$PLANT"' EXIT
  for f in env path out summary state; do : > "$plant/$f"; done
  node -e 'require("net").createServer(c => c.end("REACHED")).listen(process.argv[1])' "$plant/x.sock" > /dev/null 2>&1 &
  SRVPID=$!
  for _ in $(seq 1 50); do [ -S "$plant/x.sock" ] && break; sleep 0.1; done
  [ -S "$plant/x.sock" ] || bad "could not plant a unix socket for the connect probe (is node on PATH?)"
  chmod 660 "$plant/x.sock" 2> /dev/null || true
  local conn='const s=require("net").connect(process.argv[1]);let r="";s.on("data",d=>r+=d);s.on("error",e=>{process.stdout.write("ERR:"+e.code);process.exit(0)});s.on("end",()=>{process.stdout.write(r);process.exit(0)})'
  if [ "$(node -e "$conn" "$plant/x.sock")" = "REACHED" ]; then ok "control: the planted unix socket answers outside the isolation"; else bad "the planted unix socket does not answer even outside the isolation, so the connect probe proves nothing"; fi

  local errs before after marker
  for how in "${forms[@]}"; do
    FORCE=$how
    echo "  -- strategy: $how"
    # A. the network is gone: only a loopback interface, and a connect to a public address fails.
    out=$(probe bash -c 'tail -n +3 /proc/self/net/dev | cut -d: -f1 | tr -d " " | grep -vx lo || true') || bad "$how: the network probe did not run"
    if [ -z "$out" ]; then ok "$how: the command sees no network interface but a loopback"; else bad "$how: the command sees interface(s): $out"; fi
    if probe bash -c 'exec 3<>/dev/tcp/1.1.1.1/53' > /dev/null 2>&1; then bad "$how: the command opened a connection to 1.1.1.1:53"; else ok "$how: a connection to a public address fails"; fi

    # A2. the private loopback is up, so a quick row's own 127.0.0.1 server works inside, with nothing else reachable.
    out=$(probe node -e "const s=require('net').createServer(c=>c.end('ok')).listen(0,'127.0.0.1',()=>{const p=s.address().port;require('net').connect(p,'127.0.0.1').on('data',d=>{process.stdout.write(String(d));s.close()})})") || true
    if [ "$out" = "ok" ]; then ok "$how: control: a server on the private loopback is reachable inside"; else bad "$how: the private loopback does not carry a local server (got '${out:-nothing}')"; fi

    # B. privilege cannot be raised.
    out=$(probe bash -c "grep -E '^NoNewPrivs:' /proc/self/status | tr -d '[:space:]'") || true
    if [ "$out" = "NoNewPrivs:1" ]; then ok "$how: no_new_privs is set"; else bad "$how: no_new_privs is not set (got '${out:-nothing}')"; fi
    out=$(probe bash -c "grep -E '^CapEff:' /proc/self/status | awk '{print \$2}'") || true
    if [ "$out" = "0000000000000000" ]; then ok "$how: no effective capability"; else bad "$how: the command holds capabilities (CapEff ${out:-unknown})"; fi

    # C. the environment carries no credential and no runner path.
    out=$(probe bash -c 'env | grep -E "^(GITHUB_|ACTIONS_|RUNNER_|FIXER_PLANTED_SECRET)" || true') || bad "$how: the environment probe did not run"
    if [ -z "$out" ]; then ok "$how: GITHUB_*, ACTIONS_*, RUNNER_* and credential-shaped variables are unset"; else bad "$how: the command still sees: $(printf '%s' "$out" | cut -d= -f1 | tr '\n' ' ')"; fi

    # D. a process the command leaves behind does not outlive it (the pid namespace kills it).
    marker=$(mktemp -u "${TMPDIR:-/tmp}/fixer-isolate-marker.XXXXXX")
    probe bash -c "(sleep 3; : > '$marker') >/dev/null 2>&1 & exit 0" || true
    sleep 4
    if [ -e "$marker" ]; then rm -f "$marker"; bad "$how: a background process outlived the command and wrote after it ended"; else ok "$how: a background process does not outlive the command"; fi

    # E. the exit status and stdout pass through (control).
    if probe bash -c 'exit 7' > /dev/null 2>&1; then bad "$how: an exit status of 7 was reported as success"; else
      if [ "$?" = 7 ]; then ok "$how: the command's exit status passes through"; else bad "$how: the exit status was altered"; fi
    fi
    out=$(probe bash -c 'echo through') || true
    if [ "$out" = "through" ]; then ok "$how: control: stdout passes through"; else bad "$how: stdout did not pass through"; fi

    # F. the runner's file-command files: a planted write fails with a read-only filesystem, not with a missing file (WR-02).
    before=$(cat "$plant"/env "$plant"/path "$plant"/out "$plant"/summary "$plant"/state | wc -c)
    errs=$(FIXER_PROBE_DIR="$plant" probe bash -c 'for f in env path out summary state; do (echo "x=y" >> "$FIXER_PROBE_DIR/$f") 2>&1 || true; done') || true
    after=$(cat "$plant"/env "$plant"/path "$plant"/out "$plant"/summary "$plant"/state | wc -c)
    if [ "$(printf '%s\n' "$errs" | grep -c 'Read-only file system')" = 5 ] && [ "$before" = "$after" ]; then
      ok "$how: a write to a file-command path (the GITHUB_ENV, GITHUB_PATH, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY and GITHUB_STATE shapes) fails: read-only file system"
    else bad "$how: a planted write to a file-command path did not fail read-only (errors: $(printf '%s' "$errs" | tr '\n' '|'); bytes $before -> $after)"; fi
    # F2. the wrapper binds the runner's own paths when the variables name them.
    errs=$(GITHUB_ENV="$plant/env" GITHUB_PATH="$plant/path" GITHUB_STATE="$plant/state" FIXER_PROBE_DIR="$plant" probe bash -c 'for f in env path state; do (echo "x=y" >> "$FIXER_PROBE_DIR/$f") 2>&1 || true; done') || true
    if [ "$(printf '%s\n' "$errs" | grep -c 'Read-only file system')" = 3 ]; then ok "$how: with GITHUB_ENV, GITHUB_PATH and GITHUB_STATE naming the planted files, the writes still fail read-only"; else bad "$how: a write to a named file-command path did not fail read-only ($(printf '%s' "$errs" | tr '\n' '|'))"; fi

    # G. the script overlay is the trusted bytes and is read-only; the rest of the tree directory is writable (WR-05).
    errs=$(probe bash -c 'cmp "$FIXER_SCRATCH/tree/scripts/fixer-isolate.sh" '"'$HERE/fixer-isolate.sh'"' && echo SAME; (echo x >> "$FIXER_SCRATCH/tree/scripts/fixer-isolate.sh") 2>&1 || true; (: > "$FIXER_SCRATCH/tree/inventory/planted") 2>&1 || true; : > "$FIXER_SCRATCH/tree/ok" && echo WROTE') || true
    if [ "$(printf '%s\n' "$errs" | grep -c 'SAME')" = 1 ] && [ "$(printf '%s\n' "$errs" | grep -c 'Read-only file system')" = 2 ] && [ "$(printf '%s\n' "$errs" | grep -c 'WROTE')" = 1 ]; then
      ok "$how: the overlay shows the trusted bytes, a write to it (an existing file or a new one) fails read-only, and the worktree directory beside it is writable"
    else bad "$how: the overlay probe said: $(printf '%s' "$errs" | tr '\n' '|')"; fi

    # H. nothing outside the scratch directory is writable: the checkout and /etc; the scratch TMPDIR, HOME and /tmp are.
    errs=$(probe bash -c '(: > '"'$ROOT/.fixer-isolate-probe'"') 2>&1 || true; (: > /etc/.fixer-isolate-probe) 2>&1 || true; : > "$TMPDIR/ok" && : > "$HOME/ok" && : > /tmp/ok && echo WROTE') || true
    if [ "$(printf '%s\n' "$errs" | grep -c 'Read-only file system')" = 2 ] && [ "$(printf '%s\n' "$errs" | grep -c 'WROTE')" = 1 ] && [ ! -e "$ROOT/.fixer-isolate-probe" ]; then
      ok "$how: a write outside the scratch directory (the checkout, /etc) fails read-only; TMPDIR, HOME and /tmp are writable"
    else bad "$how: the confinement probe said: $(printf '%s' "$errs" | tr '\n' '|')"; fi

    # I. a unix socket outside: connecting to the planted group-readable socket fails (WR-03).
    out=$(probe node -e "$conn" "$plant/x.sock") || true
    if [ "$out" != "REACHED" ] && [ -n "$out" ]; then ok "$how: a connect to a planted unix socket outside fails (${out})"; else bad "$how: the command reached a unix socket outside the isolation (got '${out:-nothing}')"; fi
    # I2. supplementary groups.
    out=$(probe bash -c "awk '/^Groups:/ {print NF - 1}' /proc/self/status") || true
    if [ "$how" = sudo ]; then
      if [ "$out" = 0 ]; then ok "sudo: the supplementary groups are cleared"; else bad "sudo: the command keeps ${out:-unknown} supplementary group(s)"; fi
    else
      ok "userns: supplementary groups cannot be cleared in an unprivileged user namespace (${out} kept); the socket mask above is what is proven"
    fi
    # I3. PATH survives the form (the sudo form passes it explicitly).
    out=$(probe bash -c 'printf %s "$PATH"') || true
    if [ "$out" = "$PATH" ]; then ok "$how: PATH reaches the command unchanged"; else bad "$how: PATH changed inside the isolation"; fi
  done

  if [ -n "$untested" ]; then echo "  UNTESTED  $untested"; fi
  if [ "$exit" -eq 0 ]; then
    echo "$NAME: --self-test PASS -- strategy ${forms[*]}: no network, no new privileges, no capability, a scrubbed environment, no surviving process, no write outside the scratch directory (file-command files and the script overlay included) and no filesystem unix socket${untested:+; $untested}"
  else
    echo "$NAME: --self-test FAIL -- see the lines above" >&2
  fi
  return "$exit"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  --print-overlay) printf '%s\n' "${OVERLAY[@]}" ;;
  --)
    shift
    [ "$#" -gt 0 ] || fail "no command after --" "pass the command to isolate after --."
    run_isolated "$@"
    exit $?
    ;;
  *) fail "unknown argument '${1:-}'" "run with -- <command>, --self-test or --print-overlay." ;;
esac
