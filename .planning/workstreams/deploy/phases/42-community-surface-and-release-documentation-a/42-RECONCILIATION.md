# Phase 42 reconciliation: drafts S2, S3 and S8 (DOC-06)

Each verdict names the landed fact or the surviving owner action, so a reviewer can check the line against the tree. No draft file under `.planning/drafts/distribution/` was edited.

Verdict vocabulary:

- **SUPERSEDED**: the draft assumed something the tree or a landed requirement has replaced. The line names the replacement.
- **CURRENT**: the draft's action or contract still applies. The line names the requirement or row that owns it.

## S2: release identity

**Verdict: SUPERSEDED**, by Phase 40 and REL-01.

| Draft assumption | Landed fact | Evidence |
|---|---|---|
| Update channel `release` | The update channel, the MAR channel id and the accepted id derive from one constant through `updateChannel(config)`, and the mozconfig must agree with it | `scripts/verify-update-channel.mjs`, quick row `update-channel` (green) |
| `AppUpdateURL` policy file as the update source | `distribution/policies.json` carries no `AppUpdateURL` key at all; the baked update host is the one source | UPD-12 [x]; `scripts/verify-update-channel.mjs` consumer and policy check |
| Revision as a display version feeding Gecko | `revision` is a TOML integer in `configuration.toml [product]`; `releaseIdentity(config)` derives the release key and the version files as release metadata | REL-01 [x]; `scripts/generate.mjs` `releaseIdentity` |

No surviving action in S2 that the tree lacks.

## S3: MAR signing and update integrity

**Verdict: SUPERSEDED for the unsigned baseline and the unsigned-build work; CURRENT for two surviving actions.**

| Draft assumption | Landed fact | Evidence |
|---|---|---|
| Unsigned MAR baseline | Fork MAR certificate in patch 030 and signature enforcement, with unsigned and wrong-channel plants | NG-065 done; `scripts/verify-ng-065-mar-signature.mjs` |
| Unsigned-build flag and removal work | Covered by the NG-065 enforcement proof | NG-065 done |
| Release signing with the container-built `signmar`, read of the MAR product-info channel before signing | **Not landed.** Owned by SEC-07 (Phase 49, Pending) | REQUIREMENTS SEC-07 |
| Secondary key, key ceremony and rotation | **Not landed.** Owned by SEC-09 (Phase B) | REQUIREMENTS SEC-09 |

CURRENT owners: SEC-07 (Phase 49) and SEC-09 (Phase B). Neither is closed by this phase.

## S8: reports, bug and error crash

**Verdict: CURRENT for the form contract; SUPERSEDED for the diagnostics-in-URL design; CURRENT for the message field, which is still in the tree.**

| Draft assumption | Verdict | Owner and evidence |
|---|---|---|
| `bug.yml` with the field ids `version`, `os` and `install_format` as URL-prefillable text inputs, plus steps, expected and diagnostics | **CURRENT, implemented here** | Plan 42-02: `.github/ISSUE_TEMPLATE/bug.yml`; `scripts/verify-labels.mjs` checks the three ids as text inputs |
| A prefilled URL carries a pasted diagnostics block | **SUPERSEDED** by TEL-05: diagnostics never appear in a URL; a Copy button on the diagnostics layer copies them | TEL-05 (Phase 53, Pending) |
| `message` in the error payload sent to telemetry | **CURRENT, not yet superseded.** TEL-06 (Phase 48, Pending) requires the payload to carry version, buildID and OS with no message or stack. The tree still sends the error message: `theia/extensions/telemetry/src/browser/telemetry-sender.ts` derives the error name from `error.message` | TEL-06 (Phase 48); NG-067 done proves frontend errors reach the logger, not the payload shape |

**Correction to the research record.** RESEARCH Pattern 5 stated that the message-field correction was "landed TEL-06 work". TEL-06 is Pending in REQUIREMENTS, so the message field is an open CURRENT item owned by Phase 48, not a superseded assumption. This record takes the requirement table as the source of truth.

## Summary

| Draft | Verdict | Surviving owner |
|---|---|---|
| S2 | SUPERSEDED | none |
| S3 | SUPERSEDED (unsigned baseline) and CURRENT (signing, key ceremony) | SEC-07 (Phase 49), SEC-09 (Phase B) |
| S8 | CURRENT (form ids, message field), SUPERSEDED (diagnostics in URL) | TEL-05 (Phase 53), TEL-06 (Phase 48) |
