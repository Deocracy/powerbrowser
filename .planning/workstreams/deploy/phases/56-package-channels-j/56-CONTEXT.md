# Phase 56: Package channels (J) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Users install and update PowerBrowser through Nix, Flathub, winget and Homebrew, and each channel's manifest follows every release without an owner edit.

Requirements: PKG-19, INF-05, PKG-20, DIST-04, DIST-11, DIST-12 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Owner decision 22 (REQUIREMENTS.md "Owner Decisions") explicitly kept Cachix (INF-05) and Flathub (PKG-20, with the exception or a from-source manifest). The older research SUMMARY's proposal to defer both is superseded: all six IDs are in scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; one release per ESR point release plus out-of-band revision bumps.
- The release key is `v<ESR>-<revision>` from `configuration.toml` (`releaseIdentity()` in `scripts/generate.mjs`); today `v153.5.1-1`. Every channel manifest derives names, versions and URLs from it at check/generate time — no hand-kept version literal in any manifest, script or row.
- `powerbrowser/distribution/policies.json` carries no update URL (UPD-12) and no `DisableAppUpdate` today (`DisableTelemetry`, `DisableFirefoxStudies`, empty `ExtensionSettings`). `DisableAppUpdate` is merged into the repacked copies only (Nix repack, Flatpak) — never into the release tarball.

### Owner gates in this phase (stop points for autonomous execution)
- Every change to a LIVE external account or store is an owner action: the Cachix open-source licence request (or the R2 fallback enablement, which may need a payment method on file); the Flathub account, the build-from-source exception request in writing, and the Flathub submission PR under the owner's identity; the winget submission credential decision (likely a PAT on a fork-owning account, against the Apps-only rule — record the holder and a RENEWALS row) and the winget PR; the `_flathub.powerbrowser.org` DNS TXT record; the Homebrew tap repo creation (a Phase 41 owner step, not yet done) and any tap push; Apple notarization (Phase 55) for the cask and aarch64-darwin; the `/download` Nix and Flatpak rows (the site repository is Phase 47 work, outside this tree).
- Plans build everything locally — the flake package, the cache configuration with both backends, the four channel manifests/stages, every verify row with its self-test, the per-release bot-PR automation behind flake-hash derivation — and end with one `checkpoint:human-action` listing the exact owner commands, after which the live listings are submitted.
- Read-only `gh api` GETs against the live org/repo are allowed for research and for read-back rows.

### Assumptions about unfinished dependencies (recorded, not resolved)
- **A1 — Phase 50 tarball shape.** The flake `fetchurl` URL and every manifest download URL assume the Release tarball keeps the observed shape `powerbrowser-<esrVersion>.en-US.linux-x86_64.tar.xz` under `/releases/download/<releaseKey>/` (docs/RELEASING.md:666,704). Exact URLs and hashes resolve per release through the DIST-12 bot PR, so a rename in Phase 50 changes PR content, not plan structure. If Phase 50 renames the artifact, the flake-hash derivation and the manifest emitters follow it.
- **A2 — Phase 54 Windows asset.** The winget manifest references the Windows installer asset by versioned URL; until Phase 54 ships, the manifest is built and statically checked against a fixture asset name and goes live with the first Windows release.
- **A3 — Phase 55 notarization.** The Homebrew cask and the flake's `aarch64-darwin` coverage wait on the notarized DMG. Until then the flake package, the cask and all rows are `x86_64-linux`-only (cask `depends_on` macOS holds installation, not notarization claims), with the darwin enablement recorded as a deferred row naming this assumption.
- **A4 — Phase 47 site and DNS.** The `_flathub` TXT verification and the `/download` Nix/Flatpak rows need the Cloudflare DNS and the site repository. Plans specify the exact record value and the exact row copy as tracked text the owner pastes; no plan edits the site (it lives outside this tree).
- **A5 — Phase 41 tap repo and Apps.** The bot App committing the tap update and the GH-05 ruleset forbidding a direct flake-hash commit to `main` both need the tap repo and both Apps installed (Phase 41 owner checkpoint, not yet done). Plans implement the bot-PR path and the tap-commit path against fixture installation state.
- **A6 — Phase 43/49 train wiring.** DIST-12's per-release jobs land in the release-train job table owned by Phases 43/49. Plans add a channel-manifest stage with derived inputs (release key, tarball hashes, tap/winget/Flathub payloads) behind the train's existing stage interface; if the train table shape differs when Phase 49 lands, the stage's input mapping follows it.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` and `SUMMARY.md` Phase J (floorp-bin flake pattern; `DisableAppUpdate` merged into the existing policies.json in the repack only), plus these tree facts:

