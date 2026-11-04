---
phase: 54-windows-h
plan: 09
gap_closure: true
gap: G-54c part 3 (self-extractor Title, R3)
status: complete
requirements: [PKG-12]
key-files:
  modified: [scripts/generate.mjs, scripts/verify-installer-schema.mjs, powerbrowser/packaging/package-windows.sh, .github/workflows/release.yml, scripts/verify-build-windows-shape.mjs, .planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md]
commits: [e15cb8f8]
---

# 54-09 summary: Title comes from the generator

- `emitAppTag` writes `generated/installer/{dev,release}/app.tag` (`Title="PowerBrowser"` in release), guarded by the
  shell sink guard. A patch could not do this: the file is read raw, and the brand-value scan refuses the literal.
- `package-windows.sh` and the `sign-windows` repackage step pass `--tag generated/installer/release/app.tag`; both
  jobs run `generate.mjs` first.
- `installer-schema` compares the file with upstream's `app.tag`, with the Title taken from `resolveConfig`. There are
  two new self-test plants (6 in total). `build-windows-shape` (40 plants), `workflows`, `release-shape` and
  `--quick` pass, apart from the known red.
- BLOCKED.md item 3 names the placeholder artwork paths `brand/installer/*`, with sizes measured from the stand-ins.
