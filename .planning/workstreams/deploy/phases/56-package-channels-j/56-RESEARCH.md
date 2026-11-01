# Phase 56: Package channels (J) - Research

**Researched:** 2026-10-23
**Domain:** Out-of-tree package channels for a prebuilt Gecko tarball (Nix flake repack, Cachix/R2 binary cache, Flathub, winget, Homebrew tap), plus the per-release manifest automation
**Confidence:** HIGH for the Nix repack shape, the Flathub exception path, the winget credential answer and the Homebrew tap mechanics; MEDIUM for Cachix OSS eligibility under PolyForm Noncommercial (no published licence allow-list found — treated as not safely eligible)

## Summary

All four channels distribute the same Release tarball; none rebuilds the browser. The tree gains one flake package (`packages.x86_64-linux.powerbrowser` + `overlays.default`), one binary-cache configuration with two backends (Cachix first, R2 S3 fallback), four channel payloads (Flathub manifest, winget manifests, Homebrew cask, /download rows as pasted copy), and one per-release automation stage (DIST-12: bot PR with the flake hash, bot tap commit, `wingetcreate` submit, Flathub external-data-checker). Every channel payload derives version, URLs and hashes from the release key at generate/check time — no hand-kept version literal anywhere.

Three external answers are now settled as far as they can be without the owner:
- **winget credential (settled):** `wingetcreate` needs a classic PAT with `public_repo` on an account that owns the fork of microsoft/winget-pkgs; fine-grained PATs are unsupported and a GitHub App installation token cannot do it. This is against the Apps-only rule by necessity — record holder, environment and RENEWALS row.
- **Homebrew tap push (settled):** the own tap accepts a direct push from any token with contents:write, including the bot App token installed on the tap repo. No PAT needed there.
- **Cachix eligibility (open, owner probes):** the only published eligibility sentence is "free 5 GB limit for open source projects". No licence allow-list was found, so PolyForm Noncommercial must be assumed NOT safely covered — the R2 fallback is built in the same plan, not later.

The Flathub build-from-source rule applies to the tarball repack: the exception must be obtained in writing (linter-exception PR + reviewer discretion), otherwise the manifest builds from source. The plan implements the exception path and records the owner's written reply as the branch condition.

**Primary recommendation:** one channel per plan, each plan owning its payload, its verify row (+ self-test) and its DIST-12 automation leg, with a shared first plan for the flake package + policies-split row (every later channel depends on the tarball URL/hash derivation it establishes). The cache plan rides with the flake plan's wave. The owner checkpoint is one blocking-human plan at the end, not per channel.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release identity (key, URLs, hashes) | `configuration.toml` + `releaseIdentity()` | per-release bot PR fills hashes | PKG-19/DIST-12: derivation, never literals |
| Flake repack (fetchurl + autoPatchelf) | `nix/` flake package in tree | binary cache (substitute) | PKG-19/INF-05: build nothing, repack the tarball |
| Channel payloads (Flathub manifest, winget set, cask) | tracked generator inputs + emitted manifests | live store listings | PKG-20/DIST-04/DIST-11: payload derived, listing live |
| Per-release manifest updates | release-train stage (DIST-12) | bot App / wingetcreate / external-data-checker | DIST-12: no owner edit per release |
| Update disablement | repacked copies only (`DisableAppUpdate` merged) | release tarball stays clean (row asserts) | PKG-19/PKG-20: EXT-03 lives in policies.json |
| Drift detection | new quick rows + self-tests | later maintenance sweep (Phase 48/51) | static, offline, derive-and-compare |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding: Apps only (except the winget PAT, recorded as the exception), bot App without Workflows, one release per ESR point release plus out-of-band revision bumps.
- The release key is `v<ESR>-<revision>` (`releaseIdentity()`); every channel manifest derives from it — no hand-kept version literal.
- `DisableAppUpdate` is merged into repacked copies only, never the release tarball.

