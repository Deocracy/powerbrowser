---
phase: 47-hosting-website-and-mail-d
plan: 03
subsystem: infra
tags: [cloudflare-pages, redirects, updates-host, renewals, release-docs]

requires:
  - phase: 47-hosting-website-and-mail-d
    provides: plan 47-01 updates-repo-static row, which reads the tree this plan stages
provides:
  - updates-staging/_redirects (the one eleven-segment 200 rule)
  - updates-staging/default/Linux_x86_64-gcc3/update.xml (two-line no-update placeholder)
  - docs/RELEASING.md Pages section corrected to four real routes and the R2 primary MAR origin
  - docs/RENEWALS.md Cloudflare credentials block with one named holder per credential

affects: [47-04 owner push and live probes, 49 DIST-08 R2 copy and token minting]

actuals:
  tokens: 2939
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Static-only updates host: one _redirects rule over a committed placeholder tree, no compute"

key-files:
  created:
    - updates-staging/_redirects
    - updates-staging/default/Linux_x86_64-gcc3/update.xml
  modified:
    - docs/RELEASING.md
    - docs/RENEWALS.md
    - scripts/verify-release-identity.mjs

key-decisions:
  - "The R2 bucket is the primary MAR origin at downloads.powerbrowser.org (owner ruling 2026-10-29). Docs and the RENEWALS row describe it as primary, not as a fallback."
  - "The placeholder descriptor is an explicit empty updates document. The release-identity check now accepts that shape and still rejects a file with no updates element at all."
  - "The Cloudflare credential rows use the secrets-inventory columns (Scope, Name, Arrives in, Holder) plus renewal and owner action, in their own block with no per-release heading."
  - "The RELEASING.md Pages text drops the single-page #download redirect; the stage table row that named it is updated to the four routes."

patterns-established:
  - "Credential rows name exactly one holder and a renewal date or the reason none is set yet"

requirements-completed: [DIST-03, INF-06]

coverage:
  - id: D1
    description: "The updates staging tree holds exactly one _redirects rule and the placeholder descriptor, with no functions directory and no worker file"
    requirement: "DIST-03"
    verification:
      - kind: automated
        ref: "updates-repo-static absence check over the staged listing (runChecks, in memory): 0 failures over 2 paths"
        status: pass
    human_judgment: false
  - id: D2
    description: "RELEASING.md Pages section carries four real routes, no fragment redirect, and the R2 primary origin"
    requirement: "DIST-03"
    verification:
      - kind: automated
        ref: "grep checks in the plan 47-03 acceptance (route paths present, fragment line absent)"
        status: pass
    human_judgment: false
  - id: D3
    description: "RENEWALS.md carries a Cloudflare row per credential with a named holder, and the maintenance sweep holds no Cloudflare token"
    requirement: "INF-06"
    verification:
      - kind: automated
        ref: "grep -c CLOUDFLARE .github/workflows/*.yml = 0; holder count in RENEWALS.md"
        status: pass
    human_judgment: true
    rationale: "The token minting, expiry dates and the holder naming are owner actions at the plan 47-04 checkpoint; the rows record that they are not yet minted."

duration: approx. 50min
completed: 2026-10-29
status: complete
---

# Phase 47 Plan 03: Updates host tree and release doc corrections Summary

**The updates staging tree holds only the one eleven-segment 200 rule and the placeholder descriptor, the Pages docs describe four real routes and the R2 primary MAR origin, and every Cloudflare credential has a named holder.**

## Performance

- **Duration:** approx. 50min
- **Tasks:** 2
- **Files created:** 2; **modified:** 3

## Staged tree

```
updates-staging/_redirects
updates-staging/default/Linux_x86_64-gcc3/update.xml
```

The rule line, exactly one non-comment line:

```
/update/6/:product/:version/:buildid/:target/:locale/:channel/:osversion/:syscaps/:dist/:distversion/update.xml  /:channel/:target/update.xml  200
```

The placeholder body:

```
<?xml version="1.0"?>
<updates></updates>
```

