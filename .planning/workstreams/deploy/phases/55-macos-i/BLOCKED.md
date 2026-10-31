# Phase 55 BLOCKED pieces (owner action required)

Executor run of 2026-10-31. These pieces need the owner or a macOS host. Everything else in plans
55-01 and 55-02 was built and proven locally. No Apple account, certificate, API key, notarization,
hosted runner dispatch, push or payment was attempted.

## 1. Apple SDK licence verdict for Linux cross builds (SEC-13)

- **What:** the licence text governing the macOS SDK package fetched by `unpack-sdk.py` was not
  obtained from the agent shell. The position is UNSETTLED.
- **Why:** the Apple pages reachable from the agent shell do not carry the Xcode or Command Line
  Tools licence text (see `55-SEC13-MEMO.md`, section 1).
- **Owner steps:**
  1. Read the Xcode and Command Line Tools licence (the text shown at install time or on the Apple
     developer download page).
  2. Quote the clause on redistribution and use on non-Apple hardware.
  3. Record the verdict in `55-SEC13-MEMO.md` section 1 with the date. If the verdict is "no", the
     release build moves to the hosted `macos-26` native build.

## 2. Apple Team ID and the hook-only Team-ID patch (PKG-24, plan 55-03)

- **What:** the upstream production entitlement plists carry Mozilla's Team ID `43AQ936H96` and
  `org.mozilla` identifiers, and the two restricted keys. The `mac-entitlements` gate excludes exactly
  those ten hits while `.planning/WINDOWS.md` entry 22 is open.
- **Why:** the cure is a hook-only patch that supplies the PowerBrowser Team ID. The Team ID comes
  from the owner's Apple Developer account, which does not exist yet (Owner Decision 10: enrolment
  after the Phase 47 site is live and a D-U-N-S number exists).
- **Owner steps:**
  1. Complete D-U-N-S and Apple Developer Program enrolment (owner action, Decision 10).
  2. Record the Team ID in the owner's secret store. Do not commit it to the repository before the
     hook-only patch exists.
  3. The executor (or the owner) adds the hook-only patch and regenerates it with
     `scripts/regenerate-patches.sh`. It is never text-edited.
  4. Mark `.planning/WINDOWS.md` entry 22 `fixed` and remove the ten `KNOWN_OPEN_HITS` from
     `scripts/verify-mac-entitlements.mjs` in the same commit. The gate then proves the production
     plists are clean.

## 3. Developer ID certificate chain (SEC-13 section 6)

- **What:** which Apple Developer ID CA (G1 or G2) issues the owner's Developer ID Application
  certificate. G1 expires 2027-02-01 and G2 expires 2031-09-17, both per Apple's page read on
  2026-10-31.
- **Owner steps:** after the certificate exists, read its chain and record the issuing CA in the SEC-13
  memo, section 3, and in the `docs/RENEWALS.md` row.

## 4. rcodesign re-read at the owner checkpoint (SEC-13 section 2)

- **What:** the rcodesign pin is 0.29.0, the newest published release as of 2026-10-31.
- **Owner step:** re-read the release page before the signing wiring is used. A newer release updates
  section 2 of the memo.

## 5. Plans 55-03 and 55-04 (not executed in this run)

- Plan 55-03 needs Phase 49's `release.yml` and the Team-ID patch from item 2.
- Plan 55-04 is the owner checkpoint: live Apple actions, the hosted `macos-26` matrix, and the real-Mac
  Gatekeeper session. Every step there is an owner action.