### Owner gates in this phase (stop points for autonomous execution)
- Every live external change is an owner action: Cachix licence request / R2 enablement, Flathub account + exception + submission PR, winget credential + PR, `_flathub` DNS TXT, tap repo/push, notarization (Phase 55), /download rows. Plans build locally and end with one `checkpoint:human-action`.
- Read-only `gh api` GETs are allowed.

### Assumptions about unfinished dependencies
- A1 Phase 50 tarball shape; A2 Phase 54 Windows asset; A3 Phase 55 notarization (darwin deferred); A4 Phase 47 site/DNS; A5 Phase 41 tap repo + Apps; A6 Phase 43/49 train wiring. See CONTEXT.md for the full text.

### Claude's Discretion
All other implementation choices are at Claude's discretion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-19 | Flake package repacks the Release tarball with `fetchurl` + autoPatchelf, floorp-bin style; `DisableAppUpdate` merged in the repack only; row asserts the release tarball's `policies.json` has no such key; sidecar on `pkgs.nodejs_24`; overlay output; x86_64-linux now, aarch64-darwin after signed DMG; /download Nix row when live | §Flake repack, §Policies split, §Validation |
| INF-05 | Binary cache serves the flake package; Cachix OSS licence first, R2 S3 fallback; clean-machine `nix build` substitutes; cache token has a `docs/RENEWALS.md` row | §Binary cache |
| PKG-20 | Flathub listing: manifest on `org.mozilla.firefox.BaseApp` (`--persist=.debios`, Flatpak-only `DisableAppUpdate`, external-data-checker), DNS TXT at `_flathub.powerbrowser.org`; written exception or from-source manifest; /download Flatpak row when live | §Flathub |
| DIST-04 | winget listing through `wingetcreate` | §winget |
| DIST-11 | Own Homebrew tap with `auto_updates true`; cask after notarization | §Homebrew |
| DIST-12 | Per release: train opens bot PR with flake hash (GH-05 forbids direct commit), bot App commits tap update, `wingetcreate` submits winget PR with the named credential, Flathub external-data-checker opens its own PR | §Per-release automation, §Validation |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS (quick rows after `zizmor-self-test`, full-tier rows after `repo-controls`). No sibling driver.
- **Self-test.** Every new check has a `--self-test` that plants faults, and each fault must go red naming the drift.
- **Derive and compare.** Derive the expectation from the tree at check time and compare as set equality, red on both addition and removal. Never hand-keep an expectation list.
- **Absence-of-log assertions.** Never assert the absence of a log line emitted by your own instrumentation.
- **Quick tier.** `--quick` rows use no build, no browser, no display and no network. Cache-substitution proofs and live listing reads are full-tier or owner-checkpoint evidence, never quick rows.
- **Residual-brand scan.** `node scripts/scan-brand-residue.mjs` must stay at exit 0. **Stage new files before trusting a green scan.** The originating product's name may appear only in `inventory/brand-tokens.json`. (`org.mozilla.firefox.BaseApp` names upstream Firefox, not the originating product — safe to write.)
- **Patches regenerated, never text-edited.** This phase touches no patch; if it did, only `scripts/regenerate-patches.sh` may change one.
- **Never edit `upstream/` or Theia core; never create or edit `scripts/verify-ng-NNN-*.mjs`; never write under `ledger/`.** The `workflows` row enforces set equality with `actions-selected.json`: extending `patterns_allowed` (Cachix push action) happens in the same commit as the workflow that uses it.
- **User-facing copy.** /download row copy names the product as "PowerBrowser", states the install in plain language, and carries no internal identifier (no pref key, no hash algorithm name as jargon, no raw error).
- **Plan gate.** `python3 scripts/plan-gate.py --root . --phase 56 --plans <dir> --stream deploy`. The v1.6 rows carry no `stream` field, so they count in every stream — every plan must cite its IDs.

## Flake repack (floorp-bin pattern)

