# Phase 55 macOS install matrix record (DRAFT)

**Status: DRAFT. The owner session has not run.** Every value marked UNVERIFIED is unobserved. A cell
becomes GREEN only when someone watched it happen and wrote the evidence here. Nothing in this file is
inferred from the build alone, so an unrun session can never read as a pass.

Read by two gates, both of which derive what they compare from the tree and never from a kept list:

- `scripts/verify-macos-install-matrix.mjs` (row `macos-install-matrix`): cell set, one verdict line per
  cell, a cause on every RED, observed BUILD_TARGET set equal to the emitted descriptor set, per-user
  paths, the Gatekeeper block.
- `scripts/verify-macos-download-copy.mjs` (row `macos-download-copy`): the download page claims exactly
  what this record observed.

Verdict line shape, exactly one per cell: `**Verdict: GREEN**`, `**Verdict: UNVERIFIED**`, or
`**Verdict: RED** — <cause>`. A RED without a cause is a malformed record.

Governing decisions: locked owner decision D-77 (no schedule key anywhere); Owner Decision 10 (Apple
enrolment after the site is live), 12 (24-hour canary), 18 (descriptor gate); assumptions A1, A2, A3 as
`55-CONTEXT.md` writes them, recorded in `55-SEC13-MEMO.md`.

## Build identity

- **Build record SHA256:** UNVERIFIED
- **Mac SHA256:** UNVERIFIED
- **Complete MAR size (bytes):** UNVERIFIED
- **Locale scope:** en-US
- **Hosted run:** UNVERIFIED

## Signing status

- **Signature:** UNVERIFIED
- **Notarization:** UNVERIFIED
- **Staple:** UNVERIFIED

## Hosted draft-DMG matrix

### install

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### launch

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### alongside stock Firefox

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### uninstall + no-residue

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### N to N-plus-1 hop

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

## Real-Mac session

- **Hardware:** UNVERIFIED

### install

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### launch

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### alongside stock Firefox

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### uninstall + no-residue

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

### N to N-plus-1 hop

**Verdict: UNVERIFIED**

- **Evidence:** UNVERIFIED

## Observed BUILD_TARGET

One line per target, read off the running build. The set must equal the descriptor set the packaging
step emits, one line per emitted target.

- BUILD_TARGET: UNVERIFIED
- BUILD_TARGET: UNVERIFIED

## Per-user paths

Paths the installed product wrote under the real per-user directories, from the install-time diff. After
the uninstall, list what survives, or write `none`.

- PATH: UNVERIFIED
- **Surviving after uninstall:** UNVERIFIED

## Gatekeeper observation

- **Verbatim:** UNVERIFIED
- **Path:** UNVERIFIED
- **Update limit:** UNVERIFIED
