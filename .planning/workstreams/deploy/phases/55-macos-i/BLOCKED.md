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

## 5. Node darwin pins: owner gpg check (plan 55-02)

- **What:** `powerbrowser/packaging/node-runtime.json` carries `darwin-arm64` and `darwin-x64` pins
  for v24.19.0. Each sha256 is the `.tar.gz` entry of nodejs.org `SHASUMS256.txt`, read on
  2026-10-31. The signature file was fetched, but this shell has no `gpg` and no Node release keyring,
  so the signature was not verified.
- **Owner steps:** run `gpg --verify SHASUMS256.txt.sig SHASUMS256.txt` with the Node release keys
  (RELEASING.md "Node provenance"), then record the result in the release notes. The script enforces
  the pin, not the key trust.

## 6. DMG branding placeholders (plan 55-02, WINDOWS.md entry 23)

- **What:** `Assets.car` and `dsstore` are empty, and `background.png` is the 128-pixel icon. The Dock
  and Finder icon degrades until a real asset catalog exists.
- **Owner steps (Mac):** build an asset catalog with `actool` for the application icon, replace the
  placeholder `Assets.car` in `emitAssetsCarPlaceholder`, and observe the icon in the plan 55-04
  session. Then mark WINDOWS.md entry 23 `fixed`.

## 7. Plans 55-03 and 55-04 (not executed in this run)

- Plan 55-03 needs Phase 49's `release.yml` and the Team-ID patch from item 2.
- Plan 55-04 is the owner checkpoint: live Apple actions, the hosted `macos-26` matrix, and the real-Mac
  Gatekeeper session. Every step there is an owner action.

## 8. Build-time checks that have not run (no macOS host)

- `package-macos.sh` is syntax-checked (`bash -n`) and its argument guard and pin read are exercised.
  The Gecko `mach package`, the Theia staging and the Mach-O checks have not run. They need a built
  objdir and a macOS-capable toolchain.
- The Darwin mozconfigs inherit the shared lines `--with-libclang-path="$LIBCLANG_PATH"` and
  `--without-wasm-sandboxed-libraries` from the Linux dev row, and they reference `$MOZ_FETCHES_DIR`
  for the SDK and DMG tools. Confirm both at the first cross configure.

## Ship gate

WINDOWS.md entries 22 (Team ID, item 2) and 23 (placeholders, item 6) are open, so `/gsd-ship` stays
blocked for Phase 55 until the owner completes them.
