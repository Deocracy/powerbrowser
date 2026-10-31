#!/usr/bin/env bash
# scripts/fixer-prepare.sh (Phase 52, FIX-02, FIX-03 and the CR-01 trust boundary).
#
# Trust boundary. After Claude runs, everything under work/ is attacker-controlled, including
# work/.git (config, hooks, attributes, index). So this script:
#   - copies work/.git into <state>/base.git BEFORE the model runs, and every later git call uses
#     only that copy, through GIT_DIR, a throwaway index and a copied tree;
#   - runs git with no system or global config, no fsmonitor, no hooks, no attributes file, and
#     with --no-ext-diff and --no-textconv on every diff;
#   - never runs git inside work/, and never executes a file from work/;
#   - refuses (fail closed, before any git call) a work/.git that differs from the pristine copy,
#     and a diff that touches .gitattributes.
#
# Modes (run from the trusted root checkout):
#   --tag=<gecko-tag> --state=<dir>            prep, before Claude. Fetches upstream/ at the tag, takes the
#                                              pristine copy of work/.git, reports conflict markers and the
#                                              baseline regenerate-patches --check.
#   --emit-diff --state=<dir> --out=<file>     emit, after Claude. Writes the diff the gate will read.
#   --self-test                                plants a changed .git/config, hook and .gitattributes in a
#                                              fixture and proves emit refuses each one without running it.
#
# The only patch path is scripts/regenerate-patches.sh, with explicit --upstream and --patches.
# No secret, no App token and no key material is read here.
set -euo pipefail

NAME="fixer-prepare"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "$NAME: FAIL -- $1" >&2
  echo "  Next step: $2" >&2
  exit 1
}

# git on the pristine copy only. $1 state dir, $2 index file, $3 work tree, rest git args.
clean_git() {
  local state=$1 index=$2 tree=$3
  shift 3
  (
    cd "$tree"
    env -i PATH="$PATH" HOME="${TMPDIR:-/tmp}" \
      GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
      GIT_DIR="$state/base.git" GIT_INDEX_FILE="$index" GIT_WORK_TREE="$tree" \
      git -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null \
        -c core.untrackedCache=false -c core.pager=cat "$@"
  )
}

MODE=""
TAG=""
STATE=""
OUT=""
WORK="$REPO_ROOT/work"
for arg in "$@"; do
  case "$arg" in
    --tag=*) MODE=prep; TAG="${arg#--tag=}" ;;
    --emit-diff) MODE=emit ;;
    --self-test) MODE=self-test ;;
    --state=*) STATE="${arg#--state=}" ;;
    --out=*) OUT="${arg#--out=}" ;;
    --work=*) WORK="${arg#--work=}" ;;
    *) echo "$NAME: FAIL -- unknown argument '$arg'" >&2; echo "  Next step: run with --tag=<gecko-tag> --state=<dir>, --emit-diff --state=<dir> --out=<file>, or --self-test." >&2; exit 2 ;;
  esac
done

prep() {
  # Gecko tags are checked by shape, so a free-text value never reaches the fetch.
  local tag_re='^[A-Za-z]+_[0-9]+_[0-9]+(_[0-9]+)?esr_(RELEASE|BUILD[0-9]+)$'
  [[ "$TAG" =~ $tag_re ]] || fail "--tag '$TAG' is not an ESR tag" "pass the Gecko ESR tag the target replays onto."
  [ -d "$WORK/.git" ] || fail "work/ has no .git directory" "check the target out into work/ before prep runs."
  [ ! -e "$STATE/base.git" ] || fail "state $STATE already holds a base.git" "use a fresh state directory for each fix run."
  mkdir -p "$STATE"

  # The one fetch: upstream/ at the tag. An explicit TAG export overrides the pin fragment.
  TAG="$TAG" bash "$REPO_ROOT/scripts/fetch-upstream.sh"

  # The pristine copy, taken before the model runs. Every later git call reads this copy only.
  cp -a "$WORK/.git" "$STATE/base.git"
  clean_git "$STATE" "$STATE/prep.index" "$WORK" rev-parse --verify HEAD > "$STATE/base-sha"
  echo "$NAME: base $(cat "$STATE/base-sha") recorded; pristine .git copied to $STATE/base.git"

  # Conflict markers are a fact for the model. Plain grep: no git, no config.
  local markers
  markers=$(grep -rl --exclude-dir=.git --exclude-dir=upstream -e '^<<<<<<< ' "$WORK" || true)
  if [ -n "$markers" ]; then
    echo "$NAME: NOTE -- conflict markers in the target:"
    printf '%s\n' "$markers"
  else
    echo "$NAME: NOTE -- no conflict markers in the target"
  fi

  # The baseline check over the target's patches, computed here so the model reads a result this script produced.
  if [ -d "$WORK/patches" ]; then
    local baseline
    baseline=$(mktemp "${TMPDIR:-/tmp}/fixer-baseline.XXXXXX")
    if bash "$REPO_ROOT/scripts/regenerate-patches.sh" --check --upstream "$REPO_ROOT/upstream" --patches "$WORK/patches" > "$baseline" 2>&1; then
      echo "$NAME: NOTE -- baseline regenerate-patches --check over the target's patches passes"
    else
      echo "$NAME: NOTE -- baseline regenerate-patches --check over the target's patches is red; last lines:"
      tail -n 5 "$baseline"
    fi
    rm -f "$baseline"
  else
    echo "$NAME: NOTE -- the target carries no patches/ directory"
  fi
  echo "$NAME: prepared upstream/ at $TAG; regenerate patches only with: bash scripts/regenerate-patches.sh --upstream upstream --patches work/patches"
}

