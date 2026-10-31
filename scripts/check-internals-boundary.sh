#!/usr/bin/env bash
# scripts/check-internals-boundary.sh
#
# D-96/D-97: SHELL-02's boundary as an executable guard, not prose. Fails if
# any file under the scanned directory imports a Firefox internal outside
# `PowerBrowserAPI.sys.mjs` -- D-96 defines "Firefox internal" maximally:
# `Services.*`, `Cc`/`Ci`/`Cr`/`Cu`/XPCOM constructors, `AppConstants`, and
# `ChromeUtils.import`/`ChromeUtils.defineESModuleGetters` of anything
# outside `chrome://powerbrowser/`. Structured exactly like
# scripts/check-patch-surface.sh (D-97's named idiom): a scan function, a
# `--self-test` planting a violating fixture in `mktemp -d`, and a default
# path scanning the real tree.
#
# Default scan target is `powerbrowser/shell/` -- the directory the phase's own
# artifact manifest (04-01-PLAN.md, 04-PATTERNS.md) names as the only home
# for boundary-relevant chrome code (`powerbrowser.xhtml`, `PowerBrowserAPI.sys.mjs`,
# `TheiaService.sys.mjs`). NOT the whole `powerbrowser/` tree: prior phases
# already ship `powerbrowser/branding/*/pref/firefox-branding.js` (pref-list
# data, matched by the `*.js` glob but containing no forbidden pattern) --
# scanning the whole tree would make this check start non-vacuous and green
# before any shell code exists, defeating Wave 0's red-by-design requirement
# (04-01-PLAN.md must_haves: "every phase-behaviour check reads FAIL" at the
# end of Wave 0). Scoping to the directory this phase actually populates
# keeps both the non-vacuity assertion and the red-by-design signal honest.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_SCAN_DIR="$REPO_ROOT/powerbrowser/shell"
CATALOGUE_PATH="$REPO_ROOT/powerbrowser/INTERNAL-APIS.md"
ACTOR_CHILD_TARGET="$REPO_ROOT/powerbrowser/shell/GroupActorChild.sys.mjs"

# The one file exempt from every forbidden pattern below (D-96/D-97).
BOUNDARY_FILE_BASENAME="PowerBrowserAPI.sys.mjs"

# Forbidden pattern set, D-96 verbatim. ChromeUtils.import and
# ChromeUtils.defineESModuleGetters are conditional (see
# is_conditional_pattern below); every other entry -- including the second
# ChromeUtils.* entry -- is an unconditional offense wherever it appears on
# a non-comment line.
FORBIDDEN_PATTERNS=(
  'Services.'
  'Cc['
  'Cc.'
  'Ci.'
  'Cr.'
  'Cu.'
  'Components.classes'
  'Components.interfaces'
  'AppConstants'
  'ChromeUtils.import'
  'ChromeUtils.defineESModuleGetters'
  # Actor registration is not Services/Cc/Ci-shaped and so slipped the list
  # above (WINDOWS 13): adopting any JSWindowActor pair (candidate B, NOT
  # adopted in 01-05 -- see scripts/verify-gui01-window.mjs) obliges this
  # entry in the same commit. Unconditional -- registering an actor crosses
  # the privilege boundary no matter which chrome URL it names, so no
  # chrome://powerbrowser/ exemption applies here.
  'ChromeUtils.registerWindowActor'
  # Privileged chrome API that is not Services/Cc/Ci-shaped and so slipped the
  # list above: powerbrowser.js reached for both directly, with a comment saying
  # it did so to avoid PowerBrowserAPI -- a real internals touch living outside
  # the one boundary file and absent from the catalogue, while this guard
  # reported PASS. That is exactly the hole SHELL-02 exists to close, so the
  # names are enumerated here rather than left to the Services. prefix.
  'nodePrincipal'
  'fixupAndLoadURIString'
  # NG-039 (2026-09-25 audit): Firefox internals that are neither
  # Services/Cc/Ci-shaped nor imports, and were therefore uncatalogued -- the
  # Xray waiver, the privileged <browser> snapshot, the chrome-only IO and
  # session-store namespaces, the QueryInterface helper, and the actor base
  # classes. Unconditional, like registerWindowActor above.
  # IOUtils and gBrowser match as bare identifiers, so `?.`, destructuring and
  # a member access split onto the next line cannot slip past them.
  'wrappedJSObject'
  'drawSnapshot'
  'IOUtils'
  'SessionStoreUtils'
  'ChromeUtils.generateQI'
  'JSWindowActorParent'
  'JSWindowActorChild'
  'gBrowser'
  # Phase 27 gBrowser stand-in policy: the browser.xhtml globals later v1.5 phases shim; a shim defined outside PowerBrowserAPI.sys.mjs would be a second boundary.
  'PopupNotifications' 'nsContextMenu' 'browserDOMWindow' 'openLinkIn' 'FullScreen' 'XULBrowserWindow'
  # Phase 31.1 tab-host shim under the Phase 27 policy: defined only in PowerBrowserAPI.sys.mjs (the host install), compared by verify-shell-gbrowser-standin.mjs.
  'gBrowserInit'
  # Phase 32 zoom shims under the Phase 27 policy (plan 32-09): defined only in PowerBrowserAPI.sys.mjs (the host install), compared member by member by verify-shell-gbrowser-standin.mjs. A separate line, so 35-01's derivation from the Phase 27 line is unchanged.
  'ZoomManager' 'FullZoom' 'ZoomUI'
)

