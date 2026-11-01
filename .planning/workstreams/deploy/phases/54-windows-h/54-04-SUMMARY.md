---
phase: 54-windows-h
plan: 04
subsystem: release
status: complete-local
tags: [windows, sec-03, sec-12, dist-10, authenticode, jsign, azure-oidc, release-yml, download-copy]
requires:
  - phase: 54-03
    provides: matrix record row and harness (the record the copy row reads)
  - phase: 49-05
    provides: r2_copy fail-closed pattern, sign-publish shape the sign job mirrors
provides:
  - SEC-03 verbatim warning in docs/WINDOWS-DISTRIBUTION.md, docs/RELEASING.md and website-staging/download.html
  - win-download-copy row and self-test (full tier)
  - WINNT_x86_64-msvc descriptor target in scripts/build-update-xml.mjs (windows-x86_64 asset token)
  - release.yml sign-windows job (jsign 7.6 over Azure OIDC, chain order, fail closed)
  - win-sign-chain row and self-test, win-sign-list-self-test (full tier)
  - scripts/win-sign-list.mjs (tree-derived zip name and signing list)
affects: [54-04 Task 3 owner checkpoint, phase-50 release pipeline (Windows publish and descriptor commit)]
key-files:
  created:
    - docs/WINDOWS-DISTRIBUTION.md
    - scripts/verify-win-download-copy.mjs
    - scripts/verify-win-sign-chain.mjs
    - scripts/win-sign-list.mjs
  modified:
    - .github/workflows/release.yml
    - .github/settings/actions-selected.json
    - docs/RELEASING.md
    - website-staging/download.html
    - scripts/build-update-xml.mjs
    - scripts/verify-platform.sh
    - scripts/verify-workflows.mjs
    - powerbrowser/packaging/package-windows.sh
decisions:
  - "The canonical SEC-03 block is derived from the SEC-03 line of REQUIREMENTS.md; every source is compared with it, and the matrix record contributes the observed dialog title"
  - "A posture line in docs/RELEASING.md (Azure Artifact Signing identity validation: pending or a date) decides whether the page must carry the block and say unsigned; both rows read it"
  - "Deferred signing items 1-4 are not flipped: no certificate exists. The flip is written as the owner's step 5 in the RELEASING.md Windows signing section, and the rows go red on a page that disagrees with the posture"
  - "sign-windows fails closed without the six Azure release-environment variables; Azure/login runs after every gate; no Azure secret exists"
  - "sign-windows attests nothing: its bytes were built on legion and attest-build-provenance would name the hosted job as builder; legion is inside the Windows signing trust boundary (documented)"
  - "Windows assets are not joined to the Release publish or the descriptor commit: that needs the Windows asset-table row. Owner ruling 2026-11-01: a failed Windows sign never blocks the Linux release; Windows joins the Release in its own run (enforced by the win-sign-chain independence check)"
metrics:
  duration: "about 35 minutes of wall time (06:17Z to 06:52Z, 2026-11-01 UTC)"
  completed: 2026-11-01
  tasks: 2
  files: 12
actuals:
  tokens: 27755
  tasks: 2
  commits: 3
  basis: chars/4 over git diff 7f8f6f10..49f94a5c (111019 bytes); the plan estimate was 105000 over three tasks
plan_head_before: 7f8f6f10655359dfc7b5f87183b01107f50c2a1d
plan_head_after: 49f94a5c655a75bc96f61cc3ea528490e2d99f74
---

# Phase 54 Plan 04: Unsigned-first copy and the Windows signing chain Summary

**The SEC-03 warning is checked word for word in four places against the requirement text. `release.yml` gains `sign-windows`, which runs jsign 7.6 over Azure OIDC in the order inner files, installer, MAR, signmar. The files it signs come from the pinned package manifest, and the zip name comes from `configuration.toml`. Task 3 (owner live actions) was not executed.**

## Commits

Plan head before: `7f8f6f10`. Measured with `git rev-list --count 7f8f6f10..HEAD` before this SUMMARY: 3.

- `04356f4b` feat(54-04): SEC-03 unsigned-first warning copy and the Windows descriptor target
- `62168c0a` feat(54-04): SEC-12 Windows sign job over Azure OIDC and the win-sign-chain row
- `49f94a5c` fix(54-04): sign-windows takes no name or file list from the legion artifact (security review)

## Task status

### Task 1: SEC-03 copy, DIST-10 Windows descriptor, win-download-copy (DONE)

