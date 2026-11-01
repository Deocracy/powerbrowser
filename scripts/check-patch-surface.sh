#!/usr/bin/env bash
# D-72/D-73: the artifact/patch-surface boundary as an executable guard, not
# prose. Two modes, one script, one registry:
#
#  * Compiled-suffix scan (default): fails if any patches/*.patch touches a
#    compiled-file path -- this phase's entire Gecko patch surface is meant
#    to be config-only (D-74).
#  * Brand-value scan (05-01, MIG-05; default): fails if any ADDED (+) line
#    of patches/*.patch carries a downstream-varying brand or config value;
#    every value lives under generated/. The value set is DERIVED from
#    configuration.toml at check time (required [identity]/[product]/
#    [legal] strings via the vendored parser), never a hand-kept list, so a
#    rebrand that changes a display string moves the scan with it.
#
# Target paths are read from each patch's own '+++ b/' header lines, never
# grepped from the patch body -- a body-grep would false-match a string that
# merely appears inside changed content.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Compiled-suffix set, from upstream/python/mozbuild/mozbuild/frontend/emitter.py:1126-1133.
COMPILED_SUFFIXES=(.c .cc .cxx .cpp .h .hh .hpp .inc .m .mm .rs .s .S .asm .webidl .idl .ipdl .ipdlh)

# The only compiled paths a patch may touch, matched as the exact repo-relative
# path (never a basename or a suffix). Owner ruling 2026-10-31, Phase 57 B1
# option (a), amending D-72/D-73: the Glean crash-ping consent read lives only
# in Rust, so TEL-09's fail-closed default needs these two files. Every other
# compiled path, any other .rs included, stays an offense.
ALLOWED_COMPILED_PATHS=(
  toolkit/crashreporter/client/app/src/glean.rs
  toolkit/crashreporter/client/app/src/send_ping.rs
)

is_compiled_path() {
  local path="$1" suffix base allowed
  for allowed in "${ALLOWED_COMPILED_PATHS[@]}"; do
    [ "$path" = "$allowed" ] && return 1
  done
  base="$(basename -- "$path")"
  case "$base" in
    Cargo.*) return 0 ;;
  esac
  for suffix in "${COMPILED_SUFFIXES[@]}"; do
    case "$path" in
      *"$suffix") return 0 ;;
    esac
  done
  return 1
}

