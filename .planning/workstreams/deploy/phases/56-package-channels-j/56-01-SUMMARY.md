---
phase: 56-package-channels-j
plan: 01
subsystem: packaging
status: complete
tags: [nix, flake, flatpak, repack, policies, PKG-19, PKG-20]

requires:
  - phase: 49-release-pipeline-and-legion-runner-e
    provides: the release-asset-set derivation and the tree-derived asset names release.yml attaches
  - phase: 50-release-train-stages-and-first-public-linux-release-e
    provides: the published tarball shape (not yet published; assumption A1 applies)
provides:
  - packages.x86_64-linux.powerbrowser, packages.x86_64-linux.default and overlays.default (flake)
  - nix/pkg/powerbrowser-bin.nix, the fetchurl + autoPatchelfHook repack with the repack-only DisableAppUpdate merge
  - nix/pkg/release-hash.json, the per-release hash record the DIST-12 bot PR fills (sentinel until then)
  - flatpak/org.debios.PowerBrowser.json, the x86_64 repack manifest with release tokens and x-checker-data
  - docs/download-nix.md, the paste-ready Nix /download copy
  - scripts/lib/channel-identity.mjs, the shared release-contract derivation for every Phase 56 row
  - rows flake-repack, flake-repack-self-test, policies-update-split, policies-update-split-self-test
affects: [56-02, 56-03, 56-04, 56-05]

actuals:
  tokens: 12677      # chars/4 over the plan's realized diff (git diff c755d408..HEAD, 50708 bytes)
  tasks: 3
  commits: 4        # MEASURED: git rev-list --count c755d408..HEAD
plan_head_before: c755d408410863e98ad853188d37b2e4dddba119
plan_head_after: b5b33819be6d3738f280156c2c8e17aadc82194f

key-files:
  created:
    - nix/pkg/powerbrowser-bin.nix
    - nix/pkg/release-hash.json
    - scripts/lib/channel-identity.mjs
    - scripts/verify-flake-repack.mjs
    - scripts/verify-policies-update-split.mjs
    - flatpak/org.debios.PowerBrowser.json
    - flatpak/org.debios.PowerBrowser.desktop
    - flatpak/org.debios.PowerBrowser.png
    - docs/download-nix.md
  modified:
    - flake.nix
    - scripts/verify-platform.sh

key-decisions:
  - "Asset name follows the tree's release-asset-set grammar, powerbrowser-<version>.linux-x86_64.tar.xz under /releases/download/v<key>/. Plan assumption A1 (en-US token kept) is superseded: scripts/verify-release-asset-set.mjs derives the name without the locale token, and phase 49 BLOCKED item 4 records the same."
  - "The release hash lives in one tracked record, nix/pkg/release-hash.json. The Flatpak manifest carries @RELEASE_URL@ and @RELEASE_SHA256@ tokens, which the release renders. Every row compares the manifest with the derived values, so no second literal can drift."
  - "The hash is a sentinel SRI (decodes to PLACEHOLDER-DIST12-BOT-PR-FILLME), never a real digest for a release that does not exist. The quick row is green with it; --release refuses it."
  - "The repack reads the release key from powerbrowser/packaging/version/release.txt (the generator output) and the app name and repo from configuration.toml via builtins.fromTOML, so the derivation carries no version literal."
  - "generated/ is gitignored, so the plan's tracked generated/powerbrowser-release.desktop does not exist in git. The tracked comparand is powerbrowser/powerbrowser-release.desktop; the derivation rewrites its Exec and Icon and fails closed if the rewrite does not apply."
  - "PolyForm Noncommercial is unfree to nixpkgs. The package's own nixpkgs import allows only the name powerbrowser; devShells keep the plain pkgs. A consumer's overlay use needs its own allowance, recorded in the flake comment."
  - "The /download Nix copy carries @RELEASE_REPO@ rather than the owner slug. The residual-brand scan treats the owner slug as an originating-product identifier, and the inventory forbids new expected files in this plan."
  - "The Flatpak manifest's policies merge is a python assignment in build-commands; the policies row applies it in memory to the tarball copy, the same way as the Nix jq merge."

