---
phase: 55-macos-i
reviewed: 2026-10-31T20:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - scripts/generate.mjs
  - scripts/verify-generated-identity.mjs
  - scripts/verify-mac-entitlements.mjs
  - scripts/verify-platform.sh
  - flake.nix
  - powerbrowser/packaging/mozconfig-macos-aarch64
  - powerbrowser/packaging/mozconfig-macos-x86_64
  - powerbrowser/packaging/node-runtime.json
  - powerbrowser/packaging/package-macos.sh
  - .planning/WINDOWS.md
  - .planning/workstreams/deploy/phases/55-macos-i/55-SEC13-MEMO.md
  - docs/BUILD.md
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 55: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard (plans 55-01 and 55-02, `git diff 186f465..HEAD`)
**Status:** issues_found

## Summary

What held up under test:

- `node scripts/generate.mjs --check` is green (68 files). The `tail = []` default leaves every existing
  `emitMozconfigFor` caller byte-identical. `verify-generated-identity` (39 files) and
  `scripts/verify-platform.sh --quick` pass.
- The darwin Node sha256 pins match nodejs.org `SHASUMS256.txt` for v24.19.0. I fetched it live and compared all
  three entries (arm64, x64, and the existing linux-x64). `sha256sum -c` failure deletes the archive and exits
  non-zero, so the pin is enforced and fails closed. The signature is still unverified, as BLOCKED.md item 5 records.
- `nix eval .#devShells.x86_64-linux.firefox-macos.name` evaluates. `flake.lock` is unchanged. nixpkgs `rcodesign`
  is 0.29.0, matching the memo. There are no unpinned fetches in the shell.
- The mac-entitlements gate cannot hide a new hit with a different file, kind or value. It keys on
  `file|kind|value` and requires set equality both ways. It goes red when WINDOWS.md entry 22 stops being `open`,
  and also when the entry is unreadable or absent (fail closed). Its self-test passes on the real tree.

What did not hold up: `package-macos.sh` cannot complete a real run (CR-01, CR-02). The emitted mozconfig depends
on an environment variable nothing sets (WR-02). The staging checks do not cover the natives most at risk (WR-01).

## Critical Issues

### CR-01: precomplete is generated from the bundle root, not Contents/Resources

**File:** `powerbrowser/packaging/package-macos.sh:98`
**Issue:** `( cd "$BUNDLE" && python3 .../createprecomplete.py )` runs the script with cwd = `X.app`.
`createprecomplete.generate_precomplete` only uses the Mac layout when `basename(cwd) == "Resources"`
(`upstream/config/createprecomplete.py:56-58`). From the bundle root it writes `X.app/precomplete`, a stray file
at the bundle root, and leaves the real `Contents/Resources/precomplete` stale.

I reproduced this on a scratch tree. After the run, `X Y.app/precomplete` existed and contained
`remove "precomplete"` and `remove "Contents/Resources/precomplete"`, while `Contents/Resources/precomplete` stayed
empty.

Consequences:
1. Full MARs are built from `Contents/Resources/precomplete`. It does not list the staged `theia/`, `node/` or
   `distribution/` files, so an update leaves the old sidecar files behind on disk. The script header claims the
   opposite.
2. A non-standard file at the bundle root is "unsealed contents" for `codesign` and `rcodesign`, so signing or
   notarization in plan 55-03 is likely to fail.

**Fix:**
```bash
( cd "$RES" && python3 "$ROOT/upstream/config/createprecomplete.py" )
```
Add a post-check that `"$BUNDLE/precomplete"` does not exist and that
`grep -q 'remove "Contents/Resources/theia/' "$RES/precomplete"`.

### CR-02: the checkout-path assertion fails on every real run because the node-file keys are never rewritten

**File:** `powerbrowser/packaging/package-macos.sh:91-95` (missing step; compare `package-linux.sh` perl rewrite)
**Issue:** `package-linux.sh` rewrites the esbuild `node-file:<abs path>` keys in `lib/backend/main.js` and
`lib/backend/parcel-watcher.js` before it asserts that no staged file contains `$ROOT/`. `package-macos.sh` copies
`lib/` and then runs the `grep -rlF "$ROOT/"` assertion with no rewrite.