# Scans a patches/ directory for compiled-suffix target paths. Prints one
# "patch: path" line per offense to stdout and returns the offense count via
# exit code semantics (0 offenses -> return 0, >0 -> return 1); the empty-
# directory case is reported explicitly by the caller, not here.
scan_patch_surface() {
  local patches_dir="$1"
  local count=0
  shopt -s nullglob
  local patch_files=("$patches_dir"/*.patch)
  shopt -u nullglob

  if [ "${#patch_files[@]}" -eq 0 ]; then
    echo "check-patch-surface: FAIL -- $patches_dir contains no *.patch files (an empty stack is not a clean surface)" >&2
    return 1
  fi

  local p name path
  for p in "${patch_files[@]}"; do
    name="$(basename "$p")"
    while IFS= read -r path; do
      [ -z "$path" ] && continue
      if is_compiled_path "$path"; then
        count=$((count + 1))
        echo "  $name touches compiled path: $path" >&2
      fi
    done < <(grep -E '^\+\+\+ b/' "$p" | sed 's#^+++ b/##')
  done

  if [ "$count" -ne 0 ]; then
    echo "check-patch-surface: FAIL -- $count compiled-file patch target(s) found" >&2
    return 1
  fi

  return 0
}

# Scans a patches/ directory for downstream-varying brand values on added
# (+) lines. Prints one "patch carries brand value" line per offense to
# stderr and returns 1 when any is found, 0 when clean; the empty-directory
# case fails explicitly, like scan_patch_surface above.
#
# WHAT COUNTS AS A VALUE. Required string leaves under the manifest tables
# [identity], [product] and [legal] (required-ness read out of
# scripts/lib/config-schema.json, so a key flipping to required joins the
# set with no edit here). Optional keys (descriptions, homepages, URLs) are
# not brand: a patch quoting the homepage is sloppy, not a rebrand leak.
# The frozen app GUID is not in configuration.toml at all, so a
# manifest-derived set excludes it by construction -- a GUID-regex scan
# would flag the stock context line 010 keeps, which is exactly why this
# scan derives instead of pattern-matching.
#
# BOUNDARIES ARE PATH-AWARE. A value matches only between characters
# outside [A-Za-z0-9_./-]. The extra / . - beyond the word class is what
# keeps hook syntax green: 020's DIRS += ["../powerbrowser/shell"] carries
# the tree name as path segments, never as a value, and the shipped-stack
# control in --self-test proves it stays green. A planted
# +imply_option("MOZ_APP_DISPLAYNAME", "PowerBrowser") is quote-bounded
# and goes red naming the patch and the value.
#
# ADDED LINES ONLY. Context lines and the +++ header paths are never read:
# the stock MOZ_APP_ID context line 010 keeps would otherwise flag any
# scan whose set contained the GUID, and a header path is a filename, not
# a value.
scan_brand_values() {
  local patches_dir="$1"
  node -e "
    const fs = require(\"fs\");
    const path = require(\"path\");
    const repoRoot = process.argv[1];
    const patchesDir = process.argv[2];
    let manifest, schema;
    try {
      const { parse } = require(path.join(repoRoot, \"scripts/lib/toml.cjs\"));
      manifest = parse(fs.readFileSync(path.join(repoRoot, \"configuration.toml\"), \"utf8\"));
      schema = JSON.parse(fs.readFileSync(path.join(repoRoot, \"scripts/lib/config-schema.json\"), \"utf8\"));
    } catch (err) {
      console.error(\"check-patch-surface: FAIL -- could not derive the brand-value set from configuration.toml: \" + (err && err.message));
      process.exit(1);
    }
    const values = new Set();
    for (const table of [\"identity\", \"product\", \"legal\"]) {
      const node = manifest[table];
      if (!node || typeof node !== \"object\") continue;
      for (const [key, value] of Object.entries(node)) {
        const spec = schema.keys[table + \".\" + key];
        if (!spec || !spec.required) continue;
        if (typeof value !== \"string\" || value === \"\") continue;
        if (/[\r\n]/.test(value)) continue;
        values.add(value);
      }
    }
    let files;
    try {
      files = fs.readdirSync(patchesDir).filter((n) => n.endsWith(\".patch\")).sort();
    } catch (err) {
      console.error(\"check-patch-surface: FAIL -- could not read \" + patchesDir + \": \" + (err && err.message));
      process.exit(1);
    }
    if (files.length === 0) {
      console.error(\"check-patch-surface: FAIL -- \" + patchesDir + \" contains no *.patch files (an empty stack is not a clean surface)\");
      process.exit(1);
    }
    const esc = (s) => s.replace(/[.*+?^\${}()|[\]\\\\]/g, \"\\\\$&\");
    const BOUND = \"[^A-Za-z0-9_./-]\";
    // Longest first: \"DeBIOS Foundation\" must name itself, not its
    // \"DeBIOS\" prefix, on a line carrying the display string.
    const ordered = [...values].sort((a, b) => b.length - a.length);
    let offenses = 0;
    for (const name of files) {
      const lines = fs.readFileSync(path.join(patchesDir, name), \"utf8\").split(\"\n\");
      for (const line of lines) {
        if (!line.startsWith(\"+\") || line.startsWith(\"+++\")) continue;
        const added = line.slice(1);
        for (const value of ordered) {
          const re = new RegExp(\"(?:^|\" + BOUND + \")\" + esc(value) + \"(?:\" + BOUND + \"|$)\");
          if (re.test(added)) {
            console.error(\"  \" + name + \" carries brand value \" + JSON.stringify(value) + \" in: \" + added.slice(0, 120));
            offenses += 1;
            break;
          }
        }
      }
    }
    if (offenses !== 0) {
      console.error(\"check-patch-surface: FAIL -- \" + offenses + \" brand-value patch line(s) found\");
      process.exit(1);
    }
  " "$REPO_ROOT" "$patches_dir"
}

# --self-test-brand: the brand-value mode's own plant-and-control pair, in
# the same mktemp-fixture style as the compiled scan above. Three
# assertions, each proving a different half:
#
#  1. A planted patch carrying the LIVE display name (derived from
#     configuration.toml, the same source the scan reads -- never typed as
#     a literal, so a rebrand moves the plant with the scan) in a +line
#     goes red NAMING the patch and the value.
#  2. A hook-only patch mirroring the shipped shapes (include hook, DIRS
#     hook, comments -- no values) goes green in isolation, proving the
#     path-aware boundaries do not trip on hook syntax.
#  3. The SHIPPED stack goes green -- the clean control proving the red in
#     (1) is plant-caused rather than a scan that rejects everything.
#
# Called by --self-test-brand AND by the full --self-test below: one logic
# path, never a re-implementation per flag.
run_self_test_brand() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN

  local display
  display="$(node -e "
    const fs = require(\"fs\");
    const path = require(\"path\");
    const { parse } = require(path.join(process.argv[1], \"scripts/lib/toml.cjs\"));
    const manifest = parse(fs.readFileSync(path.join(process.argv[1], \"configuration.toml\"), \"utf8\"));
    process.stdout.write(manifest.identity.display_name);
  " "$REPO_ROOT")"
  if [ -z "$display" ]; then
    echo "check-patch-surface: --self-test-brand FAIL -- could not derive identity.display_name from configuration.toml, so no plant could mean anything" >&2
    return 1
  fi

  cat > "$tmp/900-brand.patch" <<EOF
--- a/browser/moz.configure
+++ b/browser/moz.configure
@@ -1 +1 @@
-imply_option("MOZ_APP_DISPLAYNAME", "Stock")
+imply_option("MOZ_APP_DISPLAYNAME", "$display")
EOF

  mkdir -p "$tmp/clean"
  cat > "$tmp/clean/010-clean.patch" <<'EOF'
--- a/browser/moz.configure
+++ b/browser/moz.configure
@@ -1 +1,5 @@
 context
+# hook comment, no values
+include("../identity.configure")
 context
EOF
  cat > "$tmp/clean/020-clean.patch" <<'EOF'
--- a/browser/moz.build
+++ b/browser/moz.build
@@ -1 +1,2 @@
 context
+DIRS += ["../powerbrowser/shell"]
EOF
  # Context lines are never read, even when they carry a value: the stock
  # MOZ_APP_ID context line 010 keeps is the reason this exclusion exists.
  cat > "$tmp/clean/030-context.patch" <<EOF
--- a/browser/moz.configure
+++ b/browser/moz.configure
@@ -1,3 +1,4 @@
 # A stock comment naming $display that upstream already carries
 existing
+include("../identity.configure")
 more
EOF

  if scan_brand_values "$tmp" >/dev/null 2>"$tmp/brand.err"; then
    echo "check-patch-surface: --self-test-brand FAIL -- planted brand-value patch was NOT rejected" >&2
    cat "$tmp/brand.err" >&2
    return 1
  fi

  if ! grep -q '900-brand.patch' "$tmp/brand.err" || ! grep -qF "$display" "$tmp/brand.err"; then
    echo "check-patch-surface: --self-test-brand FAIL -- rejected, but message does not name the planted patch and value" >&2
    cat "$tmp/brand.err" >&2
    return 1
  fi
  echo "check-patch-surface: --self-test-brand PASS -- planted brand value (900-brand.patch, \"$display\") was correctly rejected"

  if ! scan_brand_values "$tmp/clean" >/dev/null 2>"$tmp/clean.err"; then
    echo "check-patch-surface: --self-test-brand FAIL -- hook-only fixture was rejected, so the boundaries trip on hook syntax:" >&2
    cat "$tmp/clean.err" >&2
    return 1
  fi
  echo "check-patch-surface: --self-test-brand PASS -- hook-only fixture (include + DIRS + value-carrying context) stays green"

  if ! scan_brand_values "$REPO_ROOT/patches" >/dev/null 2>"$tmp/shipped.err"; then
    echo "check-patch-surface: --self-test-brand FAIL -- the SHIPPED stack is red, so the plant red above proves nothing:" >&2
    cat "$tmp/shipped.err" >&2
    return 1
  fi
  echo "check-patch-surface: --self-test-brand PASS -- shipped hook-only stack stays green (clean control)"
  return 0
}

# --self-test: plants a throwaway patch whose target is a compiled path in a
# mktemp -d directory (never touches the real patches/), and asserts the scan
# rejects it. This is D-73's acceptance check 1 -- a green run alone proves
# nothing; the control is what proves the scan can go red.
run_self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN

  cat > "$tmp/900-bad.patch" <<'EOF'
--- a/dom/base/nsGlobalWindowInner.cpp
+++ b/dom/base/nsGlobalWindowInner.cpp
@@ -1,3 +1,3 @@
-// old
+// new
 // context
EOF

  if scan_patch_surface "$tmp" >/dev/null 2>"$tmp/self-test.err"; then
    echo "check-patch-surface: --self-test FAIL -- planted compiled-file patch was NOT rejected" >&2
    cat "$tmp/self-test.err" >&2
    return 1
  fi

  if ! grep -q 'nsGlobalWindowInner.cpp' "$tmp/self-test.err"; then
    echo "check-patch-surface: --self-test FAIL -- rejected, but message doesn't name the planted path" >&2
    cat "$tmp/self-test.err" >&2
    return 1
  fi
  echo "check-patch-surface: --self-test PASS -- planted compiled-file patch (900-bad.patch, nsGlobalWindowInner.cpp) was correctly rejected"

  run_self_test_allowlist "$tmp"
}

# The ALLOWED_COMPILED_PATHS plants (B1 ruling, 2026-10-31). Each allowed
# path alone is green; the same basename under another directory, a
# different .rs path, and a .cpp path are each red, named.
plant_patch() {
  printf -- '--- a/%s\n+++ b/%s\n@@ -1 +1 @@\n-old\n+new\n' "$2" "$2" > "$1"
}

run_self_test_allowlist() {
  local tmp="$1" allowed dir red
  for allowed in "${ALLOWED_COMPILED_PATHS[@]}"; do
    dir="$tmp/allow-$(basename -- "$allowed")"
    mkdir -p "$dir"
    plant_patch "$dir/050-allowed.patch" "$allowed"
    if ! scan_patch_surface "$dir" >/dev/null 2>"$dir/err"; then
      echo "check-patch-surface: --self-test FAIL -- allowed path $allowed was rejected" >&2
      cat "$dir/err" >&2
      return 1
    fi
    echo "check-patch-surface: --self-test PASS -- allowed path $allowed stays green"
  done
  for red in \
    "toolkit/crashreporter/client/app/src/other/$(basename -- "${ALLOWED_COMPILED_PATHS[0]}")" \
    "toolkit/crashreporter/crashping/src/lib.rs" \
    "toolkit/crashreporter/client/app/src/glean.cpp"; do
    dir="$tmp/red-$(echo "$red" | tr '/.' '__')"
    mkdir -p "$dir"
    plant_patch "$dir/050-red.patch" "$red"
    if scan_patch_surface "$dir" >/dev/null 2>"$dir/err"; then
      echo "check-patch-surface: --self-test FAIL -- $red was NOT rejected, so the allowlist is wider than its exact paths" >&2
      return 1
    fi
    if ! grep -qF "compiled path: $red" "$dir/err"; then
      echo "check-patch-surface: --self-test FAIL -- $red rejected, but the message does not name it" >&2
      cat "$dir/err" >&2
      return 1
    fi
    echo "check-patch-surface: --self-test PASS -- $red stays an offense"
  done
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test || exit $?
  run_self_test_brand
  exit $?
fi

if [ "${1:-}" = "--brand-values" ]; then
  scan_brand_values "$REPO_ROOT/patches"
  echo "check-patch-surface: PASS -- no brand values on added patch lines in $(ls "$REPO_ROOT"/patches/*.patch | wc -l) patch(es)"
  exit $?
fi

if [ "${1:-}" = "--self-test-brand" ]; then
  run_self_test_brand
  exit $?
fi

if [ -n "${1:-}" ]; then
  echo "check-patch-surface: FAIL -- unknown argument '$1'" >&2
  exit 1
fi

scan_patch_surface "$REPO_ROOT/patches"
scan_brand_values "$REPO_ROOT/patches"
echo "check-patch-surface: PASS -- no compiled-file target paths and no brand values in $(ls "$REPO_ROOT"/patches/*.patch | wc -l) patch(es)"