- `flake.nix` today exports only `devShells.x86_64-linux` (`theia`, `firefox`); there is no `packages` output. The pinned sidecar Node is `pkgs.nodejs_24` (flake.nix:21) — the flake package's sidecar must use the same.
- Release identity: `releaseIdentity()` in `scripts/generate.mjs` (~line 2796) derives `{ esrVersion, revision, releaseKey }` from `[upstreams] firefox_esr_tag` (`FIREFOX_153_5_1esr_RELEASE`, configuration.toml:125) and `[product] revision`. Version files `powerbrowser/packaging/version/version.txt` (`153.5.1`) and `release.txt` (`v153.5.1-1`) are emitted; the `release-identity` row (`scripts/verify-release-identity.mjs`) asserts every tracked descriptor and tag agrees.
- `powerbrowser/distribution/policies.json` is the tracked comparand the PKG-19 row asserts `DisableAppUpdate`-free. The generator's ExtensionSettings fragment comment (scripts/generate.mjs ~line 1992) documents the copy-over rule: fragments set one key, siblings stay byte-identical — follow the same rule when merging `DisableAppUpdate` in the repack.
- Registry insertion points in `scripts/verify-platform.sh`: quick rows append inside the `CHECKS=(` array after `zizmor-self-test` (~line 4730); full-tier rows append in the `CHECKS+=(` block after `repo-controls` (~line 5092). One row per check plus its `--self-test` row, exactly like Phase 41's `repo-controls(-self-test)` / `workflows(-self-test)` / `zizmor(-self-test)` pairs.
- `.github/settings/actions-selected.json` admits only `cachix/install-nix-action@*` beyond github-owned. The `workflows` row enforces set equality between `uses:` and the admission list: any new third-party action a plan's workflow job uses (Cachix push, wingetcreate/komac-style tooling, Flatpak builders) must extend `patterns_allowed` in the same commit.
- `docs/RELEASING.md` prior art: the `listings-and-cadence` operator/gate rows (~lines 218-220, 240), the `WINGET_TOKEN` fork-scoped PAT custody row (~line 539), the `listing-manifests` row contract (~line 851), and the deferred-signing-items table shape. Keep row names distinct from these (`listing-manifests` belongs to the older wave-e plan, not this phase).
- `inventory/brand-tokens.json` is the only file that may name the originating product. The Flatpak runtime ref `org.mozilla.firefox.BaseApp` names upstream Firefox, which is not the originating product token — it is safe to write.

</code>

<specifics>
## Specific Ideas

- Flake package (PKG-19): `stdenv.mkDerivation` repack of the Release tarball via `fetchurl` (URL + hash filled per release by the DIST-12 bot PR, derived from the release key — never a literal refreshed by hand), `autoPatchelfHook`, sidecar on `pkgs.nodejs_24`, an `overlay` output, `meta` with homepage/license. `x86_64-linux` now; `aarch64-darwin` gated on A3.
- Policies split: the repack merges `DisableAppUpdate` into the existing policies.json (EXT-03 lives in that file) while the row asserts the release tarball's copy has no such key — derive both sides at check time (repack path vs release tarball path), compare as set difference, red on either direction of drift.
- Cache (INF-05): Cachix cache configured first; R2 S3-compatible cache as the committed fallback with the same push/substitute interface; the cache token gets a `docs/RENEWALS.md` row; the clean-machine proof is `nix build` substituting (owner runs it with the live token at the checkpoint; plans prove the config offline against fixtures).
- Flathub (PKG-20): manifest on the Firefox BaseApp with `--persist=.debios`, `DisableAppUpdate` in the Flatpak only, `x-checker-data` (external-data-checker) for the per-release PR, DNS TXT at `_flathub.powerbrowser.org`. Either the written build-from-source exception or a from-source manifest — the plan implements one path and records the owner's written reply as the branch condition, never both half-built.
- winget (DIST-04) + tap (DIST-11): versioned manifests with `auto_updates true` on the cask; the winget identifier and the tap formulae derive version/sha from the release key and the published hashes. Credential decision recorded with holder + RENEWALS row per the External Gates table.
- Per-release automation (DIST-12): the train opens a bot PR to `main` carrying the flake hash update (GH-05 forbids direct commit), the bot App commits the tap update, `wingetcreate` submits the winget PR with the named credential, Flathub's external-data-checker opens its own PR. Each leg has a static row (payload derivation + dry-run) and the live submission is the owner checkpoint.
- Every new row: one registry entry + a `--self-test` that plants each fault and goes red naming the drift; expectations derived from the tree at check time and compared as set equality (red on addition and removal).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