is_conditional_pattern() {
  case "$1" in
    'ChromeUtils.import'|'ChromeUtils.defineESModuleGetters') return 0 ;;
    *) return 1 ;;
  esac
}

# NG-039: the actor child is the one other file Gecko loads on the boundary's
# behalf (registerGroupActor names it as the child module), and it cannot
# import PowerBrowserAPI.sys.mjs (it runs in the content process with zero
# module imports by design). It may carry exactly these patterns, and every
# occurrence must have its own INTERNAL-APIS.md row; any other forbidden
# pattern in it is an offense as anywhere else.
ACTOR_CHILD_BASENAME="GroupActorChild.sys.mjs"
ACTOR_CHILD_PATTERNS=('wrappedJSObject' 'JSWindowActorChild')

is_actor_child_pattern() {
  local pattern
  for pattern in "${ACTOR_CHILD_PATTERNS[@]}"; do
    [ "$pattern" = "$1" ] && return 0
  done
  return 1
}

# True when <catalogue> has a table row whose File:Line cell is exactly
# <basename>:<line>. Prose such as "Same row as `file:line` above" does not
# count: after a --fix renumbering it can name a new, uncatalogued line.
catalogue_has_row() {
  grep -Eq "^\|[^|]*\| \`${2//./\\.}:${3}\` \|" "$1"
}

# The shell's gBrowser stand-in (powerbrowser.js) is a plain object that
# WebDriver and upstream actors read; defining it reads no Firefox internal.
# Its one definition line, in that file only, is exempt. Every other gBrowser
# line outside the boundary file is an offense.
SHELL_SCRIPT_TARGET="$REPO_ROOT/powerbrowser/shell/powerbrowser.js"

is_gbrowser_standin_definition() {
  local file="$1" pattern="$2" line="$3"
  [ "$pattern" = 'gBrowser' ] && [ "$file" -ef "$SHELL_SCRIPT_TARGET" ] \
    && [ "${line#"${line%%[![:space:]]*}"}" = 'window.gBrowser = {' ]
}

# True when the line's first non-whitespace characters are a JS line
# comment (`//`) or a block-comment continuation marker (`*`) -- so a
# header comment explaining this very rule (or a JSDoc continuation line)
# cannot flag itself.
is_comment_line() {
  local line="$1"
  local trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    //*|'*'*) return 0 ;;
    *) return 1 ;;
  esac
}

