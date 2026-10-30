---
phase: 47-hosting-website-and-mail-d
plan: 02
subsystem: ui
tags: [static-site, cloudflare-pages, privacy, legal, download, attestation]

requires:
  - phase: 47-hosting-website-and-mail-d
    provides: plan 47-01 registry rows (the verify chain these pages must keep green)
provides:
  - website-staging/index.html (home page)
  - website-staging/download.html (download, checksums, attestation, signing status, en-US scope, pending update-file size)
  - website-staging/privacy.html (opt-in error report fields, retention, processor, unattended hosts, contact, owner-fill address)
  - website-staging/legal.html (licence and trademark lines, links to the notice files)
affects: [47-04 owner push and live GET probes]

actuals:
  tokens: 4400
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Zero-third-party static pages: one inline style block per page, no external stylesheet, script or font"

key-files:
  created:
    - website-staging/index.html
    - website-staging/download.html
    - website-staging/privacy.html
    - website-staging/legal.html
  modified:
    - scripts/verify-manifest-literals.mjs

key-decisions:
  - "Pages are hand-written literals (no generator), per the Phase 1 rule that every branding value is a literal; the manifest-literals check allowlists the five carrier rows with reasons."
  - "The download and privacy pages link to github.com only for user-initiated clicks; the home and legal pages carry no href to any external host."
  - "The update-file size line says pending and gives no number. The copy does not name an internal phase identifier; see Deviations."
  - "Navigation uses relative file links (download.html and so on), which Pages resolves to the clean routes."

patterns-established:
  - "Locked copy strings (footer sentence, licence and trademark lines, TEL-08 field names) are present as plain text and checked by grep"

requirements-completed: [WEB-01, WEB-02, WEB-03, TEL-08]

coverage:
  - id: D1
    description: "Home page: PowerBrowser spelling, Mozilla non-association footer, no version fact, zero third-party references"
    requirement: "WEB-01"
    verification:
      - kind: automated
        ref: "website-staging/index.html grep checks (see Grep evidence)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Download page: stable links, SHA256SUMS, attestation with login and offline bundle notes, upload-coverage statement, signing status, requirements, en-US scope, pending size"
    requirement: "WEB-02"
    verification:
      - kind: automated
        ref: "website-staging/download.html grep checks (see Grep evidence)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Legal page: manifest licence and trademark lines verbatim, links to LICENSING.md and THIRD-PARTY-NOTICES.txt"
    requirement: "WEB-03"
    verification:
      - kind: automated
        ref: "website-staging/legal.html grep checks (see Grep evidence)"
        status: pass
    human_judgment: true
    rationale: "The licence copy is a verbatim legal string; the executor compared both lines to configuration.toml [legal] by grep, and a human should confirm the wording before publication."
  - id: D4
    description: "Privacy page: seven opt-in payload fields, no message or stack, 30-day retention, single processor, unattended hosts, privacy contact, owner-fill postal line"
    requirement: "TEL-08"
    verification:
      - kind: automated
        ref: "website-staging/privacy.html grep checks (see Grep evidence)"
        status: pass
    human_judgment: true
    rationale: "The unattended-host list is a snapshot of endpoint-allowlist.json; the owner must confirm it matches the shipped build before publication."

duration: approx. 1h
completed: 2026-10-29
status: complete
---

# Phase 47 Plan 02: Static site pages staged Summary

**Four static pages (home, download, privacy, legal) staged with the locked copy, zero third-party resources on load, and the MAR size flagged pending.**

## Performance

- **Duration:** approx. 1h
- **Tasks:** 2
- **Files created:** 4 pages; **modified:** 1 check allowlist

## Accomplishments

- Home page: PowerBrowser title and heading, a product statement with no version or release date, relative navigation, and the Mozilla non-association footer verbatim.
- Legal page: `License: PolyForm Noncommercial 1.0.0` and `PowerBrowser is a trademark of DeBIOS Foundation.` matching `configuration.toml [legal]`, plus relative links to `LICENSING.md` and `THIRD-PARTY-NOTICES.txt`.
- Download page: stable `releases/latest/download` links (asset-name rule), SHA256SUMS with a check command, `gh attestation verify` with the GitHub-login note and the `--bundle` offline alternative, the statement that the attestation covers the upload rather than the build host, per-OS signing status, system requirements, the en-US scope, and the update-file size as pending.
- Privacy page: the seven opt-in error report fields, the no-message-no-stack limit, 30-day retention, Cloudflare as the only processor, the hosts that may be contacted without a click, the privacy contact, and an owner-fill postal address line.
- Brand residue scan over the staged tree: PASS (426 files at the Task 1 stage, no residue).