patterns-established:
  - "Derive-and-compare rows read the tree through an injectable read(rel); each plant is applied in memory to one file and must go red naming the file or value."
  - "Placeholders are sentinels that decode to readable text, refused by a --release mode, and listed as Known Stubs."

requirements-completed: [PKG-19, PKG-20]

coverage:
  - id: D1
    description: "flake package repacks the Release tarball via fetchurl and autoPatchelfHook, sidecar on the nodejs_24 binding, x86_64-linux only"
    requirement: "PKG-19"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only flake-repack (PASS); nix flake check --no-build --no-write-lock-file (all checks passed)"
        status: pass
  - id: D2
    description: "flake-repack self-test plants stale hash, non-SRI hash, placeholder under --release, nodejs_22, darwin literal, typed version, missing merge, missing overlay, Flatpak URL, Flatpak hash, missing x-checker-data, Nix copy leaks"
    requirement: "PKG-19"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only flake-repack-self-test (PASS, 13 red, 2 green)"
        status: pass
  - id: D3
    description: "DisableAppUpdate exists only in the repacked copies; the tarball policies.json stays clean; siblings byte-identical"
    requirement: "PKG-19"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only policies-update-split and policies-update-split-self-test (PASS)"
        status: pass
  - id: D4
    description: "Flatpak manifest on the Firefox BaseApp ref with --persist=.debios and x-checker-data, URL and hash tokens rendered from the release"
    requirement: "PKG-20"
    verification:
      - kind: automated
        ref: "scripts/verify-flake-repack.mjs section 6 and the flake-repack-self-test Flatpak plants"
        status: pass
---

# Phase 56 Plan 01: Flake package and update-disable split Summary

**The flake package repacks the Release tarball with fetchurl and autoPatchelfHook, and DisableAppUpdate lives only in the repacked copies, proven by two derive-and-compare rows.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** 4 (cdc6e889, 1f37509e, 490b6935, b5b33819)
- **Flake check:** `nix flake check --no-build --no-write-lock-file` passes; `flake.lock` unchanged.
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0 (baseline before this plan also exit 0).

## Accomplishments

- `nix/pkg/powerbrowser-bin.nix` derives the release key, tarball name and URL from `configuration.toml` and `powerbrowser/packaging/version/release.txt`. It fetches the tarball, unpacks it to `$out/lib/powerbrowser`, merges `DisableAppUpdate` into its own policies copy with `jq`, wraps the launcher on the `nodejs_24` binding, and installs the desktop entry and icons. It builds nothing and is x86_64-linux only.
- `flake.nix` gains `packages.${system}.powerbrowser`, `packages.${system}.default` and `overlays.default`. The devShells block is untouched: the diff has 18 added lines and 0 removed.
- The Flatpak manifest uses the `org.mozilla.firefox.BaseApp` runtime with `--persist=.debios`. Its archive source carries `@RELEASE_URL@` and `@RELEASE_SHA256@` tokens and `x-checker-data` with a URL template. The flake-repack row checks any literal URL or hash against the derived values.
- `scripts/verify-policies-update-split.mjs` applies each repack's merge in memory and compares the result with the tarball copy. It is red on the key in the tarball, on the key missing from either repack, and on a sibling drift in either repack.
- `docs/download-nix.md` is the paste-ready Nix copy.

## Flake show evidence

```
packages
  x86_64-linux
    default: package 'powerbrowser-153.5.1-1'
    powerbrowser: package 'powerbrowser-153.5.1-1'
overlays
  default: Nixpkgs overlay
```

`nix eval .#packages.x86_64-linux.powerbrowser.drvPath` returns `/nix/store/x6q05q2lhvzmdn2alni6z5rp5b6spl9q-powerbrowser-153.5.1-1.drv`, and `meta.platforms` is `["x86_64-linux"]`.

## Green row runs