Upstream tarball fetched with `fetchurl { url, hash }`; unpacked in `stdenv.mkDerivation` with no compile step. `nativeBuildInputs` carries `autoPatchelfHook` (rewrites ELF INTERP/RPATH against the Nix store) plus `makeWrapper`/`wrapGAppsHook` and `copyDesktopItems`. Gecko-binary `buildInputs` on x86_64-linux (per nixpkgs firefox `wrapper.nix`): gtk3, alsa-lib, libpulseaudio, X11/Xext/Xscrnsaver, libva, libgbm, cups, pciutils, vulkan-loader, udev, libnotify, libdbusmenu-gtk3, speechd-minimal, a versioned ffmpeg pin, libglvnd, adwaita-icon-theme, xdg-utils. `installPhase` unpacks to `$out/lib/<name>`, `wrapProgram`s the binaries (LD_LIBRARY_PATH, GDK, MOZ_* vars), and installs the desktop file + icons (reuse `generated/powerbrowser.desktop` or the release variant as the tracked source, never a hand-written copy).

Flake outputs that matter: `packages.x86_64-linux.powerbrowser` (plus `packages.<system>.default`) and `overlays.default` (`final: prev: { powerbrowser = final.callPackage ./pkg.nix {}; }`). Sketch: `packages.x86_64-linux.powerbrowser = pkgs.callPackage ./pkg.nix {}; overlays.default = final: prev: { powerbrowser = final.callPackage ./pkg.nix {}; };` helpers `fetchurl autoPatchelfHook makeWrapper copyDesktopItems`.

Direct `by-name/fl/floorp-bin/package.nix` raw URLs 404'd at fetch time; the shape above is firefox `wrapper.nix` + the standard bin-repack convention, which is exactly what SUMMARY's "floorp-bin template" points at.

Sources: https://raw.githubusercontent.com/NixOS/nixpkgs/master/pkgs/applications/networking/browsers/firefox/wrapper.nix · https://nixos.org/manual/nixpkgs/stable/#setup-hook-autopatchelfhook

## Policies split (DisableAppUpdate)

The release tarball's `powerbrowser/distribution/policies.json` stays clean (`DisableTelemetry`, `DisableFirefoxStudies`, empty `ExtensionSettings`, no update URL, no `DisableAppUpdate`). The Nix repack and the Flatpak merge `DisableAppUpdate` into their own copy only — EXT-03 lives in that file, so managed installs must not self-update outside the channel. Follow the generator's ExtensionSettings fragment rule (scripts/generate.mjs): set one key, leave every sibling byte-identical.

The check derives both sides at check time (release-tarball path vs repack path) and compares as set difference: red when the tarball gains the key and red when either repack loses it. That is one row (`policies-update-split`), not two.

## Binary cache (Cachix first, R2 fallback)

Cachix: sign up at app.cachix.org, create the cache, `cachix authtoken` (or `CACHIX_AUTH_TOKEN`), `cachix use <cache>` (writes `substituters` + netrc), push via `nix-build | cachix push <cache>` or the CI action (`cachix/install-nix-action` is already admitted in `actions-selected.json`; a distinct push action needs its own admission entry in the same commit). Eligibility: the only published sentence is "free 5 GB limit for open source projects" — no licence allow-list found, so PolyForm Noncommercial is assumed NOT safely covered and the paid-plan risk is recorded. The licence request email is an owner action at the checkpoint.

R2 fallback: S3-compatible binary cache. `substituters = https://<acct>.r2.cloudflarestorage.com/...` + `trusted-public-keys = <cache-name>:<base64-key>` in nix.conf; push with `nix copy --to 's3://<bucket>?endpoint=<r2-endpoint>&region=auto&profile=...'`; reads via the HTTPS binary-cache URL, not `s3://`. Both backends share one push/substitute interface so the train job flips by config, not by rewrite. The cache token (whichever backend goes live) gets a `docs/RENEWALS.md` row appended to the Phase 42-owned file — coordinate, do not fork the file.

Clean-machine proof (`nix build` substitutes from the cache) needs the live token and network: it is owner-checkpoint evidence, never a quick row.

Sources: https://www.cachix.org/pricing · https://docs.cachix.org/getting-started · https://docs.cachix.org/faq · https://www.cachix.org/terms · https://nix.dev/manual/nix/2.24/command-ref/new-cli/nix3-copy · https://nix.dev/manual/nix/2.24/store/types/s3-binary-cache-store · https://nix.dev/manual/nix/2.24/command-ref/conf-file