# Scans <dir> for forbidden-pattern offenses. Prints one "path:line:
# pattern" row per offense to stderr. Returns 0 with zero offenses, 1
# otherwise -- including the non-vacuity case (empty scan set), reported
# with its own distinct message so a caller can tell "clean" from "nothing
# was scanned" (SHELL-02's empty edge, per 04-01-PLAN.md must_haves).
scan_internals_boundary() {
  local dir="$1"
  local count=0
  local -a files=()

  if [ -d "$dir" ]; then
    while IFS= read -r -d '' f; do
      files+=("$f")
    done < <(find "$dir" -type f \( -name '*.sys.mjs' -o -name '*.mjs' -o -name '*.js' -o -name '*.xhtml' \) -print0)
  fi

  local -a scanned=()
  local f base
  for f in "${files[@]}"; do
    base="$(basename -- "$f")"
    [ "$base" = "$BOUNDARY_FILE_BASENAME" ] && continue
    scanned+=("$f")
  done

  if [ "${#scanned[@]}" -eq 0 ]; then
    echo "check-internals-boundary: FAIL -- scanned file set under $dir is empty (excluding $BOUNDARY_FILE_BASENAME) -- an empty file set is not a clean boundary" >&2
    return 1
  fi

  local line_no line pattern offense
  for f in "${scanned[@]}"; do
    line_no=0
    while IFS= read -r line || [ -n "$line" ]; do
      line_no=$((line_no + 1))
      is_comment_line "$line" && continue
      for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
        case "$line" in
          *"$pattern"*)
            offense=1
            if is_conditional_pattern "$pattern"; then
              case "$line" in
                *'chrome://powerbrowser/'*) offense=0 ;;
              esac
            fi
            if [ "$offense" -eq 1 ] && [ "$f" -ef "$ACTOR_CHILD_TARGET" ] \
              && is_actor_child_pattern "$pattern" \
              && catalogue_has_row "$CATALOGUE_PATH" "$ACTOR_CHILD_BASENAME" "$line_no"; then
              offense=0
            fi
            if [ "$offense" -eq 1 ] && is_gbrowser_standin_definition "$f" "$pattern" "$line"; then
              offense=0
            fi
            if [ "$offense" -eq 1 ]; then
              count=$((count + 1))
              echo "  $f:$line_no: $pattern" >&2
            fi
            ;;
        esac
      done
    done < "$f"
  done

  if [ "$count" -ne 0 ]; then
    echo "check-internals-boundary: FAIL -- $count forbidden-pattern offense(s) found under $dir" >&2
    return 1
  fi

  return 0
}

# --- Catalogue consistency (04-05, SHELL-02's second half) -----------------
#
# SHELL-02 has two halves: nothing outside PowerBrowserAPI.sys.mjs imports a
# Firefox internal (the scan above), and every internal that file DOES
# import is catalogued in powerbrowser/INTERNAL-APIS.md. This mode scans
# PowerBrowserAPI.sys.mjs itself -- normally excluded above by
# BOUNDARY_FILE_BASENAME -- with the exact same FORBIDDEN_PATTERNS/
# is_conditional_pattern/is_comment_line logic, so the rule is written once
# and the catalogue is derived from the code rather than maintained beside
# it.
CATALOGUE_TARGET="$REPO_ROOT/powerbrowser/shell/PowerBrowserAPI.sys.mjs"

# Prints one distinct line number per output line for every forbidden-
# pattern occurrence in <file>. Two offending patterns on the same line
# (e.g. Cc[...]/Ci. on one nsITimer construction) collapse to one line
# number -- one catalogue row covers both, matching the doc's own
# "one row = one touchpoint" grain.
catalogue_occurrence_lines() {
  local file="$1"
  local only_actor_child="${2:-}"
  local line_no line pattern offense
  local -A seen=()
  line_no=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    is_comment_line "$line" && continue
    for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
      if [ -n "$only_actor_child" ] && ! is_actor_child_pattern "$pattern"; then
        continue
      fi
      case "$line" in
        *"$pattern"*)
          offense=1
          if is_conditional_pattern "$pattern"; then
            case "$line" in
              *'chrome://powerbrowser/'*) offense=0 ;;
            esac
          fi
          if [ "$offense" -eq 1 ] && [ -z "${seen[$line_no]:-}" ]; then
            seen[$line_no]=1
            echo "$line_no"
          fi
          ;;
      esac
    done
  done < "$file"
}

