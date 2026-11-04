---
phase: 49-release-pipeline-and-legion-runner-e
plan: 06
gap_closure: true
status: complete
requirements: [DIST-02, PKG-21]
commits: [d08b0cce, 7f442768]
key_files:
  modified:
    - powerbrowser/packaging/package-linux.sh
    - scripts/verify-release-shape.mjs
    - scripts/verify-platform.sh
---

# 49-06 summary: Linux complete-MAR emit (G-49a)

- `package-linux.sh` now runs `tools/update-packaging/make_full_update.sh` from `upstream/` against the
  staged release dir after the tarball rewrite. Output: `<tarball base>.complete.mar` in
  `objdir-release/dist/`, the file the `release-linux` upload expects. `MAR_CHANNEL_ID` is the generator's
  `marChannelId`; `MOZ_PRODUCT_VERSION` is `application.ini` `Version`. Stale MARs are removed first; a
  missing `dist/host/bin/mar`, a failed run or an empty file fails the package and removes the partial file.
- `release-shape` rule 9 `mar-emit`: when build-linux uploads `*.complete.mar`, a
  `powerbrowser/packaging/*.sh` named in its run steps must invoke `make_full_update.sh` on a non-comment line.
  Two self-test plants (invocation removed; invocation commented out) go red naming the rule.
- Verification: `release-shape` and `release-shape-self-test` green (46 plants); `node scripts/generate.mjs`
  produced no generated/ change; `--quick` green except the known `fixer-isolate-self-test`.
- Not run: the emit itself. It needs the container-built release tree; it runs on the first legion release
  build (Phase 50). BLOCKED.md item 6 is closed in code by this plan.