## Flathub

Default rule: submissions build entirely from source with no network access during the build; binary/precompiled files must not be in the PR; all deps are manifest `sources:` with public URLs. A prebuilt-tarball repack needs a case-by-case written exception: a linter-exception PR to flatpak-builder-lint `exceptions.json` (`"<app-id>": {"stable": {"linter-error": "reason"}}`) plus reviewer discretion for well-known vendors where offline source-build tooling is unavailable. The non-redistributable path (`type: extra-data`, download at install time) is NOT a convenience bypass for source builds. The plan implements the exception path and records the owner's written reply as the branch condition — never both half-built.

Manifest shape: runtime on the Firefox BaseApp ref (`org.mozilla.firefox.BaseApp`), `--persist=.debios`, `DisableAppUpdate` in the Flatpak copy of policies.json only, `x-checker-data` driving flathub-infra/flatpak-external-data-checker (global action ~every 2h on the default branch opens version-bump PRs; maintainer test-builds then merges). Verification: DNS TXT at `_flathub.powerbrowser.org` with the token value (one TXT per app), or the `.well-known/org.flathub.VerifiedApps.txt` file. App id and desktop/icon agreement derive from the tracked branding at check time. /download gains the Flatpak row when the channel is live (pasted copy, owner applies to the Phase 47 site).

Sources: https://docs.flathub.org/docs/for-app-authors/requirements · https://docs.flathub.org/docs/for-app-authors/submission · https://docs.flathub.org/docs/for-app-authors/verification · https://docs.flathub.org/docs/for-app-authors/maintenance · https://docs.flathub.org/docs/for-app-authors/linter · https://docs.flathub.org/docs/for-app-authors/runtimes · https://docs.flatpak.org/en/latest/module-sources.html · https://docs.flatpak.org/en/latest/dependencies.html · https://github.com/flathub-infra/flatpak-external-data-checker

## winget

Flow: `wingetcreate new` from scratch, then per release `update <PackageIdentifier> -u <urls> -v <version> -t <token> --submit` (recomputes InstallerUrl + Sha256 by downloading the installer; fills version; `--out` writes locally instead), or `submit --prtitle --token` for existing manifests. Destination is a PR from the caller's own fork to microsoft/winget-pkgs; installer nodes match by arch/type; version pinning via `PackageVersion` (+ DisplayVersion/ReleaseDate/ReleaseNotesUrl autofill from the GitHub release when a token is given).

Credential (settled, against Apps-only by necessity): a GitHub classic PAT with `public_repo` scope on the fork-owning account — fine-grained PATs unsupported, App installation tokens cannot own/push a fork or open the cross-repo PR as a user. Record the choice, its holder environment (`release`, as `WINGET_TOKEN`, per docs/RELEASING.md:539) and a RENEWALS row. Until the Phase 54 Windows asset exists, the manifest is built and statically checked against a fixture asset name.

Sources: https://github.com/microsoft/winget-create · https://raw.githubusercontent.com/microsoft/winget-create/main/doc/update.md · https://raw.githubusercontent.com/microsoft/winget-create/main/doc/submit.md · https://raw.githubusercontent.com/microsoft/winget-create/main/doc/token.md · https://github.com/microsoft/winget-pkgs

## Homebrew

Cask shape: `cask "<token>" do version; sha256; url ["verified:"]; name; desc; homepage; livecheck; auto_updates; depends_on; app/binary/pkg; uninstall; zap end` — at least one artifact required; `zap` (+ `livecheck`/`uninstall` where applicable) required. `auto_updates true` asserts an in-app self-updater; `url ... verified: "<host>"` constrains the host; the `livecheck` block drives version+sha256 PRs. Own tap = direct push/commit with any contents:write token, including the bot App token installed on the tap repo (no PAT needed). The cask follows notarization (Phase 55): official macOS casks must pass Gatekeeper on default macOS (Developer ID + notary ticket), enforced by `brew audit --new --cask --online`; until then the cask and its row are x86_64-linux-scoped fixtures with the darwin enablement deferred. The tap repo itself is a Phase 41 owner step (not yet done) — plans build against fixture installation state.