- `docs/WINDOWS-DISTRIBUTION.md` (new) carries the verbatim block and points to `scripts/matrix/win-matrix-record.json`, the `launch` cell's `smartscreen` field.
- `docs/RELEASING.md` (Windows posture) carries the block and the posture line `- Azure Artifact Signing identity validation: pending.`. The maintenance-service and admin-install notes are unchanged.
- `website-staging/download.html` carries the block as `<p id="windows-smartscreen">`. The Windows status line still says "no build is published yet. The planned build is unsigned."
- `scripts/verify-win-download-copy.mjs` (`win-download-copy`, full tier):
  - It derives the canonical block from the SEC-03 line of `REQUIREMENTS.md`.
  - It extracts every block from the two docs, the page source and the published page (`<homepage origin>/download.html`, one GET), and requires each block to equal the canonical one.
  - A reword is red naming the file and the first word that drifted.
  - The quoted dialog title must equal the title in the matrix record.
  - Once the posture line holds a date, the page must carry no block.
- `scripts/build-update-xml.mjs` gains the `WINNT` / `x86_64-msvc` row. The ABI comes from `upstream/build/moz.configure/toolchain.configure` `target_xpcom_abi`, which gives `<cpu>-msvc` for clang-cl. WINNT is removed from PENDING, and the patch URL uses the shared `WINDOWS_TOKEN` (`windows-x86_64`).

### Task 2: SEC-12 sign job and win-sign-chain (DONE locally; live run is the owner's)

`sign-windows` runs on `ubuntu-latest` under environment `release`, with `contents: read` and `id-token: write` on this job only. Its steps, in order:

