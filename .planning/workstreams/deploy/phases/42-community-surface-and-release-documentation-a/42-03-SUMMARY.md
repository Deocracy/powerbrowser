---
phase: 42-community-surface-and-release-documentation-a
plan: 03
subsystem: docs
tags: [renewals, community-health, security-policy, drafts-reconciliation, quick-gate]

# Dependency graph
requires:
  - phase: 42-community-surface-and-release-documentation-a
    provides: labels gate and issue forms that link to SECURITY.md (plan 42-02)
provides:
  - docs/RENEWALS.md, the renewals register with a date and an owner action per row
  - scripts/verify-renewals.mjs, the structure-only renewals row and its self-test
  - SECURITY.md, SUPPORT.md and docs/KNOWN-ISSUES.md in the product repository
  - org-github/ staged bodies for the organization .github repository (SECURITY, CONTRIBUTING, CODE_OF_CONDUCT)
  - 42-RECONCILIATION.md, the S2, S3 and S8 verdict record
affects: [42-04 owner checkpoint (org .github PRs), 48 renewals-due sweep row, 47 INF-02 mailbox routing, 53 TEL-05 Copy button, 48 TEL-06 payload]

# Actuals (#2632)
actuals:
  tokens: 7100
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "structure-only register gate: date cell and owner-action cell per row, no calendar logic, no network"
    - "staged organization files kept free of the vendor display name, so the manifest-literal gate stays green"

key-files:
  created:
    - docs/RENEWALS.md
    - scripts/verify-renewals.mjs
    - SECURITY.md
    - SUPPORT.md
    - docs/KNOWN-ISSUES.md
    - org-github/SECURITY.md
    - org-github/CONTRIBUTING.md
    - org-github/CODE_OF_CONDUCT.md
    - .planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-RECONCILIATION.md
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "Where no expiry is recorded in the tree, the RENEWALS date cell holds the register check date (2026-10-29) and says the expiry is not recorded; the owner replaces it with the provider's expiry"
  - "The renewals row checks structure only; it does not require the DOC-04 family to be present, because the family is a review item, not a tree fact"
  - "The org bodies say this organization rather than the display name, because the manifest-literal gate forbids the display name outside manifest-owned surfaces"
  - "S8 message field verdict is CURRENT, not SUPERSEDED: TEL-06 is Pending and the tree still sends the error message; the RESEARCH wording was corrected in the record"

patterns-established:
  - "Each verdict in a reconciliation record names the landed proof or the owner requirement that holds it"

requirements-completed: [DOC-04, DOC-06]

