---
phase: 49-release-pipeline-and-legion-runner-e
plan: 01
subsystem: release-pipeline
status: complete
tags: [release, workflow, dispatch, legion, dist-02, dist-08, config]
requires: []
provides:
  - .github/workflows/release.yml: 4-job dispatch-only skeleton with the SHA-ancestor and key>tag gates
  - scripts/verify-release-shape.mjs: the release-shape quick row and its self-test
  - configuration.toml [urls] mar_origin, validated, and recorded as mar_origin in release-manifest.json
affects:
  - 49-03 (fills sign-publish), 49-04 (fills descriptor and channel-live), 49-05 (R2 origin and allowlist)
key-files:
  created:
    - .github/workflows/release.yml
    - scripts/verify-release-shape.mjs
  modified:
    - scripts/verify-workflows.mjs
    - scripts/verify-platform.sh
    - configuration.toml
    - scripts/lib/config-schema.json
    - scripts/generate.mjs
    - docs/REBRANDING.md
    - powerbrowser/packaging/package-linux.sh
decisions:
  - "The release runner label powerbrowser-release is a legion label. The workflows row keys on it as well as on legion, so the release runner gets the full legion rule set (no environment, no secrets, build-* job ids only)."
  - "sign-publish, descriptor and channel-live end in a deliberate failure in this revision, so a dispatch cannot publish or commit a partial result before plans 49-03 and 49-04 land."
  - "urls.mar_origin is unset-safe: an unset value is recorded as null in release-manifest.json, and generate refuses any value that is not an https origin naming only a host (path, port, query, fragment, userinfo, trailing slash and uppercase host are refused by name)."
  - "build-linux follows the Phase 45 container procedure recorded in powerbrowser/packaging/Containerfile and 45-04-SUMMARY, not a new build path."
metrics:
  tasks: 3
  commits: 2
  duration: "single session"
actuals:
  tokens: 10179
  tasks: 3
  commits: 2
plan_head_before: 186f465a2840c2e2c116d9064b22b08e41fc5f2e
plan_head_after: be0d59c0451b4eb911253cebeac542dce0c5480c
---

# Phase 49 Plan 01: Release workflow skeleton, release-shape row, and MAR origin key Summary

Dispatch-only `release.yml` skeleton with a SHA-ancestor gate and a key>tag gate ahead of the legion build, a derive-and-compare `release-shape` row with nine planted faults, and the `[urls] mar_origin` configuration key written into the release manifest.

## Commits

- `8356fde` feat(49-01): release.yml 4-job skeleton with dispatch, SHA and key gates, and the release-shape row (Tasks 1 and 2)
- `be0d59c` feat(49-01): configuration [urls] mar_origin, validated and written to the release manifest (Task 3)

Tasks 1 and 2 share one commit. The workflows row cannot pass on the real `release.yml` without the Task 2 legion-label change, so committing Task 1 alone would leave the tree red.

## What was built

**Task 1 (release.yml skeleton and release-shape row).** `.github/workflows/release.yml` has `on.workflow_dispatch.inputs.sha` (required, string, no default) as its only trigger, and top-level `permissions: contents: read`.

