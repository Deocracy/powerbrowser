#!/usr/bin/env bash
# D-13 baseline, extended by Phase 45 (PKG-17, owner decision 19).
#
# Two modes. Dev mode (default): assumes it is already running inside the
# `firefox` dev shell -- it does not enter that shell itself -- and prints
# the three Nix-flake toolchain lines.
#
# Container mode (--container) MEASURES the pb-gecko-build release container:
# every line is read from the toolchain the container actually holds (the
# Mozilla bootstrap under MOZBUILD_STATE_PATH, or ~/.mozbuild). Nothing is
# echoed as a literal. It must run after the bootstrap build in the same
# container, because the bootstrap state does not outlive `podman run --rm`:
#   podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash -c \
#     'MOZCONFIG=/src/powerbrowser/packaging/mozconfig.release ./mach build && bash /src/scripts/toolchain-baseline.sh --container'
# Outside a container the mode refuses and names that command, because host
# numbers would describe the host, not the release toolchain.
#
# Phase 49 (AUTO-05): build-linux writes this output to a file and
# scripts/verify-toolchain-container.mjs --measured compares it with
# toolchain-baseline.txt, drift failing the build before packaging. A line that
# cannot be measured prints UNMEASURED and exits non-zero, so it can never match
# a committed value.
set -euo pipefail

CONTAINER_CMD='podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash -c '"'"'MOZCONFIG=/src/powerbrowser/packaging/mozconfig.release ./mach build && bash /src/scripts/toolchain-baseline.sh --container'"'"

# drift <container-output> <committed-baseline>: red on any UNMEASURED line
# and on any line that differs. Comment lines of the committed file are not
# compared. The release build's comparison (verify-toolchain-container.mjs
# --measured) applies the same rule.
drift() {
    local bad=0 committed
    committed="$(grep -v '^#' "$2")"
    if grep -q UNMEASURED <<< "$committed"; then
        grep UNMEASURED <<< "$committed" | sed 's/^/drift: UNMEASURED line: /'
        bad=1
    fi
    if ! diff <(printf '%s\n' "$committed") "$1" > /dev/null; then
        diff <(printf '%s\n' "$committed") "$1" | sed 's/^/drift: /'
        bad=1
    fi
    return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then
    SCR="$(mktemp -d)"
    trap 'rm -rf "$SCR"' EXIT
    printf 'clang clang 17.0.1\nsysroot jessie glibc-2.19\n' > "$SCR/container.txt"
    printf '# comment\nclang clang 17.0.1\nsysroot jessie glibc-2.19\n' > "$SCR/green.txt"
    printf 'clang clang 17.0.1\nsysroot jessie glibc-2.28\n' > "$SCR/mismatch.txt"
    printf 'clang UNMEASURED\nsysroot jessie glibc-2.19\n' > "$SCR/unmeasured.txt"
    fails=0
    if drift "$SCR/container.txt" "$SCR/green.txt" > /dev/null; then
        echo "toolchain-baseline: --self-test -- matching baseline GREEN"
    else
        echo "toolchain-baseline: --self-test FAIL -- a matching baseline was rejected" >&2; fails=1
    fi
    out="$(drift "$SCR/container.txt" "$SCR/mismatch.txt" || true)"
    if grep -q 'sysroot' <<< "$out"; then
        echo "toolchain-baseline: --self-test -- planted sysroot mismatch RED: $(grep sysroot <<< "$out" | sed -n 1p)"
    else
        echo "toolchain-baseline: --self-test FAIL -- a planted sysroot mismatch was not red naming sysroot" >&2; fails=1
    fi
    out="$(drift "$SCR/container.txt" "$SCR/unmeasured.txt" || true)"
    if grep -q 'UNMEASURED line' <<< "$out"; then
        echo "toolchain-baseline: --self-test -- planted UNMEASURED line RED"
    else
        echo "toolchain-baseline: --self-test FAIL -- a planted UNMEASURED line was not red" >&2; fails=1
    fi
    test "$fails" -eq 0 || exit 1
    echo "toolchain-baseline: --self-test PASS"
    exit 0
fi

if [ "${1:-}" = "--container" ]; then
    if [ ! -e /run/.containerenv ] && [ ! -e /.dockerenv ]; then
        echo "toolchain-baseline: FAIL -- --container measures the pb-gecko-build container, not this host. Run: $CONTAINER_CMD" >&2
        exit 1
    fi
    STATE="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}"
    # The bootstrap puts rustc, cargo, cbindgen and clang under the state dir,
    # and only mach's environment puts them on PATH. Measure the same binaries
    # mach would use.
    BOOT_BIN="$(find "$STATE" -maxdepth 5 -type f \( -name rustc -o -name cargo -o -name cbindgen -o -name clang \) -perm -u+x -printf '%h\n' 2>/dev/null | sort -u | paste -sd: -)"
    export PATH="${BOOT_BIN:+$BOOT_BIN:}$PATH"

    clang --version | sed -n 1p | grep -oE 'clang version [0-9]+\.[0-9]+\.[0-9]+' | sed 's/^clang version /clang /'
    rustc --version | grep -oE '^rustc [0-9]+\.[0-9]+\.[0-9]+'
    cargo --version | grep -oE '^cargo [0-9]+\.[0-9]+\.[0-9]+'
    cbindgen --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sed 's/^/cbindgen /'

    # The sysroot the bootstrap resolved: its dist comes from its own
    # /etc/debian_version, its glibc from running its libc.so.6, and its
    # libstdc++ ceiling from the GLIBCXX versions its libstdc++.so.6 defines.
    SYSROOT="$(find "$STATE" -maxdepth 5 -type d -name 'sysroot-x86_64-linux-gnu' 2>/dev/null | sed -n 1p)"
    if [ -z "$SYSROOT" ] || [ ! -f "$SYSROOT/etc/debian_version" ]; then
        echo "toolchain-baseline: FAIL -- no bootstrapped sysroot-x86_64-linux-gnu under $STATE; the sysroot lines are UNMEASURED. Run the bootstrap build in this container first: $CONTAINER_CMD" >&2
        exit 1
    fi
    case "$(cut -d. -f1 "$SYSROOT/etc/debian_version")" in
        8) DIST=jessie ;; 9) DIST=stretch ;; 10) DIST=buster ;; 11) DIST=bullseye ;; 12) DIST=bookworm ;;
        *) echo "toolchain-baseline: FAIL -- sysroot debian_version names no known dist" >&2; exit 1 ;;
    esac
    GLIBC="$("$SYSROOT/lib/x86_64-linux-gnu/libc.so.6" | sed -n 's/.*version \([0-9][0-9.]*\).*/\1/p' | sed -n 1p)"
    GLIBCXX="$(readelf -V "$SYSROOT/usr/lib/x86_64-linux-gnu/libstdc++.so.6" | grep -oE 'GLIBCXX_[0-9]+(\.[0-9]+)+' | sort -uV | tail -n 1)"
    test -n "$GLIBC" && test -n "$GLIBCXX" || { echo "toolchain-baseline: FAIL -- could not measure the sysroot glibc or libstdc++ floor" >&2; exit 1; }
    echo "sysroot $DIST glibc-$GLIBC"
    echo "sysroot-glibcxx $GLIBCXX"
    echo "image pb-gecko-build $(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release)"
    exit 0
fi

rustc --version | grep -oE '^rustc [0-9]+\.[0-9]+\.[0-9]+' | sed 's/^rustc /rustc /'
cargo --version | grep -oE '^cargo [0-9]+\.[0-9]+\.[0-9]+' | sed 's/^cargo /cargo /'
cbindgen --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sed 's/^/cbindgen /'