The absence check over this exact listing (run through the row's own `runChecks` with an in-memory getter, no network) returned 0 failures over 2 paths. `find updates-staging -type d -name functions` is empty, and no `_worker.js` exists.

## RENEWALS rows

| Credential | Holder | Status |
|---|---|---|
| Cloudflare account login | Owner | 2FA to be confirmed before any token is minted |
| Wrangler deploy token (scheduler and telemetry repositories only) | Owner | not yet minted |
| R2 object-write token (`release` environment secret, MAR bucket only) | Owner | not yet minted; R2 enablement is an owner action |
| Maintenance sweep | none (holds no Cloudflare token) | `grep -c CLOUDFLARE .github/workflows/*.yml` returns 0 in all three workflows |

## Quick gate

`scripts/verify-platform.sh --quick` exits 0 after the three commits: `verify-platform: PASS -- all checks passed`. The brand residue scan over the staged tree also passes.

## Task Commits

1. **Task 1: updates staging tree** - `aecfb09` (feat)
2. **Task 2: RELEASING Pages correction and RENEWALS rows** - `c4f21b3` (docs)
3. **Release-identity no-update carve-out** - `1c05e23` (fix). The first quick run went red: `verify-release-identity` requires an `<update>` element in every tracked `update.xml`, which the placeholder cannot have. See Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] release-identity rejected the placeholder descriptor**
- **Found during:** the quick gate after Task 1
- **Issue:** `updates-staging/default/Linux_x86_64-gcc3/update.xml` carries no `<update>` element, so the row reported it as having no version to agree with. The placeholder path is locked by the DIST-03 design, so the file cannot move.
- **Fix:** the check accepts an explicit empty `<updates>` document (no `<update>` child) as a no-update descriptor. A file with no `<updates>` element at all, such as a truncated one, stays red. The self-test gains a control for the empty document and a plant for the truncated file (eight planted faults and six controls now).
- **Files modified:** `scripts/verify-release-identity.mjs`
- **Commit:** `1c05e23`

### Documentation changes that go beyond "keep byte-identical"

The plan said to keep the 25 MiB MAR note byte-identical. Three sentences in `docs/RELEASING.md` conflict with the 2026-10-29 ruling, so they were changed:

- **MAR note:** "MAR bytes stay on GitHub Release assets" now reads that MAR bytes never go on Pages, and that the primary MAR origin is R2 at `downloads.powerbrowser.org`. The 25 MiB reason is unchanged.
- **Descriptor patch URL:** it was documented as always the `/releases/download/<tag>/` form. It now names the R2 origin, and github.com is excluded because it is user-initiated.
- **Stage table row:** it named the retired `/download /#download 302` redirect. It now names the four routes.

### Plan-text items not applied as written

- The RELEASING Pages section keeps its two-project paragraph, eleven-segment rule block, placeholder paragraph and 25 MiB sentence (with the R2 correction above). The fragment-redirect line is gone; the acceptance grep for `/download /#download 302` now returns 0.
- The RENEWALS Cloudflare rows sit in their own `## Cloudflare credentials` block with the secrets-inventory columns. The existing RENEWALS table (Item, Date / cadence, Owner action) is unchanged.
- The R2 credential is described as the primary MAR origin. The plan's "MAR fallback bucket" wording is not used, because of the ruling.

## Owner follow-up

- **Cloudflare 2FA.** Confirm 2FA on the account before minting any token.
- **Wrangler deploy token.** Mint it scoped to the scheduler and telemetry repositories only, store it there, and record its expiry date in `docs/RENEWALS.md`.
- **R2 object-write token.** Enable R2 (a payment method may be required). Mint a token scoped to the MAR bucket that serves `downloads.powerbrowser.org`, store it as a `release` environment secret, and record its expiry date. The bucket name and secret name are set when Phase 49 lands.
- **Planning text.** `.planning/workstreams/deploy/REQUIREMENTS.md` INF-06 still says "MAR fallback bucket", and some 47 plan text says "R2 fallback". Those texts are outside this plan and were not edited here; the planner should align them with the 2026-10-29 ruling.
- **Notice files.** The legal page links `LICENSING.md` and `THIRD-PARTY-NOTICES.txt`; see the 47-02 follow-up for the copy at push time.

## Known Stubs

- `docs/RENEWALS.md`: the Cloudflare rows state "not yet minted" and carry no expiry date. This is deliberate until the owner mints the tokens.

## Threat Flags

None. The staged tree adds no endpoint, function or worker; the absence check guards that.

## Self-Check: PASSED

- `updates-staging/_redirects` and `updates-staging/default/Linux_x86_64-gcc3/update.xml` are committed in `aecfb09`.
- `docs/RELEASING.md` and `docs/RENEWALS.md` are committed in `c4f21b3`.
- The release-identity change is committed in `1c05e23`.
- `git merge-base --is-ancestor 1c05e23 HEAD` holds.
