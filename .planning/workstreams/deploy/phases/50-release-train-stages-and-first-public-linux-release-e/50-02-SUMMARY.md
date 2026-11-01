---
phase: 50-release-train-stages-and-first-public-linux-release-e
plan: 02
subsystem: release-verification
status: complete
requirements: [TRAIN-10, REL-02, GH-15, UPD-16, REL-03]
tags: [mar-update-hop, served-release, release-assertions, attestation, clean-room-drill]
dependency_graph:
  requires:
    - Plan 50-01 (release train states, dispatch, SHA gate)
    - Phase 45 portable tarball and complete MAR, Phase 44 descriptor builder, Phase 47 updates host (as landed)
  provides:
    - hop.json served selector (loopback unchanged; release asserts the published bytes)
    - six release assertions with eleven release fault plants and attestation sub-plants
    - clean-room drill procedure for the owner run on legion, and the hop record fields
  affects:
    - scripts/verify-mar-update-hop.mjs, docs/BUILD.md, docs/RELEASING.md
key_files:
  modified:
    - scripts/verify-mar-update-hop.mjs
    - docs/BUILD.md
    - docs/RELEASING.md
decisions:
  - "served is a required key; an absent or unknown value fails naming it. Existing loopback evidence without served now fails by design"
  - "The release branch never demands server-access.log, client-update.log or the UI transcript: those belong to the fork-server experience proof"
  - "The MAR host and the descriptor host come from configuration.toml ([urls] mar_origin and update), not a hand-kept list"
  - "Attestation runs through gh with an offline --bundle when one is present, else a logged-in host verification; neither is a skip"
metrics:
  tasks: 3
  commits: 2
  completed: 2026-10-31
actuals:
  tokens: 9091
  tasks: 3
  commits: 2
commits: 2
plan_head_before: dbe56f32
plan_head_after: 23176dfe
---

# Phase 50 Plan 02: served:release hop mode, six assertions, fault plants, clean-room drill Summary

The hop script gains a `served` selector. Loopback keeps the fork-server assertion set. Release
judges the published bytes by six properties and the byte-identity detector, and each fault plant
is red naming its file and value. The live drill is the owner checkpoint in plan 50-04; nothing
here runs it.

## Commits

- `9a6f46d0` feat(50-02): served:release mode for the hop script with six release assertions
  (Tasks 1 and 2: one file, one pass; see deviations)
- `23176dfe` docs(50-02): clean-room drill procedure and the release hop record

## Task results

**Task 1, served selector and release assertion set.** `hop.json` must carry `served`. Absent
fails naming the key; an unknown value fails naming the value and the two modes. `loopback` runs
the existing branch unchanged. `release` runs `runReleaseChecks`, which asserts:

- hosts: the descriptor host (from `[urls] update`) and the write-once MAR host (from `[urls]
  mar_origin`) both appear in the sifted `Resolving host` lines; `github.com` and
  `release-assets.githubusercontent.com` each fail naming the host; zero Mozilla hosts. An empty
  capture fails; the write-once `servedMarUrl` form (https, origin host, `<tag>/<asset>`, no
  `latest`) is required.
- hash and size: recomputed from the MAR bytes with sha512 and byte length.
- version: N+1 not older than N in dotted order; distinct buildIDs. Same appVersion with a distinct
  buildID is accepted (self-test control).
- signature: `scripts/verify-mar-signature.mjs` (node:crypto) and `signmar -v` against
  `powerbrowser/packaging/mar/mar-primary.der`, both required.
- allowed channels: `signmar -T` channel must be in `ACCEPTED_MAR_CHANNEL_IDS` from
  `mozconfig.release` and equal `updateChannel(config).marChannelId`.
- attestation: `gh attestation verify` with `--bundle` when the bundle exists, else a logged-in
  verification; otherwise red naming attestation.
- byte-identity: the served descriptor equals a fresh `buildUpdateXml` emission from the MAR bytes.

The fork-server access log, the client update log and the UI transcript are not required in
release mode. The loopback code path is unchanged apart from the `served` key.