# Fails when any occurrence line in <target> has no matching
# "<basename>:<line>" row in <catalogue>, naming the uncatalogued
# file:line. <catalogue>/<target> are parameters, not the module-level
# defaults, so --self-test can point this at scratch copies without ever
# touching the real files.
check_catalogue_consistency() {
  local catalogue="$1"
  local target="$2"
  local only_actor_child="${3:-}"
  local base
  base="$(basename -- "$target")"

  if [ ! -f "$catalogue" ]; then
    echo "internals-catalogue: FAIL -- $catalogue does not exist" >&2
    return 1
  fi
  if [ ! -f "$target" ]; then
    echo "internals-catalogue: FAIL -- $target does not exist" >&2
    return 1
  fi

  local -a missing=()
  local line_no
  while IFS= read -r line_no; do
    if ! catalogue_has_row "$catalogue" "$base" "$line_no"; then
      missing+=("$base:$line_no")
    fi
  done < <(catalogue_occurrence_lines "$target" "$only_actor_child")

  if [ "${#missing[@]}" -ne 0 ]; then
    echo "internals-catalogue: FAIL -- ${#missing[@]} occurrence(s) with no catalogue row: ${missing[*]}" >&2
    return 1
  fi

  echo "internals-catalogue: PASS -- every forbidden-pattern occurrence in $target has a catalogue row in $catalogue"
  return 0
}

# --self-test: plants one fixture module carrying exactly one unconditional
# forbidden pattern in a mktemp -d directory (never a real repo file), and
# asserts scan_internals_boundary rejects it AND names the planted path.
# D-68 idiom: a negative assertion without a demonstrated-red control proves
# nothing. Also plants a mutated scratch copy of the real catalogue with one
# row removed and asserts check_catalogue_consistency rejects it and names
# the missing row -- never mutates the real powerbrowser/INTERNAL-APIS.md.
run_self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN

  local overall=0

  cat > "$tmp/planted-violation.sys.mjs" <<'EOF'
// planted-violation.sys.mjs -- check-internals-boundary.sh --self-test
// fixture. One unconditional forbidden pattern below, deliberately.
export function badFunction() {
  return Services.prefs.getBoolPref("some.pref", false);
}
EOF

  if scan_internals_boundary "$tmp" >/dev/null 2>"$tmp/self-test.err"; then
    echo "check-internals-boundary: --self-test FAIL -- planted violation was NOT rejected" >&2
    cat "$tmp/self-test.err" >&2
    overall=1
  elif grep -q 'planted-violation.sys.mjs' "$tmp/self-test.err"; then
    echo "check-internals-boundary: --self-test PASS -- planted violation (planted-violation.sys.mjs, Services.) was correctly rejected"
  else
    echo "check-internals-boundary: --self-test FAIL -- rejected, but message doesn't name the planted path" >&2
    cat "$tmp/self-test.err" >&2
    overall=1
  fi

  # WINDOWS 13 plant: a ChromeUtils.registerWindowActor call outside the
  # boundary file. The fixture names a chrome://powerbrowser/ module on
  # purpose -- registration is unconditional, so a chrome-scheme URL must
  # NOT exempt it. Rejection must name both the file and the pattern.
  cat > "$tmp/planted-actor-violation.sys.mjs" <<'EOF'
