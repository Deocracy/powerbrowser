# Phase 45: Portable Linux release build (C) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The release build produces a Linux tarball and complete MAR that run on mainstream Linux with no Nix installed, and the packaged app keeps its state in the profile.

Requirements: PKG-17, PKG-22, PKG-18, PKG-23, PKG-04, PKG-05, PKG-06, PKG-07, PKG-21, UPD-29 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; non-ephemeral legion runner later (Phase 49); one release per ESR point release.
- Safe Browsing (decision 7): obtain an API key; keyfile outside the repo; RENEWALS row; live list-update check. The keyfile is stored on legion.
- Toolchain baseline (decision 19): `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain.

### Owner gates in this phase (stop points for autonomous execution)
- Obtaining the Google Safe Browsing API key and storing the keyfile on legion (path outside the repo) are owner actions. The research flag C open item (whether the jessie-built `signmar` runs on `ubuntu-latest`, what `toolchain-baseline.txt` means under a container build) is answered by research reading the tree, not by running the container build — no legion podman run happens during planning.
- The container bootstrap build itself (PKG-17, the longest single item) executes in Phase 49's legion `build-linux` job or as an owner/local run; Phase 45 plans prepare the Containerfile, the release `.mozconfig` variant, the staging changes and every registry row, and end with the exact local/legion build commands rather than invoking podman here. The full-tier rows that need the container-built tarball are staged locally and proven against it when the build exists.
- Read-only `gh api` calls are allowed for research.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §3.2 (PowerBrowserAPI boundary: TheiaService `_resolveConfigDir` at `powerbrowser/shell/TheiaService.sys.mjs:522-527` → PKG-06 moves state under the profile), §3.6 (packaging: `package-linux.sh:45-63` sidecar staging, PKG-18 assertion, the build job adds `make_full_update.sh` and `release-manifest.json`), §8 (PKG-18 resolved: the 2026-10-17 tarball holds 0 symlinks; PKG-21 partly resolved: tarball 129,529,524 bytes, expect ~130 MB complete MAR), `STACK.md` rows 19/22/78 (Debian bookworm container, `--enable-bootstrap` fetching clang/rust/cbindgen plus the jessie sysroot glibc 2.19; container-built `signmar` with Ubuntu `libnss3-tools`; release `.mozconfig` variant from the generator), `PITFALLS.md` (drivelist.node RUNPATH row: strip with `patchelf --remove-rpath` at staging; MAR product-info channel must equal `ACCEPTED_MAR_CHANNEL_IDS` before `signmar -s`), `powerbrowser/packaging/package-linux.sh` (the staging script this phase extends: RUNPATH strip at the natives loop, M-6 checkout-path assertion, precomplete refresh), and `scripts/verify-platform.sh` (`portable-elf`/`sidecar-no-symlinks`/`package-target-natives` are new full-tier rows with `--self-test` plants; quick means no build/browser/display/network).

</code_context>

<specifics>
## Specific Ideas

- Research flag C (PKG-17): the first container bootstrap build; whether the jessie-built `signmar` runs on `ubuntu-latest`; what `toolchain-baseline.txt` means under a container build (SUMMARY gap 6 / decision 19: it pins the release container's Mozilla bootstrap toolchain, and `toolchain-baseline.sh` output drifts fail the build).
- SUMMARY phase C order: PKG-06 first (blocks the matrix rows), then the PKG-17 container build (longest single item — start the rebuild early), PKG-18 as assertion only, the RUNPATH strip, PKG-04/05/07, PKG-21 measure, and the `package-target-natives` row.
- UPD-29: keyfile outside the repo mounted into the container build; a `docs/RENEWALS.md` row for the key (note: `docs/RENEWALS.md` does not exist yet — Phase 40 DOC scope created it or it lands here per DOC-04); a live check shows the Safe Browsing lists updating.
- PKG-21: measure the complete MAR size, state it for /download (WEB-02), record the partial-MAR decision (complete MARs only unless too large for a two-week cadence).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