The built tree carries these keys. In `theia/applications/browser/lib/backend/main.js`, `node-file:` occurs 6 times
and `parcel-watcher.js` 2 times. One example is
`node-file:/home/chris/gsd-workspaces/deploy/Power-Browser/theia/node_modules/drivelist/build/Release/drivelist.node`.
`ROOT` is the same checkout the Theia build ran in, so the assertion matches and calls `fail`. The comment saying
"RUNPATH rewriting for Mach-O ... is not guessed" does not apply to the text keys, which need no Mach-O knowledge.

This also happens after `$RES` has been mutated (see WR-07), so the failure leaves a half-staged bundle in the objdir.

**Fix:** copy the Linux step before the assertion:
```bash
perl -pi -e 's{//\s*node-file:\S+}{// node-file:<buildhost>}; s{"node-file:[^"]+"}{"node-file:<buildhost>"}g' \
    "$RES/theia/lib/backend/main.js" "$RES/theia/lib/backend/parcel-watcher.js"
```
Then add a Mach-O RPATH step (`otool -l` or `llvm-objdump --macho --rpaths`, plus `install_name_tool -delete_rpath`
or `rcodesign`-safe removal) for the staged `.node` files, or keep the failing assertion as the guard.

## Warnings

### WR-01: Mach-O and architecture checks cover only `node`, not the natives

**File:** `powerbrowser/packaging/package-macos.sh:77-82` and `:86-88`
**Issue:** The `lipo -archs` check runs on `node/bin/node` only. The sidecar `lib/` also ships native modules, and
the built tree has ELF binaries: `lib/backend/native/keytar.node`, `watcher.node`, `drivelist.node`, and
`lib/prebuilds/linux-x64/pty.node`. The "no Linux name" `find` catches only the `pty` one, because its directory is
named `linux-x64`. The other three have arch-free names, so a Linux-built `lib/` (a stale tree, or the wrong host)
stages ELF natives into a bundle with no failure. The staged `better-sqlite3` prebuild is also not checked for
arch. The header says "on a matching host" but nothing enforces it.

**Fix:** after staging, require every `*.node` and every file with Mach-O or ELF magic under `$RES/theia` to be a
thin Mach-O of `$WANT_ARCH`:
```bash
while IFS= read -r f; do
  a="$("$LIPO" -archs "$f" 2>/dev/null || true)"
  [ "$a" = "$WANT_ARCH" ] || fail "$f is not a thin $WANT_ARCH Mach-O (got '${a:-not Mach-O}')"
done < <(find "$RES/theia" -name '*.node')
```

### WR-02: the mozconfig bakes in `$MOZ_FETCHES_DIR`, which nothing sets or checks

**File:** `powerbrowser/packaging/mozconfig-macos-aarch64:20-23` (same lines in `-x86_64`; emitter `scripts/generate.mjs` `emitMozconfigMacos`); `flake.nix` firefox-macos `shellHook`; `package-macos.sh:47`
**Issue:** `MACOS_SDK_DIR`, `MKFSHFS`, `DMG_TOOL` and `HFS_TOOL` expand `$MOZ_FETCHES_DIR` when the mozconfig is
loaded. Neither the firefox-macos shell nor `package-macos.sh` sets it, and nothing checks it. Unset, the values
become `/MacOSX26.5.sdk` and `/hfsplus/newfs_hfs`.

`MACOS_SDK_DIR` is non-empty, so `toolchain.configure:259-263` skips the bootstrap SDK fetch and dies with
"SDK not found in /MacOSX26.5.sdk". Even `--enable-bootstrap` cannot rescue it. The DMG tool paths fail later and
less clearly. The plan's own comment calls the SDK "the bootstrap SDK", but the mozconfig bypasses bootstrap.
BLOCKED.md item 8 and the 55-02 SUMMARY list the dependency as "to confirm at the first cross configure". This is
checkable now without a Mac.

**Fix:** add a preflight to `package-macos.sh` (and a line in the BUILD.md section) that fails with a plain next
step:
```bash
: "${MOZ_FETCHES_DIR:?set MOZ_FETCHES_DIR to the directory holding MacOSX26.5.sdk, hfsplus/ and dmg/}"
test -d "$MOZ_FETCHES_DIR/MacOSX26.5.sdk" || fail "$MOZ_FETCHES_DIR/MacOSX26.5.sdk is absent"
```