- `build-linux`: `[self-hosted, powerbrowser-release]`, `contents: read`, no `environment:`, no `secrets.`. Steps in order: checkout of the requested commit (`fetch-depth: 0`, `persist-credentials: false`); `sha_gate` (main tip, or a `configuration.toml`-changing ancestor, with `.github/workflows/` identical to main's, else exit 1); `key_gate` (derives the release key, reads the latest published Release, and writes `build=true|false` to `GITHUB_OUTPUT`; every later step is conditioned on `build == 'true'`, so a non-newer key exits without building); generate; `podman build` of `powerbrowser/packaging/Containerfile`; `mach build` plus `toolchain-baseline.sh --container` in the container; `package-linux.sh` in the container; `upload-artifact` with `retention-days: 1` for the tarball, the complete MAR and `release-manifest.json`.
- `sign-publish`: `needs: build-linux`, `ubuntu-latest`, `environment: release`, the write trio, a download of the artifact, then a deliberate failure (see Known Stubs).
- `descriptor`: `needs: sign-publish`, `environment: descriptor`, deliberate failure.
- `channel-live`: `needs: descriptor`, `contents: read`, deliberate failure.
- Every `uses:` is a 40-hex SHA resolved read-only with `gh api` against the tag refs: `actions/checkout` v4.4.0 (`11d5960a...`), `actions/upload-artifact` v7.0.2 (`cf430e03...`), `actions/download-artifact` v8.0.2 (`9000827c...`). All three are GitHub-owned, so `actions-selected.json` needed no change.
- `scripts/verify-release-shape.mjs` parses the workflow with js-yaml from `theia/` and checks: trigger set, sha input, legion placement (no environment, no secrets. reference), both named gates present with their required commands and ordered before the first build step, `retention-days` 1 on every upload with at least one upload present, and no cache step or cache input.
- Registry rows `release-shape` and `release-shape-self-test` sit in `scripts/verify-platform.sh` after `workflows-self-test`.

**Task 2 (trust-boundary fixture).** `scripts/verify-workflows.mjs` now treats `powerbrowser-release` as a legion label alongside `legion`. Before this change the rule keyed only on `legion`, so the real release runner was classed as a neither-hosted-nor-legion job and the row went red on the new file. `GOOD_RELEASE` moves to the 4-job dispatch-only shape (sha input, `retention-days: 1` on the upload, descriptor and channel-live jobs). The `pull_request` plant re-anchors on `workflow_dispatch:`. Every existing plant is kept.

**Task 3 (MAR origin key).** `configuration.toml` `[urls] mar_origin = "https://downloads.powerbrowser.org"` with the 2026-10-29 ruling in its comment. `scripts/lib/config-schema.json` gets `urls.mar_origin` (required false, regex `^https://[A-Za-z0-9.-]+$`). `scripts/generate.mjs` exports `marOrigin(config)`: unset returns null, and any other value must parse as https with pathname `/`, no search, hash, userinfo or port, and must equal `https://<hostname>` exactly, else `report()` names `urls.mar_origin`. `powerbrowser/packaging/package-linux.sh` passes the value into the manifest writer, which records `mar_origin` (or null). `docs/REBRANDING.md` documents the key.

## Verification

Baseline before the first plan: `scripts/verify-platform.sh --quick` returned `verify-platform: PASS -- all checks passed` (no pre-existing reds in this clone; zizmor ran and passed).

Release-shape self-test (`node scripts/verify-release-shape.mjs --self-test`, exit 0):

```
  ok  baseline -> green
  ok  pull_request trigger added -> red, naming .github/workflows/release.yml and 'pull_request'
  ok  tag push trigger added -> red, naming .github/workflows/release.yml and 'push'
  ok  sha input not required -> red, naming .github/workflows/release.yml and 'required'
  ok  legion job build-linux with environment: -> red, naming .github/workflows/release.yml and 'environment'
  ok  legion job build-linux reaching a secrets. reference -> red, naming .github/workflows/release.yml and 'secrets.'
  ok  upload-artifact with retention-days 5 -> red, naming .github/workflows/release.yml and 'retention-days 5'
  ok  actions/cache step added to build-linux -> red, naming .github/workflows/release.yml and 'actions/cache'
  ok  key>tag gate removed -> red, naming .github/workflows/release.yml and 'no key>tag gate'
  ok  SHA-ancestor gate removed -> red, naming .github/workflows/release.yml and 'no SHA-ancestor gate'
release-shape: --self-test PASS -- the unmodified release workflow is green and 9 planted faults each went red naming the file and the fault. It writes nothing.
```

Live row: `release-shape: PASS -- .github/workflows/release.yml dispatches on workflow_dispatch only ...`. Unknown argument: exit 2 with a Next step line.

Workflows row after the change: `workflows: PASS -- 4 workflow(s), 7 uses: line(s) pinned and admitted, ...`. Its self-test: `workflows: --self-test PASS -- 38 planted faults went red naming the file and job, and 6 controls stayed green`.

zizmor (`scripts/verify-zizmor.mjs`): `zizmor: PASS -- zizmor 1.29.0 --offline over .github/workflows/: No findings to report.`

Config: `node scripts/generate.mjs` then `node scripts/generate.mjs --check`: `--check PASS -- all 56 generated file(s) match configuration.toml`. Negative checks: a path-bearing origin is refused naming `urls.mar_origin`; an uppercase host (which the regex admits) is refused by `marOrigin`; an unset value returns null. `scripts/verify-platform.sh --only verify-rebranding-docs`: PASS. `bash -n powerbrowser/packaging/package-linux.sh`: ok.

Full `--quick` after the three tasks: `verify-platform: PASS -- all checks passed`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Legion rule keyed on the wrong label.** The plan requires the release runner label `powerbrowser-release`, and the workflows row keyed only on `legion`. Fixed in `scripts/verify-workflows.mjs` by a legion label set (`legion`, `powerbrowser-release`). Files: `scripts/verify-workflows.mjs`. Commit `8356fde`.

**2. [Plan snippet fault] Verify chain imports a non-export.** The Task 3 automated verify snippet imports `mar_origin` from `scripts/generate.mjs`, which exports no such name, so the snippet would throw. The check was run with `marOrigin` instead (the exported helper). No code change.

**3. [Scope note] packaged-launch and install-matrix rows not wired into build-linux.** The plan says build-linux runs the packaged rows. The labels `ng063-packaged-launch`, `portable-elf`, `sidecar-no-symlinks`, `package-target-natives` and `packaged-identity` exist, but `install-matrix` is not in the registry, and the packaged rows need the built tree. They are not invoked in this skeleton. Carried to the first real dispatch (see Known Stubs and BLOCKED notes).

## Known Stubs

| File | Job | Reason | Resolved by |
|---|---|---|---|
| `.github/workflows/release.yml` | sign-publish | placeholder step exits 1; no signing, channel gate, asset-set equality or publish in this revision | Plan 49-03 |
| `.github/workflows/release.yml` | descriptor | placeholder step exits 1; no update.xml commit | Plan 49-04 |
| `.github/workflows/release.yml` | channel-live | placeholder step exits 1; no live read-back | Plan 49-04 |

These are intentional fail-closed placeholders, not plan-complete functionality. A dispatch in this revision cannot publish.

## Flagged Assumptions (DIST-02 and DIST-08)

- **DIST-02 live half (artifact cap and pending timeout):** not measured here. `retention-days: 1` is in place on the one upload. Post-publish artifact deletion is not in this plan; it is needed when sign-publish is wired (plan 49-03), and the cap readout is recorded at the first real run.
- **DIST-02 concurrency:** the row is read-only and writes nothing, proven by design, not by a repeated-run plant.
- **Complete MAR emit (not in the tree):** build-linux uploads `objdir-release/dist/*.complete.mar`, but no step produces it. `package-linux.sh` packages the tarball and the manifest, and does not emit the MAR. The Phase 45 MAR emit (`make_full_update.sh` against the release objdir) is the missing step; `if-no-files-found: error` makes the first run fail visibly until it is supplied.
- **Container bootstrap steps (Phase 45 dependency):** the build steps follow the 45-04 procedure. They are unrun in this clone, and the first dispatch on legion proves them.

## Owner Actions Implied by This Plan

- Repository variable `PB_KEYDIR` (the Safe Browsing key directory on the legion host, mounted read-only into the build container). Without it the build step fails closed by design.
- Legion runner registration under the `powerbrowser-release` label is owned by plan 49-02 (skipped in this run).

## Broken-Windows Register

The `gsd_run windows append` calls for the three stub rows and the unrun build-linux verification were refused. The reason is pre-existing: the rendered table in `.planning/WINDOWS.md` disagrees with its fenced JSON for rows 10, 11 and 19. This plan did not touch that file. The tool says to regenerate the table rather than hand-edit it, so no entry was hand-written. The owner should regenerate `.planning/WINDOWS.md` and re-run the appends for the stubs above.

## Self-Check

- Created files present: `.github/workflows/release.yml`, `scripts/verify-release-shape.mjs`.
- Commits present on the branch: `8356fde`, `be0d59c`.
- No `ledger/` or `scripts/verify-ng-NNN-*.mjs` file was read, edited or created.
- The word "pull_request" and the word "schedule" do not occur in `release.yml`.

## Self-Check: PASSED
