---
phase: 49-release-pipeline-and-legion-runner-e
plan: 09
gap_closure: true
status: complete
requirements: [SEC-12]
commits: [f4f606a2, 04565b85]
key_files:
  modified:
    - .github/workflows/release.yml
    - docs/RELEASING.md
    - scripts/verify-win-sign-chain.mjs
    - scripts/verify-platform.sh
---

# 49-09 summary: sign-windows reports skipped without Azure (G-sign, R14)

- `sign-windows` `azure_config`: when `AZURE_CLIENT_ID` is empty it writes `signing=false` to
  `GITHUB_OUTPUT`, a `::notice::` and a job-summary line saying Windows signing was skipped, then exits 0.
  When `AZURE_CLIENT_ID` is set, the existing loop still requires all six `AZURE_*` variables and exits 1
  on a missing one; `signing=true` is written after it. The 17 later steps carry
  `if: steps.azure_config.outputs.signing == 'true'`; the `always()` scratch cleanup is unchanged.
  The Azure steps are kept (R14). The job conclusion is success with the steps skipped. GitHub has no
  way for a step to mark its own job "skipped" when the variable lives in the job's environment, because
  a job-level `if:` cannot read environment variables.
- docs/RELEASING.md "Windows signing (SEC-12)": one paragraph describing the skip and the partial-account
  fail-closed behaviour.
- `win-sign-chain` rule `skip` with 5 plants: the Azure sign-in ungated, skip branch removed, skip branch
  exiting 1, `signing=true` before the loop, the cleanup widened beyond `rm -rf`. The existing
  `independence` rule already keeps every Linux-path job off `sign-windows`.
- Verification: `win-sign-chain-self-test` (33 plants), `workflows`, `workflows-self-test`, `zizmor`,
  `release-shape`, `build-windows-shape` green; `--quick` green except the known `fixer-isolate-self-test`.
  Full `win-sign-chain`: the only problem it reports is `vacuity` on `https://powerbrowser.org/download.html`
  (fetch failed, HTTP 000 from this host with the sandbox off). That red existed before this plan and clears
  when the owner publishes the site (47-04).