Sources: https://docs.brew.sh/Cask-Cookbook · https://docs.brew.sh/Acceptable-Casks · https://docs.brew.sh/Adding-Software-to-Homebrew · https://docs.brew.sh/Taps · https://docs.brew.sh/Homebrew-Security-and-Supply-Chain

## Per-release automation (DIST-12)

For each release the train: opens a bot PR to `main` carrying the flake hash update (GH-05 forbids a direct commit — the ruleset the Phase 41 row asserts); the bot App commits the tap update; `wingetcreate` submits the winget PR with the named credential; Flathub's external-data-checker opens its own PR. Each leg gets a static row (payload derivation + dry-run shape) and the live submission is the owner checkpoint. The jobs land in the release-train table owned by Phases 43/49 — plans add a channel-manifest stage behind the train's existing stage interface and map inputs (release key, tarball hashes, tap/winget/Flathub payloads) through it (assumption A6).

## Validation Architecture

Each plan owns its row pair (row + `--self-test`), one registry entry per row, faults planted in memory (or mkdtemp fixtures for file-emitting checks), each going red naming the file and value, with the unmodified tree green first:

- `flake-repack` (PKG-19): fetchurl URL/hash derive from the release key + published hashes; `nodejs_24`; overlay output; `DisableAppUpdate` present in the repack. Plants: hash disagreeing with the release asset, `nodejs_22`, missing overlay, missing `DisableAppUpdate` in repack.
- `policies-update-split` (PKG-19/PKG-20): tarball policies.json has no `DisableAppUpdate`; both repacks do; siblings byte-identical. Plants: key in tarball, key missing in either repack, sibling key drift.
- `binary-cache` (INF-05): substituters + trusted-public-keys derive from one tracked cache config; both backends share the interface; token RENEWALS row present. Plants: substituter/keys disagreement, missing backend block, missing RENEWALS row. The live substitute proof is checkpoint evidence, not a quick assertion.
- `flathub-manifest` (PKG-20): app id, BaseApp ref, `--persist=.debios`, Flatpak-only disable key, `x-checker-data`, TXT record value derived. Plants: wrong BaseApp, missing persist, missing disable key, missing checker data, TXT value mismatch.
- `winget-manifest` (DIST-04): identifier, versioned URL, sha256 derivation, PAT-custody record (holder + environment + RENEWALS row). Plants: version/URL disagreement, sha mismatch, missing custody record.
- `homebrew-cask` (DIST-11): token, version/sha derivation, `auto_updates true`, verified host, livecheck, notarization deferral marker. Plants: `auto_updates` false/missing, unverified host drift, version/sha disagreement, premature darwin enablement.
- `channel-release-jobs` (DIST-12): bot-PR payload (flake hash diff against the release asset), tap-commit payload, wingetcreate submit shape, checker-data freshness; GH-05 no-direct-commit assertion. Plants: hash not derived, direct-commit path, missing leg, stale checker data.

Live listings (Flathub/winget/tap), the DNS TXT, the clean-machine substitute run and the /download rows are owner-checkpoint evidence with verbatim outputs pasted into the SUMMARY — never quick-row assertions (network, accounts, and a site outside this tree).

## Open Questions

1. ~~Whether the J flake follows the floorp-bin template~~ — answered: yes, `fetchurl` + `autoPatchelfHook` repack, no compile (SUMMARY + firefox `wrapper.nix` confirm the helper set).
2. ~~winget credential shape~~ — answered: classic PAT `public_repo` on the fork owner; App token impossible. Record as the Apps-only exception.
3. ~~Homebrew tap push credential~~ — answered: bot App token suffices on the own tap.
4. **Cachix OSS eligibility under PolyForm Noncommercial** — open: no published allow-list; owner sends the licence email and records the reply. R2 fallback is built regardless.
5. **Flathub build-from-source exception** — open: owner requests in writing and records the reply; otherwise the manifest builds from source (follow-up scope, not this phase).

## RESEARCH COMPLETE