**Task 2, eleven release plants.** Each is red naming its file and value, after a green release
control: unsigned MAR (`nplus1.mar`, signature); wrong-channel MAR (`nplus1.mar`, the channel);
tampered MAR byte (`update.xml`, hashValue); http patch URL (`update.xml`, the URL); resolver log
missing the MAR host (`client-resolver.log`, the host); same-buildID hop (`hop.json`, "share buildID
<value>"); Mozilla host in the resolver log (`client-resolver.log`, the host); attestation failure
(`nplus1.mar`, attestation); servedMarUrl on a github.com release-download URL (`hop.json`, the URL);
a github.com line in the resolver log (`client-resolver.log`, the host); descriptor not byte-identical
(`update.xml`, byte-identical).

Attestation sub-plants go through the real `realDeps().attest` wiring with a gh test double that
checks the repository and the MAR bytes: a tampered MAR (red, attestation), a missing bundle with no
login (red, attestation), and a wrong repository (red, attestation). Two controls pass: a logged-in
verification and an offline bundle.

Two loopback plants cover the selector: `served` absent and `served` set to `fork`.

**Task 3, clean-room drill and hop record.** `docs/BUILD.md` gains "Clean-room drill for a
published Release": bookworm family, no Nix mount, read-only inputs, evidence out, network on, a
fresh profile, MOZ_LOG capture, `SIGNMAR`, and the attestation path. `docs/RELEASING.md` gains the
hop record the owner pastes back (served, the two URLs, resolver host lines, signmar and node:crypto
output, attestation path, version pair with the `updateIsAtLeastAsOldAs` citation, evidence path).

## Verification

- `scripts/verify-mar-update-hop.mjs --self-test`: PASS. Control green first (loopback and release
  mocks); 27 rejections, each naming file and value; literal-IP carve-out; same-appVersion
  distinct-buildID control green.
- `scripts/verify-platform.sh --only mar-update-hop-self-test`: PASS.
- `scripts/verify-platform.sh --only update-download-host` and `update-download-host-self-test`: PASS
  (after the fixture URL was built from parts; see deviations).
- `scripts/verify-platform.sh --quick`: exit 0, "all checks passed", on the staged tree before each
  commit.
- `node scripts/generate.mjs --check`: PASS (68 generated files match configuration.toml).
- `node scripts/scan-brand-residue.mjs`: PASS on the staged set.
- Default (drill) mode on this tree: red, naming the absent `.mozbuild/mar-hop` evidence. That is the
  designed behaviour and matches the pre-change result. The `mar-update-hop` row is a full row, not
  quick.

## Deviations

- **Tasks 1 and 2 share one commit.** Both edit `scripts/verify-mar-update-hop.mjs` in one pass.
  The plants, the controls and the assertions were landed together and checked together, so they
  were not split into two commits.
- **Plant count.** The plan asks for eleven plants and an attestation fixture. Delivered: eleven
  release plants plus three attestation sub-plants (tampered, bundle missing, wrong repository), and
  two loopback selector plants.
- **Signature and channel wiring.** The crypto verdicts are the job of `verify-mar-signature.mjs`
  (its own row) and of `signmar`. The self-test injects fakes for the signature and channel reads
  (`fakeDeps`), so it proves the wiring and the messages, not the cryptography. The attestation
  branch is proven through the real function with a gh double.
- **DER path.** The tracked primary DER path is a constant. The plan asked for the DER set to be
  derived from `brand/` and `patches/030-*`. Shortcut: the constant is the one tracked DER the
  release workflow reads; upgrade if a second DER slot is added to the release path.
- **Host for the MAR.** The plan's wording named the host as a literal. It is derived from
  `[urls] mar_origin`, which is the value the owner ruling of 2026-10-29 set.

## Notes for the owner

- `scripts/verify-update-download-host.mjs` names `release-assets.githubusercontent.com` as an
  allowed update host in its message text. The owner ruling of 2026-10-29 moved the primary MAR origin
  to `downloads.powerbrowser.org`, and the release-assets form lost its updater justification (see
  50-CONTEXT). The guard's rule (no github.com download URL) still holds; its guidance text is stale.
  Not edited here: it is outside the two plans' files.
- The `servedMarUrl` plant fixture is built from parts in the self-test, as `release-train.mjs` does
  for tags, so the update-download-host sweep does not read the test literal as a live download URL.

## Self-Check: PASSED

- Commits `9a6f46d0` and `23176dfe` exist on dsh/phase-50 after `dbe56f32`.
- Modified files `scripts/verify-mar-update-hop.mjs`, `docs/BUILD.md` and `docs/RELEASING.md` are in
  those commits.
