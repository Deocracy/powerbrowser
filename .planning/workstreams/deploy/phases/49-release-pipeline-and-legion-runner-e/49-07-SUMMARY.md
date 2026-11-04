---
phase: 49-release-pipeline-and-legion-runner-e
plan: 07
gap_closure: true
status: complete
requirements: [DIST-02, PKG-04, PKG-18, PKG-22, PKG-23]
commits: [d4ada7e5, 7946ec04]
key_files:
  created:
    - scripts/verify-install-matrix.mjs
  modified:
    - scripts/verify-platform.sh
    - scripts/verify-release-shape.mjs
    - .github/workflows/release.yml
---

# 49-07 summary: packaged rows and install-matrix in build-linux (G-49b)

- New full row `install-matrix` (`scripts/verify-install-matrix.mjs`) promotes the untracked 08-05
  `.mozbuild/matrix/run-matrix.sh`. The cells come from the Linux row header of the docs/BUILD.md install
  matrix and are compared with the four cells the script implements; the hop cell is covered by
  `mar-update-hop`. The fork and the stock browser each get a fresh HOME and profile. The fork's process
  group (sidecar included) is stopped at uninstall. Residue is any path under the fork HOME with a segment
  named after `identity.app_basename/binary_name/remoting_name/distribution_id` or a Mozilla/Firefox root.
- `install-matrix-self-test` (quick, about 7 s): fixture tarballs and shell-script browsers, a green control
  and 11 plants, each red naming its cell.
- build-linux: one step after "Package the tarball..." and before the first upload, gated on the key gate,
  runs the six labels through `scripts/verify-platform.sh --only` in `nix develop .#theia`, with
  `PB_STOCK_FIREFOX` from `nix build --inputs-from . nixpkgs#firefox`.
- `release-shape` rule 10 `packaged-rows` with 5 plants (label dropped, unregistered label, step removed,
  step after an upload, row unregistered).
- Verification: `release-shape --self-test` (51 plants), `install-matrix-self-test`, `workflows-self-test`
  green; `--quick` green except the known `fixer-isolate-self-test`.
- Not run: the full `install-matrix` row. It is red on this host for the same reason as its packaged-row
  neighbours: no container-built release tarball exists. It runs first on the legion release build. The
  no-residue rule is stricter than 08-05's (any matching path, recursively), so the first live run may show
  a real residue path, which is then a product finding.
