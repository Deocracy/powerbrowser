#!/usr/bin/env bash
# powerbrowser/packaging/check-win-sidecar.sh -- the admission and purge gates for the hosted Windows sidecar
# artifact (Phase 54, PKG-13). package-windows.sh calls both; --self-test plants each fault.
#
#   check-win-sidecar.sh check DIR SUMS_SHA256   admit DIR as the artifact the hosted job produced
#   check-win-sidecar.sh purge DIR TARGET...     refuse a staged text file that names the hosted build root
#   check-win-sidecar.sh --self-test
#
# check, in order:
#   - SUMS_SHA256 is the digest of SHA256SUMS that the PRODUCING job recorded outside the artifact (a job
#     output or an attestation). SHA256SUMS itself travels inside the artifact, so on its own it only detects
#     corruption; whoever can alter the files can alter it. It must hash to SUMS_SHA256 before it is trusted.
#   - the artifact holds no symlink (cp -a would carry one into the stage);
#   - every manifest line is '<64 hex> <space-or-*><path>' and no path is absolute, contains a '..' segment,
#     a backslash or a duplicate;
#   - the manifest paths equal the files actually present (find -type f, SHA256SUMS excepted) as SETS, in
#     both directions: an unlisted file is refused naming it, and a listed file that is absent is refused;
#   - sha256sum -c agrees for every listed file;
#   - BUILD_ROOT (a file the producing job lists in the manifest like any other) is non-empty: it records the
#     hosted workspace root, which purge needs.
# purge greps the targets for BUILD_ROOT in every slash form a bundle can carry (as recorded, forward slashes,
# back slashes, back slashes doubled as inside a JS string); a grep error is a failure, not a pass.
set -euo pipefail

fail() { echo "check-win-sidecar: FAIL -- $*" >&2; exit 1; }

check() {
    local dir="$1" want="${2:-}"
    [[ "$want" =~ ^[0-9a-f]{64}$ ]] || fail "the out-of-band SHA-256 of SHA256SUMS is unset or not 64 lowercase hex ('$want'); the hosted job must record it outside the artifact"
    test -f "$dir/SHA256SUMS" || fail "$dir/SHA256SUMS is absent; the hosted job must upload its checksum manifest with the sidecar"
    local got
    got="$(sha256sum "$dir/SHA256SUMS" | cut -d' ' -f1)"
    [ "$got" = "$want" ] || fail "SHA256SUMS hashes to $got, not the $want the producing job recorded; the manifest was altered after the job"
    local link
    link="$(find "$dir" -type l -print -quit)"
    [ -z "$link" ] || fail "the artifact contains a symlink: $link"
    local bad
    bad="$(grep -vnE '^[0-9a-f]{64} [ *][^[:space:]].*$' "$dir/SHA256SUMS" | head -n1 || true)"
    [ -z "$bad" ] || fail "SHA256SUMS has a malformed line ($bad)"
    local listed actual path
    listed="$(sed -E 's/^[0-9a-f]{64} [ *]//' "$dir/SHA256SUMS" | LC_ALL=C sort)"
    while IFS= read -r path; do
        case "$path" in
            /*) fail "SHA256SUMS lists an absolute path: $path" ;;
            *\\*) fail "SHA256SUMS lists a path with a backslash: $path" ;;
            ../*|*/../*|*/..|..) fail "SHA256SUMS lists a path with a '..' segment: $path" ;;
        esac
    done <<<"$listed"
    local dup
    dup="$(uniq -d <<<"$listed" | head -n1)"
    [ -z "$dup" ] || fail "SHA256SUMS lists '$dup' twice"
    actual="$(cd "$dir" && find . -type f ! -path ./SHA256SUMS -print | sed 's|^\./||' | LC_ALL=C sort)"
    local extra missing
    extra="$(LC_ALL=C comm -13 <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") | head -n1)"
    [ -z "$extra" ] || fail "'$extra' is in the artifact but not in SHA256SUMS; an unlisted file would be staged unverified"
    missing="$(LC_ALL=C comm -23 <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") | head -n1)"
    [ -z "$missing" ] || fail "'$missing' is in SHA256SUMS but absent from the artifact"
    ( cd "$dir" && sha256sum -c --quiet SHA256SUMS ) || fail "the sidecar artifact does not agree with its SHA256SUMS; nothing is staged"
    test -f "$dir/BUILD_ROOT" || fail "$dir/BUILD_ROOT is absent; the hosted job must record its workspace root (listed in SHA256SUMS)"
    [ -n "$(tr -d '[:space:]' < "$dir/BUILD_ROOT")" ] || fail "$dir/BUILD_ROOT is empty, so the checkout-path purge would look for nothing"
}

purge() {
    local dir="$1"; shift
    local root fwd back dbl form hits rc
    root="$(tr -d '\r' < "$dir/BUILD_ROOT" | head -n1)"
    [ -n "$root" ] || fail "$dir/BUILD_ROOT is empty, so the checkout-path purge would look for nothing"
    fwd="${root//\\//}"
    back="${root//\//\\}"
    dbl="${back//\\/\\\\}"
    for form in "$root" "$fwd" "$back" "$dbl"; do
        rc=0
        hits="$(grep -rlI -F -e "$form" "$@")" || rc=$?
        [ "$rc" -le 1 ] || fail "grep could not read the stage while looking for '$form' (exit $rc)"
        [ -z "$hits" ] || fail "the staged sidecar still carries the hosted build root '$form': $(head -n1 <<<"$hits")"
    done
}

