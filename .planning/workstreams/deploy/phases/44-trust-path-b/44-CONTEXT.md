# Phase 44: Trust path (B) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Losing or rotating the primary MAR key no longer strands users, and every descriptor the pipeline writes is per build target and can never offer an older build.

Requirements: SEC-05, UPD-14, UPD-26, SEC-09 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): no `schedule:` in the product repo; legion runner later (Phase 49); tags created only by the bot App after `release` approval; one release per ESR point release plus out-of-band revision bumps; 24-hour descriptor canary with the owner as required reviewer on the `descriptor` environment.
- SEC-05/SEC-09: the secondary MAR key is generated offline in a recorded ceremony; two offline `.p12` copies are mandatory; `docs/RELEASING.md` documents the ceremony and rotation.
- UPD-26: rollback is possible only through an owner-dispatched `--rollback-to`; `MOZ_BUILD_DATE` is never pinned to the ESR tag.

### Owner gates in this phase (stop points for autonomous execution)
- The secondary MAR key ceremony is an owner action, offline on `legion`: generate the key, export the secondary DER, keep two `.p12` copies on the offline medium. No executor generates, mints, receives, prints or stores key material. Plans build everything locally (the `build-update-xml` CLI, the `descriptor-monotonic` row, the ng065 secondary plant, the ceremony/rotation docs) and carry the key handoff as a `checkpoint:human-action`; the patch-030 regeneration with the real secondary DER and any live re-proof run only after the owner's reply.
- The live `ng065` full-tier re-proof needs the built tree and the key store on `legion`; if the key store or a rebuilt updater is absent, the plant is proven by `--self-test` and the live run is recorded as the owner step, not claimed green.

### Assumptions about unfinished dependencies (recorded, not resolved here)
- Phase 41 waits on the owner (live `repo-controls` row, second owner, both Apps, empty `powerbrowser-updates` and tap repos). Phase 44 assumes none of that exists: the `powerbrowser-updates` repo may not exist, so every descriptor write in this phase targets local fixture/draft output only — no writes to that repo, no `channel-live` claim.
- Phase 45 (container build) and Phase 49 (`release.yml`, `release-manifest.json`, `sign-publish`, per-target descriptors in the updates repo) are not done. `release-manifest.json` does not exist yet, and `--rollback-to` lives with the Phase 49/50 train and withdraw job — this phase defines the monotonicity contract and its row, but does not build the rollback dispatcher.
- Phase 50 owns the first real N to N+1 hop drill (`served: release`); this phase's descriptor work is proven by byte-identity re-emission and self-test fixtures, not by a live hop.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` "Phase B: Trust path" and `ARCHITECTURE.md` (the `scripts/build-update-xml.mjs` row: NEW CLI over the existing `buildUpdateXml`, one descriptor per BUILD_TARGET, import-not-copy), plus:

- `patches/030-powerbrowser-mar-certificates.patch` (both updater slots name `mar-primary.der` today) and `scripts/regenerate-patches.sh` (`--check` re-derives from `git -C upstream diff HEAD`).
- `scripts/verify-ng-065-mar-signature.mjs` (fork-signed applies; unsigned/foreign-key refused with `CERT_VERIFY_ERROR`; wrong-channel refused; key store at `~/.config/powerbrowser-release/mar-key/`, outside the repo).
- `scripts/verify-mar-update-hop.mjs` (`buildUpdateXml`/`parseUpdateXml` are the single descriptor source; idempotency is asserted by emitting twice).
- `docs/RELEASING.md` "The MAR key ceremony and custody", "### Key rotation", and the verification-map table (`build-update-xml-self-test`, `mar-sign-self-test` rows).
- `objdir/config.status` (`TARGET_XPCOM_ABI`, `OS_TARGET`) and `objdir/dist/bin/application.ini` (`BuildID`) as the built-tree sources the CLI and the monotonic row derive from.

</code>

<specifics>
## Specific Ideas

- SEC-05's secondary slot: patch 030 regenerated with `regenerate-patches.sh` so the primary DER stays in one slot and a distinct secondary DER fills the other; `patches-regenerated` stays green; `ng065` gains a "signed by the secondary key only" plant that must be accepted.
- UPD-14's CLI imports `buildUpdateXml` from `verify-mar-update-hop.mjs` (never a copy) and writes one descriptor per BUILD_TARGET with `detailsURL`, idempotently, from the built artifacts.
- UPD-26's row reads the published buildIDs from the Releases' `release-manifest.json` (absent today: zero Releases — define the empty-set behaviour with a named line, as `release-identity` does for zero tags), requires every offered buildID to strictly exceed every published one for that appVersion, and its self-test plants a same-version older-buildID descriptor.
- The updater accepts a MAR signed by either slot's key; the secondary plant proves exactly that, against the rebuilt updater once it embeds both certificates.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
