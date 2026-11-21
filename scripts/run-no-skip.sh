#!/usr/bin/env bash
# scripts/run-no-skip.sh -- run one check where a check that did not run is a failure (a release, signing or
# publishing step, the release train's pin gates). SKIP-PROTOCOL.md: a converted check exits 77 after printing
# "<name>: SKIP -- <reason>", and an unconverted one prints that line and exits 0. A workflow step under
# set -e would read the first as a bare failure and the second as a pass; this wrapper decides deliberately.
#
#   bash scripts/run-no-skip.sh [--allow-skip <ERE>] -- <command> [args...]
#   bash scripts/run-no-skip.sh --self-test
#
# The command's stdout and stderr pass through unchanged (each stream whole, stdout first). Then:
#   exit 0 and no SKIP line                  -> 0
#   exit 77, or exit 0 with a SKIP line      -> 1, naming the command and the SKIP line; or 0 with a NOTE when
#                                               --allow-skip is given and the SKIP line matches its ERE (the step
#                                               names the documented normal case it allows in a comment)
#   any other exit status                    -> that status
# The SKIP line is selected as the driver selects it: the last line of stderr of the form
# ^[[:space:]]*[A-Za-z0-9][A-Za-z0-9 ._/-]*: SKIP( -- .*)?$, else the last such line of stdout. A partial run (some
# clauses skipped, the rest green) is a skip too: in these paths every clause must run.
set -euo pipefail

SKIP_RE='^[[:space:]]*[A-Za-z0-9][A-Za-z0-9 ._/-]*: SKIP( -- .*)?$'

skip_of() { # skip_of <stdout file> <stderr file>
  local l
  l="$(grep -E "$SKIP_RE" "$2" | tail -n 1 || true)"
  [ -n "$l" ] || l="$(grep -E "$SKIP_RE" "$1" | tail -n 1 || true)"
  printf '%s' "$l"
}

run() {
  local allow="" out err rc line
  if [ "${1:-}" = --allow-skip ]; then
    [ $# -ge 2 ] && [ -n "$2" ] || { echo "run-no-skip: FAIL -- --allow-skip needs an ERE" >&2; return 2; }
    allow="$2"; shift 2
  fi
  [ "${1:-}" = -- ] || { echo "run-no-skip: FAIL -- usage: run-no-skip.sh [--allow-skip <ERE>] -- <command> [args...]" >&2; return 2; }
  shift
  [ $# -gt 0 ] || { echo "run-no-skip: FAIL -- no command given" >&2; return 2; }
  out="$(mktemp)"; err="$(mktemp)"
  rc=0
  "$@" >"$out" 2>"$err" || rc=$?
  cat "$out"; cat "$err" >&2
  line="$(skip_of "$out" "$err")"
  rm -f "$out" "$err"
  if [ "$rc" -eq 77 ] || { [ "$rc" -eq 0 ] && [ -n "$line" ]; }; then
    if [ -n "$allow" ] && [ -n "$line" ] && printf '%s\n' "$line" | grep -qE -- "$allow"; then
      echo "run-no-skip: NOTE -- $1 skipped in the documented normal case this step allows: $line"
      return 0
    fi
    echo "::error::run-no-skip: $* did not run every clause (${line:-exit $rc with no SKIP line}). A check that did not run is a failure here; supply what its SKIP line names and re-run." >&2
    return 1
  fi
  return "$rc"
}

self_test() {
  local t misses=0 n=0 got
  t="$(mktemp -d)"
  trap 'rm -rf "$t"' RETURN
  printf '%s\n' 'echo "fixture: PASS -- all ran"' > "$t/pass.sh"
  printf '%s\n' 'echo "fixture: FAIL -- a clause failed" >&2; exit 1' > "$t/fail.sh"
  printf '%s\n' 'echo "fixture: SKIP -- no input"; exit 77' > "$t/skip77.sh"
  printf '%s\n' 'echo "fixture: PASS -- part ran"; echo "fixture: SKIP -- part did not"' > "$t/skip0.sh"
  printf '%s\n' 'exit 77' > "$t/bare77.sh"
  printf '%s\n' 'echo "fixture: SKIP -- zero published Releases"; exit 77' > "$t/allowed.sh"
  printf '%s\n' 'echo "  ok  a named SKIP case -> red"; echo "fixture: PASS"' > "$t/selftestline.sh"
  case_() { # case_ <name> <want exit> <args...>
    local name="$1" want="$2" rc=0; shift 2
    run "$@" >"$t/o" 2>"$t/e" || rc=$?
    n=$((n + 1))
    if [ "$rc" -eq "$want" ]; then echo "  ok $name -> exit $rc"; else echo "  MISS $name: exit $rc, want $want ($(tail -n 1 "$t/e"))" >&2; misses=$((misses + 1)); fi
  }
  case_ "a passing check" 0 -- bash "$t/pass.sh"
  case_ "a failing check keeps its status" 1 -- bash "$t/fail.sh"
  case_ "exit 77 with its SKIP line is red" 1 -- bash "$t/skip77.sh"
  case_ "exit 0 with a SKIP line (unconverted, partial) is red" 1 -- bash "$t/skip0.sh"
  case_ "exit 77 with no SKIP line is red" 1 -- bash "$t/bare77.sh"
  case_ "an allowed SKIP that matches is green" 0 --allow-skip 'zero published Releases' -- bash "$t/allowed.sh"
  case_ "an allowed SKIP that does not match is red" 1 --allow-skip 'zero published Releases' -- bash "$t/skip77.sh"
  case_ "a line that only mentions SKIP is not a SKIP" 0 -- bash "$t/selftestline.sh"
  run -- bash "$t/pass.sh" > "$t/o" 2>/dev/null
  got="$(cat "$t/o")"
  if [ "$got" = "fixture: PASS -- all ran" ]; then echo "  ok stdout passes through unchanged"; else echo "  MISS stdout: '$got'" >&2; misses=$((misses + 1)); fi
  if [ "$misses" -eq 0 ]; then echo "run-no-skip self-test: PASS -- $n cases, and stdout passes through"; return 0; fi
  echo "run-no-skip self-test: FAIL -- $misses case(s) missed" >&2
  return 1
}

if [ "${1:-}" = --self-test ]; then self_test; exit $?; fi
run "$@"