1. The gates copied from sign-publish: ref and event refusal, full SHA, SHA gate.
2. The release key, derived from the tree.
3. The stale-approval guard (`stale_guard`).
4. `azure_config`. It fails closed when any of these is empty: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`. All six are release-environment variables, not secrets.
5. Artifact admission, against tree-derived names.
6. The apt tools (`libnss3-tools`, `openjdk-21-jre-headless`, `7zip`).
7. signmar, built from the pinned source.
8. jsign 7.6, fetched with `gh release download` and checked against sha256 `6cf58aa0...39fa5` (2551899 bytes; GitHub's asset digest matches).
9. The pinned Firefox source, fetched and patched.
10. `sign_list`: the derived set of PE files to sign.
11. `Azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906` (v3.1.0), with only the three ids.
12. `inner_sign`: jsign `TRUSTEDSIGNING` over the derived list plus the `setup.exe` stub.
13. `mach repackage installer`.
14. `setup_sign`: jsign over the installer.
15. `mach repackage mar`, with signmar as the mar tool.
16. The Windows MAR channel gate.
17. `win_sign_mar` and `win_verify_mar`, against the tracked DER, with signmar `-v` and node:crypto.
18. The handoff: `SHA256SUMS` and the `release-windows-signed` artifact, retention 1.

Other changes in this task:

- `build-windows` now also uploads `*.zip` and `setup.exe`. `package-windows.sh` copies both into `release-windows/`.
- `Azure/login@*` is admitted in `.github/settings/actions-selected.json`.
- The `workflows` self-test fixture (`GOOD_RELEASE`) now has a `sign-windows` job, so the new admission is used.
- `scripts/verify-win-sign-chain.mjs` (`win-sign-chain`, full tier) classifies each step from its own text and compares the chain as ordered equality. It also checks these rules:
  - OIDC only: one login, plain `vars.` ids, after every gate and before the first signature.
  - The configuration gate covers every `vars.AZURE_*` the job reads.
  - No Azure `secrets.` reference anywhere, and `secrets.` only in `win_sign_mar`.
  - No `LD_LIBRARY_PATH`; signmar built from the pinned source; jsign pinned; verification against the tracked DER.
  - No schedule key.
  - No environment and no `secrets` on any legion job.
  - Tree-derived inputs and GITHUB_OUTPUT values only; the derived sign list; no attestation.
  - The Windows status line on the page source and the published page agrees with the posture line.
- `docs/RELEASING.md` gains:
  - a "Windows signing (SEC-12)" section: order, OIDC, the six variables, tool pins, five owner steps (step 5 is the signing flip of deferred items 1-4), and the legion trust-boundary sentence;
  - the Azure variables in the secrets inventory.

### Security review fixes (coordinator, two MEDIUM)

1. **Output injection.** `scripts/win-sign-list.mjs --expected-base` derives `<app_basename>-<ESR version>.en-US.win64` and the top directory `<app_basename>` from `configuration.toml`.
   - The self-test checks that `package-windows.sh` globs the same `*.en-US.win64.zip`.
   - The artifact must hold exactly that zip, or the job stops. The error names the zip(s) found, escaped with `printf %q`, and the expected name.
   - The Python check refuses any entry outside `^[A-Za-z0-9._/-]+$`, a `..` segment, a leading slash, a symlink, and any top directory other than the derived one (which must match `[A-Za-z0-9._-]+`).
   - GITHUB_OUTPUT gets only `$WANT_BASE`, `$WANT_TOP` and `$PKG`.
   - win-sign-chain plants: an artifact-derived name written to GITHUB_OUTPUT, the comparison removed, the entry check removed.
2. **Trust transfer.** The `find` is replaced by `win-sign-list.mjs --list`. It allows every manifest entry ending `.exe` or `.dll` and requires the unconditional ones.
   - An extra PE file is red naming it. A missing unconditional entry is red naming it. An unsafe name or an empty tree is also red.
   - `node/` (vendor-signed Node) and `theia/` (the sidecar) are not signed.
   - **Attestation: removed.** `actions/attest-build-provenance` cannot record a different builder, so the job does not attest legion-built bytes as hosted provenance. The step and the `attestations: write` permission are removed. win-sign-chain reds on either coming back.
   - `docs/RELEASING.md` now states that compromising legion is equivalent to compromising the Windows signing identity.
   - Plants: a `find` over the build output, the `sign_list` step removed, and a hosted attestation added back.

## Verification

Plan automated verify, Task 1: `--only win-download-copy-self-test` PASS, `--only sidecar-reap-blocker` PASS, `--quick` (see below). Task 2: `--only win-sign-chain-self-test` PASS, `--only workflows` PASS, `--only win-download-copy-self-test` PASS, `--quick`.

Also run: `release-shape`, `zizmor` (zizmor 1.29.0 --offline, no findings), `release-asset-set-self-test` and `release-asset-set`, `workflows-self-test` (208 plants, 11 controls), `release-shape-self-test`, `mar-channel-gate-self-test`, `release-symbols-self-test`, `build-windows-shape` with its self-test, `update-download-host`, `build-update-xml-self-test`, `win-sign-list-self-test`. All exit 0. `node scripts/scan-brand-residue.mjs` PASS over 565 files, with new files staged. Every sign-windows run block passes `bash -n`, and its two Python heredocs parse.

Self-test ok counts:

- win-download-copy: 15 ok lines (2 controls and 13 plants).
- win-sign-chain: 27 ok lines (2 controls and 25 plants).
- build-update-xml: 25 ok lines (Windows control plus wrong-target, stale-version and empty-set plants added).
- win-sign-list: 8 ok lines.

Final `scripts/verify-platform.sh --quick` (after the last commit): 267 PASS rows. Red rows are only the six known worktree-environment reds: `gui07-strip-spike-verdict` and its self-test, `gui09-dependent-window-content` and its self-test, `single-copy-deps`, `ng086-theia-react-node`. The baseline before any change had the same six reds and 267 PASS rows.

The full rows on the live tree are red, as expected: `win-download-copy` (the published page fetch fails, and the matrix record is absent) and `win-sign-chain` (the published page fetch fails). Neither is in `--quick`.

The plan's acceptance greps, run with `grep -Fc`: each of the four registry rows has count 1. `grep -c 'schedule:' release.yml` gives 0, and `sign-windows` and `Azure/login` are both present.

## Deviations from Plan

1. **[Adaptation] The descriptor half is in `scripts/build-update-xml.mjs`, not `verify-mar-update-hop.mjs`.** The per-target emitter that imports `buildUpdateXml` exists now (Phase 44), so the WINNT row goes there. The wrong-target, stale-version and empty-set plants are in its self-test, not in win-download-copy's; the plan asked for them in win-download-copy's.
2. **[Adaptation] signmar is built from the pinned source with no `LD_LIBRARY_PATH`.** The plan said container-built signmar with `LD_LIBRARY_PATH dist bin`, which the release-shape sign-trust rule forbids. The pinned signmar is also the mar tool for `mach repackage mar`.
3. **[Adaptation] makensis is not installed.** `mach repackage installer` only runs 7zz (`exe_7z_archive.py`). `setup.exe` is built by makensis on legion and is signed as an inner file.
4. **[Rule 2 / honesty] Deferred signing items 1-4 are not flipped.** No certificate exists, so the flip is written as the owner's step 5 and guarded by the posture line.
5. **[Security review] No attestation in sign-windows.** The plan asked for `attest-build-provenance`; it is removed (see above).
6. **[Rule 3] Step ids and texts differ from sign-publish on purpose.** The release-shape, release-asset-set and mar-channel-gate self-tests plant faults by first or last text occurrence. Copied anchors made those plants hit sign-windows instead of sign-publish. So sign-windows uses its own ids (`stale_guard`, `win_signmar`, `win_mar_channel_gate`, `win_sign_mar`, `win_verify_mar`) and its own step names, and the job sits between build-windows and sign-publish.
7. **[Rule 3] jsign is fetched with `gh release download`.** A literal github.com `/releases/download/` URL in release.yml reds `update-download-host`.
8. **Self-test rows are in the full block, as the plan states.** `--quick` therefore does not run them, which leaves the PASS count at 267.

## Left open, with reasons

- **The Windows publish, the R2 copy, the descriptor commit and channel-live for Windows are not wired.** This needs the Windows row of the asset table (stage windows-unsigned) and an owner decision: should a fail-closed Windows sign job be able to block the Linux release? `channel-live` also derives the MAR asset name with the Linux token only.
- **SEC-03 "ships unsigned" has no pipeline path.** The caller required sign-windows to fail closed without Azure. An unsigned-first Windows publish therefore needs either Azure first or a separate owner-approved unsigned path.
- **Unverified until the first live run.**
  - Whether `./mach repackage installer` and `mar` run in a hosted checkout with no objdir.
  - Whether pinned signmar works as `make_full_update.sh`'s `$MAR`.
  - The jsign `TRUSTEDSIGNING` call with `az account get-access-token`.
  - The apt package versions, which are recorded as pending in RELEASING.md.
  - The package-manifest derivation against a real package. Conditional entries are allowed but not required; see the shortcut comment in `win-sign-list.mjs`. A wrong derivation fails closed, naming the file.
- **The theia/ sidecar PE files are not signed.** Their file list belongs to the hosted sidecar job (BLOCKED.md item 8).
- **Pre-existing, out of scope:** sign-publish attests legion-built Linux bytes the same way. The download page already says the attestation covers the upload, not the build host.

## Task 3: owner checkpoint (NOT EXECUTED)

Every step is a live write. No agent runs any of them.

1. **Azure (SEC-12).**
   - Create the account with two-factor sign-in, an Artifact Signing account and a Public Trust certificate profile. Request the identity validation (1-20 business days, about USD 10 per month, billed from creation).
   - Create an app registration with a federated credential for `repo:<owner>/<repo>:environment:release`, where `<owner>/<repo>` is the release home that `configuration.toml` names. Give it the certificate profile signer role. Create no client secret.
   - Set the six variables with `gh variable set <NAME> --env release`.
   - Apply the admission list (`Azure/login@*`).
   - When the validation completes, record the date in the posture line and make the four flip edits (docs/RELEASING.md, "Windows signing (SEC-12)", step 5).
2. **Legion libvirt (MTX-01).** Grant the runner user libvirt in `/etc/nixos/configuration.nix`, finish with `nrs` under `pkexec`, and record the date.
3. **pkg-win11 (MTX-01, UPD-31).** Define it from `scripts/matrix/pkg-win11-domain.xml` (new disk, qcow2 nvram, NAT; leave `win11` untouched). Install Windows 11, the guest agent and stock Firefox. Apply the licence and freeze updates. Take the `clean-baseline` snapshot. Record the media hash and the freeze method.
4. **Matrix.** Run `PB_MATRIX_ISO=<iso> scripts/matrix/win-matrix-run.sh` over the five cells. Paste the verbatim record, including BUILD_TARGET (expect `WINNT_x86_64-msvc`), Software/Mozilla untouched, and the SmartScreen title. Then re-run `--only win-download-copy`.
5. **Release.** Once Phase 50 and BLOCKED.md item 8 have landed, dispatch release.yml and approve `release`. Check that `sign-windows` evidences the six-step order and that `win-sign-chain` is green. Approve `descriptor` after your own N-1 to N hop. Reply with the run links, the descriptor commit and the channel-live result.

Resume reply, five fields:

1. The Azure account holder and the validation date.
2. The nrs date.
3. The media hash and the freeze method.
4. The five-cell record.
5. The run links, the descriptor commit and the channel-live result.

## Known Stubs

None. The `pending` posture line and the `pending` apt-version record are owner-filled facts, not stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-credential-path | .github/workflows/release.yml | Azure OIDC federation from environment `release` (sign-windows); covered by T-54-15 and the win-sign-chain secret and oidc rules |
| threat_flag: trust-boundary | .github/workflows/release.yml | legion-built PE bytes receive the foundation's Authenticode signature; documented in docs/RELEASING.md, with no hosted provenance claimed |

## Self-Check: PASSED

- Files exist: `docs/WINDOWS-DISTRIBUTION.md`, `scripts/verify-win-download-copy.mjs`, `scripts/verify-win-sign-chain.mjs`, `scripts/win-sign-list.mjs`.
- Commits `04356f4b`, `62168c0a` and `49f94a5c` are ancestors of HEAD.