# emit <state> <work> <out>. Returns non-zero with a named refusal; never runs a command from work/.
emit() {
  local st=$1 wk=$2 out=$3
  [ -d "$st/base.git" ] || fail "no pristine copy in $st" "run prep before the fixer, with the same state directory."
  case "$out" in /*) ;; *) fail "--out must be an absolute path, got '$out'" "pass an absolute path outside work/." ;; esac
  case "$out" in "$wk"|"$wk"/*) fail "--out is inside work/" "write the diff outside the target checkout." ;; esac

  # 1. work/.git must be byte-identical to the pristine copy. Plain diff: no git, no config.
  if ! diff -rq "$wk/.git" "$st/base.git" > "$st/gitdiff.txt" 2>&1; then
    echo "$NAME: FAIL -- [work/.git] differs from the pristine copy:" >&2
    head -n 5 "$st/gitdiff.txt" >&2
    echo "  Next step: the fixer changed the git directory. Refuse the change; the diff is not built." >&2
    return 1
  fi

  # 2. A clean copy of the tree the model left: no .git, no upstream. Symlinks stay symlinks.
  local copy
  copy=$(mktemp -d "$st/emit.XXXXXX")
  mkdir "$copy/tree"
  tar -C "$wk" --exclude=./.git --exclude=./upstream -cf - . | tar -C "$copy/tree" -xf -

  # 3. Stage the copy against the base commit in a throwaway index, forcing ignored paths in so the gate sees them.
  clean_git "$st" "$copy/index" "$copy/tree" read-tree "$(cat "$st/base-sha")"
  clean_git "$st" "$copy/index" "$copy/tree" add -A -f -- .
  clean_git "$st" "$copy/index" "$copy/tree" diff --cached --no-ext-diff --no-textconv --no-color "$(cat "$st/base-sha")" > "$copy/work.diff"

  # 4. A diff that touches .gitattributes changes how git reads the tree: refuse it.
  if grep -Eq '^diff --git .*\.gitattributes' "$copy/work.diff"; then
    echo "$NAME: FAIL -- [.gitattributes] the diff changes a .gitattributes file, which changes how git reads the tree" >&2
    echo "  Next step: revert the .gitattributes change; the gate also refuses it." >&2
    rm -rf "$copy"
    return 1
  fi

  cp "$copy/work.diff" "$out"
  echo "$NAME: wrote $(wc -l < "$out") diff line(s) to $out"
  rm -rf "$copy"
}

if [ "$MODE" = prep ]; then
  [ -n "$STATE" ] || fail "--state=<dir> is required" "pass a fresh directory outside work/ for the pristine copy."
  prep
  exit 0
fi

if [ "$MODE" = emit ]; then
  [ -n "$STATE" ] || fail "--state=<dir> is required" "pass the directory prep wrote."
  [ -n "$OUT" ] || fail "--emit-diff needs --out=<file>" "pass the file the diff is written to."
  emit "$STATE" "$WORK" "$OUT"
  exit 0
fi

if [ "$MODE" = self-test ]; then
  # Fixture: a target repository, its pristine copy taken as prep would take it, then the model's edits.
  T=$(mktemp -d "${TMPDIR:-/tmp}/fixer-selftest.XXXXXX")
  EXIT=0
  bad() { echo "$NAME: --self-test FAIL -- $1" >&2; EXIT=1; }
  ok() { echo "  ok  $1"; }
  mkfixture() {
    # Fresh target repo and pristine copy, each test in its own directory.
    local d=$1
    mkdir -p "$d/work"
    git -C "$d/work" init -q
    git -C "$d/work" config user.email fixture@example.invalid
    git -C "$d/work" config user.name fixture
    printf 'alpha\n' > "$d/work/doc.md"
    git -C "$d/work" add -A
    git -C "$d/work" commit -qm base
    mkdir -p "$d/state"
    cp -a "$d/work/.git" "$d/state/base.git"
    git -C "$d/work" rev-parse --verify HEAD > "$d/state/base-sha"
  }

  # A. control: a model edit and nothing else is emitted.
  mkfixture "$T/a"
  printf 'alpha\nbeta\n' > "$T/a/work/doc.md"
  if emit "$T/a/state" "$T/a/work" "$T/a/out.diff" > "$T/a/log" 2>&1 && grep -q '^+beta' "$T/a/out.diff"; then ok "control: a plain edit is emitted with its body"; else bad "control: a plain edit was refused or not emitted"; cat "$T/a/log" >&2; fi

  # B. planted config: core.fsmonitor and diff.external, each writing a marker if run.
  mkfixture "$T/b"
  printf 'alpha\nbeta\n' > "$T/b/work/doc.md"
  printf '[core]\n\tfsmonitor = touch %s/PWNED-fsmonitor\n[diff]\n\texternal = touch %s/PWNED-external\n' "$T/b" "$T/b" >> "$T/b/work/.git/config"
  if emit "$T/b/state" "$T/b/work" "$T/b/out.diff" > "$T/b/log" 2>&1; then bad "planted .git/config was not refused"; else
    if [ -e "$T/b/PWNED-fsmonitor" ] || [ -e "$T/b/PWNED-external" ]; then bad "a planted .git/config command ran"; else ok "planted core.fsmonitor and diff.external in work/.git/config are refused and never run"; fi
  fi
  grep -q '\[work/.git\]' "$T/b/log" && ok "the refusal names [work/.git]" || bad "the .git/config refusal did not name [work/.git]"

  # C. planted hook under work/.git/hooks.
  mkfixture "$T/c"
  printf 'alpha\nbeta\n' > "$T/c/work/doc.md"
  mkdir -p "$T/c/work/.git/hooks"
  printf '#!/bin/sh\ntouch %s/PWNED-hook\n' "$T/c" > "$T/c/work/.git/hooks/post-index-change"
  if emit "$T/c/state" "$T/c/work" "$T/c/out.diff" > "$T/c/log" 2>&1; then bad "a planted hook under work/.git was not refused"; else
    [ -e "$T/c/PWNED-hook" ] && bad "a planted hook ran" || ok "a planted work/.git/hooks file is refused and never runs"
  fi

  # D. a .gitattributes change that would alter git's reading of the tree.
  mkfixture "$T/d"
  printf 'alpha\nbeta\n' > "$T/d/work/doc.md"
  printf '*.md diff=planted\n' > "$T/d/work/.gitattributes"
  if emit "$T/d/state" "$T/d/work" "$T/d/out.diff" > "$T/d/log" 2>&1; then bad ".gitattributes change was not refused"; else grep -q '\[.gitattributes\]' "$T/d/log" && ok "a .gitattributes change is refused, naming [.gitattributes]" || bad ".gitattributes refusal did not name the rule"; fi

  # E. a relative --out is refused before any work.
  if (cd "$T" && bash "$REPO_ROOT/scripts/fixer-prepare.sh" --emit-diff --state="$T/a/state" --out=rel.diff) > /dev/null 2>&1; then bad "a relative --out was accepted"; else ok "a relative --out is refused"; fi

  if [ "$EXIT" -eq 0 ]; then
    echo "$NAME: --self-test PASS -- a plain edit is emitted; a planted work/.git/config, a planted hook and a .gitattributes change are each refused before any command from them runs"
  else
    echo "$NAME: --self-test FAIL -- see the lines above" >&2
  fi
  exit "$EXIT"
fi

fail "no mode given" "pass --tag=<gecko-tag> --state=<dir> before the fixer, --emit-diff --state=<dir> --out=<file> after it, or --self-test."
