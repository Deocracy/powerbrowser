---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 06
subsystem: updates
gap_closure: true
status: complete
tags: [UPD-24, UPD-14, mar-hop, stage-f]
key-files:
  modified:
    - powerbrowser/packaging/version-nplus1/version.txt
    - powerbrowser/packaging/version-nplus1/version_display.txt
    - docs/BUILD.md
commits: [6d0ef9ed, 3df28992]
---

# 46-06 Summary: N+1 bump and Stage F refresh procedure (G-46)

`powerbrowser/packaging/version-nplus1/` now reads `153.5.2` / `153.5.2esr`, one patch level
above the pinned `FIREFOX_153_5_1esr_RELEASE`. Byte shape is the same as upstream's
`version*.txt`: one line with a trailing newline. docs/BUILD.md "MAR build and serve loop" now
states the current N (153.5.1) and N+1 (153.5.2). Step 1's expected `Version=` and step 3's
`MOZ_PRODUCT_VERSION` are updated. The section explains why the recorded 153.1 evidence is red
(no `served` key, no transcript). It adds the Stage F order:

- a. dev objdir rebuild and package (N)
- b. `objdir-nplus1/` build and package
- c. emit and sign `.mozbuild/mar-hop/nplus1.mar`, replacing the 153.1.1 MAR
- d. `node scripts/drive-mar-update-hop.mjs --n objdir/dist/powerbrowser --nplus1 objdir-nplus1/dist/powerbrowser`
- e. `--only mar-update-hop` and `--only build-update-xml` green, then the Nimbus re-probe (H3)

No build ran. `upstream/` and `objdir*` were not touched (`git -C upstream diff` empty).

## Verification

- `--quick`: green except the known reds. A first run went red on `scan-brand-residue`: the
  text named the finish-plan filename, whose `-PLAN.md` suffix is a counted frozen token. The
  text was reworded and the scan passed.

## Follow-up

- If the release train moves the pin (153.7 window 2026-11-10, R12) before Stage F, bump
  `version-nplus1/` again. The driver's version guard refuses N+1 at or below N.