coverage:
  - id: D1
    description: "docs/RENEWALS.md lists every renewable row with a date and an owner action, and the renewals row is green"
    requirement: "DOC-04"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-platform.sh --only renewals (18 rows, PASS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A dateless, actionless, non-imperative, short, headerless, duplicate or empty register goes red naming the row"
    requirement: "DOC-04"
    verification:
      - kind: unit
        ref: "scripts/verify-renewals.mjs --self-test (7 plants red, Month YYYY control green)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SECURITY.md, SUPPORT.md and docs/KNOWN-ISSUES.md exist in the product repository with plain copy and no internal identifiers"
    requirement: "GH-14"
    verification:
      - kind: automated_ui
        ref: "file existence, security@ grep, identifier scan, scan-brand-residue (quick)"
        status: pass
    human_judgment: true
    rationale: "Tone, the acknowledgement window and the mailbox are owner decisions to confirm at the checkpoint"
  - id: D4
    description: "The org .github bodies (SECURITY, CONTRIBUTING, CODE_OF_CONDUCT) are staged for the owner's PRs"
    requirement: "GH-14"
    verification:
      - kind: automated_ui
        ref: "file existence under org-github/ (quick: brand scan, manifest-literal gate)"
        status: pass
    human_judgment: false
  - id: D5
    description: "S2, S3 and S8 each carry a SUPERSEDED or CURRENT verdict with its landed fact or owner, and no draft changed"
    requirement: "DOC-06"
    verification:
      - kind: automated_ui
        ref: "42-RECONCILIATION.md (13 verdict lines); git status of .planning/drafts/distribution/ empty"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-29
status: complete
---

# Phase 42 Plan 03: Renewals register, community health files and draft reconciliation

**The renewals register lists 18 renewable items with a date and an owner action and a green structure gate; the product health files exist; S2, S3 and S8 carry verdicts against the landed proofs.**

## Performance

- **Duration:** about 50 min
- **Tasks:** 3, committed one per task
- **Files:** 9 created, 1 modified

## Accomplishments
- `docs/RENEWALS.md`: 18 rows (Safe Browsing key from UPD-29, domain, Apple membership, Developer ID, Azure validation, App keys, Cachix, two Cloudflare tokens, telemetry secret, Codeberg, two Anthropic keys, winget credential, MAR certificate 2046, Node 24 end of life, ESR 153 final point, ESR 175 train dates).
- `scripts/verify-renewals.mjs`: header must be Item | Date | Owner action | Source; each row has a recognizable date (ISO, Month YYYY or a year), an action beginning with an imperative verb, and an item name that no other row repeats. No calendar logic, no network.
- Two registry rows, `renewals` and `renewals-self-test`, after the labels rows.
- Product health files: `SECURITY.md` (private route first, then the security address; latest release only; acknowledgement within 5 business days), `SUPPORT.md`, `docs/KNOWN-ISSUES.md`.
- Staged organization bodies under `org-github/` for the owner's PRs to the `.github` repository.
- `42-RECONCILIATION.md`: per-draft verdicts with the landed proof or the owning requirement.

## Renewals row output

```
renewals: PASS -- 18 row(s) in docs/RENEWALS.md each carry a date and an owner action, and no item is named twice
renewals: --self-test PASS -- 7 planted faults went red naming the row, and 1 control(s) stayed green
```

Planted faults: dateless row, actionless row, non-imperative action, row with a missing cell, missing header, duplicate item, table with no rows. Control: a Month YYYY deadline stays green.

## Product health file listing

- `SECURITY.md`
- `SUPPORT.md`
- `docs/KNOWN-ISSUES.md`
- `org-github/SECURITY.md`
- `org-github/CONTRIBUTING.md`
- `org-github/CODE_OF_CONDUCT.md`

Checks: all six exist; `security@powerbrowser.org` appears in both SECURITY.md files; no pref-style key, port, sentinel or update-host token appears in the six bodies; `scan-brand-residue` and `verify-manifest-literals` pass.

## Draft verdicts

- **S2: SUPERSEDED** by Phase 40 (update channel gate, no `AppUpdateURL`) and REL-01 (revision as a TOML integer).
- **S3: SUPERSEDED** for the unsigned baseline by NG-065; **CURRENT** for SEC-07 (Phase 49) and SEC-09 (Phase B).
- **S8: CURRENT** for the bug form field ids (implemented in plan 42-02) and for the message field (TEL-06, Phase 48); **SUPERSEDED** for diagnostics in the URL (TEL-05, Phase 53).

No draft under `.planning/drafts/distribution/` was edited.

## Task Commits

1. **Task 1: renewals register and structure gate** - `7284434` (feat)
2. **Task 2: health files and staged org bodies** - `1bd4685` (docs)
3. **Task 3: reconciliation record** - `bf782d2` (docs)

## Files Created/Modified
- `docs/RENEWALS.md` - the register (reshaped from the 45-04 three-column table; its Safe Browsing row kept)
- `scripts/verify-renewals.mjs` - structure-only row and self-test
- `scripts/verify-platform.sh` - `renewals` and `renewals-self-test` rows
- `SECURITY.md`, `SUPPORT.md`, `docs/KNOWN-ISSUES.md` - product health files
- `org-github/SECURITY.md`, `org-github/CONTRIBUTING.md`, `org-github/CODE_OF_CONDUCT.md` - staged org bodies
- `.planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-RECONCILIATION.md` - verdicts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing RENEWALS row would fail the new structure check**
- **Found during:** Task 1
- **Issue:** `docs/RENEWALS.md` already existed (plan 45-04, one row, three columns). Its date cell read "No expiry; rotate on compromise", which has no date.
- **Fix:** Rewrote the table to four columns and gave the Safe Browsing row the date 2026-10-29 with the no-expiry text kept beside it.
- **Commit:** 7284434

**2. [Rule 1 - Bug] Action verb not in the list**
- **Found during:** Task 1
- **Issue:** The Safe Browsing action began with "Re-obtain", which the verb list does not hold.
- **Fix:** Reworded to "Rotate the key: obtain a new one ...".
- **Commit:** 7284434

**3. [Rule 3 - Blocking] Vendor display name in org bodies**
- **Found during:** Task 2 quick gate
- **Issue:** `verify-manifest-literals` rejects the configured display name "DeBIOS Foundation" in three org bodies.
- **Fix:** Reworded the headings and opening lines to "this organization". The gate was not edited.
- **Commit:** 1bd4685

**4. [Rule 1 - Bug] Research record stated an unlanded fact**
- **Found during:** Task 3
- **Issue:** RESEARCH Pattern 5 said the S8 message-field correction was landed TEL-06 work. REQUIREMENTS lists TEL-06 as Pending (Phase 48), and `telemetry-sender.ts` still sends the error message.
- **Fix:** The S8 message field is recorded as CURRENT, with TEL-06 as its owner, and the correction is written into the record.
- **Commit:** bf782d2

### Process deviations
- Plan says "do not commit"; this session's instruction says to commit per task. Followed the instruction.
- The plan-head base for this plan was recorded after its first commit. The value (5b29073) is the HEAD before it.
- Plan named a "security address second" link in config.yml (plan 42-02 T-42-05). Config.yml carries the policy and Discussions links only. The security address appears in SECURITY.md, as GH-14 asks.

## Issues Encountered
- Markdown lint reports MD034 (bare URL or address) warnings on the email lines in SECURITY.md and CODE_OF_CONDUCT.md. These are warnings from the editor, not gate failures; the gate is green.

## Known Stubs
None.

## Owner follow-up
- **Acknowledgement window (5 business days) and the wording of SECURITY.md.** The window is a promise to strangers. Confirm it, or change it, before the org `.github` PR lands. Costly to reverse.
- **security@powerbrowser.org and contact@powerbrowser.org are not yet routed.** INF-02 (Phase 47) routes them. SECURITY.md and the CODE_OF_CONDUCT.md reporting address point at them now. Do not publish either until a test message reaches the owner.
- **Org `.github` repository (42-04 checkpoint).** The repository is absent (404 at the 2026-10-22 probe). The owner creates it empty, then opens PRs from `org-github/` for SECURITY.md, CONTRIBUTING.md and CODE_OF_CONDUCT.md. GH-14 is complete for the product half only until those PRs merge.
- **RENEWALS expiry dates.** The rows dated 2026-10-29 with "expiry not recorded in the tree" need the provider's expiry entered at each row. The renewals row cannot tell a recorded date from a check date.
- **Renewals row does not require the DOC-04 family.** Presence of each named item is a review item. If the owner wants it enforced, add a required-items list to `verify-renewals.mjs` in a reviewed commit.

## Self-Check: PASSED
- All nine created files and the one modified file are tracked in `7284434`, `1bd4685` and `bf782d2`.
- `scripts/verify-renewals.mjs` main run exits 0; `--self-test` exits 0.
- `scripts/verify-platform.sh --quick` exits 0 on the committed tree.
- `.planning/drafts/distribution/` has no modifications.
