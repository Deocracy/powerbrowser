---
phase: 54-windows-h
plan: 05
gap_closure: true
gap: G-54a (windows-latest sidecar job and the PB_WIN_SIDECAR_SUMS_SHA256 digest, BLOCKED.md item 8)
status: complete
requirements: [PKG-10, PKG-13]
key-files:
  modified:
    - .github/workflows/release.yml
    - powerbrowser/packaging/package-windows.sh
    - scripts/verify-build-windows-shape.mjs
    - scripts/verify-platform.sh
    - docs/RELEASING.md
    - .planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md
commits: [7ffc76ff, 8ca29b57]
---

# 54-05 summary: hosted windows-sidecar job feeds build-windows

- `.github/workflows/release.yml`, new job `windows-sidecar`:
  - Runner and permissions: `windows-latest`, `contents: read`, no environment, no secret, no needs, `shell: bash`.
  - Gates and checkout: ref and event refusal, then the full-SHA check, then a pinned checkout of `inputs.sha`.
  - Toolchain: Node at the `win32-x64` version read from `node-runtime.json`, through the pinned `setup-node`. The
    image's yarn must be exactly 1.22.22, which is also the nixpkgs yarn. zizmor `adhoc-packages` refused
    `npm install -g yarn`, so nothing is installed outside a lockfile.
  - Build: the same commands `build-linux` runs, without the nix shell. `drivelist` is compiled with the
    lockfile's node-gyp.
  - Stage: the `package-linux.sh` layout (`lib/` without maps, `package.json`, `plugins/`, and better-sqlite3's
    `lib/`, `package.json` and `prebuilds/win32-x64.node`). The `node-file:` keys are rewritten, `BUILD_ROOT` holds
    `$GITHUB_WORKSPACE`, and `SHA256SUMS` covers every other file.
  - Admission: `check-win-sidecar.sh check` and `purge` run over its own output. The SHA-256 of `SHA256SUMS` becomes
    the job output `sums_sha256`, recorded outside the artifact.
  - Upload: one `windows-sidecar` artifact, retention 1 day, hidden files included, `if-no-files-found: error`.
- `build-windows`:
  - `needs: windows-sidecar`.
  - A key-gated `download-artifact` step puts the artifact in `windows-sidecar/` before the staging step.
  - `PB_WIN_SIDECAR_SUMS_SHA256` comes from `needs.windows-sidecar.outputs.sums_sha256`. The repository-variable
    placeholder is gone. A variable cannot carry a per-run digest inside the run that produces it, so no owner
    step is needed for it.
- `powerbrowser/packaging/package-windows.sh`: admits the artifact by `lib/backend/main.js`, the path
  `TheiaService.sys.mjs` loads. It used to test `backend/main.js`, which a correctly staged artifact does not have,
  so every real artifact would have been refused.
- `scripts/verify-build-windows-shape.mjs`, rule 11:
  - It used to require "no needs". It now admits exactly `[windows-sidecar]`, and the only needs value read must be
    the digest output.
  - The download must go to `windows-sidecar` before `package-windows.sh`, and `vars.PB_WIN_SIDECAR_SUMS_SHA256`
    must appear nowhere.
  - The producer must run on exactly `windows-latest` with `contents: read`, no environment, secret or needs, and
    pinned `actions/` uses. Its first step must be the ref guard. It must write `BUILD_ROOT` and have a sums step
    that hashes `SHA256SUMS`, runs the check and the purge, and writes `sha256=`. It must upload one artifact with
    retention 1 and no fail-open step.
  - 16 new plants, 40 in total, each red naming job and cause. The commit message says 22, which is wrong: there
    were 24 plants before.
- `docs/RELEASING.md` (Windows bullet) and `BLOCKED.md` item 8 now describe the job output. The live half is the
  owner's first dispatch at 54-04 Task 3 step 5.

## Verification

- `node scripts/verify-build-windows-shape.mjs`: PASS (13 steps). `--self-test`: PASS, 40 plants.
- The producer's staging and sums step text was extracted from the YAML and run against a fixture tree. Results:
  maps dropped, `node-file:` keys rewritten, digest written to `GITHUB_OUTPUT`, and a planted `D:/a/pb/pb` path
  refused by the purge.
- The workflows, workflows-self-test, release-shape, release-shape-self-test, zizmor, zizmor-self-test,
  win-sidecar-check-self-test and release-asset-set rows: all PASS.
- `node scripts/generate.mjs` made no generated/ change. `scripts/verify-platform.sh --quick` is green except
  `fixer-isolate-self-test`, a known sandbox red.

## Not verified

- Nothing has run on `windows-latest`. Unproven: the image's yarn version, the node-gyp build of `drivelist` with
  the image's Visual Studio, any purge hit from a Windows path form the rewrite does not cover, and the artifact
  round trip into legion. Each one fails closed, and the owner's first dispatch shows which.