### WR-03: the macOS mozconfig is dev-variant only, so staging defaults to dev branding

**File:** `scripts/generate.mjs` (`emitMozconfigMacos`, `TARGETS` rows for `mozconfig-macos-*` with `variant: 'dev'`); `powerbrowser/packaging/package-macos.sh:47`
**Issue:** The emitted mozconfigs default `--with-branding` to `powerbrowser/branding-generated/dev` and use the
non-bootstrap, no-Safe-Browsing shape of the Linux dev row. `mozconfig.release` differs on exactly those lines.
`package-macos.sh` never sets `POWERBROWSER_BRANDING`, so a bare run produces a "Dev" bundle. The ten release DMG
branding files under `branding/release/` are emitted but nothing selects them. A release macOS bundle needs a human
to remember `POWERBROWSER_BRANDING=powerbrowser/branding-generated/release`, with no check that they did.

**Fix:** either add a variant argument to `package-macos.sh` that exports `POWERBROWSER_BRANDING` for release and
asserts the staged `Info.plist` product name matches, or record in 55-03 that the release job exports it and add a
gate that fails when the macOS release path would use `.../dev`.

### WR-04: nothing in the shell or mozconfig supplies a Darwin Rust standard library

**File:** `flake.nix:108-139` (firefox-macos), `powerbrowser/packaging/mozconfig-macos-*`
**Issue:** The shell takes `rustc` from `firefox-esr-153-unwrapped` via `inputsFrom`, and the mozconfig does not use
`--enable-bootstrap`. A nixpkgs `rustc` ships only its host rust-std. The `rustc` I inspected under `/nix/store`
lists `x86_64-unknown-linux-gnu` plus wasm and bpf targets, with no `aarch64-apple-darwin` or
`x86_64-apple-darwin`. I did not enter the shell itself, so this is probable rather than proven. The shell also
provides no cctools or Apple linker wiring beyond `lld` and `llvm`, and the mozconfig sets none. The 55-02 SUMMARY
and BLOCKED.md list only libclang and `MOZ_FETCHES_DIR` as unconfirmed, not this. A Linux-side cross `configure`
needs no Mac, so it can be tried before the owner session.

**Fix:** run `./mach configure` with the aarch64 mozconfig inside `nix develop .#firefox-macos` and record the
result. If it fails, add `rust-std` for both Darwin targets, for example via a `rust-bin` or fenix overlay pinned in
`flake.lock`, or use `--enable-bootstrap` with the SDK fetch left unset.

### WR-05: `objdir-macos-*` is not git-ignored

**File:** `.gitignore:34-36`
**Issue:** `.gitignore` lists `objdir/`, `objdir-release/` and `objdir-nplus1/`. `git check-ignore` returns nothing
for `objdir-macos-aarch64` and `objdir-macos-x86_64`. The first `package-macos.sh` run leaves a full build tree
untracked at the repo root. `git add -A` or an IDE auto-add could stage it, and `git status` becomes unusable. The
commit rules in this repo already depend on explicit adds, which is a weak guard.

**Fix:** add `objdir-macos-aarch64/` and `objdir-macos-x86_64/` (or `objdir-*/`) to `.gitignore`.

### WR-06: mac-entitlements self-test leaves two rules unexercised

**File:** `scripts/verify-mac-entitlements.mjs:257-266` (stale-exclusion rule) and `:356-366` (control)
**Issue:**
1. The "excluded hit that no longer exists is red" rule (the stale-exclusion branch after `expected`) has no plant.
   Delete the whole stale loop and `--self-test` still passes. That branch is what makes the gate go red after the
   Team-ID patch lands but entry 22 is left open. Plant it: read `firefox.browser.xml` with the
   `43AQ936H96.org.mozilla.firefox` string replaced, and require a failure naming the hit and "stale".
2. The derived-zero side of the vacuity rule is never planted. The "zero entitlement files" plant empties the
   directory listing, not the config's signing groups. A broken `signingGroups` reader that returns empty groups
   would pass the self-test.
