---
phase: 54-windows-h
plan: 11
gap_closure: true
gap: G-54b (unsigned Windows publish path; owner answer A2, 2026-11-04)
status: complete
requirements: [DIST-10, SEC-03]
key-files:
  modified:
    - .github/workflows/release.yml
    - scripts/verify-release-asset-set.mjs
    - scripts/verify-channel-live.mjs
    - scripts/build-update-xml.mjs
    - scripts/verify-win-sign-chain.mjs
    - scripts/verify-build-windows-shape.mjs
    - scripts/verify-release-shape.mjs
    - scripts/verify-release-symbols.mjs
    - scripts/verify-platform.sh
    - docs/RELEASING.md
commits: [2e2e1852, d550a972]
---

# 54-11 summary: Windows publishes to the MAR origin after the Linux publish

## What was built

- **`build-windows`** now also uploads `release-windows-identity`: `config.status` and `dist/bin/application.ini`,
  retention 7 days, because descriptor-windows reads it after the 1440-minute descriptor wait.
- **`publish-windows`** needs `build-windows` and `sign-publish`, and uses environment `release`. It runs these steps:
  - the ref, SHA and main-ancestry gates;
  - the tree-derived key, and a check that the latest published Release is this run's tag;
  - admission of the unsigned installer and the MAR against the base name that `win-sign-list.mjs --expected-base`
    derives;
  - signmar built from the pinned source, the Windows MAR channel gate, then MAR signing;
  - `signmar -v` and `verify-mar-signature.mjs` against the tracked DER;
  - assembly under the `--expected-windows` names, with a Windows `SHA256SUMS`;
  - a write-once `r2_copy` to `<mar_origin>/<tag>/<asset>`: read before the put, overwrite refused, read back and
    compared by sha512.

  The job holds `contents: read` only. It makes no `gh release` call.
- **`descriptor-windows`** uses environment `descriptor`. It runs these steps:
  - downloads the signed MAR from the MAR origin;
  - `build-update-xml.mjs --emit --manifest-out`, then `--check`;
  - the `--form-only` patch-URL gate;
  - uploads `release-windows-manifest`;
  - mints the updates-repo token and commits `<channel>/WINNT_x86_64-msvc/update.xml`.

  The commit step refuses a buildID that is not newer than the committed Windows descriptor. A no-update document
  carries no buildID, so a build after a withdraw is allowed. `descriptor-monotonic` is not used here because the
  Releases carry only the Linux manifest, so it has nothing to order a Windows build against.
- **`channel-live-windows`** has `contents: read`, no environment and no secret. It runs `--manifest-agrees`, then
  `verify-channel-live.mjs` with the Windows manifest, with 10 attempts 60 seconds apart.
- **Asset names**: the `docs/RELEASING.md` table has a `windows-x86_64` row:
  `powerbrowser-<version>.windows-x86_64.installer.exe`, `.complete.mar`, and `SHA256SUMS`.

## Checks (derived from the tree, each with planted faults)

- **`release-asset-set`**:
  - The Windows Target key must equal `WINDOWS_TOKEN`.
  - `publish-windows` must need `build-windows` and `sign-publish`, assemble by `--expected-windows`, and copy
    write-once. The rule body is shared with `sign-publish`'s `r2_copy`.
  - A Cloudflare credential is admitted only in those two `r2_copy` steps.
  - No `*-windows` job may call `gh release create`, `upload`, `edit` or `delete`.
  - Ten new plants; the self-test has 37 in total.
- **`channel-live`**: the MAR asset name is derived per BUILD_TARGET. A WINNT target uses `WINDOWS_TOKEN`, as the
  emitter does. The new Windows control is green on the Windows name and red on the Linux name.
- **`build-update-xml`**: the `--manifest-out` control passes channel-live's own field rules. An ini with no
  `[AppUpdate]` URL is refused, and the refusal names `update_url`.
- **`win-sign-chain` self-test**:
  - The three real Windows jobs must exist.
  - `sign-publish`, `descriptor` and `channel-live` each waiting on one of them is red.
  - If `descriptor-windows` moves no windows-named artifact, the row classifies it as a Linux job, so it is red too.
  - 46 plants in total.
- **`build-windows-shape`**: exactly the identity upload is exempt from the release-bytes path rule and the
  retention-1 rule. `release-shape` still judges its retention against the descriptor wait. A new plant puts a MAR in
  the identity upload, and it goes red.
- **`release-shape` and `release-symbols` self-tests**: the plant anchors are scoped to `sign-publish`, or replace
  every occurrence. Before this, `publish-windows` repeated the gate text and absorbed the plants.

## Verification

- `scripts/verify-platform.sh --quick` is green. The only red is `fixer-isolate-self-test`, the known sandbox red.
  zizmor is green over the new jobs.
- The full-tier `win-sign-chain` row is red here only because `https://powerbrowser.org/download.html` cannot be
  fetched from the sandbox. Its workflow half is proven by the self-test control over the real workflow.
- No job has run. The live Windows publish is part of the 54-04 owner checkpoint.

## Open (follow-ups)

- The winget leg (Phase 56: `winget/*.installer.yaml`, `scripts/verify-winget-manifest.mjs`,
  `scripts/lib/channel-identity.mjs`) still points `InstallerUrl` at `github.com/.../releases/download/<key>/` and names
  the installer `<app>-<version>.windows-x86_64.exe`. Under A2 it must point at
  `downloads.powerbrowser.org/<tag>/<app>-<version>.windows-x86_64.installer.exe`.
  The `verify-assets` winget leg of `.github/workflows/channel-manifests.yml` also downloads, attests and sums the
  installer from the Release. Recorded as Phase 56 BLOCKED.md item 17 and in HANDOFF.md (54-11 review).
- `website-staging/download.html` still says no Windows build is published. That is true until the first run. After
  that run, the page must link the MAR-origin files and the Windows `SHA256SUMS`.
- The daily sweep runs `channel-live` with the Release manifest only, which is Linux. The Windows channel is checked
  only in the release run.
- When Azure signing is configured later (SEC-12, out of scope for v1.6), `publish-windows` must take the
  `sign-windows` output instead of the unsigned installer.