// planted-actor-violation.sys.mjs -- check-internals-boundary.sh --self-test
// fixture. One unconditional forbidden pattern below, deliberately.
ChromeUtils.registerWindowActor("PowerBrowserSelfTestActor", {
  parent: { esModuleURI: "chrome://powerbrowser/content/SelfTestActor.sys.mjs" },
  child: { esModuleURI: "chrome://powerbrowser/content/SelfTestActorChild.sys.mjs" },
});
EOF

  if scan_internals_boundary "$tmp" >/dev/null 2>"$tmp/self-test-actor.err"; then
    echo "check-internals-boundary: --self-test FAIL -- planted actor registration was NOT rejected" >&2
    cat "$tmp/self-test-actor.err" >&2
    overall=1
  elif grep -q 'planted-actor-violation.sys.mjs' "$tmp/self-test-actor.err" \
    && grep -q 'ChromeUtils.registerWindowActor' "$tmp/self-test-actor.err"; then
    echo "check-internals-boundary: --self-test PASS -- planted actor registration (planted-actor-violation.sys.mjs, ChromeUtils.registerWindowActor) was correctly rejected"
  else
    echo "check-internals-boundary: --self-test FAIL -- actor rejection doesn't name the planted path and pattern" >&2
    cat "$tmp/self-test-actor.err" >&2
    overall=1
  fi

  # NG-039 plants: each new pattern is rejected outside the boundary file, and
  # an actor-child waiver with no catalogue row is rejected even in the one
  # file that may carry it.
  # The IOUtils plant uses destructuring and the gBrowser plant is the shell
  # stand-in's definition line outside powerbrowser.js: neither may pass.
  local plant_name plant_body
  # The Phase 27 shim globals are each planted as a one-line shim assignment.
  for plant_name in wrappedJSObject drawSnapshot IOUtils gBrowser \
      PopupNotifications nsContextMenu browserDOMWindow openLinkIn FullScreen XULBrowserWindow gBrowserInit ZoomManager FullZoom ZoomUI; do
    case "$plant_name" in
      wrappedJSObject) plant_body='  return win.wrappedJSObject.JSON.parse(text);' ;;
      drawSnapshot) plant_body='  return browser.drawSnapshot(0, 0, 1, 1, 1, "white");' ;;
      IOUtils) plant_body='  const { remove } = IOUtils; return remove(text);' ;;
      gBrowser) plant_body='  window.gBrowser = {' ;;
      *) plant_body="  window.$plant_name = {};" ;;
    esac
    printf '// planted %s fixture\nexport function planted(win, browser, text) {\n%s\n}\n' "$plant_name" "$plant_body" > "$tmp/planted-$plant_name.sys.mjs"
    if scan_internals_boundary "$tmp" >/dev/null 2>"$tmp/self-test-$plant_name.err"; then
      echo "check-internals-boundary: --self-test FAIL -- planted $plant_name was NOT rejected" >&2
      overall=1
    elif grep -q "planted-$plant_name.sys.mjs:[0-9]*: $plant_name" "$tmp/self-test-$plant_name.err"; then
      echo "check-internals-boundary: --self-test PASS -- planted $plant_name was correctly rejected"
    else
      echo "check-internals-boundary: --self-test FAIL -- $plant_name rejection doesn't name the planted file and pattern" >&2
      overall=1
    fi
    rm -f "$tmp/planted-$plant_name.sys.mjs"
  done
  # The waiver is keyed on the real actor-child path, so this plant stands in
  # for it (ACTOR_CHILD_TARGET, for this one call only); its line 2 has no row.
  mkdir -p "$tmp/child"
  printf '// planted uncatalogued actor-child waiver\nexport const x = globalThis.wrappedJSObject;\n' > "$tmp/child/$ACTOR_CHILD_BASENAME"
  if ACTOR_CHILD_TARGET="$tmp/child/$ACTOR_CHILD_BASENAME" scan_internals_boundary "$tmp/child" >/dev/null 2>"$tmp/self-test-child.err"; then
    echo "check-internals-boundary: --self-test FAIL -- an actor-child waiver with no catalogue row was NOT rejected" >&2
    overall=1
  elif grep -q "$ACTOR_CHILD_BASENAME:2: wrappedJSObject" "$tmp/self-test-child.err"; then
    echo "check-internals-boundary: --self-test PASS -- an uncatalogued actor-child waiver was correctly rejected"
  else
    echo "check-internals-boundary: --self-test FAIL -- the actor-child rejection doesn't name $ACTOR_CHILD_BASENAME:2: wrappedJSObject" >&2
    cat "$tmp/self-test-child.err" >&2
    overall=1
  fi
  # A byte-identical copy of the real actor child anywhere else gets no
  # waiver, although every one of its lines has a row.
  mkdir -p "$tmp/elsewhere"
  cp "$ACTOR_CHILD_TARGET" "$tmp/elsewhere/"
  if scan_internals_boundary "$tmp/elsewhere" >/dev/null 2>"$tmp/self-test-elsewhere.err"; then
    echo "check-internals-boundary: --self-test FAIL -- a copy of $ACTOR_CHILD_BASENAME outside powerbrowser/shell was waived" >&2
    overall=1
  elif grep -q "elsewhere/$ACTOR_CHILD_BASENAME:[0-9]*: \(wrappedJSObject\|JSWindowActorChild\)" "$tmp/self-test-elsewhere.err"; then
    echo "check-internals-boundary: --self-test PASS -- a copy of $ACTOR_CHILD_BASENAME outside powerbrowser/shell was correctly rejected"
  else
    echo "check-internals-boundary: --self-test FAIL -- the copied actor child's rejection doesn't name its waived patterns" >&2
    cat "$tmp/self-test-elsewhere.err" >&2
    overall=1
  fi

  local mutated="$tmp/INTERNAL-APIS-mutated.md"
  if [ ! -f "$CATALOGUE_PATH" ]; then
    echo "check-internals-boundary: --self-test FAIL -- $CATALOGUE_PATH does not exist, cannot run the catalogue self-test" >&2
    overall=1
  else
    # Derive the line to remove from the code, never a hardcoded number: a
    # pinned line silently stops testing anything the moment an edit above it
    # shifts the file, and the mutation degrades into a no-op that always
    # "passes". Take the first real occurrence the guard itself reports.
    local victim_line victim
    # Collect fully, then take the first line: piping into `head -1` closes the
    # pipe early and kills the producing function with SIGPIPE (exit 141).
    victim_line="$(catalogue_occurrence_lines "$CATALOGUE_TARGET")"
    victim_line="${victim_line%%$'\n'*}"
    if [ -z "$victim_line" ]; then
      echo "check-internals-boundary: --self-test FAIL -- no forbidden-pattern occurrence found in $CATALOGUE_TARGET to mutate" >&2
      return 1
    fi
    victim="$(basename -- "$CATALOGUE_TARGET"):$victim_line"

    # Remove exactly the victim's row (a bare `grep -v :15` also dropped the
    # :150/:1544/... rows, so the rejection never hinged on the victim alone).
    grep -vF "| \`$victim\` |" "$CATALOGUE_PATH" > "$mutated"
    # The mutation must actually remove something, or the test proves nothing.
    if cmp -s "$CATALOGUE_PATH" "$mutated"; then
      echo "check-internals-boundary: --self-test FAIL -- mutation removed no row for $victim; the catalogue self-test would be vacuous" >&2
      return 1
    fi
    # T2-R1 plant: the same removal, with the removed file:line still cited in
    # prose the way "Same ... as `file:line` above" notes are. Only a table
    # row's File:Line cell counts, so this copy must be rejected too.
    local prose="$tmp/INTERNAL-APIS-prose-only.md"
    cp "$mutated" "$prose"
    printf '\nSame touchpoint as `%s` above.\n' "$victim" >> "$prose"
    local out copy what
    for copy in "$mutated" "$prose"; do
      what="removed row for $victim"
      [ "$copy" = "$prose" ] && what="$what, cited in prose only"
      if out="$(check_catalogue_consistency "$copy" "$CATALOGUE_TARGET" 2>&1)"; then
        echo "check-internals-boundary: --self-test FAIL -- catalogue mutation ($what) was NOT rejected" >&2
        echo "$out" >&2
        overall=1
      elif echo "$out" | grep -Eq "${victim//./\\.}([^0-9]|\$)"; then
        echo "check-internals-boundary: --self-test PASS -- catalogue mutation ($what) was correctly rejected"
      else
        echo "check-internals-boundary: --self-test FAIL -- catalogue mutation ($what) rejected, but message doesn't name the removed row" >&2
        echo "$out" >&2
        overall=1
      fi
    done
  fi

  return "$overall"
}

# --scan <dir>: the same boundary scan over any directory. NG-039's check
# plants fixtures in a scratch directory and needs the guard's own verdict
# on them; the default path below stays powerbrowser/shell.
if [ "${1:-}" = "--scan" ]; then
  if [ -z "${2:-}" ]; then
    echo "check-internals-boundary: FAIL -- --scan requires a directory" >&2
    exit 1
  fi
  scan_internals_boundary "$2"
  exit $?
fi

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

if [ "${1:-}" = "--catalogue" ]; then
  rc=0
  check_catalogue_consistency "$CATALOGUE_PATH" "$CATALOGUE_TARGET" || rc=1
  check_catalogue_consistency "$CATALOGUE_PATH" "$ACTOR_CHILD_TARGET" actor-child || rc=1
  exit "$rc"
fi

scan_internals_boundary "$DEFAULT_SCAN_DIR"
echo "check-internals-boundary: PASS -- no forbidden Firefox-internal patterns found under $DEFAULT_SCAN_DIR"