self_test() {
    local t good fixture
    t="$(mktemp -d)"
    trap 'rm -rf "$t"' RETURN
    good="$t/good"
    mkdir -p "$good/backend" "$good/node_modules/x"
    echo 'console.log(1)' > "$good/backend/main.js"
    echo 'binary' > "$good/node_modules/x/addon.node"
    printf '%s\n' 'D:\a\work\work' > "$good/BUILD_ROOT"
    mksums() { ( cd "$1" && find . -type f ! -path ./SHA256SUMS -print | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum > SHA256SUMS ); }
    mksums "$good"
    local sums
    sums="$(sha256sum "$good/SHA256SUMS" | cut -d' ' -f1)"
    ( check "$good" "$sums" ) || { echo "check-win-sidecar: --self-test FAIL -- the good fixture was refused" >&2; return 1; }
    echo "  ok  good artifact -> admitted"

    local failed=0 SUMS_OVERRIDE=""
    # plant NAME FRAGMENT FN [SUMS]: FN edits a fresh copy; check must refuse it naming FRAGMENT. FN may set SUMS_OVERRIDE
    # (after re-hashing the manifest) so the plant gets past the out-of-band digest and reaches the rule under test.
    plant() {
        local name="$1" frag="$2" fn="$3" out want
        fixture="$t/plant"; rm -rf "$fixture"; cp -a "$good" "$fixture"
        SUMS_OVERRIDE=""
        "$fn" "$fixture"
        want="${4:-${SUMS_OVERRIDE:-$sums}}"
        out="$( (check "$fixture" "$want") 2>&1 )" && { echo "check-win-sidecar: --self-test FAIL -- '$name' was admitted" >&2; failed=1; return; }
        grep -qF -- "$frag" <<<"$out" || { echo "check-win-sidecar: --self-test FAIL -- '$name' went red without naming '$frag': $out" >&2; failed=1; return; }
        echo "  ok  $name -> refused, naming '$frag'"
    }
    resum() { SUMS_OVERRIDE="$(sha256sum "$1/SHA256SUMS" | cut -d' ' -f1)"; }
    p_unlisted() { echo x > "$1/backend/extra.js"; }
    p_missing() { rm "$1/node_modules/x/addon.node"; }
    p_manifest_tamper() { printf '\n' >> "$1/SHA256SUMS"; }
    p_tamper() { echo changed > "$1/backend/main.js"; }
    p_symlink() { ln -s /etc/passwd "$1/backend/link"; }
    p_dotdot() { echo "$(printf 'a%.0s' {1..64})  ../escape" >> "$1/SHA256SUMS"; resum "$1"; }
    p_abs() { echo "$(printf 'a%.0s' {1..64})  /etc/passwd" >> "$1/SHA256SUMS"; resum "$1"; }
    p_noroot() { : > "$1/BUILD_ROOT"; mksums "$1"; resum "$1"; }
    p_nested_sums() { echo x > "$1/backend/SHA256SUMS"; }
    p_none() { :; }
    plant 'unlisted extra file' "backend/extra.js" p_unlisted
    plant 'listed file absent' "node_modules/x/addon.node" p_missing
    plant 'manifest altered after the producing job' "altered after the job" p_manifest_tamper
    plant 'file changed after hashing' "does not agree" p_tamper
    plant 'symlink in the artifact' "symlink" p_symlink
    plant '.. segment in the manifest' "'..' segment" p_dotdot
    plant 'absolute path in the manifest' "absolute path" p_abs
    plant 'a file named SHA256SUMS in a subdirectory is still an unlisted file' "backend/SHA256SUMS" p_nested_sums
    plant 'out-of-band digest does not match' "producing job recorded" p_none "$(printf 'b%.0s' {1..64})"
    plant 'out-of-band digest unset or malformed' "out-of-band SHA-256" p_none "not-a-digest"
    plant 'empty BUILD_ROOT' "BUILD_ROOT is empty" p_noroot

    # purge: a clean stage, then each slash form of the hosted root
    local stage="$t/stage"
    mkdir -p "$stage"; echo 'clean' > "$stage/a.js"
    ( purge "$good" "$stage" ) || { echo "check-win-sidecar: --self-test FAIL -- a clean stage was refused" >&2; failed=1; }
    echo "  ok  clean stage -> admitted by purge"
    local form
    for form in 'D:\a\work\work' 'D:/a/work/work' 'D:\\a\\work\\work'; do
        printf 'var p = "%s/x";\n' "$form" > "$stage/leak.js"
        local out
        out="$( (purge "$good" "$stage") 2>&1 )" && { echo "check-win-sidecar: --self-test FAIL -- a stage naming '$form' was admitted" >&2; failed=1; continue; }
        grep -qF "hosted build root" <<<"$out" || { echo "check-win-sidecar: --self-test FAIL -- '$form' went red without naming the build root: $out" >&2; failed=1; continue; }
        echo "  ok  stage naming '$form' -> refused by purge"
    done
    rm -f "$stage/leak.js"
    local out
    out="$( (purge "$good" "$t/does-not-exist") 2>&1 )" && { echo "check-win-sidecar: --self-test FAIL -- an unreadable stage was admitted" >&2; failed=1; }
    grep -qF "grep could not read" <<<"$out" && echo "  ok  unreadable stage -> refused by purge (a grep error is not a pass)"
    [ "$failed" -eq 0 ] || return 1
    echo "check-win-sidecar: --self-test PASS -- the good artifact is admitted and every planted fault is refused naming the cause."
}

case "${1:-}" in
    check) [ "$#" -eq 3 ] || fail "usage: check DIR SUMS_SHA256"; check "$2" "$3" ;;
    purge) [ "$#" -ge 3 ] || fail "usage: purge DIR TARGET..."; shift; purge "$@" ;;
    --self-test) self_test ;;
    *) fail "usage: check-win-sidecar.sh check DIR SUMS_SHA256 | purge DIR TARGET... | --self-test" ;;
esac