- `flake-repack`: PASS in quick mode. The v153.5.1-1 hash is the placeholder. `--release` refuses it, as designed.
- `flake-repack-self-test`: PASS, 13 planted faults red naming the file or value, 2 controls green.
- `policies-update-split`: PASS.
- `policies-update-split-self-test`: PASS, 5 planted drifts red, 1 control green.
- `scripts/generate.mjs --check`: PASS, 68 generated files match.
- `scan-brand-residue`: PASS after the release-repo token fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asset name without the en-US token**
- **Found during:** Task 1
- **Issue:** Assumption A1 expects `powerbrowser-<esrVersion>.en-US.linux-x86_64.tar.xz`. The tree's release-asset-set derivation (`scripts/verify-release-asset-set.mjs`) and the phase 49 BLOCKED item 4 both drop the locale token and name the asset `<app>-<key minus v>.linux-x86_64.tar.xz`.
- **Fix:** The derivation and the shared helper follow the tree. The flake-repack row checks the token equals the asset table.
- **Files:** nix/pkg/powerbrowser-bin.nix, scripts/lib/channel-identity.mjs
- **Commit:** cdc6e889

**2. [Rule 3 - Blocking] generated/ is not tracked**
- **Found during:** Task 1 (nix eval failed: "not tracked by Git")
- **Issue:** `.gitignore` covers `/generated/`, so the plan's `generated/powerbrowser-release.desktop` is not an input a flake can read.
- **Fix:** The derivation installs the tracked comparand `powerbrowser/powerbrowser-release.desktop` and rewrites its Exec and Icon in place.
- **Commit:** cdc6e889

**3. [Rule 3 - Blocking] Unfree license blocks evaluation**
- **Found during:** Task 1 (nix eval refused the derivation as unfree)
- **Issue:** PolyForm Noncommercial is not free software, and nixpkgs refuses to evaluate it without an allowance.
- **Fix:** The package's own `pkgsPowerBrowser` import allows only the name `powerbrowser`. The devShells keep `pkgs`.
- **Commit:** cdc6e889

**4. [Rule 1 - Bug] Owner slug in the /download copy**
- **Found during:** --quick gate after Task 3
- **Issue:** `docs/download-nix.md` named the release owner literally. The residual-brand scan classes that slug as an originating-product identifier and it is not in the new file's expected list. The scan went red.
- **Fix:** The copy carries `@RELEASE_REPO@`. The owner renders it at paste time (see BLOCKED.md). The row asserts the token and checks for internal identifiers and version literals.
- **Commits:** b5b33819

### Order change

The Flatpak manifest body was committed with Task 2 rather than Task 3. The policies row reads the manifest's merge, so the row could not be green without it. Task 3 adds the URL, hash and checker assertions and the download copy.

## Known Stubs

| Stub | File | Why it stays |
| --- | --- | --- |
| Release hash is the sentinel `PLACEHOLDER-DIST12-BOT-PR-FILLME` | nix/pkg/release-hash.json | No release has been published. The DIST-12 bot PR (plan 56-04 leg 1) writes the real SRI hash. `flake-repack --release` refuses it until then. |
| Flatpak `@RELEASE_URL@`, `@RELEASE_SHA256@`, `@RELEASE_REPO@`, `@RELEASE_URL_TEMPLATE@` tokens | flatpak/org.debios.PowerBrowser.json | Rendered at submission and by external-data-checker in Flathub's repo. The submission is an owner step (BLOCKED.md). |
| `@RELEASE_REPO@` in the Nix copy | docs/download-nix.md | The owner renders it when pasting into the Phase 47 site, because the site lives outside this tree. |

## Threat Flags

None. The derivation fetches one URL built from the release key and the hash record. It writes only under `$out`.

## Unverified offline

- The Flatpak runtime-version `stable` on `org.mozilla.firefox.BaseApp` and the `sdk` pairing. Owner check: `flatpak-builder --show-manifest` or a flatpak-builder dry run at the checkpoint.
- The external-data-checker `json` type with `url-template`. The owner's flatpak-external-data-checker dry run confirms it.
- `ruby -c` is not runnable on this host (no ruby). Plan 56-03 uses the Ruby check; the row uses a structural check instead, and the owner runs `ruby -c` at the checkpoint.

## Self-Check

- [x] `packages.x86_64-linux.powerbrowser` evaluates (`nix flake check` passed).
- [x] `flake.lock` unchanged (`git diff --quiet HEAD -- flake.lock`).
- [x] devShells block byte-identical (flake diff: 0 removed lines).
- [x] `--quick` exit 0 after the final commit (verify-platform: PASS -- all checks passed).
- [x] Each commit uses explicit paths and the attribution line.

## Self-Check: PASSED
