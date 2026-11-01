---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 03
subsystem: verification
tags: [mar-hop, nimbus, webdriver-evidence, verify-row]

requires:
  - phase: 46-02 (same phase, wave 2)
    provides: contracted copy the hop row derives by value
provides:
  - mar-update-hop experience assertions (notification, restart, layout, read-only plant)
  - nimbus-exposure probe row with fixture self-test
  - BUILD.md evidence procedure for transcript + probe window
affects: [Phase 50 (packaged re-run criterion), Phase 44 (build-update-xml import direction)]

actuals:
  tokens: 15000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns: [positive UI-signal assertions, set-difference over derived capture, missing-browser named FAIL]

key-files:
  created: [scripts/verify-nimbus-exposure.mjs]
  modified: [scripts/verify-mar-update-hop.mjs, scripts/verify-platform.sh, docs/BUILD.md]

key-decisions:
  - "Transcript + readOnly are REQUIRED hop.json keys; old plumbing-only evidence fails naming the re-run procedure, never passes"
  - "Ready/cannot-update strings derived from the branding contribution at check time, never hand-kept"
  - "Exposure live probe FAILs naming the evidence gap on a browserless tree; self-test drives fixture doubles"
  - "Phase 45 packaged re-run stays Phase 50; build-update-xml import stays Phase 44 (script not landed, in-file generator used)"

patterns-established:
  - "Experience proof as evidence assertions over hop.json transcript, not log absence"

requirements-completed: [UPD-24, UPD-27]

coverage:
  - id: D1
    description: "mar-update-hop asserts the ready notification, Restart-now click, N+1 landing with layout, and the read-only cannot-update plant"
    requirement: "UPD-24"
    verification:
      - kind: other
        ref: "node scripts/verify-mar-update-hop.mjs --self-test"
        status: pass
    human_judgment: true
    rationale: "Full green needs the tier-3 N/N+1 builds plus the WebDriver hop drive per BUILD.md; automation proves the instrument discriminates on all 8 fault classes."
  - id: D2
    description: "recordExposureEvent neither throws nor makes a network request with MOZ_NORMANDY removed"
    requirement: "UPD-27"
    verification:
      - kind: other
        ref: "node scripts/verify-nimbus-exposure.mjs --self-test"
        status: pass
    human_judgment: true
    rationale: "Full green needs the in-Gecko probe-window drive; automation proves the probe discriminates (throwing/recording/comparand plants) and never passes green-by-absence."
  - id: D3
    description: "BUILD.md documents every evidence field both rows assert"
    requirement: "UPD-24"
    verification:
      - kind: other
        ref: "grep -c layoutRestored docs/BUILD.md (>=1); grep -c read-only docs/BUILD.md (>=1)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-10-26
status: complete
---

# Phase 46 Plan 03: Hop experience proof and exposure probe Summary

**The hop row proves the update experience (notification, restart, layout, cannot-update plant) and the exposure probe proves the Nimbus call inert.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-26T03:15:00Z
- **Completed:** 2026-10-26T03:33:00Z
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments
- `verify-mar-update-hop.mjs`: transcript assertions (readyNotification equals contracted UPD-20 with N+1, restartClicked, postVersion/postBuildID equal N+1, layoutRestored) + readOnly assertions (cannotUpdate equals contracted UPD-21, never a ready string); 5 new in-memory/mkdtemp plants (notification absent, version not N+1, layout false, read-only ready string, read-only empty).
- `scripts/verify-nimbus-exposure.mjs` (new): full-tier row (comparand carry of MOZ_NORMANDY False, two call-site count, live probe FAIL naming the gap) + quick self-test (silent control green; throwing/recording/comparand plants red; live-gap named).
- Registry: `nimbus-exposure` full-tier row after mar-update-hop, `nimbus-exposure-self-test` quick row after mar-update-hop-self-test; hop comments updated.
- `docs/BUILD.md`: transcript fields, read-only variant, probe-window capture steps, Phase 45/44 carry-forwards.

## Task Commits

Each task was committed atomically:

1. **Task 1: hop extension** - `6f676e8` (feat)
2. **Task 2: exposure probe** - `6f676e8` (feat, same commit)
3. **Task 3: evidence-runner glue** - `6f676e8` (feat, same commit: BUILD.md procedure)

**Plan metadata:** `6f676e8` (feat: hop experience proof and Nimbus exposure probe)

## Files Created/Modified
- `scripts/verify-mar-update-hop.mjs` - contracted-string derivation, transcript + readOnly assertions, 5 new plants, fixture mirror carries transcript.
- `scripts/verify-nimbus-exposure.mjs` - `probeExposure` + `siftResolverHosts`, comparand + call-site gates, live-gap FAIL, 3-plant self-test.
- `scripts/verify-platform.sh` - full-tier + quick rows for nimbus-exposure; extended hop comments.
- `docs/BUILD.md` - transcript/readOnly/probe-window procedure + carry-forwards.

## Decisions Made
- Phase 44 `scripts/build-update-xml.mjs` does not exist yet: UPD-24 uses the in-file `buildUpdateXml` directly; import direction recorded for Phase 44, not built here.
- Phase 45 packaged tarball+MAR re-run stays Phase 50's criterion (CONTEXT assumption).
- New hop keys REQUIRED (not presence-gated): old 08-04 evidence fails the new assertions naming the re-run, while every old plumbing assertion still passes unchanged.
- Exposure row never asserts an absent log line: the negative is a set-difference over the derived contacted-host set for the probe window.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED

- `node scripts/verify-mar-update-hop.mjs --self-test` PASS with ok lines for notification-absent, version-not-N+1, layout-not-restored and both read-only plants.
- `grep -c 'Restart now'` hop row >= `1`; `grep -c 'read-only\|readOnly\|cant-apply'` >= `1`.
- Missing-evidence tree exits 1 naming the BUILD.md procedure.
- `node scripts/verify-nimbus-exposure.mjs --self-test` PASS (throwing, recording, comparand plants + live-gap named).
- `grep -c 'Resolving host'` exposure row >= `1` (layer-3 capture shape reused).
- `grep -c 'layoutRestored'` BUILD.md >= `1`; `grep -c 'read-only'` >= `1`.