3. The control ("forbidden text under .planning/ stays green") overrides `read` for a path the gate never reads. It
   cannot go red by construction, so it proves nothing about the `.planning/` exclusion. The real
   `windowsStatus` also reads WINDOWS.md through `readText`, bypassing the injected `read`.

**Fix:** add the stale plant and a plant that passes a config text with an empty `hardened-sign-config`. Make the
control meaningful by routing `windowsStatus` through the injectable `read` and planting forbidden text in a
WINDOWS.md-shaped string.

## Info

### IN-01: plist facts are regex-scraped and the restricted-key list is a hand-kept copy

**File:** `scripts/verify-mac-entitlements.mjs:66-69` and `:174-181`
**Issue:** The header says "XML parsing", but `plistFacts` uses `<key>([^<]*)</key>` and `<string>([^<]*)</string>`.
A CDATA string or a numeric entity (`&#52;3AQ936H96`) evades both. The match is also case-sensitive on
`org.mozilla`. `RESTRICTED_KEYS` is a copy of the list in `mach_commands.py:732-738`, not derived at check time, so
an upstream addition to that list will not be noticed (a "derive from the tree" gap per CLAUDE.md).
`KNOWN_OPEN_HITS` is a justified, ledger-keyed exception, but duplicates of an excluded value collapse into one id.
**Fix:** parse with `plistlib` equivalent logic or an XML parser. Derive `RESTRICTED_KEYS` by reading the
`restricted_entitlements = [...]` literal from `mach_commands.py` and fail if it cannot be found.

### IN-02: the staged node binary is not covered by any entitlement or signing input

**File:** `scripts/verify-mac-entitlements.mjs:4-11` (scope), `package-macos.sh:73-80`
**Issue:** The gate derives from Gecko's `hardened-sign-config`, whose globs do not include
`Contents/Resources/node/bin/node` or the Theia natives. A hardened-runtime Node needs JIT-related entitlements and
a signature in the notarized bundle. Plan 55-03 may cover this, but the 55-01 `must_haves` present the gate as
covering "every signing input".
**Fix:** record in 55-03 that sidecar Mach-O files are signed with their own entitlement file, and extend the gate
to that file once it exists.

### IN-03: small defects in `package-macos.sh`

**File:** `powerbrowser/packaging/package-macos.sh:38, 42, 77`
**Issue:**
- `TMP_OUT` is never assigned. It is dead code in the ERR trap.
- If `python3` fails to read the pin (for example an arch key missing from `node-runtime.json`), `read` returns 1
  at EOF and `set -e` exits silently with no message. The Linux script has the same weakness.
- `"$LIPO" -archs ... || true` turns a missing `llvm-lipo` into the misleading message "not a single arm64 Mach-O
  (lipo reports 'nothing')".
**Fix:** `command -v "$LIPO" >/dev/null || fail "$LIPO not found; enter nix develop .#firefox-macos"`. Wrap the pin
read as `read ... < <(python3 ...) || fail "no usable $NODE_KEY pin in node-runtime.json"`. Delete `TMP_OUT`.

### IN-04: stale and loose claims in comments and tests

**File:** `powerbrowser/packaging/package-macos.sh:11`, `scripts/verify-generated-identity.mjs:4,13,19,44`, `scripts/generate.mjs:1532-1549`
**Issue:**
- The `package-macos.sh` header says the script "fails before anything is left behind when a pin, a Mach-O check or
  a checkout-path check fails". The ERR trap does not fire for `fail`, which calls `exit 1`. The Mach-O and
  checkout checks run after `$RES` was rewritten, so a failed run leaves a half-staged bundle (and, in the
  CR-02 case, a bundle containing the wrong or unrewritten payload) in the objdir. A later unify step that does not
  re-run staging would consume it.
- The `verify-generated-identity.mjs` header still says "thirty-three" and "thirty-six" files and "three declared
  exceptions", while the run now reports 39 files. This is stale prose, not a failing check.
- The `MACOS_FORBIDDEN_TRIPLE` and generic-certs guard in `emitMozconfigMacos` tests only constants it just
  emitted, and no self-test exercises it, so it cannot go red as written. The real protection is the byte-identity
  comparison against the tracked file.
**Fix:** run staging into a temp `Resources` copy and move it into place only after all checks pass. Update the
counts in the header. Drop the tautological guard or give it a planted-fault test.