## Grep evidence

```
PowerBrowser occurrences, index.html: 6
footer sentence, each of index/download/privacy/legal: 1
legal licence line, trademark line, notice-file links: present
external src/href (http) in index.html + legal.html: 0
version-like text (15x.x) in index.html: 0
external src/script/stylesheet in download.html + privacy.html: 0
download hrefs outside github.com and powerbrowser.org: 0
SHA256SUMS occurrences in download.html: 3
releases/latest/download occurrences: 2
gh attestation verify + login + --bundle + upload: present
en-US, pending: present
privacy@ + 30 days: present
payload field names (type|basename|buildID) in privacy.html: 3
internal identifiers (Phase, PKG-, TEL-, WEB-, host name, /events, port) in the four pages: 0
```

## Quick gate

`scripts/verify-platform.sh --quick` exits 0 after the three commits: `verify-platform: PASS -- all checks passed`.

## Task Commits

1. **Task 1: home and legal pages** - `0e5160e` (feat)
2. **Task 2: download and privacy pages** - `c524527` (feat)
3. **Allowlist for the manifest-literals check** - `6582cd7` (fix). The first quick run went red: the public copy carries the manifest vendor name and trademark line verbatim by requirement. The check requires each carrier as a slot and file row with a reason, so five rows were added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Manifest-literals carriers allowlisted**
- **Found during:** the quick gate after Task 2
- **Issue:** `verify-manifest-literals` flagged the vendor name and trademark line in the four pages.
- **Fix:** five `{slot, file, reason}` rows in `scripts/verify-manifest-literals.mjs`. No literal was written into the check.
- **Commit:** `6582cd7`

### Intentional deviation from the plan's grep

**2. "Phase 45" is not in the download copy.** Task 2's acceptance grep expects `pending ... Phase 45`. The CONTEXT asked for the size line to name the Phase 45 measurement, but the project rule for user-facing copy forbids internal identifiers, and a phase number is one. The line reads "Pending. The size of the complete update file is measured on the release build." The grep is therefore not met by design. The owner can add the phase reference if they decide the public copy should carry it.

## Owner follow-up

- **Legal links need the notice files at the site root.** `legal.html` links `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` by relative path. The static site has no copy of them. At the push (plan 47-04), copy both files from the repository root into the website repository root. `THIRD-PARTY-NOTICES.txt` is 1,084,413 bytes, well under the 25 MiB Pages file cap.
- **Postal address.** `privacy.html` carries `[OWNER TO FILL BEFORE PUBLICATION]`. Replace it before the site is published.
- **Unattended-host list is a snapshot.** It is derived from `powerbrowser/endpoint-allowlist.json` as of this build. The list includes `release-assets.githubusercontent.com`. Under the owner ruling of 2026-10-29, the MAR origin becomes `downloads.powerbrowser.org` (R2). When Phase 49/50 change the allowlist, the privacy page must be updated in the same change.
- **Stable asset name.** The download link uses `powerbrowser-linux-x86_64.tar.xz`, derived from the asset-name rule (`<app_basename>-<target-token>.<ext>`). The RELEASING.md table still reads pending for the Linux stable name. Confirm the name when the Linux release-pipeline stage lands.
- **Update-file size.** Pending the measurement on the release build. Fill it in once the measurement exists.
- **Owner confirmation of wording.** The system-requirements line, the per-OS signing lines (Windows and macOS are described as planned builds), and the licence wording are drafted from the locked decisions; the owner should read them once before publication.

## Known Stubs

- `website-staging/privacy.html`: the postal-address line is an intentional placeholder, `[OWNER TO FILL BEFORE PUBLICATION]`. It is tracked in Owner follow-up and must be filled before publication.
- `website-staging/download.html`: the update-file size line is intentionally pending the release-build measurement. No number is stated.

## Threat Flags

None. The pages add no endpoint, auth path or trust boundary in this repository; the external links are click-only.

## Self-Check: PASSED

- The four pages exist under `website-staging/` and are committed in `0e5160e` and `c524527`.
- The allowlist change is committed in `6582cd7`.
- `git merge-base --is-ancestor 6582cd7 HEAD` holds.
